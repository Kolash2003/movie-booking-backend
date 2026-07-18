import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../config/prisma";
import { redisClient } from "../config/redis";
import { refundPayment } from "../lib/razorpay";
import { ConflictError, ForbiddenError, NotFoundError } from "../utils/error";
import { logger } from "../utils/logger";
import { enqueueNOtification } from "./notigications";
import { decideRefund } from "./pricing";
import { invalidateSeatMap } from "./seatHolds";



export interface cancelResult {
    bookingId: string;
    refundedCents: number;
    refundId: string;
    cancelledAt: string;
}


export async function cancelBooking(input: {
    bookingId: string;
    reason: string;
    actorUserId: string;
}): Promise<{ result: cancelResult }> {
    const booking = await prisma.booking.findUnique({
        where: {
            id: input.bookingId,
        },
        include: {
            user: true,
            show: {
                include: {
                    movie: true,
                    screen: {
                        include: {
                            theater: true
                        }
                    }
                }
            },
            showSeats: {
                include: {
                    seats: true,
                }
            },
            payment: true,
        },
    });

    if(!booking) {
        throw new NotFoundError('Booking not found');
    }

    if(booking.userId !== input.actorUserId && (await notAdmin(input.actorUserId))) {
        throw new ForbiddenError('Not allowd to cancel this booking');
    }

    if(booking.status !== 'CONFIRMED') {
        throw new ConflictError('ONly confirmed bookings can be cancelled');
    }

    const decision = decideRefund(booking.show.startTime);

    if(!decision.allowed) {
        throw new ConflictError(`Refund not allowed: ${decision.reason}`);
    }

    const payment = booking.payment.find((p) => p.status === 'PAID') ?? booking.payment[0];

    if(!payment) {
        throw new ConflictError('NO payable payment attached to booking');
    }

    const providerRefundId = await refundPayment(payment.providerPaymentId!, booking.amountCents, {
        bookingId: booking.id,
        reason: input.reason,
        actor: input.actorUserId,
    });

    await prisma.$transaction(async (tx) => {
        const seatIds = booking.showSeats.map((ss) => ss.seatId);

        await tx.$executeRaw`
            SELECT id FROM "ShowSeat"
            WHERE "showId" = ${booking.showId} AND "seatId" IN (${Prisma.join(seatIds)})
            FOR UPDATE;
        `;

        await tx.showSeat.updateMany({
            where: {
                id: booking.id
            },
            data: {
                status: "CANCELLED",
                cancelledAt: new Date(),
            }
        });

        await tx.payment.update({
            where: {
                id: payment.id,
            },
            data: {
                status: 'REFUNDED',
            }
        });

        await tx.refund.create({
            data: {
                paymentId: payment.id,
                bookingId: booking.id,
                providerRefundId: providerRefundId,
                amountCents: booking.amountCents,
                status: 'REFUNDED',
                reason: input.reason,
            },
        });
    });

    await invalidateSeatMap(booking.showId, redisClient);

    logger.info('booking.cancelled', {
        bookingId: booking.id, 
        refundId: providerRefundId
    });

    if(booking.user) {
        await enqueueNOtification(
            booking.user,
            booking,
            'EMAIL',
            {
                subject: `Booking cancelled & refund initiated: ${booking.show.movie.title}`,
                body: [
                    `Hi ${booking.user.name}`,
                    ``,
                    `your booking ${booking.id} has been cancelled`,
                    `Refund of ${(booking.amountCents / 100).toFixed(2)} has been initiated`,
                    `Refund reference :${providerRefundId}`,
                    ``,
                    `-Movie Booking`,
                ].join('\n'),
            }
        ).catch(() => {});
    }

    return {
        result: {
            bookingId: booking.id,
            refundedCents: booking.amountCents,
            refundId: providerRefundId,
            cancelledAt: new Date().toISOString(),
        }
    };
}

async function notAdmin(userId: string) {
    const u = await prisma.user.findUnique({
        where: {
            id: userId
        },
        select: {
            role: true,
        }
    });

    return u?.role !== 'ADMIN';
}