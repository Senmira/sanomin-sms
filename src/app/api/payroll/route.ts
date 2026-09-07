import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Monthly payroll register ───────────────────────────────────────────────
// GET  /api/payroll?month=YYYY-MM
//      → one register row per ACTIVE teacher: live salary + EPF/ETF breakdown
//        merged with any persisted PayrollRecord (paid snapshot) for the month.
// POST /api/payroll
//      body: { month, entries: [{ teacherId, status: "Paid"|"Pending",
//                                method?, note?, paidDate? }] }
//      → upserts PayrollRecord rows (unique teacherId+month), snapshotting the
//        teacher's CURRENT salary figures when marking Paid.

const PAYROLL_METHODS = new Set(['Cash', 'Bank', 'Cheque'])

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function breakdown(basic: number, allowances: number) {
  const b = Math.max(0, basic || 0)
  const a = Math.max(0, allowances || 0)
  const gross = b + a
  const epfEmployee = b * 0.08
  const netSalary = gross - epfEmployee
  const epfEmployer = b * 0.12
  const etfEmployer = b * 0.03
  const employerCost = gross + epfEmployer + etfEmployer
  return {
    basicSalary: b,
    allowances: a,
    gross,
    epfEmployee,
    netSalary,
    epfEmployer,
    etfEmployer,
    employerCost,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── GET /api/payroll?month=YYYY-MM ────────────────────────────────────────
//      /api/payroll?teacher=<Teacher.id> → salary history (profile dialog)
export async function GET(req: Request) {
  const url = new URL(req.url)

  // Salary history for a single teacher across all recorded months
  const teacherIdParam = url.searchParams.get('teacher')?.trim() || ''
  if (teacherIdParam) {
    const teacher = await db.teacher.findUnique({
      where: { id: teacherIdParam },
      select: { id: true, teacherId: true, fullName: true, type: true },
    })
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }
    const records = await db.payrollRecord.findMany({
      where: { teacherId: teacherIdParam },
      orderBy: [{ month: 'desc' }],
      take: 24,
    })
    const paid = records.filter((r) => r.status === 'Paid')
    return NextResponse.json({
      teacher: {
        id: teacher.id,
        teacherId: teacher.teacherId,
        fullName: teacher.fullName,
        type: teacher.type,
      },
      history: records.map((r) => ({
        month: r.month,
        gross: round2(r.gross),
        netSalary: round2(r.netSalary),
        epfEmployee: round2(r.epfEmployee),
        epfEmployer: round2(r.epfEmployer),
        etfEmployer: round2(r.etfEmployer),
        status: r.status,
        method: r.method,
        paidDate: r.paidDate ? r.paidDate.toISOString() : null,
        note: r.note,
      })),
      paidCount: paid.length,
      totalPaid: round2(paid.reduce((s, r) => s + r.netSalary, 0)),
    })
  }

  const month = url.searchParams.get('month')?.trim() || currentMonth()
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }
  const q = url.searchParams.get('q')?.trim() || ''
  const status = url.searchParams.get('status')?.trim() || ''

  const [teachers, records] = await Promise.all([
    db.teacher.findMany({
      where: { status: 'Active' },
      orderBy: [{ type: 'asc' }, { teacherId: 'asc' }],
      select: {
        id: true,
        teacherId: true,
        fullName: true,
        type: true,
        status: true,
        basicSalary: true,
        allowances: true,
        monthlyRate: true,
        epfNo: true,
        salaryNote: true,
        _count: { select: { classes: true } },
      },
    }),
    db.payrollRecord.findMany({
      where: { month },
      select: {
        id: true,
        teacherId: true,
        month: true,
        basicSalary: true,
        allowances: true,
        gross: true,
        epfEmployee: true,
        netSalary: true,
        epfEmployer: true,
        etfEmployer: true,
        employerCost: true,
        status: true,
        method: true,
        paidDate: true,
        note: true,
      },
    }),
  ])

  const recByTeacher = new Map(records.map((r) => [r.teacherId, r]))

  let rows = teachers.map((t) => {
    const live = breakdown(t.basicSalary, t.allowances)
    const rec = recByTeacher.get(t.id) ?? null
    const paid = rec?.status === 'Paid'
    // Paid rows show the persisted snapshot; pending rows show live figures
    const figures = paid && rec ? rec : live
    return {
      teacher: {
        id: t.id,
        teacherId: t.teacherId,
        fullName: t.fullName,
        type: t.type,
        epfNo: t.epfNo,
        classes: t._count.classes,
      },
      month,
      basicSalary: round2(figures.basicSalary),
      allowances: round2(figures.allowances),
      gross: round2(figures.gross),
      epfEmployee: round2(figures.epfEmployee),
      netSalary: round2(figures.netSalary),
      epfEmployer: round2(figures.epfEmployer),
      etfEmployer: round2(figures.etfEmployer),
      employerCost: round2(figures.employerCost),
      status: rec?.status ?? 'Pending',
      method: rec?.method ?? null,
      paidDate: rec?.paidDate ? rec.paidDate.toISOString() : null,
      note: rec?.note ?? null,
      recordId: rec?.id ?? null,
    }
  })

  // External tuition teachers without a basic salary fall back to monthlyRate
  for (const row of rows) {
    if (row.teacher.type === 'External' && row.basicSalary <= 0 && row.gross <= 0) {
      const t = teachers.find((x) => x.id === row.teacher.id)
      if (t && t.monthlyRate > 0) {
        const live = breakdown(t.monthlyRate, 0)
        // For rate-only externals: no statutory contributions on tuition rate
        row.basicSalary = round2(t.monthlyRate)
        row.allowances = 0
        row.gross = round2(t.monthlyRate)
        row.epfEmployee = 0
        row.netSalary = round2(t.monthlyRate)
        row.epfEmployer = 0
        row.etfEmployer = 0
        row.employerCost = round2(t.monthlyRate)
      }
    }
  }

  if (q) {
    rows = rows.filter(
      (r) =>
        r.teacher.fullName.toLowerCase().includes(q.toLowerCase()) ||
        r.teacher.teacherId.toLowerCase().includes(q.toLowerCase()),
    )
  }
  if (status === 'Paid' || status === 'Pending') {
    rows = rows.filter((r) => r.status === status)
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalGross += r.gross
      acc.totalEpfEmployee += r.epfEmployee
      acc.totalNet += r.netSalary
      acc.totalEpfEmployer += r.epfEmployer
      acc.totalEtfEmployer += r.etfEmployer
      acc.totalEmployerCost += r.employerCost
      if (r.status === 'Paid') {
        acc.paidCount += 1
        acc.totalPaid += r.netSalary
      } else {
        acc.pendingCount += 1
        acc.totalPending += r.netSalary
      }
      return acc
    },
    {
      totalGross: 0,
      totalEpfEmployee: 0,
      totalNet: 0,
      totalEpfEmployer: 0,
      totalEtfEmployer: 0,
      totalEmployerCost: 0,
      paidCount: 0,
      pendingCount: 0,
      totalPaid: 0,
      totalPending: 0,
    },
  )

  return NextResponse.json({
    month,
    data: rows,
    summary: {
      teachers: rows.length,
      ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
    },
  })
}

