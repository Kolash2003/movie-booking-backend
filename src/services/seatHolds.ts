import { Redis } from "ioredis";
import { redis, KEYS } from "../config/redis";

export async function releaseSeats(
    showId: string,
    seatIds: string[],
    userId: string,
    redisClient: Redis = redis,
): Promise<number> {
    let releasedCount = 0;
    const removeKeys: string[] = [];

    for(const seatId of seatIds) {
        const key = KEYS.seatHold(showId, seatId);
        const owner = await redisClient.get(key);

        if(owner === userId) {
            await redisClient.del(key);
            removeKeys.push(key);
            releasedCount++;
        }
    }

    if(removeKeys.length) {
        await redisClient.srem(KEYS.userHoldSet(showId, userId), ...removeKeys);
    }

    return releasedCount;
}


export async function invalidateSeatMap(showId: string, redisClient: Redis = redis): Promise<void> {
    await redisClient.del(KEYS.showSeatMap(showId)).catch(() => {});
}