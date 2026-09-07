import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/notifications
// Single aggregate that powers the topbar bell: actionable counts across the
// modules (overdue bills, expenses awaiting approval, attendance concerns,
// unpaid salaries, upcoming celebrations). One cheap round-trip instead of
// five parallel calls from the client.
// Response: { alerts: [{key, section, severity, title, detail, count}], total }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET() {
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
  fourteenDaysAgo.setHours(0, 0, 0, 0)

  const [overduePayments, pendingExpenses, activeTeachers, paidPayroll, recentAttendance, dobWindow, hireWindow] =
    await Promise.all([
      // 1. Overdue bills — any month (status flips to Overdue via due date)
      db.payment.findMany({
        where: { status: 'Overdue' },
        select: { amount: true, paidAmount: true },
      }),
      // 2. Expenses awaiting approval (current month)
      db.expense.findMany({
        where: { status: 'Pending', date: { gte: monthStart, lte: monthEnd } },
        select: { amount: true },
      }),
      // 3. Active staff vs payroll rows for this month
      db.teacher.findMany({
        where: { status: 'Active' },
        select: { id: true },
      }),
      db.payrollRecord.findMany({
        where: { month: monthKey, status: 'Paid' },
        select: { id: true },
      }),
      // 4. Attendance concerns — students with ≥3 Absent/Late marks in 14d
      db.attendance.findMany({
        where: {
          personType: 'Student',
          date: { gte: fourteenDaysAgo, lte: now },
          status: { in: ['Absent', 'Late'] },
        },
        select: { personId: true },
      }),
      // 5. Celebrations in the next 7 days (birthdays + work anniversaries)
      db.student.findMany({
        where: { status: 'Active', dob: { not: null } },
        select: { dob: true },
      }),
      db.teacher.findMany({
        where: { status: 'Active', hireDate: { not: null } },
        select: { hireDate: true },
      }),
    ])

  const overdueTotal = round2(
    overduePayments.reduce((s, p) => s + Math.max(0, p.amount - p.paidAmount), 0),
  )
  const pendingExpenseTotal = round2(pendingExpenses.reduce((s, e) => s + e.amount, 0))

  const absentCounts = new Map<string, number>()
  for (const r of recentAttendance) {
    absentCounts.set(r.personId, (absentCounts.get(r.personId) ?? 0) + 1)
  }
  // 4+ absent/late marks in two weeks is a firm signal — lower thresholds
  // flag half the school on normal months (verified against live data).
  let atRiskStudents = 0
  for (const c of absentCounts.values()) if (c >= 4) atRiskStudents++

  // Next-occurrence birthday/anniversary counting (UTC-safe month/day match)
  let celebrations = 0
  const check = (d: Date | null) => {
    if (!d) return
    const m = d.getUTCMonth()
    const day = d.getUTCDate()
    for (let i = 0; i <= 7; i++) {
      const t = new Date(now)
      t.setDate(t.getDate() + i)
      if (t.getUTCMonth() === m && t.getUTCDate() === day) {
        celebrations++
        return
      }
    }
  }
  for (const s of dobWindow) check(s.dob)
  for (const t of hireWindow) check(t.hireDate)

  const alerts: {
    key: string
    section: string
    severity: 'high' | 'medium' | 'low' | 'info'
    title: string
    detail: string
    count: number
  }[] = []

  if (overduePayments.length > 0) {
    alerts.push({
      key: 'overdue-bills',
      section: 'fees',
      severity: 'high',
      title: 'Overdue fee bills',
      detail: `${overduePayments.length} bill${overduePayments.length === 1 ? '' : 's'} · LKR ${overdueTotal.toLocaleString()} unpaid`,
      count: overduePayments.length,
    })
  }
  if (pendingExpenses.length > 0) {
    alerts.push({
      key: 'pending-expenses',
      section: 'expenses',
      severity: 'medium',
      title: 'Expenses awaiting approval',
      detail: `${pendingExpenses.length} entr${pendingExpenses.length === 1 ? 'y' : 'ies'} · LKR ${pendingExpenseTotal.toLocaleString()} this month`,
      count: pendingExpenses.length,
    })
  }
  if (atRiskStudents > 0) {
    alerts.push({
      key: 'at-risk-attendance',
      section: 'attendance',
      severity: 'medium',
      title: 'Attendance concerns',
      detail: `${atRiskStudents} student${atRiskStudents === 1 ? '' : 's'} with 4+ absent/late marks in 14 days`,
      count: atRiskStudents,
    })
  }
  const unpaidStaff = Math.max(0, activeTeachers.length - paidPayroll.length)
  if (unpaidStaff > 0) {
    alerts.push({
      key: 'pending-payroll',
      section: 'payroll',
      severity: 'low',
      title: 'Salaries pending',
      detail: `${unpaidStaff} of ${activeTeachers.length} staff unpaid for ${monthKey}`,
      count: unpaidStaff,
    })
  }
  if (celebrations > 0) {
    alerts.push({
      key: 'celebrations',
      section: 'dashboard',
      severity: 'info',
      title: 'Celebrations ahead',
      detail: `${celebrations} birthday${celebrations === 1 ? '' : 's'}/anniversar${celebrations === 1 ? 'y' : 'ies'} in the next 7 days`,
      count: celebrations,
    })
  }

  return NextResponse.json({
    alerts,
    total: alerts.reduce((s, a) => s + a.count, 0),
    checkedAt: now.toISOString(),
  })
}
