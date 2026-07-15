

export interface CreateBookingInput {
    showId: string;
    seatsId: string[];
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

export async function createBooking(input: CreateBookingInput) {
    const { showId, seatIds, userId } = input;


}