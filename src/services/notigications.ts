import ioredis from 'ioredis';
import { env } from '../config/env';
import { Job, Queue, Worker } from 'bullmq';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

let connection: any;

function getConnection() {
    if(!connection) {
        connection = new ioredis(env.REDIS_URL, {
            maxRetriesPerRequest: null,
        });
    }

    return connection;
}

export interface NotificationJobData {
    notificationId: string;
    channel: 'EMAIL' | 'SMS';
    to: string;
    subject?: string;
    body: string;
}

export const notificationQueue = new Queue<NotificationJobData, string>('notifications', {
    connection: getConnection(),
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: 100,
        removeOnFail: 200,
    },
} as any);

export async function enqueueNOtification(
    user: {
        id?: string;
        email?:string | null;
        phone?: string | null;
        name?: string;
    },
    booking: {
        id: string;
        show?: {
            movie?: {
                title: string;
            };
            startTime?: Date | string
        }
    },
    channel: 'EMAIL' | 'SMS',
    content: {
        subject?: string;
        body: string
    },
): Promise<void> {
    const to = channel === 'EMAIL' ? (user.email ?? undefined) : (user.phone ?? undefined);
    if(!to) return;
    
    const notification = await prisma.notification.create({
        data: {
            userId: user.id,
            bookingId: booking.id,
            channel: channel,
            to: to,
            subject: content.subject,
            body: content.body,
            status: 'QUEUED',
        }
    });

    await notificationQueue.add('send', {
        notificationId: notification.id,
        channel: channel,
        to: to,
        subject: content.subject,
        body: content.body,
    });

    logger.info('notification.queued', {
        notificationId: notification.id,
        channel: channel
    });
}


async function send(msg: NotificationJobData): Promise<void> {
    if(msg.channel === 'EMAIL') {
        logger.info('email.sent', {
            to: msg.to,
            subject: msg.subject
        });
    } else {
        logger.info('sms.sent', {
            to: msg.to,
            bodyPreview: msg.body.slice(0, 40)
        });
    }
}

export function startNotificationWorker(): Worker<NotificationJobData> {
    const worker = new Worker<NotificationJobData>(
        'notifications',
        async(job: Job<NotificationJobData>) => {
            try {
                await send(job.data);
                await prisma.notification.update({
                    where: {
                        id: job.data.notificationId
                    },
                    data: {
                        status: 'SENT',
                        updatedAt: new Date()
                    }
                });
            } catch (error) {
                await prisma.notification.update({
                    where: {
                        id: job.data.notificationId
                    },
                    data: {
                        status: 'FAILED',
                        attempts: {
                            increment: 1
                        },
                        lastError: error instanceof Error ? error.message : String(error),
                        updatedAt: new Date(),
                    },
                });

                throw error;
            }
        }, {
            connection: getConnection(),
            concurrency: 8
        } as any,
    );

    worker.on('failed', (job, error) => {
        logger.warn('notification.worker.failed', {
            jobId: job?.id,
            notifcationId: job?.data.notificationId,
            error: error,
        });
    });

    return worker;
}

