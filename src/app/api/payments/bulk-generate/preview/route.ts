import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/payments/bulk-generate/preview?month=YYYY-MM
//
// Dry-run for the bulk monthly bill generation: returns exactly what POST
// /api/payments/bulk-generate would create — one bill per active student with
// one line item per active programme enrolment — WITHOUT writing anything.
//
// Response: {
//   month, monthLabel,
//   toBill:   [{ studentId, studentCode, fullName, lines: [{programId, code,
//              name, color, amount}], total }],
//   skipped:  [{ studentId, studentCode, fullName, billedAmount }],
//   noProgrammes: [{ studentId, studentCode, fullName }],
//   totals:   { billCount, lineCount, grandTotal, skippedCount,
//               noProgrammeCount, studentCount }
// }
export async function GET(req: Request) {
  const url = new URL(req.url)
  const month = url.searchParams.get('month')?.trim() || ''
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: 'month is required in YYYY-MM format' },
      { status: 400 },
    )
  }

  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  // All active students with their active programme enrolments (same shape
  // and ordering as the POST route so the preview never drifts from reality).
  const students = await db.student.findMany({
    where: { status: 'Active' },
    select: {
      id: true,
      studentId: true,
      fullName: true,
      enrollments: {
        where: { status: 'Active' },
        orderBy: { enrolledAt: 'asc' },
        include: {
          program: {
            select: { id: true, monthlyFee: true, code: true, name: true, color: true },
          },
        },
      },
    },
    orderBy: { studentId: 'asc' },
  })

  // Students with any bill for this month are skipped (a bill covers ALL
  // programmes — per-student, per-month uniqueness).
  const existing = await db.payment.findMany({
    where: { month },
    select: { studentId: true, amount: true },
  })
  const existingByStudent = new Map<string, number>()
  for (const p of existing) {
    existingByStudent.set(p.studentId, (existingByStudent.get(p.studentId) ?? 0) + p.amount)
  }

  const toBill: Array<{
    studentId: string
    studentCode: string
    fullName: string
    lines: Array<{ programId: string; code: string; name: string; color: string | null; amount: number }>
    total: number
  }> = []
  const skipped: Array<{ studentId: string; studentCode: string; fullName: string; billedAmount: number }> = []
  const noProgrammes: Array<{ studentId: string; studentCode: string; fullName: string }> = []

  for (const s of students) {
    if (existingByStudent.has(s.id)) {
      skipped.push({
        studentId: s.id,
        studentCode: s.studentId,
        fullName: s.fullName,
        billedAmount: existingByStudent.get(s.id) ?? 0,
      })
      continue
    }

    // One line item per enrolled programme; dedupe by programme id (same as POST).
    const seen = new Set<string>()
    const lines: Array<{ programId: string; code: string; name: string; color: string | null; amount: number }> = []
    for (const en of s.enrollments) {
      if (!en.program) continue
      if (seen.has(en.program.id)) continue
      seen.add(en.program.id)
      lines.push({
        programId: en.program.id,
        code: en.program.code,
        name: en.program.name,
        color: en.program.color,
        amount: en.program.monthlyFee,
      })
    }

    if (lines.length === 0) {
      noProgrammes.push({ studentId: s.id, studentCode: s.studentId, fullName: s.fullName })
      continue
    }

    toBill.push({
      studentId: s.id,
      studentCode: s.studentId,
      fullName: s.fullName,
      lines,
      total: lines.reduce((sum, li) => sum + li.amount, 0),
    })
  }

  const lineCount = toBill.reduce((sum, b) => sum + b.lines.length, 0)
  const grandTotal = toBill.reduce((sum, b) => sum + b.total, 0)

  return NextResponse.json({
    month,
    monthLabel,
    toBill,
    skipped,
    noProgrammes,
    totals: {
      billCount: toBill.length,
      lineCount,
      grandTotal,
      skippedCount: skipped.length,
      noProgrammeCount: noProgrammes.length,
      studentCount: students.length,
    },
  })
}
