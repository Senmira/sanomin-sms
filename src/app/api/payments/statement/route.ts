import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/payments/statement?studentId=...
// → Printable fee statement for ONE student: every bill month with its
//   programme line items, per-month balance and grand totals. Parents get one
//   sheet with everything billed / paid / outstanding to date.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')?.trim() || ''
  if (!studentId) {
    return NextResponse.json({ error: 'studentId is required' }, { status: 400 })
  }

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      studentId: true,
      fullName: true,
      gender: true,
      status: true,
      admissionDate: true,
      guardians: { select: { name: true, phone: true, relationship: true, isPrimary: true } },
      enrollments: {
        where: { status: 'Active' },
        include: { program: { select: { name: true, color: true } }, class: { select: { name: true } } },
      },
    },
  })
  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  const payments = await db.payment.findMany({
    where: { studentId },
    include: {
      items: {
        include: { program: { select: { name: true, color: true } } },
        orderBy: { createdAt: 'asc' },
      },
      program: { select: { name: true, color: true } },
    },
    orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
  })

  const months = payments.map((p) => {
    const lines =
      p.items.length > 0
        ? p.items.map((it) => ({
            description: it.description || it.program?.name || 'Programme',
            amount: it.amount,
            color: it.program?.color ?? null,
          }))
        : [
            {
              description: p.program?.name || 'Programme fee',
              amount: p.amount,
              color: p.program?.color ?? null,
            },
          ]
    return {
      id: p.id,
      month: p.month,
      amount: p.amount,
      paidAmount: p.paidAmount,
      balance: Math.max(0, Math.round((p.amount - p.paidAmount) * 100) / 100),
      status: p.status,
      method: p.method,
      paidDate: p.paidDate ? p.paidDate.toISOString() : null,
      receiptNo: p.receiptNo,
      lines,
    }
  })

  const round2 = (n: number) => Math.round(n * 100) / 100
  const totals = {
    billed: round2(payments.reduce((s, p) => s + p.amount, 0)),
    paid: round2(payments.reduce((s, p) => s + p.paidAmount, 0)),
    balance: round2(payments.reduce((s, p) => s + Math.max(0, p.amount - p.paidAmount), 0)),
    billCount: payments.length,
  }

  return NextResponse.json({
    student: {
      id: student.id,
      studentId: student.studentId,
      fullName: student.fullName,
      gender: student.gender,
      status: student.status,
      admissionDate: student.admissionDate ? student.admissionDate.toISOString() : null,
      guardians: student.guardians,
      enrollments: student.enrollments.map((e) => ({
        program: e.program?.name ?? null,
        programColor: e.program?.color ?? null,
        class: e.class?.name ?? null,
      })),
    },
    months,
    totals,
    generatedAt: new Date().toISOString(),
  })
}