// ─── POST /api/payroll — mark salaries paid / pending ──────────────────────
interface PayrollBody {
  month?: string
  entries?: Array<{
    teacherId?: string
    status?: string
    method?: string
    note?: string | null
    paidDate?: string | null
  }>
}

export async function POST(req: Request) {
  let body: PayrollBody
  try {
    body = (await req.json()) as PayrollBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const month = body.month?.trim()
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 })
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: 'entries array is required' }, { status: 400 })
  }
  if (body.entries.length > 200) {
    return NextResponse.json({ error: 'Too many entries (max 200)' }, { status: 400 })
  }

  const teacherIds = Array.from(
    new Set(body.entries.map((e) => e.teacherId?.trim()).filter((v): v is string => !!v)),
  )
  const teachers = await db.teacher.findMany({
    where: { id: { in: teacherIds } },
    select: {
      id: true,
      basicSalary: true,
      allowances: true,
      monthlyRate: true,
      type: true,
    },
  })
  const byId = new Map(teachers.map((t) => [t.id, t]))

  let marked = 0
  const errors: string[] = []

  await db.$transaction(async (tx) => {
    for (let i = 0; i < body.entries!.length; i++) {
      const entry = body.entries![i]
      const tid = entry.teacherId?.trim()
      if (!tid) {
        errors.push(`Row ${i + 1}: teacherId is required`)
        continue
      }
      const teacher = byId.get(tid)
      if (!teacher) {
        errors.push(`Row ${i + 1}: teacher not found`)
        continue
      }
      const status = entry.status === 'Pending' ? 'Pending' : entry.status === 'Paid' ? 'Paid' : null
      if (!status) {
        errors.push(`Row ${i + 1}: status must be Paid or Pending`)
        continue
      }
      const method = entry.method && PAYROLL_METHODS.has(entry.method) ? entry.method : 'Cash'
      const paidDate =
        status === 'Paid' ? (entry.paidDate ? new Date(entry.paidDate) : new Date()) : null
      const note = entry.note?.trim() || null

      // Rate-only externals: tuition rate, no statutory contributions
      const isRateOnlyExternal =
        teacher.type === 'External' && teacher.basicSalary <= 0 && teacher.monthlyRate > 0
      const f = isRateOnlyExternal
        ? breakdown(teacher.monthlyRate, 0)
        : breakdown(teacher.basicSalary, teacher.allowances)
      if (isRateOnlyExternal) {
        f.epfEmployee = 0
        f.epfEmployer = 0
        f.etfEmployer = 0
        f.employerCost = f.gross
        f.netSalary = f.gross // tuition rate is net — no statutory deductions
      }

      const data = {
        basicSalary: round2(f.basicSalary),
        allowances: round2(f.allowances),
        gross: round2(f.gross),
        epfEmployee: round2(f.epfEmployee),
        netSalary: round2(f.netSalary),
        epfEmployer: round2(f.epfEmployer),
        etfEmployer: round2(f.etfEmployer),
        employerCost: round2(f.employerCost),
        status,
        method,
        paidDate,
        note,
        month,
      }

      await tx.payrollRecord.upsert({
        where: { teacherId_month: { teacherId: tid, month } },
        create: { teacherId: tid, ...data },
        update: data,
      })
      marked++
    }
  })

  return NextResponse.json({
    ok: true,
    marked,
    failed: errors.length,
    errors: errors.slice(0, 20),
    message: `Payroll updated for ${marked} teacher${marked === 1 ? '' : 's'}${
      errors.length ? `, ${errors.length} row${errors.length === 1 ? '' : 's'} failed` : ''
    }.`,
  })
}
