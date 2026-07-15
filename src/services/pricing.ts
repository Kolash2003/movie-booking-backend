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