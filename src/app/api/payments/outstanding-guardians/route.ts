import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── WhatsApp phone normalisation (mirrors lib/school.ts toWaPhone) ─────────
function toWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = '94' + digits.slice(1)
  if (!digits.startsWith('94') && digits.length === 9) digits = '94' + digits
  return digits.length >= 9 && digits.length <= 13 ? digits : null
}

interface BillLine {
  description: string
  amount: number
}
interface OutstandingBill {
  id: string
  receiptNo: string | null
  month: string
  total: number
  paid: number
  balance: number
  dueDate: string | null
  status: string
  lines: BillLine[]
}
interface GuardianBucket {
  phone: string // normalised wa.me number
  displayPhone: string // as entered in the record
  guardianName: string
  isPrimary: boolean
  students: Array<{
    studentId: string
    studentRef: string
    studentName: string
    bills: OutstandingBill[]
    balance: number
  }>
  billCount: number
  totalBalance: number
}

// ─── GET /api/payments/outstanding-guardians?month=YYYY-MM ─────────────────
// Server-side "WhatsApp blast queue": groups every outstanding bill for the
// month by guardian phone so the client can open one wa.me chat per family
// with ALL their children's bills combined into a single message.
// - balance > 0 only (Pending / Partial / Overdue)
// - guardian chosen per bill: primary w/ valid phone → any guardian w/ valid phone
// - bills with no reachable guardian land in `unreachable` (data-quality hint)
export async function GET(req: Request) {
  const url = new URL(req.url)
  const month = url.searchParams.get('month')?.trim() || currentMonth()

  const payments = await db.payment.findMany({
    where: { month },
    select: {
      id: true,
      month: true,
      amount: true,
      paidAmount: true,
      status: true,
      dueDate: true,
      receiptNo: true,
      student: {
        select: {
          id: true,
          studentId: true,
          fullName: true,
          guardians: {
            select: { name: true, phone: true, relationship: true, isPrimary: true },
            orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
          },
        },
      },
      items: {
        orderBy: { createdAt: 'asc' },
        select: {
          amount: true,
          description: true,
          program: { select: { name: true } },
        },
      },
    },
    orderBy: { receiptNo: 'asc' },
  })

  const buckets = new Map<string, GuardianBucket>()
  const unreachable: Array<{
    studentRef: string
    studentName: string
    guardianName: string | null
    balance: number
    reason: string
  }> = []
  let billCount = 0
  let totalBalance = 0

  for (const p of payments) {
    const balance = Math.round((p.amount - p.paidAmount) * 100) / 100
    if (balance <= 0) continue // fully paid — nothing to remind
    billCount++
    totalBalance = Math.round((totalBalance + balance) * 100) / 100

    const lines: BillLine[] =
      p.items.length > 0
        ? p.items.map((it) => ({
            description: it.description || it.program?.name || 'Fee',
            amount: it.amount,
          }))
        : [{ description: 'Tuition fee', amount: p.amount }]

    const bill: OutstandingBill = {
      id: p.id,
      receiptNo: p.receiptNo,
      month: p.month,
      total: p.amount,
      paid: p.paidAmount,
      balance,
      dueDate: p.dueDate ? p.dueDate.toISOString() : null,
      status: p.status,
      lines,
    }

    const guardians = p.student.guardians
    const reachable = guardians.filter((g) => toWaPhone(g.phone) !== null)
    const chosen = reachable.find((g) => g.isPrimary) ?? reachable[0] ?? null

    if (!chosen) {
      unreachable.push({
        studentRef: p.student.studentId,
        studentName: p.student.fullName,
        guardianName: guardians[0]?.name ?? null,
        balance,
        reason: guardians.length === 0 ? 'No guardian on file' : 'No valid phone number',
      })
      continue
    }

    const wa = toWaPhone(chosen.phone)!
    let bucket = buckets.get(wa)
    if (!bucket) {
      bucket = {
        phone: wa,
        displayPhone: chosen.phone,
        guardianName: chosen.name,
        isPrimary: chosen.isPrimary,
        students: [],
        billCount: 0,
        totalBalance: 0,
      }
      buckets.set(wa, bucket)
    }
    bucket.billCount++
    bucket.totalBalance = Math.round((bucket.totalBalance + balance) * 100) / 100

    // Same child may have several outstanding bills in the month (rare) —
    // merge into one student entry.
    let studentEntry = bucket.students.find((s) => s.studentId === p.student.id)
    if (!studentEntry) {
      studentEntry = {
        studentId: p.student.id,
        studentRef: p.student.studentId,
        studentName: p.student.fullName,
        bills: [],
        balance: 0,
      }
      bucket.students.push(studentEntry)
    }
    studentEntry.bills.push(bill)
    studentEntry.balance = Math.round((studentEntry.balance + balance) * 100) / 100
  }

  const guardiansOut = Array.from(buckets.values()).sort(
    (a, b) => b.totalBalance - a.totalBalance,
  )

  return NextResponse.json({
    month,
    totals: {
      guardians: guardiansOut.length,
      bills: billCount,
      outstanding: totalBalance,
      unreachable: unreachable.length,
    },
    guardians: guardiansOut,
    unreachable,
  })
}
