// ─── Payroll routes — monthly salary register with EPF/ETF breakdown ───────
import { Router } from 'express'
import { PayrollRecord, Teacher, Class, Enrollment } from '../models'
import { ah, qs, breakdown, round2 } from '../helpers'

const r = Router()

const PAYROLL_METHODS = new Set(['Cash', 'Bank', 'Cheque'])

const currentMonth = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── Class-earnings calculator ──────────────────────────────────────────────
// For each active class a teacher teaches, the teacher's share is:
//     enrolledCount × class.fee × (100 − class.instituteSharePct) / 100
//
// Returns { total, breakdown[] } where breakdown has one row per class with
// the fields needed to display "5 students × LKR 675 = LKR 3,375".
async function computeTeacherEarnings(teacherId: string): Promise<{
  total: number
  breakdown: Array<{
    classId: string | null
    className: string | null
    enrolledCount: number
    classFee: number
    teacherShare: number
  }>
}> {
  const classes = await Class.find({ teacherId, active: true }).lean()
  if (classes.length === 0) return { total: 0, breakdown: [] }

  const classIds = classes.map((c: any) => c._id.toString())

  // Aggregate active enrolments per class in one query
  const enrollAgg = await Enrollment.aggregate([
    { $match: { classId: { $in: classIds }, status: 'Active' } },
    { $group: { _id: '$classId', count: { $sum: 1 } } },
  ])
  const countByClass = new Map<string, number>()
  for (const row of enrollAgg as any[]) {
    countByClass.set(String(row._id), row.count)
  }

  let total = 0
  const breakdown: Array<{
    classId: string | null
    className: string | null
    enrolledCount: number
    classFee: number
    teacherShare: number
  }> = []

  for (const c of classes as any[]) {
    const cid = c._id.toString()
    const enrolled = countByClass.get(cid) ?? 0
    const sharePct = 100 - (typeof c.instituteSharePct === 'number' ? c.instituteSharePct : 25)
    const perStudent = (c.fee ?? 0) * (sharePct / 100)
    const teacherShare = round2(enrolled * perStudent)
    total += teacherShare
    breakdown.push({
      classId: cid,
      className: c.name ?? null,
      enrolledCount: enrolled,
      classFee: c.fee ?? 0,
      teacherShare,
    })
  }

  return { total: round2(total), breakdown }
}

// ─── GET /api/payroll?month= | ?teacher= ────────────────────────────────────
r.get('/', ah(async (req, res) => {
  const p = qs(req)

  // ── Single-teacher history view ──────────────────────────────────────────
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
        basicSalary: round2(x.basicSalary ?? 0),
        allowances: round2(x.allowances ?? 0),
        classEarnings: round2(x.classEarnings ?? 0),
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

  // ── Monthly register view ────────────────────────────────────────────────
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

  // Build a row for every teacher. If a PayrollRecord exists for the month
  // AND it's already marked Paid, use its frozen numbers. Otherwise recompute
  // live (basic/allowances + class earnings) so the UI always reflects the
  // latest enrolment counts.
  const rows = await Promise.all(
    (teachers as any[]).map(async (t) => {
      const tid = t._id.toString()
      const rec = recByTeacher.get(tid) ?? null
      const isPaid = rec?.status === 'Paid'
      const isExternal = t.type === 'External'

      let basicSalary: number
      let allowances: number
      let classEarnings: number
      let classBreakdown: any[]

      if (isPaid && rec) {
        // Frozen snapshot — don't recompute for already-paid months
        basicSalary = rec.basicSalary ?? 0
        allowances = rec.allowances ?? 0
        classEarnings = rec.classEarnings ?? 0
        classBreakdown = rec.classBreakdown ?? []
      } else {
        // Live recompute
        const earnings = await computeTeacherEarnings(tid)
        basicSalary = isExternal ? 0 : (t.basicSalary ?? 0)
        allowances = isExternal ? 0 : (t.allowances ?? 0)
        classEarnings = earnings.total
        classBreakdown = earnings.breakdown
      }

      // External teachers: no EPF/ETF, gross = class earnings only
      // Internal teachers: gross = basic + allowances + class earnings,
      //                   EPF 8% employee + 12% employer + ETF 3% on BASIC only
      const gross = round2(basicSalary + allowances + classEarnings)
      const epfEmployee = isExternal ? 0 : round2(basicSalary * 0.08)
      const epfEmployer = isExternal ? 0 : round2(basicSalary * 0.12)
      const etfEmployer = isExternal ? 0 : round2(basicSalary * 0.03)
      const netSalary = round2(gross - epfEmployee)
      const employerCost = round2(gross + epfEmployer + etfEmployer)

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
        basicSalary: round2(basicSalary),
        allowances: round2(allowances),
        classEarnings: round2(classEarnings),
        classBreakdown,
        gross,
        epfEmployee,
        netSalary,
        epfEmployer,
        etfEmployer,
        employerCost,
        status: rec?.status ?? 'Pending',
        method: rec?.method ?? null,
        paidDate: rec?.paidDate ? new Date(rec.paidDate).toISOString() : null,
        note: rec?.note ?? null,
        recordId: rec?._id?.toString() ?? null,
      }
    }),
  )

  let filtered = rows
  if (q) {
    const ql = q.toLowerCase()
    filtered = filtered.filter(
      (x) =>
        x.teacher.fullName.toLowerCase().includes(ql) ||
        x.teacher.teacherId.toLowerCase().includes(ql),
    )
  }
  if (status === 'Paid' || status === 'Pending') {
    filtered = filtered.filter((x) => x.status === status)
  }

  const totals = filtered.reduce(
    (acc, x) => {
      acc.totalBasic += x.basicSalary
      acc.totalAllowances += x.allowances
      acc.totalClassEarnings += x.classEarnings
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
      totalBasic: 0, totalAllowances: 0, totalClassEarnings: 0, totalGross: 0,
      totalEpfEmployee: 0, totalNet: 0, totalEpfEmployer: 0,
      totalEtfEmployer: 0, totalEmployerCost: 0, paidCount: 0, pendingCount: 0,
      totalPaid: 0, totalPending: 0,
    },
  )

  res.json({
    month,
    data: filtered,
    summary: {
      teachers: filtered.length,
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
    const paidDate =
      status === 'Paid' ? (entry.paidDate ? new Date(entry.paidDate) : new Date()) : null
    const note = entry.note?.trim() || null

    const isExternal = (teacher as any).type === 'External'

    // Compute class earnings fresh (enrolments might have changed since GET)
    const earnings = await computeTeacherEarnings(tid)

    const basicSalary = isExternal ? 0 : (teacher as any).basicSalary ?? 0
    const allowances = isExternal ? 0 : (teacher as any).allowances ?? 0
    const classEarnings = earnings.total
    const gross = round2(basicSalary + allowances + classEarnings)
    const epfEmployee = isExternal ? 0 : round2(basicSalary * 0.08)
    const epfEmployer = isExternal ? 0 : round2(basicSalary * 0.12)
    const etfEmployer = isExternal ? 0 : round2(basicSalary * 0.03)
    const netSalary = round2(gross - epfEmployee)
    const employerCost = round2(gross + epfEmployer + etfEmployer)

    const data = {
      basicSalary: round2(basicSalary),
      allowances: round2(allowances),
      classEarnings: round2(classEarnings),
      classBreakdown: earnings.breakdown,
      gross,
      epfEmployee,
      netSalary,
      epfEmployer,
      etfEmployer,
      employerCost,
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
