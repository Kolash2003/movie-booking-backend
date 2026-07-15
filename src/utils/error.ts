

export type ErrorField = Record<string, string[] | string>;

export class AppError extends Error {
    readonly status: number;
    readonly code: string;
    readonly fields?: ErrorField;
    readonly cause: unknown;

    constructor(
        message: string,
        options: {
            status?: number;
            code?: string;
            fields?: ErrorField;
            cause?: unknown
        } = {},
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = options.code ?? 'INTERNAL';
        this.status = options.status ?? 500;
        this.fields = options.fields;
        this.cause = options.cause;
    }
}

export class ValidationError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, {
            status: 400,
            code: 'VALIDATION_ERROR'
        });
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, {
            status: 401,
            code: 'UNAUTHORIZED'
        });
    }
}

export class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, {
            status: 403,
            code: 'FORBIDDEN'
        });
    }
}

export class NotFoundError extends AppError {
    constructor(message = 'Not Found') {
        super(message, {
            status: 404,
            code: 'NOT_FOUND'
        });
    }
}

export class ConflictError extends AppError {
    constructor(message = 'Conflict', fields?: ErrorField) {
        super(message, {
            status: 409,
            code: 'CONFLICT',
            fields,
        });
    }
}

export class PaymentrequiredError extends AppError {
    constructor(message = 'Payment Required') {
        super(message, {
            status: 402,
            code: 'PAYMENT_REQUIRED'
        });
    }
}

export class RateLimitError extends AppError {
    constructor(message = 'Too Many Requests', retryAfterSeconds?: number) {
        super(message, {
            status: 429,
            code: 'RATE_LIMIT_EXCEEDED'
        });

        if(retryAfterSeconds) {
            (this as any).retryAfter = retryAfterSeconds;
        }
    }
}

export class IdempotencyError extends AppError {
    constructor(message = 'Idempotency Key Conflict') {
        super(message, {
            status: 422,
            code: 'IDEMPOTENCY_KEY_REUSE'
        });
    }
}