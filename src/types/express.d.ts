import type { Request } from "express";

declare global {
    namespace Express {
        interface Request {
            user?: { 
                id: string;
                email: string,
                role: string
            };
        }
        interface Locals {
            correlationId?: string;
        }
    }
}
