// Seed monthly Payment records for all 48 students × their program enrollments.
// Generates current-month and last-month payment rows distributed across
// statuses: ~70% Paid, ~12% Partial, ~12% Pending, ~6% Overdue.
// Auto-generates receiptNo SAN-2025-NNNN.
// Run with: bun run prisma/seed-payments.ts

import { db } from '../src/lib/db'

const PAID_RATIO = 0.7
const PARTIAL_RATIO = 0.12
const PENDING_RATIO = 0.12
// remainder (0.06) -> Overdue

const METHODS = ['Cash', 'Card', 'Bank', 'Online'] as const

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function dueDateForMonth(month: string): Date {
  // 10th of the month
  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  return new Date(y, m - 1, 10, 23, 59, 59, 0)
}

function pickStatus(rand: number): {
  status: 'Paid' | 'Partial' | 'Pending' | 'Overdue'
} {
  if (rand < PAID_RATIO) return { status: 'Paid' }
  if (rand < PAID_RATIO + PARTIAL_RATIO) return { status: 'Partial' }
  if (rand < PAID_RATIO + PARTIAL_RATIO + PENDING_RATIO) return { status: 'Pending' }
  return { status: 'Overdue' }
}

async function main() {
  console.log('Seeding Payment records…')

  // Wipe any existing payments to make the seed idempotent
  await db.payment.deleteMany({})
  console.log('• Cleared existing payments')

  // Load all enrollments + the student & program data we need
  const enrollments = await db.enrollment.findMany({
    where: { status: 'Active' },
    include: {
      student: { select: { id: true, fullName: true } },
      program: { select: { id: true, code: true, name: true, monthlyFee: true } },
    },
  })
  console.log(`• Found ${enrollments.length} active enrollments`)

  if (enrollments.length === 0) {
    console.log('✗ No enrollments found — run `bun run prisma/seed.ts` first')
    return
  }

  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const months = [lastMonth, thisMonth]

  // Pick a receipt sequence starting at 0001
  let seq = 1
  const yearTag = String(now.getFullYear())

  type Row = {
    studentId: string
    programId: string | null
    month: string
    amount: number
    paidAmount: number
    method: string
    status: string
    dueDate: Date
    paidDate: Date | null
    note: string | null
    receiptNo: string
    createdAt: Date
  }

  const rows: Row[] = []

  for (const en of enrollments) {
    if (!en.program) continue
    for (const m of months) {
      const month = monthKey(m)
      const amount = en.program.monthlyFee || 0
      // Deterministic-ish but varied status across students/months
      const rand = Math.random()
      const { status } = pickStatus(rand)
      let paidAmount = 0
      let paidDate: Date | null = null
      let method = 'Cash'
      let note: string | null = null

      if (status === 'Paid') {
        paidAmount = amount
        // Paid sometime within the month
        const dayOffset = 1 + Math.floor(Math.random() * 9) // 1..9 of the month
        paidDate = new Date(m.getFullYear(), m.getMonth(), dayOffset)
        method = METHODS[Math.floor(Math.random() * METHODS.length)]
      } else if (status === 'Partial') {
        // 30-70% of amount
        const pct = 0.3 + Math.random() * 0.4
        paidAmount = Math.round((amount * pct) / 100) * 100
        if (paidAmount > amount) paidAmount = amount
        if (paidAmount <= 0) paidAmount = Math.round(amount / 2)
        const dayOffset = 1 + Math.floor(Math.random() * 9)
        paidDate = new Date(m.getFullYear(), m.getMonth(), dayOffset)
        method = METHODS[Math.floor(Math.random() * METHODS.length)]
        note = 'Partial payment — balance carried forward'
      } else if (status === 'Overdue') {
        note = 'Payment overdue — reminder sent'
      } else {
        // Pending
        note = null
      }

      const receiptNo = `SAN-${yearTag}-${String(seq).padStart(4, '0')}`
      seq++

      // createdAt should be just before the due date / start of the month
      const createdAt = new Date(m.getFullYear(), m.getMonth(), 1, 8, 0, 0, 0)

      rows.push({
        studentId: en.student.id,
        programId: en.program.id,
        month,
        amount,
        paidAmount,
        method,
        status,
        dueDate: dueDateForMonth(month),
        paidDate,
        note,
        receiptNo,
        createdAt,
      })
    }
  }

  // Batch insert (chunk to avoid SQLite variable limits)
  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    await db.payment.createMany({ data: chunk })
  }

  console.log(`✓ Created ${rows.length} payment records (${months.length} months × ${enrollments.length} enrollments)`)
  // Status distribution summary
  const dist: Record<string, number> = {}
  for (const r of rows) dist[r.status] = (dist[r.status] || 0) + 1
  console.log(`  Distribution: ${JSON.stringify(dist)}`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
