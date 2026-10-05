// ─── Minor staff (daily-wage) routes ────────────────────────────────────────
// /api/staff, /:id, /:id/worklog, /payroll
import { Router } from 'express'
import { Staff, StaffWorkLog } from '../models'
import { ah, qs, round2 } from '../helpers'

const r = Router()

// ─── ID generation ──────────────────────────────────────────────────────────
async function nextStaffId(): Promise<string> {
  const existing = await Staff.find({ staffId: { $regex: '^MS' } }, 'staffId').lean()
  let max = 0
  for (const s of existing as any[]) {
    const num = parseInt(s.staffId.slice(2), 10)
    if (!isNaN(num) && num > max) max = num
  }
  return `MS${String(max + 1).padStart(3, '0')}`
}

// ─── Serializers ────────────────────────────────────────────────────────────
function serializeStaff(s: any) {
  return {
    id: s._id.toString(),
    staffId: s.staffId,
    fullName: s.fullName,
    role: s.role,
    phone: s.phone ?? null,
    defaultDailyRate: s.defaultDailyRate ?? 0,
    joinDate: s.joinDate ? new Date(s.joinDate).toISOString() : null,
    active: s.active,
    notes: s.notes ?? null,
  }
}

// ─── GET /api/staff ─────────────────────────────────────────────────────────
r.get('/', ah(async (req, res) => {
  const p = qs(req)
  const q = p.get('q')?.trim() || ''
  const role = p.get('role')?.trim() || ''
  const activeParam = p.get('active')

  const where: Record<string, unknown> = {}
  if (q) where.fullName = { $regex: q, $options: 'i' }
  if (role) where.role = role
  if (activeParam === 'true') where.active = true
  if (activeParam === 'false') where.active = false

  const rows = await Staff.find(where).sort({ staffId: 1 }).lean()
  res.json({ data: (rows as any[]).map(serializeStaff) })
}))

// ─── POST /api/staff ────────────────────────────────────────────────────────
r.post('/', ah(async (req, res) => {
  const body = req.body || {}
  const fullName = body.fullName?.trim()
  const role = body.role?.trim()
  if (!fullName) return res.status(400).json({ error: 'fullName is required' })
  if (!role) return res.status(400).json({ error: 'role is required' })

  const staffId = await nextStaffId()
  const created = await Staff.create({
    staffId,
    fullName,
    role,
    phone: body.phone?.trim() || null,
    defaultDailyRate:
      typeof body.defaultDailyRate === 'number' && body.defaultDailyRate >= 0
        ? body.defaultDailyRate
        : 0,
    joinDate: body.joinDate ? new Date(body.joinDate) : null,
    active: body.active ?? true,
    notes: body.notes?.trim() || null,
  })
  res.status(201).json(serializeStaff(created))
}))

// ─── PUT /api/staff/:id ─────────────────────────────────────────────────────
r.put('/:id', ah(async (req, res) => {
  const existing = await Staff.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Staff not found' })
  const body = req.body || {}

  if (body.fullName !== undefined) existing.fullName = body.fullName.trim()
  if (body.role !== undefined) existing.role = body.role.trim()
  if (body.phone !== undefined) existing.phone = body.phone?.trim() || null
  if (body.defaultDailyRate !== undefined)
    existing.defaultDailyRate =
      typeof body.defaultDailyRate === 'number' && body.defaultDailyRate >= 0
        ? body.defaultDailyRate
        : 0
  if (body.joinDate !== undefined)
    existing.joinDate = body.joinDate ? new Date(body.joinDate) : null
  if (body.active !== undefined) existing.active = Boolean(body.active)
  if (body.notes !== undefined) existing.notes = body.notes?.trim() || null

  await existing.save()
  res.json(serializeStaff(existing))
}))

// ─── DELETE /api/staff/:id ──────────────────────────────────────────────────
r.delete('/:id', ah(async (req, res) => {
  const existing = await Staff.findById(req.params.id).lean()
  if (!existing) return res.status(404).json({ error: 'Staff not found' })
  await StaffWorkLog.deleteMany({ staffId: req.params.id })
  await Staff.deleteOne({ _id: (existing as any)._id })
  res.json({ ok: true, id: req.params.id, fullName: (existing as any).fullName })
}))

