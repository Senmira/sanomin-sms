import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// If the schema changed mid-dev-session (e.g. a new model was added), the cached
// PrismaClient singleton on globalThis will be missing the new model. Detect
// that and discard it so a fresh client is instantiated on next access.
if (globalForPrisma.prisma && !(globalForPrisma.prisma as unknown as { payment?: unknown }).payment) {
  globalForPrisma.prisma = undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
