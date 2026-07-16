import { prisma } from "../config/prisma";
import { KEYS, redis, redisClient } from "../config/redis";
import { createRazorpayOrder } from "../lib/razorpay";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/error";
import { computeAmount } from "./pricing";
import { invalidateSeatMap, releaseSeats } from "./seatHolds";
import { logger } from "../utils/logger";
import { Prisma } from "../../generated/prisma/browser";


export interface CreateBookingInput {
    showId: string;
    seatIds: string[];
    userId: string;
}

export interface BookingCreated {
    bookingId: string;
    status: 'PENDING';
    amountCents: number;
    currency: string,
    seatCount: number;
    expiresAt: string;
    razorpayOrderId: string;
    razorpayKeyId: string;
}

const PAYMENT_WINDOW_SECONDS = 600;

export async function createBooking(input: CreateBookingInput) {
    const { showId, seatIds, userId } = input;

    if(seatIds.length === 0) {
        throw new ConflictError('No seats selected');
    }

    if(new Set(seatIds).size !== seatIds.length) {
        throw new ConflictError('Duplicate seats in selection');
    }

    // if(seatIds.length > MAX_SEATS_PER_BOOKING) {
    //     throw new ConflictError(`Cannot book more than ${MAX_SEATS_PER_BOOKING}`)
    // }

    const show = await prisma.show.findUnique({
        where: {
            id: showId,
        },
        include: {
            screen: true,
            movie: true,
        }
    });

    if(!show) {
        throw new NotFoundError('Show not found');
    }

    if(show.startTime.getTime() < Date.now()) {
        throw new ConflictError('Show has already started');
    }

    const pipeline = redis.multi();

    for(const seatId of seatIds) {
        pipeline.get(KEYS.seatHold(showId, seatId));
    }

    const results = await pipeline.exec();

    const missing: string[] = [];

    const ownedByOthers: string[] = [];

    const showSeats = await prisma.showSeat.findMany({
        where: {
            showId,
            seatId: {
                in: seatIds
            },
        },
        include: {
            seats: true
        }
    });

    const showSeatById = new Map(showSeats.map((ss) => [ss.seatId, ss]));

    seatIds.forEach((seatId, i) => {
        const owner = results?.[i]?.[1] as string | null;
        
        const ss = showSeatById.get(seatId);

        const label = ss ? `${ss.seats.rowLablel}${ss.seats.number}` : seatId;

        if(owner === null) {
            missing.push(label);
        }
        else if(owner !== userId) {
            ownedByOthers.push(label);
        }
    });

    if(missing.length) {
        throw new ConflictError(`Seats not held by you (hold expired?) : ${missing.join(', ')}. Call POST /shows/:id/hold first`)
    }

    if(ownedByOthers.length) {
        throw new ForbiddenError(`Seats held by another user: ${ownedByOthers.join(', ')}`)
    }

    const amountCents = computeAmount(show.basePriceCents, showSeats.map((ss) => ss.seats.type));

    const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_SECONDS * 1000);

    const booking = await prisma.$transaction(async (tx) => {
        const updated = await tx.showSeat.updateMany({
            where: {
                showId: showId,
                seatId: {
                    in: seatIds,
                },
                status: 'AVAILABLE'
            },
            data: {
                status: 'HELD',
                heldByUserId: userId,
                heldUntil: expiresAt
            },
        });

        if(updated.count !== seatIds.length) {
            throw new ConflictError('One or more seats are no longer available');
        }

        const created = await tx.booking.create({
            data: {
                userId: userId,
                showId: showId,
                status: 'PENDING',
                amountCents,
                seatCount: seatIds.length,
                expiresAt: expiresAt,
            },
        });

        await tx.showSeat.updateMany({
            where: {
                showId: showId,
                seatId: {
                    in: seatIds,
                },
            },
            data: {
                bookingId: created.id,
            },
        });

        await tx.payment.create({
            data: {
                bookingId: created.id,
                gateway: 'RAZORPAY',
                amountCents: amountCents,
                currency: 'INR',
                status: 'PENDING',
            },
        });

        return created;
    });

    const payment = await prisma.payment.findFirstOrThrow({
        where: {
            bookingId: booking.id,
        }
    });

    let providerOrderId: string;

    try {
        providerOrderId = await createRazorpayOrder(amountCents, `booking_${booking.id}`);

        await prisma.payment.update({
            where: {
                id: payment.id,
            },
            data: {
                providerOrderId,
            }
        });
    } catch (error) {
        await releaseBookingSeats(booking.id);
        await prisma.booking.update({
            where: {
                id: booking.id,
            },
            data: {
                status: 'EXPIRED',
            }
        })

        throw error;
    }

    await releaseSeats(showId, seatIds, userId, redisClient);
    await invalidateSeatMap(showId, redisClient);

    logger.info(`Booking created: {BookingId: booking.id}, Show: ${showId}, User: ${userId}, Amount: ${amountCents} cents, Expires at: ${expiresAt.toISOString()}, Razorpay order id: ${providerOrderId}`);


    return {
        bookingId: booking.id,
        status: booking.status,
        amountCents: booking.amountCents,
        currency: 'INR',
        seatCount: seatIds.length,
        expiresAt: expiresAt.toISOString(),
        razorpayOrderId: providerOrderId,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    };

}

