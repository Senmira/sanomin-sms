import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Weekly digest (share-ready operations summary) ─────────────────────────
// GET /api/reports/digest?days=7
// Aggregates the period's attendance (vs the previous period of equal length),
// current-month fees, expenses, payroll, upcoming celebrations, at-risk
// students and announcements into structured sections PLUS a ready-to-post
// plain-text digest (WhatsApp / announcement body). Powers the dashboard
// "Weekly Digest" card.

const SCHOOL_FALLBACK = 'SANOMIN International Preschool'

function lkr(n: number): string {
  return 'LKR ' + Math.round(n).toLocaleString('en-US')
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function todayUtc(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

function nextOccurrence(month: number, day: number, from: Date): Date {
  const y = from.getUTCFullYear()
  let d = new Date(Date.UTC(y, month - 1, day))
  if (d.getTime() < from.getTime()) d = new Date(Date.UTC(y + 1, month - 1, day))
  return d
}

function schoolName(): Promise<string> {
  return db.setting
    .findUnique({ where: { key: 'school_name' } })
    .then((s) => (s?.value || '').trim() || SCHOOL_FALLBACK)
    .catch(() => SCHOOL_FALLBACK)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const days = Math.min(31, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10) || 7))
  const now = new Date()

  // Current period: last `days` days including today
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  // Previous period of equal length, directly before
  const prevEnd = new Date(start)
  prevEnd.setDate(prevEnd.getDate() - 1)
  prevEnd.setHours(23, 59, 59, 999)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - (days - 1))
  prevStart.setHours(0, 0, 0, 0)

  // Current month for money sections
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [
    name,
    att,
    prevAtt,
    windowAtt, // combined window (prev + current) for per-student at-risk detection
    monthPayments,
    monthExpenses,
    monthPayroll,
    announcements,
    students,
  ] = await Promise.all([
    schoolName(),
    db.attendance.findMany({
      where: { personType: 'Student', date: { gte: start, lte: end } },
      select: { status: true },
    }),
    db.attendance.findMany({
      where: { personType: 'Student', date: { gte: prevStart, lte: prevEnd } },
      select: { status: true },
    }),
    db.attendance.findMany({
      where: { personType: 'Student', date: { gte: prevStart, lte: end } },
      select: { personId: true, personRef: true, status: true },
    }),
    db.payment.findMany({
      where: { month: monthKey },
      select: { amount: true, paidAmount: true, status: true },
    }),
    db.expense.findMany({
      // Digest reports approved spend; rejected rows are voided. Pending rows
      // are surfaced separately as an "awaiting approval" callout.
      where: { date: { gte: monthStart, lt: monthEnd }, status: { not: 'Rejected' } },
      select: { amount: true, category: true, status: true },
    }),
    db.payrollRecord.findMany({
      where: { month: monthKey, status: 'Paid' },
      select: { netSalary: true },
    }),
    db.announcement.count({
      where: { publishDate: { gte: start, lte: end }, status: 'Published' },
    }),
    db.student.findMany({
      where: { status: 'Active', dob: { not: null } },
      select: { studentId: true, fullName: true, dob: true },
    }),
  ])

  // ── Attendance: rate now vs previous period ──
  const rateOf = (rows: { status: string }[]) => {
    const marked = rows.length
    const positive = rows.filter((r) => r.status === 'Present' || r.status === 'Late').length
    return marked > 0 ? Math.round((positive / marked) * 100) : null
  }
  const statusCount = (rows: { status: string }[], s: string) =>
    rows.filter((r) => r.status === s).length

  const rate = rateOf(att)
  const prevRate = rateOf(prevAtt)
  const delta = rate !== null && prevRate !== null ? rate - prevRate : null

  // ── At-risk: students under 75% across the combined window (≥3 marks) ──
  const perStudent = new Map<string, { ref: string; present: number; marked: number }>()
  for (const r of windowAtt) {
    const cur = perStudent.get(r.personId) ?? { ref: r.personRef, present: 0, marked: 0 }
    cur.marked += 1
    if (r.status === 'Present' || r.status === 'Late') cur.present += 1
    perStudent.set(r.personId, cur)
  }
  const atRiskAll = [...perStudent.entries()]
    .filter(([, v]) => v.marked >= 3 && v.present / v.marked < 0.75)
    .map(([personId, v]) => ({ id: personId, ref: v.ref, rate: Math.round((v.present / v.marked) * 100) }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 5)
  const riskNames = new Map(
    (
      await db.student.findMany({
        where: { id: { in: atRiskAll.map((a) => a.id) } },
        select: { id: true, fullName: true },
      })
    ).map((s) => [s.id, s.fullName]),
  )
  const atRisk = atRiskAll.map((a) => ({ ref: a.ref, name: riskNames.get(a.id) ?? 'Unknown', rate: a.rate }))

  // ── Fees (current month) ──
  const collected = monthPayments.reduce((n, p) => n + p.paidAmount, 0)
  const billed = monthPayments.reduce((n, p) => n + p.amount, 0)
  const outstandingBills = monthPayments.filter((p) => p.amount - p.paidAmount > 0.01)
  const outstanding = outstandingBills.reduce((n, p) => n + (p.amount - p.paidAmount), 0)
  const overdue = monthPayments.filter((p) => p.status === 'Overdue').length

  // ── Expenses (current month) ──
  const expenseTotal = monthExpenses.reduce((n, e) => n + e.amount, 0)
  const byCategory = new Map<string, number>()
  for (const e of monthExpenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount)
  }
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  const pendingExpenses = monthExpenses.filter((e) => e.status === 'Pending')
  const pendingExpenseTotal = pendingExpenses.reduce((n, e) => n + e.amount, 0)

  // ── Payroll (current month, paid) ──
  const paidSalaries = monthPayroll.reduce((n, p) => n + p.netSalary, 0)
  const paidTeachers = monthPayroll.length

  // ── Celebrations (next `days` days) ──
  const today = todayUtc()
  const horizon = new Date(today.getTime() + days * 86_400_000)
  const celebrations: { name: string; kind: 'birthday' | 'anniversary'; when: string; daysUntil: number }[] = []
  for (const s of students) {
    if (!s.dob) continue
    const next = nextOccurrence(s.dob.getUTCMonth() + 1, s.dob.getUTCDate(), today)
    if (next.getTime() > horizon.getTime()) continue
    celebrations.push({
      name: s.fullName,
      kind: 'birthday',
      when: next.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      daysUntil: Math.round((next.getTime() - today.getTime()) / 86_400_000),
    })
  }
  celebrations.sort((a, b) => a.daysUntil - b.daysUntil)

  const periodLabel = `${dayLabel(start)} – ${dayLabel(end)} ${end.getFullYear()}`
  const monthLabel = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  const data = {
    days,
    period: { start: start.toISOString(), end: end.toISOString(), label: periodLabel },
    schoolName: name,
    attendance: {
      records: att.length,
      present: statusCount(att, 'Present'),
      late: statusCount(att, 'Late'),
      absent: statusCount(att, 'Absent'),
      leave: statusCount(att, 'Leave'),
      rate,
      prevRate,
      delta,
      atRiskTotal: atRiskAll.length,
      atRisk,
    },
    fees: {
      month: monthKey,
      monthLabel,
      billed,
      collected,
      outstanding,
      outstandingBills: outstandingBills.length,
      overdue,
    },
    expenses: {
      total: expenseTotal,
      count: monthExpenses.length,
      topCategory: topCategory ? { name: topCategory[0], total: topCategory[1] } : null,
      pendingCount: pendingExpenses.length,
      pendingTotal: pendingExpenseTotal,
    },
    payroll: { paidCount: paidTeachers, paidTotal: paidSalaries },
    people: { celebrationsCount: celebrations.length, celebrations: celebrations.slice(0, 5) },
    announcementsPosted: announcements,
    generatedAt: new Date().toISOString(),
  }

  // ── Ready-to-post text digest ──
  const attLine =
    rate !== null
      ? `${rate}% average attendance (${att.length} record${att.length === 1 ? '' : 's'}` +
        (delta !== null
          ? `, ${delta >= 0 ? '+' : '−'}${Math.abs(delta)}% vs previous ${days} days`
          : '') +
        ')'
      : `No attendance records in the last ${days} days`
  const lines: string[] = [
    `📋 ${name} — ${days}-Day Digest`,
    periodLabel,
    '',
    'ATTENDANCE',
    `• ${attLine}`,
    atRisk.length > 0
      ? `• ⚠️ ${atRisk.length} student${atRisk.length === 1 ? '' : 's'} below 75% — needs follow-up`
      : '• ✅ No attendance concerns detected',
    '',
    `FEES — ${monthLabel}`,
    `• ${lkr(collected)} collected of ${lkr(billed)} billed`,
    outstanding > 0
      ? `• ${lkr(outstanding)} outstanding across ${outstandingBills.length} bill${outstandingBills.length === 1 ? '' : 's'}${overdue > 0 ? ` (${overdue} overdue)` : ''}`
      : '• ✅ All bills settled',
    '',
    `FINANCES — ${monthLabel}`,
    `• Expenses ${lkr(expenseTotal)}${topCategory ? ` (top: ${topCategory[0]} ${lkr(topCategory[1])})` : ''}`,
    ...(pendingExpenses.length > 0
      ? [`• ⏳ ${pendingExpenses.length} expense${pendingExpenses.length === 1 ? '' : 's'} awaiting approval — ${lkr(pendingExpenseTotal)}`]
      : []),
    ...(paidTeachers > 0
      ? [`• Salaries paid to ${paidTeachers} staff member${paidTeachers === 1 ? '' : 's'} — ${lkr(paidSalaries)}`]
      : []),
    '',
    'PEOPLE',
    celebrations.length > 0
      ? `• 🎉 ${celebrations.length} celebration${celebrations.length === 1 ? '' : 's'} ahead: ${celebrations
          .slice(0, 3)
          .map((c) => `${c.name.split(' ')[0]} (${c.when})`)
          .join(', ')}${celebrations.length > 3 ? '…' : ''}`
      : '• No birthdays or anniversaries in the window',
    `• ${announcements} announcement${announcements === 1 ? '' : 's'} published this period`,
  ]

  const text = lines.join('\n')

  return NextResponse.json({ ...data, text })
}
