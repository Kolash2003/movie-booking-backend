import 'dotenv/config';

import { z } from 'zod';

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    API_PREFIX: z.string().default('/api/v1'),
    

    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),

    JWT_ACCESS_SECRET: z.string().min(8),
    JWT_REFRESH_SECRET: z.string().min(8),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
    BCRYPT_ROUNDS: z.coerce.number().default(10),

    SEAT_HOLD_TTL_SECONDS: z.coerce.number().default(600),
    IDEMPOTENCY_TTL_SECONDS: z.coerce.number().default(1500),

    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(120),
    BOOKING_RATE_LIMIT_MAX: z.coerce.number().default(10),

    RAZORPAY_KEY_ID: z.string(),
    RAZORPAY_KEY_SECRET: z.string(),
    RAZORPAY_WEBHOOK_SECRET: z.string(),
    RAZORPAY_WEBHOOK_HEADER: z.string().default('x-razorpay-signature'),

    SENTRY_DSN: z.string().optional().default(''),
    EMAIL_FROM: z.string().default('no-reply@moviebooking.local'),
    SMS_FROM: z.string().default('+10000000000'),
});

const parsed = schema.safeParse(process.env);

if(!parsed.success) {
    console.error('Invalid environment variables');
    console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
    process.exit(1);
}

export const env = parsed
export type Env = typeof env;