// ─── GET /api/staff/:id/worklog?month=YYYY-MM ───────────────────────────────
r.get('/:id/worklog', ah(async (req, res) => {
  const month = qs(req).get('month')?.trim() || ''
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month is required as YYYY-MM' })
  }
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end   = new Date(Date.UTC(y, m, 1))

  const rows = await StaffWorkLog.find({
    staffId: req.params.id,
    date: { $gte: start, $lt: end },
  }).sort({ date: 1 }).lean()

  res.json({
    month,
    logs: (rows as any[]).map((l) => ({
      id: l._id.toString(),
      date: new Date(l.date).toISOString().slice(0, 10),
      dayRate: l.dayRate,
      status: l.status,
      note: l.note ?? null,
    })),
    totalDays: (rows as any[]).filter((l) => l.status !== 'Absent').length,
    totalPay: round2((rows as any[]).reduce((sum, l) => sum + (l.dayRate || 0), 0)),
  })
}))

// ─── POST /api/staff/:id/worklog (upsert a single day) ──────────────────────
r.post('/:id/worklog', ah(async (req, res) => {
  const body = req.body || {}
  const dateStr = String(body.date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'date is required as YYYY-MM-DD' })
  }
  const staff = await Staff.findById(req.params.id).lean()
  if (!staff) return res.status(404).json({ error: 'Staff not found' })

  const dayRate =
    typeof body.dayRate === 'number' && body.dayRate >= 0
      ? body.dayRate
      : (staff as any).defaultDailyRate ?? 0

  const status = ['Present', 'Half Day', 'Absent', 'Leave'].includes(body.status)
    ? body.status
    : 'Present'
  const note = body.note?.trim() || null

  const effectiveRate =
    status === 'Absent' ? 0 : status === 'Half Day' ? dayRate / 2 : dayRate

  const doc = await StaffWorkLog.findOneAndUpdate(
    { staffId: req.params.id, date: new Date(dateStr + 'T00:00:00.000Z') },
    {
      staffId: req.params.id,
      date: new Date(dateStr + 'T00:00:00.000Z'),
      dayRate: effectiveRate,
      status,
      note,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )

  res.status(201).json({
    id: (doc as any)._id.toString(),
    date: dateStr,
    dayRate: (doc as any).dayRate,
    status: (doc as any).status,
    note: (doc as any).note ?? null,
  })
}))

// ─── DELETE /api/staff/:id/worklog/:date ────────────────────────────────────
r.delete('/:id/worklog/:date', ah(async (req, res) => {
  const dateStr = req.params.date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  }
  await StaffWorkLog.deleteOne({
    staffId: req.params.id,
    date: new Date(dateStr + 'T00:00:00.000Z'),
  })
  res.json({ ok: true })
}))

// ─── GET /api/staff/payroll?month=YYYY-MM ───────────────────────────────────
// NOTE: this route must be registered BEFORE /:id — Express matches in order.
r.get('/payroll', ah(async (req, res) => {
  const month = qs(req).get('month')?.trim() || ''
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month is required as YYYY-MM' })
  }
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end   = new Date(Date.UTC(y, m, 1))

  const staff = await Staff.find({ active: true }).sort({ staffId: 1 }).lean()
  const logs = await StaffWorkLog.find({
    date: { $gte: start, $lt: end },
  }).lean()

  const byStaff = new Map<string, any[]>()
  for (const l of logs as any[]) {
    const key = l.staffId.toString()
    if (!byStaff.has(key)) byStaff.set(key, [])
    byStaff.get(key)!.push(l)
  }

  const rows = (staff as any[]).map((s) => {
    const entries = byStaff.get(s._id.toString()) ?? []
    const daysWorked = entries.filter((e) => e.status !== 'Absent').length
    const total = entries.reduce((sum, e) => sum + (e.dayRate || 0), 0)
    return {
      staffId: s._id.toString(),
      staffCode: s.staffId,
      fullName: s.fullName,
      role: s.role,
      defaultDailyRate: s.defaultDailyRate ?? 0,
      daysWorked,
      totalPay: round2(total),
    }
  })

  const grandTotal = round2(rows.reduce((sum, r) => sum + r.totalPay, 0))
  res.json({ month, data: rows, totals: { staff: rows.length, grandTotal } })
}))

export default r
