import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/payments/bulk-generate
// Body: { month: "YYYY-MM", dueDate?: "YYYY-MM-DD", skipExisting?: boolean }
//
// Creates ONE BILL PER STUDENT for the given month. All of the student's
// active programme enrolments become line items on that single bill — the
// student's name appears only once no matter how many programmes they take.
// The bill total = Σ monthlyFee of the enrolled programmes.
//
// Returns { created, skipped, total, message }
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

  // All active students with their active programme enrolments
  const students = await db.student.findMany({
    where: { status: 'Active' },
    select: {
      id: true,
      studentId: true,
      fullName: true,
      enrollments: {
        include: {
          program: {
            select: { id: true, monthlyFee: true, code: true, name: true },
          },
        },
        where: { status: 'Active' },
        orderBy: { enrolledAt: 'asc' },
      },
    },
    orderBy: { studentId: 'asc' },
  })

  // Existing bills for this month are per-STUDENT now (a bill covers all
  // programmes), so a student with any bill for the month is skipped.
  const existing = await db.payment.findMany({
    where: { month },
    select: { studentId: true },
  })
  const existingStudents = new Set(existing.map((p) => p.studentId))

  type BillDraft = {
    studentId: string
    amount: number
    receiptNo: string
    lines: Array<{ programId: string | null; amount: number; description: string | null }>
  }
  const bills: BillDraft[] = []
  let skipped = 0

  for (const s of students) {
    if (skipExisting && existingStudents.has(s.id)) {
      skipped++
      continue
    }

    // One line item per enrolled programme; dedupe by programme id
    const seenProgram = new Set<string>()
    const lines: BillDraft['lines'] = []
    for (const en of s.enrollments) {
      if (!en.program) continue
      if (seenProgram.has(en.program.id)) continue
      seenProgram.add(en.program.id)
      lines.push({
        programId: en.program.id,
        amount: en.program.monthlyFee,
        description: en.program.name,
      })
    }

    const amount = lines.reduce((sum, li) => sum + li.amount, 0)
    const receiptNo = `SAN-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
    seq++

    bills.push({ studentId: s.id, amount, receiptNo, lines })
  }

  if (bills.length === 0) {
    return NextResponse.json({
      created: 0,
      skipped,
      total: students.length,
      message: skipExisting
        ? `All ${students.length} active students already have bills for ${month}.`
        : 'No students to generate bills for.',
    })
  }

  // Create one bill (with line items) per student
  await db.$transaction(
    bills.map((b) =>
      db.payment.create({
        data: {
          studentId: b.studentId,
          programId: b.lines.length === 1 ? b.lines[0].programId : null,
          month,
          amount: b.amount,
          paidAmount: 0,
          method: 'Cash',
          status: b.amount > 0 ? 'Pending' : 'Paid',
          dueDate,
          receiptNo: b.receiptNo,
          note: `Monthly bill for ${month}`,
          items: {
            create: b.lines.map((li) => ({
              programId: li.programId,
              amount: li.amount,
              description: li.description,
            })),
          },
        },
      }),
    ),
  )

  const lineCount = bills.reduce((sum, b) => sum + b.lines.length, 0)
  return NextResponse.json({
    created: bills.length,
    skipped,
    total: students.length,
    month,
    message: `Created ${bills.length} bill${bills.length === 1 ? '' : 's'} for ${month} covering ${lineCount} programme line item${lineCount === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} student${skipped === 1 ? '' : 's'} already billed, skipped)` : ''}.`,
  })
}