interface confirmContext {
    bookingId: string;
    providerOrderId: string;
    providerPaymentId: string;
    amountCents: number;
    gateway: 'RAZORPAY';
}


export async function confirmBooking(ctx: confirmContext): Promise<{confirmed: Boolean; alreadyConfirmed: Boolean}> {
    const existing = await prisma.booking.findUnique({
        where: {
            id: ctx.bookingId,
        },
        include: {
            payment: true,
            showSeats: {
                include: {
                    seats: true,
                }
            }
        }
    });

    if(!existing) {
        logger.warn('webhook.confirm.unknownBooking', {bookingId: ctx.bookingId});
        throw new NotFoundError('Boooking not found');
    }

    if(existing.status === 'CONFIRMED') {
        return {
            confirmed: false,
            alreadyConfirmed: true,
        }
    }

    if(existing.status !== 'PENDING') {
        throw new ConflictError(`Booking is not confirmable in status=${existing.status}`);
    }

    if(existing.expiresAt < new Date()) {
        await prisma.payment.updateMany({
            where: {
                bookingId: ctx.bookingId
            },
            data: {
                status: 'PAID',
                providerPaymentId: ctx.providerPaymentId,
            }
        });

        logger.warn('webhook.confirm.late_payment', { bookingId: ctx.bookingId });

        throw new ConflictError('Payment recedived after booking expiry: refun will be issued');
    }

    const seatIds = existing.showSeats.map((ss) => ss.seatId);

    const showId = existing.showId;

    await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
            SELECT id FROM "ShowSeat"
            WHERE "showId" = ${showId} AND "seatId" IN (${Prisma.join(seatIds)})
            FOR UPDATE;
        `;

        const locked = await tx.showSeat.findMany({
            where: {
                showId: showId,
                seatId: {
                    in: seatIds,
                },
                select: {
                    seatId: true,
                    status: true,
                    bookingId: true,
                }
            }
        });

        const notHeldOurs = locked.filter(
            (s) => s.status !== 'HELD' || s.bookingId !== ctx.bookingId,
        );

        if(notHeldOurs) {
            throw new ConflictError('Seats changed state before confirmation could complete');
        }

        await tx.showSeat.updateMany({
            where: {
                showId: showId,
                seatId: {
                    in: seatIds,
                },
                status: 'HELD',
                bookingId: ctx.bookingId,
            },
            data: {
                status: 'BOOKED',
                heldByUserId: null,
                heldUntil: null,
            }
        });

        await tx.booking.updateMany({
            where: {
                id: ctx.bookingId,
            },
            data: {
                status: 'CONFIRMED',
                confirmedAt: new Date(),
            }
        });

        await tx.payment.updateMany({
            where: {
                bookingId: ctx.bookingId,
            },
            data: {
                status: 'PAID',
                providerPaymentId: ctx.providerPaymentId,
                providerOrderId: ctx.providerOrderId,
            },
        });

    });
    
    await invalidateSeatMap(showId, redisClient);

    logger.info('booking.confirmed', { bookingId: ctx.bookingId });

    return {
        confirmed: true,
        alreadyConfirmed: false
    };
}


export async function releaseBookingSeats(bookingId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const booking  = await tx.booking.findUnique({
            where: {
                id: bookingId,
            },
            include: {
                showSeats: true,
            }
        });

        if(!booking) {
            return;
        }

        if(booking.status !== 'CONFIRMED') {
            return;
        }

        await tx.showSeat.updateMany({
            where: {
                bookingId: bookingId,
                status: 'HELD',
            },
            data: {
                status: 'AVAILABLE',
                heldByUserId: null,
                heldUntil: null,
                bookingId: null,
            }
        });

        const bookingUpdated = await prisma.booking.findUnique({
            where: {
                id: bookingId,
            }
        });

        if(bookingUpdated) {
            await invalidateSeatMap(bookingUpdated.showId, redisClient);
        }
    });
}


export async function failBookingPayment(
    bookingId: string,
    providerPaymentId: string | null
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
            where: {
                bookingId: bookingId,
            }, data: {
                status: 'FAILED',
                providerPaymentId: providerPaymentId,
            },
        });

        await tx.booking.update({
            where: {
                id: bookingId,
            },
            data: {
                status: 'EXPIRED',
            },
        });

        await tx.showSeat.updateMany({
            where: {
                bookingId: bookingId,
            },
            data: {
                status: 'AVAILABLE',
                heldByUserId: null,
                heldUntil: null,
                bookingId: null,
            },
        });
    });

    const booking  = await prisma.booking.findUnique({
        where: {
            id: bookingId,
        }
    });

    if(booking) {
        await invalidateSeatMap(booking.showId, redisClient);
    }
}