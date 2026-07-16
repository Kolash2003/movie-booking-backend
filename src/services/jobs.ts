import ioredis from 'ioredis';
import { Queue } from 'bullmq';
import { prisma } from '../config/prisma';
import { env } from '../config/env';


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