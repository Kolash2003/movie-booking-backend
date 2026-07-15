import ioredis, {type Redis} from 'ioredis';
import { env } from './env'

class RedisClient {
    private static instance: Redis;

    static getInstance(): Redis {
        if(!RedisClient.instance) {
            RedisClient.instance = new ioredis(env.REDIS_URL, {
                maxRetriesPerRequest: null,
                enableReadyCheck: true,
                lazyConnect: false,
            });
        }

        return RedisClient.instance;
    }
}

export const redis = RedisClient.getInstance();

export const KEYS = {
    seatHold: (showId: string, seatId: string) => `seat:hold:${showId}:${seatId}`,
    seatHoldOwner: (showId: string, seatId: string) => `seat:hold:owner:${showId}:${seatId}`,
    showSeatMap: (showId: string, version: number | string = 'v1') => `cache:show:${showId}:seat${version}`,
    showListings: (movieId: string, page: string) => `cache:shows:movie:${movieId}:p:${page}`,
    idempotency: (key: string) => `idem:${key}`,
    rateBucket: (bucket: string) => `rate:${bucket}`,
    userHoldSet: (showId: string, userId: string) => `seat:hold:user:${userId}:show:${showId}`
} as const;