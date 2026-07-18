export const SEAT_PRICE_MULTIPLIER: Record<string, number> = {
    STANDARD: 1,
    PREMIUM: 1.5,
    RECLINER: 2,
} as const;

export const MAX_SEATS_PER_BOOKING = 10;
export const REFUND_BLACKOUT_MS = 2 * 60 * 60 * 1000 // 2 hours before show time

export function computeAmount(basePriceCents: number, seatTypes: string[]): number {
    return seatTypes.reduce(
        (sum, t) => sum + Math.round(basePriceCents * (SEAT_PRICE_MULTIPLIER[t] ?? 1)),
        0,
    );
}

export interface RefundDecision {
    allowed: boolean;
    reason?: string;
}

export function decideRefund(
    showStartTime: Date,
    now: Date = new Date(),
): RefundDecision {

    const msToShow = showStartTime.getTime() - now.getTime();

    if(showStartTime.getTime() <= now.getTime()) {
        return {
            allowed: false,
            reason: 'Show has already started'
        };
    }

    if(msToShow < REFUND_BLACKOUT_MS) {
        return {
            allowed: false,
            reason: `Refunds are not allowed within 2 hours of showtime (${Math.round(
                msToShow / 60000,
            )} min to showTime)`
        };
    }

    return { 
        allowed: true
    };
}


export function payloadFingerPrint(input: unknown): string {
    try {
        return JSON.stringify(input);
    } catch (error) {
        return String(input);
    }
}