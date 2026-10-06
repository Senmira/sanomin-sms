// ─── Common fees (extras) routes ────────────────────────────────────────────
// /api/extras — CRUD catalog for recurring admin-defined fees such as
// Annual Concert, Sports Meet, Photograph, Graduation, etc.
// These are *not* tied to programmes; the payment-entry page lets the
// operator tick the ones that apply to a given student.
import { Router } from 'express'
import { Extra } from '../models'
import { ah, qs } from '../helpers'

const r = Router()

function serialize(e: any) {
  return {
    id: e._id.toString(),
    name: e.name,
    defaultAmount: e.defaultAmount ?? 0,
    category: e.category ?? 'Other',
    description: e.description ?? null,
    active: e.active ?? true,
    order: e.order ?? 0,
  }
}

// ─── GET /api/extras?active=true ────────────────────────────────────────────
r.get('/', ah(async (req, res) => {
  const p = qs(req)
  const activeParam = p.get('active')
  const where: Record<string, unknown> = {}
  if (activeParam === 'true') where.active = true
  if (activeParam === 'false') where.active = false
  const rows = await Extra.find(where).sort({ order: 1, name: 1 }).lean()
  res.json({ data: (rows as any[]).map(serialize) })
}))

// ─── POST /api/extras ───────────────────────────────────────────────────────
r.post('/', ah(async (req, res) => {
  const body = req.body || {}
  const name = body.name?.trim()
  if (!name) return res.status(400).json({ error: 'name is required' })
  const created = await Extra.create({
    name,
    defaultAmount:
      typeof body.defaultAmount === 'number' && body.defaultAmount >= 0 ? body.defaultAmount : 0,
    category: body.category?.trim() || 'Other',
    description: body.description?.trim() || null,
    active: body.active ?? true,
    order: typeof body.order === 'number' ? body.order : 0,
  })
  res.status(201).json(serialize(created))
}))

// ─── PUT /api/extras/:id ────────────────────────────────────────────────────
r.put('/:id', ah(async (req, res) => {
  const existing = await Extra.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Extra not found' })
  const body = req.body || {}
  if (body.name !== undefined) existing.name = body.name.trim()
  if (body.defaultAmount !== undefined)
    existing.defaultAmount =
      typeof body.defaultAmount === 'number' && body.defaultAmount >= 0 ? body.defaultAmount : 0
  if (body.category !== undefined) existing.category = body.category?.trim() || 'Other'
  if (body.description !== undefined) existing.description = body.description?.trim() || null
  if (body.active !== undefined) existing.active = Boolean(body.active)
  if (body.order !== undefined) existing.order = typeof body.order === 'number' ? body.order : 0
  await existing.save()
  res.json(serialize(existing))
}))

// ─── DELETE /api/extras/:id ─────────────────────────────────────────────────
r.delete('/:id', ah(async (req, res) => {
  const existing = await Extra.findById(req.params.id).lean()
  if (!existing) return res.status(404).json({ error: 'Extra not found' })
  await Extra.deleteOne({ _id: (existing as any)._id })
  res.json({ ok: true, id: req.params.id, name: (existing as any).name })
}))

export default r
