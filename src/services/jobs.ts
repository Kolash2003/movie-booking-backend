import ioredis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { failBookingPayment } from './booking';
import { logger } from '../utils/logger';


let connection: any;

function getConnection(): any {
    if(!connection) {
        connection = new ioredis(env.REDIS_URL, {
            maxRetriesPerRequest: null,
        });
    }

    return connection;
}

export const reconciliationQueue = new Queue('reconciliation', {
    connection: getConnection(),
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: 50
    },
});


export const reminderQueue = new Queue('reminders', {
    connection: getConnection(),
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: 50,
    },
});

export async function recordLatency(stage: 'create' | 'confirm'| 'webhook', durationMs: number, bookingId?: string): Promise<void> {
    await prisma.bookingLatencyMetric.create({
        data: {
            stage: stage,
            durationMs: durationMs,
            bookingId: bookingId
        }
    })
    .catch(() => {});
}


export async function reconciliationRun(staleSeconds = 20 * 60): Promise<number> {
    const cutoff = new Date(Date.now() - staleSeconds * 1000);

    const stale = await prisma.payment.findMany({
        where: {
            status: 'PENDING',
            updatedAt: {
                lt: cutoff
            },
        },
        take: 100,
    });

    let released = 0;

    for(const p of stale) {
        await failBookingPayment(p.bookingId, null).catch(() => {});
        released++;
        logger.info('reconciliation.released', {
            bookingId: p.bookingId,
            paymentId: p.id
        });
    }

    return released;
}


export function startreconciliationWorker(): Worker {
    const worker = new Worker(
        'reconciliation',
        async () => reconciliationRun(),
        {
            connection: getConnection(),
            concurrency: 1
        }
    );

    worker.on('failed', (_j, error) => logger.warn('reconciliation.worker.failed', { error }));

    reconciliationQueue.upsertJobScheduler('reconcile', { pattern: '*/5 * * * *', }, { name: 'reconcile', data: {} }).catch(() => {});
    
    return worker;
}


export async function reminderRun(): Promise<number> {
    const horizon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const now = new Date();

    const upcoming = await prisma.booking.findMany({
        where: {
            status: 'CONFIRMED',
            show: {
                startTime: {
                    gte: now,
                    lte: horizon,
                }
            },
            notifications: {
                none: {
                    body: {
                        contains: 'Reminder',
                    }
                }
            }
        },
        include: {
            user: true,
            show: {
                include: {
                    movie: true,
                    screen: {
                        include: {
                            theater: true,
                        }
                    }
                }
            },
            showSeats: {
                include: {
                    seats: true,
                }
            }
        },
        take: 200,
    });

    let count  = 0;

    for(const booking of upcoming) {
        if(!booking.user) {
            continue;
        }

        const seats = booking.showSeats.map((s) => `${s.seats.rowLablel}${s.seats.number}`).join(', ');

        prisma.notification.create({
            data: {
                userId: booking.user.id,
                bookingId: booking.id,
                channel: 'EMAIL',
                to: booking.user.email,
                subject: `Reminder: ${booking.show.movie.title} is tomorrow`,
                body: [
                    `Reminder: ${booking.show.movie.title}`,
                    `Showtime: ${new Date(booking.show.startTime).toLocaleString()}`,
                    `Theater: ${booking.show.screen.theater.name}, ${booking.show.screen}`,
                    `Seats: ${seats}`
                ].join('\n'),
                status: 'QUEUED',
            },
        }).catch(() => {});

        count++;        
    }

    return count;
}

export function startReminderWorker(): Worker {
    const worker = new Worker('reminders', async () => reminderRun(), {
        connection: getConnection(),
        concurrency: 1,
    });

    reminderQueue.upsertJobScheduler('dailyReminder',  { pattern: '0 9 * * *' }, {
        name: 'dailyReminder',
        data: {}
    }).catch(() => {});

    return worker;
}

export async function expiredBookingSweep(): Promise<number> {
    const expired = await prisma.booking.findMany({
        where: {
            status: 'PENDING',
            expiresAt: {
                lt: new Date()
            }
        },
        take: 200,
    });

    let released = 0;

    for(const b of expired) {
        await failBookingPayment(b.id, null).catch(() => {});
        released++;
    }

    return released;
}

export function startExpiredBookingSweep(): NodeJS.Timeout {
    return setInterval(() => {
        expiredBookingSweep().catch(() => {});
    }, 60 * 1000);
}

export  { enrollInWaitingRoom }