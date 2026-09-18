// ─── Payroll routes — monthly salary register with EPF/ETF breakdown ───────
import { Router } from 'express'
import { PayrollRecord, Teacher, Class } from '../models'
import { ah, qs, breakdown, round2 } from '../helpers'

const r = Router()

const PAYROLL_METHODS = new Set(['Cash', 'Bank', 'Cheque'])

const currentMonth = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── GET /api/payroll?month= | ?teacher= ────────────────────────────────────
r.get('/', ah(async (req, res) => {
  const p = qs(req)

  const teacherIdParam = p.get('teacher')?.trim() || ''
  if (teacherIdParam) {
    const teacher = await Teacher.findById(teacherIdParam).lean()
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
    const t = teacher as any
    const records = await PayrollRecord.find({ teacherId: teacherIdParam })
      .sort({ month: -1 })
      .limit(24)
      .lean()
    const paid = (records as any[]).filter((x) => x.status === 'Paid')
    return res.json({
      teacher: {
        id: t._id.toString(),
        teacherId: t.teacherId,
        fullName: t.fullName,
        type: t.type,
      },
      history: (records as any[]).map((x) => ({
        month: x.month,
        gross: round2(x.gross),
        netSalary: round2(x.netSalary),
        epfEmployee: round2(x.epfEmployee),
        epfEmployer: round2(x.epfEmployer),
        etfEmployer: round2(x.etfEmployer),
        status: x.status,
        method: x.method,
        paidDate: x.paidDate ? new Date(x.paidDate).toISOString() : null,
        note: x.note ?? null,
      })),
      paidCount: paid.length,
      totalPaid: round2(paid.reduce((s, x) => s + x.netSalary, 0)),
    })
  }

  const month = p.get('month')?.trim() || currentMonth()
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month must be YYYY-MM' })
  }
  const q = p.get('q')?.trim() || ''
  const status = p.get('status')?.trim() || ''

  const [teachers, records] = await Promise.all([
    Teacher.find({ status: 'Active' }).sort({ type: 1, teacherId: 1 }).lean(),
    PayrollRecord.find({ month }).lean(),
  ])
  const classCounts = await (async () => {
    const rows = await Class.find({}, 'teacherId').lean()
    const m: Record<string, number> = {}
    for (const c of rows as any[]) {
      if (!c.teacherId) continue
      m[c.teacherId] = (m[c.teacherId] || 0) + 1
    }
    return m
  })()

  const recByTeacher = new Map((records as any[]).map((x) => [x.teacherId, x]))

  let rows = (teachers as any[]).map((t) => {
    const tid = t._id.toString()
    const live = breakdown(t.basicSalary, t.allowances)
    const rec = recByTeacher.get(tid) ?? null
    const paid = rec?.status === 'Paid'
    const figures = paid && rec ? rec : live
    return {
      teacher: {
        id: tid,
        teacherId: t.teacherId,
        fullName: t.fullName,
        type: t.type,
        epfNo: t.epfNo ?? null,
        classes: classCounts[tid] || 0,
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
      paidDate: rec?.paidDate ? new Date(rec.paidDate).toISOString() : null,
      note: rec?.note ?? null,
      recordId: rec?._id?.toString() ?? null,
    }
  })

  // External tuition teachers without a basic salary fall back to monthlyRate
  for (const row of rows) {
    if (row.teacher.type === 'External' && row.basicSalary <= 0 && row.gross <= 0) {
      const t = (teachers as any[]).find((x) => x._id.toString() === row.teacher.id)
      if (t && t.monthlyRate > 0) {
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
      (x) =>
        x.teacher.fullName.toLowerCase().includes(q.toLowerCase()) ||
        x.teacher.teacherId.toLowerCase().includes(q.toLowerCase()),
    )
  }
  if (status === 'Paid' || status === 'Pending') {
    rows = rows.filter((x) => x.status === status)
  }

  const totals = rows.reduce(
    (acc, x) => {
      acc.totalGross += x.gross
      acc.totalEpfEmployee += x.epfEmployee
      acc.totalNet += x.netSalary
      acc.totalEpfEmployer += x.epfEmployer
      acc.totalEtfEmployer += x.etfEmployer
      acc.totalEmployerCost += x.employerCost
      if (x.status === 'Paid') {
        acc.paidCount += 1
        acc.totalPaid += x.netSalary
      } else {
        acc.pendingCount += 1
        acc.totalPending += x.netSalary
      }
      return acc
    },
    {
      totalGross: 0, totalEpfEmployee: 0, totalNet: 0, totalEpfEmployer: 0,
      totalEtfEmployer: 0, totalEmployerCost: 0, paidCount: 0, pendingCount: 0,
      totalPaid: 0, totalPending: 0,
    },
  )

  res.json({
    month,
    data: rows,
    summary: {
      teachers: rows.length,
      ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, round2(v)])),
    },
  })
}))

// ─── POST /api/payroll — mark salaries paid / pending ───────────────────────
r.post('/', ah(async (req, res) => {
  const body = req.body || {}
  const month = (body.month || '').trim()
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month is required (YYYY-MM)' })
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return res.status(400).json({ error: 'entries array is required' })
  }
  if (body.entries.length > 200) {
    return res.status(400).json({ error: 'Too many entries (max 200)' })
  }

  const teacherIds = Array.from(
    new Set(body.entries.map((e: any) => e.teacherId?.trim()).filter((v: string) => !!v)),
  )
  const teachers = await Teacher.find({ _id: { $in: teacherIds } })
    .select('basicSalary allowances monthlyRate type')
    .lean()
  const byId = new Map((teachers as any[]).map((t) => [t._id.toString(), t]))

  let marked = 0
  const errors: string[] = []

  for (let i = 0; i < body.entries.length; i++) {
    const entry = body.entries[i]
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
    const paidDate = status === 'Paid' ? (entry.paidDate ? new Date(entry.paidDate) : new Date()) : null
    const note = entry.note?.trim() || null

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
      f.netSalary = f.gross
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

    await PayrollRecord.findOneAndUpdate(
      { teacherId: tid, month },
      { $set: data },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    marked++
  }

  res.json({
    ok: true,
    marked,
    failed: errors.length,
    errors: errors.slice(0, 20),
    message: `Payroll updated for ${marked} teacher${marked === 1 ? '' : 's'}${
      errors.length ? `, ${errors.length} row${errors.length === 1 ? '' : 's'} failed` : ''
    }.`,
  })
}))

export default r
