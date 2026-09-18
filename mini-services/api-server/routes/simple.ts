// ─── Simple routes: root, settings, programs, announcements, search,
//     notifications, celebrations ────────────────────────────────────────────
import { Router } from 'express'
import mongoose from 'mongoose'
import { Program, Announcement, Setting, Student, Teacher, Payment, Enrollment, Class, Guardian, Expense, PayrollRecord, Attendance } from '../models'
import {
  ah, qs, containsRe, round2, todayUtc, nextOccurrence, yearsBetween, isReachablePhone,
} from '../helpers'

const r = Router()

// GET /api — root health (mirrors old hello-world route)
r.get('/', (_req, res) => {
  res.json({ message: 'Hello, world!' })
})
r.get('/health', (_req, res) => {
  res.json({ ok: true, server: 'sanomin-api', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', ts: new Date().toISOString() })
})

// ─── Settings ───────────────────────────────────────────────────────────────
r.get('/settings', ah(async (_req, res) => {
  const rows = await Setting.find({}).lean()
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  res.json(settings)
}))

r.put('/settings', ah(async (req, res) => {
  const body = req.body as Record<string, string>
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Body must be an object' })
  }
  for (const [key, value] of Object.entries(body)) {
    await Setting.findOneAndUpdate(
      { key },
      { $set: { value: String(value) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  }
  res.json({ ok: true })
}))

// ─── Programs ───────────────────────────────────────────────────────────────
const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

async function programWithCounts(id?: string) {
  const programs = await Program.find(id ? { _id: id } : {}).sort({ code: 1 }).lean()
  const ids = programs.map((p: any) => p._id.toString())
  const [enrRows, clsRows] = await Promise.all([
    Enrollment.find({ programId: { $in: ids } }, 'programId').lean(),
    Class.find({ programId: { $in: ids } }, 'programId').lean(),
  ])
  const eMap: Record<string, number> = {}
  for (const e of enrRows) eMap[e.programId] = (eMap[e.programId] || 0) + 1
  const cMap: Record<string, number> = {}
  for (const c of clsRows) cMap[c.programId] = (cMap[c.programId] || 0) + 1
  return { programs, eMap, cMap }
}

function serializeProgram(p: any, eMap: Record<string, number>, cMap: Record<string, number>) {
  const id = p._id.toString()
  return {
    id,
    code: p.code,
    name: p.name,
    description: p.description ?? null,
    color: p.color,
    monthlyFee: p.monthlyFee,
    active: p.active,
    _count: { enrollments: eMap[id] || 0, classes: cMap[id] || 0 },
  }
}

r.get('/programs', ah(async (req, res) => {
  const onlyActive = qs(req).get('active') === 'true'
  const { programs, eMap, cMap } = await programWithCounts()
  const filtered = onlyActive ? programs.filter((p: any) => p.active) : programs
  res.json({ data: filtered.map((p: any) => serializeProgram(p, eMap, cMap)) })
}))

r.post('/programs', ah(async (req, res) => {
  const body = req.body || {}
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!code) return res.status(400).json({ error: 'code is required' })
  if (!name) return res.status(400).json({ error: 'name is required' })
  const clash = await Program.findOne({ code })
  if (clash) return res.status(400).json({ error: `Program code "${code}" already exists` })
  const rawColor = (body.color || '').trim()
  const color = COLOR_RE.test(rawColor) ? rawColor : '#7c3aed'
  const monthlyFee =
    typeof body.monthlyFee === 'number' && !isNaN(body.monthlyFee) ? Math.max(0, body.monthlyFee) : 0
  const created = await Program.create({
    code,
    name,
    description: body.description?.trim() || null,
    color,
    monthlyFee,
    active: body.active ?? true,
  })
  const doc = created.toJSON()
  res.status(201).json({ ...doc, _count: { enrollments: 0, classes: 0 } })
}))

r.get('/programs/:id', ah(async (req, res) => {
  const p = await Program.findById(req.params.id).lean()
  if (!p) return res.status(404).json({ error: 'Program not found' })
  const { eMap, cMap } = await programWithCounts()
  res.json(serializeProgram(p, eMap, cMap))
}))

r.put('/programs/:id', ah(async (req, res) => {
  const existing = await Program.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Program not found' })
  const body = req.body || {}
  if (body.code !== undefined) {
    const code = body.code.trim().toUpperCase()
    if (!code) return res.status(400).json({ error: 'code cannot be empty' })
    if (code !== existing.code) {
      const clash = await Program.findOne({ code, _id: { $ne: existing._id } })
      if (clash) return res.status(400).json({ error: `Program code "${code}" already exists` })
    }
    existing.code = code
  }
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return res.status(400).json({ error: 'name cannot be empty' })
    existing.name = name
  }
  if (body.description !== undefined) existing.description = body.description?.trim() || null
  if (body.color !== undefined) {
    const raw = (body.color || '').trim()
    existing.color = COLOR_RE.test(raw) ? raw : '#7c3aed'
  }
  if (body.monthlyFee !== undefined) {
    existing.monthlyFee =
      typeof body.monthlyFee === 'number' && !isNaN(body.monthlyFee) ? Math.max(0, body.monthlyFee) : 0
  }
  if (body.active !== undefined) existing.active = Boolean(body.active)
  await existing.save()
  const p = await Program.findById(existing._id).lean()
  const { eMap, cMap } = await programWithCounts()
  res.json(serializeProgram(p, eMap, cMap))
}))

r.delete('/programs/:id', ah(async (req, res) => {
  const id = req.params.id
  const existing = await Program.findById(id).lean()
  if (!existing) return res.status(404).json({ error: 'Program not found' })
  const [enrolled, classes] = await Promise.all([
    Enrollment.countDocuments({ programId: id }),
    Class.countDocuments({ programId: id }),
  ])
  if (enrolled > 0 || classes > 0) {
    return res.status(400).json({
      error:
        `Cannot delete "${existing.name}" — it has ${enrolled} enrollment(s)` +
        ` and ${classes} class(es) attached. Reassign or remove them first.`,
    })
  }
  await Program.deleteOne({ _id: id })
  res.json({ ok: true, id, code: existing.code, name: existing.name })
}))

// ─── Announcements ──────────────────────────────────────────────────────────
const annJson = (row: any) => {
  const j = row.toJSON ? row.toJSON() : row
  return {
    ...j,
    publishDate: new Date(j.publishDate).toISOString(),
    expiryDate: j.expiryDate ? new Date(j.expiryDate).toISOString() : null,
    createdAt: new Date(j.createdAt).toISOString(),
    updatedAt: new Date(j.updatedAt).toISOString(),
  }
}

r.get('/announcements', ah(async (req, res) => {
  const p = qs(req)
  const status = p.get('status') || 'Published'
  const category = p.get('category')
  const audience = p.get('audience')
  const priority = p.get('priority')
  const q = p.get('q')?.trim()
  const pinned = p.get('pinned')
  const limit = Math.min(parseInt(p.get('limit') || '50', 10) || 50, 100)

  const where: Record<string, unknown> = {}
  if (status !== 'All') where.status = status
  if (category) where.category = category
  if (audience && audience !== 'All') where.audience = { $in: [audience, 'All'] }
  if (priority) where.priority = priority
  if (pinned === 'true') where.pinned = true
  if (q) where.$or = [{ title: containsRe(q) }, { body: containsRe(q) }]

  const [rows, total, summaryRows] = await Promise.all([
    Announcement.find(where).sort({ pinned: -1, publishDate: -1, createdAt: -1 }).limit(limit),
    Announcement.countDocuments(where),
    Announcement.find({ status: 'Published' }, 'category priority audience pinned').lean(),
  ])

  const summary = {
    total: summaryRows.length,
    byCategory: {} as Record<string, number>,
    byPriority: { High: 0, Normal: 0, Low: 0 },
    byAudience: { All: 0, Staff: 0, Parents: 0, Teachers: 0 },
    pinnedCount: 0,
  }
  for (const row of summaryRows) {
    summary.byCategory[row.category] = (summary.byCategory[row.category] || 0) + 1
    if (row.priority in summary.byPriority) (summary.byPriority as any)[row.priority]++
    if (row.audience in summary.byAudience) (summary.byAudience as any)[row.audience]++
    if (row.pinned) summary.pinnedCount++
  }

  res.json({ data: rows.map(annJson), total, summary })
}))

r.post('/announcements', ah(async (req, res) => {
  const body = req.body || {}
  if (!body.title || !body.body) {
    return res.status(400).json({ error: 'title and body are required' })
  }
  const created = await Announcement.create({
    title: String(body.title).trim(),
    body: String(body.body).trim(),
    category: body.category || 'General',
    audience: body.audience || 'All',
    priority: body.priority || 'Normal',
    pinned: !!body.pinned,
    status: body.status || 'Published',
    publishDate: body.publishDate ? new Date(body.publishDate) : new Date(),
    expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
    authorName: body.authorName || 'Administrator',
  })
  res.status(201).json(annJson(created))
}))

r.get('/announcements/:id', ah(async (req, res) => {
  const row = await Announcement.findById(req.params.id)
  if (!row) return res.status(404).json({ error: 'Announcement not found' })
  res.json(annJson(row))
}))

r.put('/announcements/:id', ah(async (req, res) => {
  const row = await Announcement.findById(req.params.id)
  if (!row) return res.status(404).json({ error: 'Announcement not found' })
  const body = req.body || {}
  if (body.title !== undefined) row.title = String(body.title).trim()
  if (body.body !== undefined) row.body = String(body.body).trim()
  if (body.category !== undefined) row.category = body.category
  if (body.audience !== undefined) row.audience = body.audience
  if (body.priority !== undefined) row.priority = body.priority
  if (body.pinned !== undefined) row.pinned = !!body.pinned
  if (body.status !== undefined) row.status = body.status
  if (body.publishDate) row.publishDate = new Date(body.publishDate)
  if (body.expiryDate === null) row.expiryDate = null
  else if (body.expiryDate) row.expiryDate = new Date(body.expiryDate)
  if (body.authorName !== undefined) row.authorName = body.authorName
  await row.save()
  res.json(annJson(row))
}))

r.delete('/announcements/:id', ah(async (req, res) => {
  const row = await Announcement.findById(req.params.id)
  if (!row) return res.status(404).json({ error: 'Announcement not found' })
  await row.deleteOne()
  res.json({ ok: true, id: req.params.id })
}))

// ─── Search (topbar ⌘K palette) ─────────────────────────────────────────────
r.get('/search', ah(async (req, res) => {
  const q = qs(req).get('q')?.trim()
  if (!q || q.length < 2) {
    return res.json({ students: [], teachers: [], payments: [], announcements: [] })
  }
  const re = containsRe(q)
  const [students, teachers, payments, announcements] = await Promise.all([
    Student.find({
      $or: [{ fullName: re }, { studentId: re }, { barcode: re }, { indexNo: re }],
    })
      .limit(5)
      .lean(),
    Teacher.find({
      $or: [
        { fullName: re }, { teacherId: re }, { fingerprintId: re },
        { phone: re }, { specialization: re },
      ],
    })
      .limit(5)
      .lean(),
    (async () => {
      const matchedStudents = await Student.find(
        { $or: [{ fullName: re }, { studentId: re }] },
        '_id',
      ).lean()
      const ids = matchedStudents.map((s: any) => s._id.toString())
      return Payment.find({
        $or: [{ receiptNo: re }, ...(ids.length ? [{ studentId: { $in: ids } }] : [])],
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .then(async (rows: any[]) => {
          const sIds = [...new Set(rows.map((p) => p.studentId))]
          const progIds = [...new Set(rows.map((p) => p.programId).filter(Boolean))]
          const [studs, progs] = await Promise.all([
            Student.find({ _id: { $in: sIds } }, 'studentId fullName').lean(),
            progIds.length ? Program.find({ _id: { $in: progIds } }, 'code name color').lean() : [],
          ])
          const sMap = new Map(studs.map((s: any) => [s._id.toString(), s]))
          const pMap = new Map(progs.map((p: any) => [p._id.toString(), p]))
          return rows.map((p) => ({ p, s: sMap.get(p.studentId), prog: p.programId ? pMap.get(p.programId) : null }))
        })
    })(),
    Announcement.find({
      $or: [{ title: re }, { body: re }],
      status: 'Published',
    })
      .sort({ pinned: -1, publishDate: -1 })
      .limit(4)
      .lean(),
  ])

  const studentResults = students.map((s: any) => ({
    id: s._id.toString(),
    studentId: s.studentId,
    fullName: s.fullName,
    gender: s.gender,
    ageGroup: s.ageGroup ?? null,
    status: s.status,
    barcode: s.barcode,
    guardianName: null,
    guardianPhone: null,
  }))
  // attach first guardian
  const gRows = await Guardian.find(
    { studentId: { $in: students.map((s: any) => s._id.toString()) } },
  ).sort({ isPrimary: -1, createdAt: 1 }).lean()
  const gMap = new Map<string, any>()
  for (const g of gRows) if (!gMap.has(g.studentId)) gMap.set(g.studentId, g)
  for (const s of studentResults) {
    const g = gMap.get(s.id)
    s.guardianName = g?.name ?? null
    s.guardianPhone = g?.phone ?? null
  }

  res.json({
    students: studentResults,
    teachers: teachers.map((t: any) => ({
      id: t._id.toString(),
      teacherId: t.teacherId,
      fullName: t.fullName,
      type: t.type,
      status: t.status,
      specialization: t.specialization ?? null,
    })),
    payments: (payments as any[]).map(({ p, s, prog }: any) => ({
      id: p._id.toString(),
      receiptNo: p.receiptNo ?? null,
      month: p.month,
      amount: p.amount,
      paidAmount: p.paidAmount,
      status: p.status,
      studentId: s?.studentId ?? '',
      studentName: s?.fullName ?? '',
      programCode: prog?.code ?? null,
      programColor: prog?.color ?? null,
    })),
    announcements: announcements.map((a: any) => ({
      id: a._id.toString(),
      title: a.title,
      category: a.category,
      audience: a.audience,
      priority: a.priority,
      pinned: a.pinned,
      publishDate: new Date(a.publishDate).toISOString(),
    })),
  })
}))

// ─── Notifications (topbar bell) ────────────────────────────────────────────
r.get('/notifications', ah(async (_req, res) => {
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
  fourteenDaysAgo.setHours(0, 0, 0, 0)

  const [overduePayments, pendingExpenses, activeTeachers, paidPayroll, recentAttendance, dobWindow, hireWindow] =
    await Promise.all([
      Payment.find({ status: 'Overdue' }, 'amount paidAmount').lean(),
      Expense.find({ status: 'Pending', date: { $gte: monthStart, $lte: monthEnd } }, 'amount').lean(),
      Teacher.find({ status: 'Active' }, '_id').lean(),
      PayrollRecord.find({ month: monthKey, status: 'Paid' }, '_id').lean(),
      Attendance.find(
        { personType: 'Student', date: { $gte: fourteenDaysAgo, $lte: now }, status: { $in: ['Absent', 'Late'] } },
        'personId',
      ).lean(),
      Student.find({ status: 'Active', dob: { $ne: null } }, 'dob').lean(),
      Teacher.find({ status: 'Active', hireDate: { $ne: null } }, 'hireDate').lean(),
    ])

  const overdueTotal = round2(
    overduePayments.reduce((s: number, p: any) => s + Math.max(0, p.amount - p.paidAmount), 0),
  )
  const pendingExpenseTotal = round2(pendingExpenses.reduce((s: number, e: any) => s + e.amount, 0))

  const absentCounts = new Map<string, number>()
  for (const row of recentAttendance) {
    absentCounts.set(row.personId, (absentCounts.get(row.personId) ?? 0) + 1)
  }
  let atRiskStudents = 0
  for (const c of absentCounts.values()) if (c >= 4) atRiskStudents++

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
    key: string; section: string; severity: 'high' | 'medium' | 'low' | 'info'
    title: string; detail: string; count: number
  }[] = []

  if (overduePayments.length > 0) {
    alerts.push({
      key: 'overdue-bills', section: 'fees', severity: 'high',
      title: 'Overdue fee bills',
      detail: `${overduePayments.length} bill${overduePayments.length === 1 ? '' : 's'} · LKR ${overdueTotal.toLocaleString()} unpaid`,
      count: overduePayments.length,
    })
  }
  if (pendingExpenses.length > 0) {
    alerts.push({
      key: 'pending-expenses', section: 'expenses', severity: 'medium',
      title: 'Expenses awaiting approval',
      detail: `${pendingExpenses.length} entr${pendingExpenses.length === 1 ? 'y' : 'ies'} · LKR ${pendingExpenseTotal.toLocaleString()} this month`,
      count: pendingExpenses.length,
    })
  }
  if (atRiskStudents > 0) {
    alerts.push({
      key: 'at-risk-attendance', section: 'attendance', severity: 'medium',
      title: 'Attendance concerns',
      detail: `${atRiskStudents} student${atRiskStudents === 1 ? '' : 's'} with 4+ absent/late marks in 14 days`,
      count: atRiskStudents,
    })
  }
  const unpaidStaff = Math.max(0, activeTeachers.length - paidPayroll.length)
  if (unpaidStaff > 0) {
    alerts.push({
      key: 'pending-payroll', section: 'payroll', severity: 'low',
      title: 'Salaries pending',
      detail: `${unpaidStaff} of ${activeTeachers.length} staff unpaid for ${monthKey}`,
      count: unpaidStaff,
    })
  }
  if (celebrations > 0) {
    alerts.push({
      key: 'celebrations', section: 'dashboard', severity: 'info',
      title: 'Celebrations ahead',
      detail: `${celebrations} birthday${celebrations === 1 ? '' : 's'}/anniversar${celebrations === 1 ? 'y' : 'ies'} in the next 7 days`,
      count: celebrations,
    })
  }

  res.json({
    alerts,
    total: alerts.reduce((s, a) => s + a.count, 0),
    checkedAt: now.toISOString(),
  })
}))

// ─── Celebrations ───────────────────────────────────────────────────────────
r.get('/celebrations', ah(async (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(qs(req).get('days') || '30', 10) || 30))
  const today = todayUtc()
  const horizon = new Date(today.getTime() + days * 86_400_000)

  const [students, teachers] = await Promise.all([
    Student.find({ status: 'Active', dob: { $ne: null } })
      .select('studentId fullName dob photoUrl')
      .lean(),
    Teacher.find({ status: { $ne: 'Inactive' }, hireDate: { $ne: null } })
      .select('teacherId fullName hireDate photoUrl phone')
      .lean(),
  ])

  const studentIds = students.map((s: any) => s._id.toString())
  const guardians = await Guardian.find(
    { studentId: { $in: studentIds } },
    'studentId name phone isPrimary',
  ).lean()

  const out: Array<{
    personType: 'Student' | 'Teacher'; ref: string; name: string; date: string
    daysUntil: number; milestone: number | null; kind: 'birthday' | 'anniversary'
    contact: { name: string; phone: string } | null
  }> = []

  for (const s of students) {
    if (!s.dob) continue
    const dob = new Date(s.dob)
    const next = nextOccurrence(dob.getUTCMonth() + 1, dob.getUTCDate(), today)
    if (next.getTime() > horizon.getTime()) continue
    const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000)
    const gs = guardians
      .filter((g: any) => g.studentId === s._id.toString())
      .sort((a: any, b: any) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
    const best =
      gs.find((g: any) => g.isPrimary && isReachablePhone(g.phone)) ??
      gs.find((g: any) => isReachablePhone(g.phone)) ??
      null
    out.push({
      personType: 'Student',
      ref: s.studentId,
      name: s.fullName,
      date: next.toISOString(),
      daysUntil,
      milestone: yearsBetween(dob, next),
      kind: 'birthday',
      contact: best ? { name: best.name, phone: best.phone } : null,
    })
  }

  for (const t of teachers) {
    if (!t.hireDate) continue
    const hire = new Date(t.hireDate)
    if (hire.getTime() >= today.getTime()) continue
    const next = nextOccurrence(hire.getUTCMonth() + 1, hire.getUTCDate(), today)
    if (next.getTime() > horizon.getTime()) continue
    const years = yearsBetween(hire, next)
    if (years < 1) continue
    const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000)
    out.push({
      personType: 'Teacher',
      ref: t.teacherId,
      name: t.fullName,
      date: next.toISOString(),
      daysUntil,
      milestone: years,
      kind: 'anniversary',
      contact: isReachablePhone(t.phone) ? { name: t.fullName, phone: t.phone } : null,
    })
  }

  out.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
  const todayCount = out.filter((c) => c.daysUntil === 0).length
  res.json({ days, todayCount, total: out.length, celebrations: out })
}))

export default r
