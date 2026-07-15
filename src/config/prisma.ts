import { PrismaClient } from '../../generated/prisma/client';
import { env } from "./env";

const globalForPrisma = global as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    accelerateUrl: env.DATABASE_URL,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
});

if(env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}