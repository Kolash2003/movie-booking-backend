import { env } from 'node:process';
import razorpay from 'razorpay';
import { AppError } from '../utils/error';
import crypto from 'node:crypto';

export const Razorpay = new razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
});

export async function createRazorpayOrder(amountCents: number, receipt: string): Promise<string> {
    try {
        const order = await Razorpay.orders.create({
            amount: 'INR',
            receipt: receipt,
            payment_capture: true,
        } as any) as {id : string};

        return order.id;
    } catch (error) {
        throw new AppError('Failed to create payment order', {
            status: 502,
            code: 'PAYMENT_GATEWAY_ERROR',
            cause: error,
        });
    }
}


export function verifyWebhookSignature(rawbody: Buffer, signature: string): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET;

    if(!secret) {
        return false;
    }

    const expected = crypto.createHmac('sha256', secret)
                            .update(rawbody)
                            .digest('hex');

    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch (error) {
        return false;
    }
}

export async function refundPayment(
    providerPaymentId: string,
    amountCents: number,
    notes: Record<string, string>,
): Promise<string> {
    const refund = await Razorpay.payments.refund(providerPaymentId, {
        amount: amountCents,
        notes,
    });

    return refund.id;
}