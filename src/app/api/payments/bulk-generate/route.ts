import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/payments/bulk-generate
// Body: { month: "YYYY-MM", dueDate?: "YYYY-MM-DD", skipExisting?: boolean }
// Auto-creates payment records for all active students who don't already have one
// for the given month. Uses each student's primary program's monthlyFee.
// Returns { created, skipped, total, receipts: [...] }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || !body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json(
      { error: 'month is required in YYYY-MM format' },
      { status: 400 },
    )
  }
  const month: string = body.month
  const skipExisting = body.skipExisting !== false // default true
  const dueDate = body.dueDate ? new Date(body.dueDate + 'T23:59:59') : null

  // Get the latest receipt number to continue sequencing
  const lastPayment = await db.payment.findFirst({
    where: { receiptNo: { startsWith: 'SAN-' } },
    orderBy: { receiptNo: 'desc' },
    select: { receiptNo: true },
  })
  let seq = 1
  if (lastPayment?.receiptNo) {
    const m = /SAN-\d{4}-(\d+)/.exec(lastPayment.receiptNo)
    if (m) seq = parseInt(m[1], 10) + 1
  }

  // Get all active students with their enrollments (program + monthlyFee)
  const students = await db.student.findMany({
    where: { status: 'Active' },
    select: {
      id: true,
      studentId: true,
      fullName: true,
      enrollments: {
        include: { program: { select: { id: true, monthlyFee: true, code: true } } },
        where: { status: 'Active' },
      },
    },
    orderBy: { studentId: 'asc' },
  })

  // Get existing payments for this month to avoid duplicates
  const existing = await db.payment.findMany({
    where: { month },
    select: { studentId: true, programId: true },
  })
  const existingKey = new Set(
    existing.map((p) => `${p.studentId}:${p.programId ?? 'null'}`),
  )

  const toCreate: Array<{
    studentId: string
    programId: string | null
    amount: number
    receiptNo: string
  }> = []
  let skipped = 0

  for (const s of students) {
    // Use the first active enrollment's program; if none, create a program-less payment with amount 0
    const enrollment = s.enrollments[0]
    const programId = enrollment?.program.id ?? null
    const amount = enrollment?.program.monthlyFee ?? 0
    const key = `${s.id}:${programId ?? 'null'}`

    if (skipExisting && existingKey.has(key)) {
      skipped++
      continue
    }

    const receiptNo = `SAN-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
    seq++
    toCreate.push({ studentId: s.id, programId, amount, receiptNo })
  }

  if (toCreate.length === 0) {
    return NextResponse.json({
      created: 0,
      skipped,
      total: students.length,
      message: skipExisting
        ? `All ${students.length} active students already have payments for ${month}.`
        : 'No students to generate payments for.',
    })
  }

  // Bulk insert
  await db.payment.createMany({
    data: toCreate.map((p) => ({
      studentId: p.studentId,
      programId: p.programId,
      month,
      amount: p.amount,
      paidAmount: 0,
      method: 'Cash',
      status: p.amount > 0 ? 'Pending' : 'Paid',
      dueDate,
      receiptNo: p.receiptNo,
      note: `Bulk-generated for ${month}`,
    })),
  })

  return NextResponse.json({
    created: toCreate.length,
    skipped,
    total: students.length,
    month,
    message: `Created ${toCreate.length} payment record${toCreate.length === 1 ? '' : 's'} for ${month}${skipped > 0 ? ` (${skipped} already existed, skipped)` : ''}.`,
  })
}
