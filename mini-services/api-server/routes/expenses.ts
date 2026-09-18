// ─── Expenses routes — /api/expenses, /:id, /budgets, /templates,
//     /apply-templates (static sub-paths registered before /:id) ────────────
import { Router } from 'express'
import { Expense, Setting } from '../models'
import { ah, qs, round2, containsRe } from '../helpers'

const r = Router()

const ALLOWED_METHODS = new Set(['Cash', 'Bank', 'Card'])
const ALLOWED_STATUSES = new Set(['Pending', 'Approved', 'Rejected'])

const currentMonth = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const isValidMonth = (s?: string | null): boolean => !!s && /^\d{4}-\d{2}$/.test(s)

function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) }
}

function serialize(e: any, includeReceipt = false) {
  const id = e.id ?? (e._id ? e._id.toString() : null)
  const base = {
    id,
    date: new Date(e.date).toISOString(),
    category: e.category,
    description: e.description,
    amount: e.amount,
    method: e.method,
    vendor: e.vendor ?? null,
    note: e.note ?? null,
    status: e.status,
    reviewedAt: e.reviewedAt ? new Date(e.reviewedAt).toISOString() : null,
    reviewedBy: e.reviewedBy ?? null,
    hasReceipt: !!e.receiptUrl,
    receiptName: e.receiptName ?? null,
    createdAt: new Date(e.createdAt).toISOString(),
    updatedAt: new Date(e.updatedAt).toISOString(),
  }
  return includeReceipt ? { ...base, receiptUrl: e.receiptUrl ?? null } : base
}

// ─── validation (POST = full, PUT = partial) ────────────────────────────────
function parseIsoDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}
function parseAmount(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v as string) : (v as number)
  if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return null
  return n
}

function validate(body: any, partial: boolean): { error: string } | { values: Record<string, unknown> } {
  const values: Record<string, unknown> = {}
  if (body.date !== undefined || !partial) {
    const date = parseIsoDate(body.date)
    if (!date) return { error: 'date is required (ISO date, e.g. 2026-09-07)' }
    values.date = date
  }
  if (body.category !== undefined || !partial) {
    const category = body.category?.trim()
    if (!category) return { error: 'category is required' }
    values.category = category
  }
  if (body.description !== undefined || !partial) {
    const description = body.description?.trim()
    if (!description) return { error: 'description is required' }
    values.description = description
  }
  if (body.amount !== undefined || !partial) {
    const amount = parseAmount(body.amount)
    if (amount === null || amount <= 0) return { error: 'amount must be a positive number' }
    values.amount = amount
  }
  if (body.method !== undefined || !partial) {
    const method = body.method?.trim() || 'Cash'
    if (!ALLOWED_METHODS.has(method)) {
      return { error: `method must be one of ${Array.from(ALLOWED_METHODS).join(', ')}` }
    }
    values.method = method
  }
  if (body.vendor !== undefined) values.vendor = body.vendor?.trim() || null
  if (body.note !== undefined) values.note = body.note?.trim() || null
  if (body.status !== undefined && body.status !== null && body.status !== '') {
    const st = body.status.trim()
    if (!ALLOWED_STATUSES.has(st)) {
      return { error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` }
    }
    values.status = st
  }
  if (body.receiptUrl !== undefined) {
    const ru = typeof body.receiptUrl === 'string' ? body.receiptUrl.trim() : ''
    if (ru && !/^data:image\//.test(ru)) return { error: 'receiptUrl must be an image data URL' }
    if (ru.length > 1_500_000) return { error: 'receipt image is too large — please choose a smaller photo' }
    values.receiptUrl = ru || null
    values.receiptName = body.receiptName?.trim() || null
  }
  return { values }
}

// ─── GET /api/expenses ──────────────────────────────────────────────────────
r.get('/', ah(async (req, res) => {
  const p = qs(req)
  const q = p.get('q')?.trim() || ''
  const category = p.get('category')?.trim() || ''
  const status = p.get('status')?.trim() || ''
  const month = p.get('month')?.trim() || currentMonth()
  const page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(p.get('limit') || '100', 10) || 100))

  if (!isValidMonth(month)) return res.status(400).json({ error: 'month must be YYYY-MM' })
  if (status && !ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` })
  }

  const { start, end } = monthRange(month)
  const where: Record<string, unknown> = { date: { $gte: start, $lt: end } }
  if (category) where.category = category
  if (status) where.status = status
  if (q) where.$or = [{ description: containsRe(q) }, { vendor: containsRe(q) }, { note: containsRe(q) }]

  const statusWhere: Record<string, unknown> = { date: where.date }
  if (category) statusWhere.category = category
  if (q) statusWhere.$or = where.$or

  const [total, rows, allMatching, statusRows] = await Promise.all([
    Expense.countDocuments(where),
    Expense.find(where).sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Expense.find(where, 'amount category method').lean(),
    Expense.find(statusWhere, 'amount status').lean(),
  ])

  const catMap: Record<string, { total: number; count: number }> = {}
  const methodTotals: Record<string, number> = { Cash: 0, Bank: 0, Card: 0 }
  let sumTotal = 0
  for (const e of allMatching as any[]) {
    sumTotal += e.amount
    if (!catMap[e.category]) catMap[e.category] = { total: 0, count: 0 }
    catMap[e.category].total += e.amount
    catMap[e.category].count++
    if (e.method in methodTotals) methodTotals[e.method] = round2(methodTotals[e.method] + e.amount)
  }
  const byCategory = Object.entries(catMap)
    .map(([cat, v]) => ({ category: cat, total: round2(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category))

  const statusTotals: Record<string, { count: number; total: number }> = {
    Pending: { count: 0, total: 0 },
    Approved: { count: 0, total: 0 },
    Rejected: { count: 0, total: 0 },
  }
  for (const e of statusRows as any[]) {
    if (e.status in statusTotals) {
      statusTotals[e.status].count++
      statusTotals[e.status].total = round2(statusTotals[e.status].total + e.amount)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))
  res.json({
    data: (rows as any[]).map((e) => serialize(e)),
    summary: {
      total: round2(sumTotal),
      count: total,
      byCategory,
      methodTotals,
      statusTotals,
    },
    page,
    totalPages,
    total,
  })
}))

// ─── POST /api/expenses ─────────────────────────────────────────────────────
r.post('/', ah(async (req, res) => {
  const result = validate(req.body || {}, false)
  if ('error' in result) return res.status(400).json({ error: result.error })
  const created = await Expense.create(result.values)
  res.status(201).json(serialize(created.toJSON()))
}))

// ─── GET /api/expenses/budgets?month= ───────────────────────────────────────
r.get('/budgets', ah(async (req, res) => {
  const monthStr = qs(req).get('month')
  const now = new Date()
  const year = monthStr ? parseInt(monthStr.split('-')[0], 10) : now.getFullYear()
  const month = monthStr ? parseInt(monthStr.split('-')[1], 10) - 1 : now.getMonth()
  const y = isNaN(year) ? now.getFullYear() : year
  const m = isNaN(month) || month < 0 || month > 11 ? now.getMonth() : month
  const firstDay = new Date(y, m, 1)
  const nextMonth = new Date(y, m + 1, 1)

  const budgetRow = await Setting.findOne({ key: 'expense_budgets' }).lean()
  const budgets: Record<string, number> = {}
  if ((budgetRow as any)?.value) {
    try {
      const parsed = JSON.parse((budgetRow as any).value)
      for (const [k, v] of Object.entries(parsed)) {
        const n = Number(v)
        if (k && Number.isFinite(n) && n > 0) budgets[k] = n
      }
    } catch {
      /* ignore */
    }
  }

  const expenses = await Expense.find(
    { date: { $gte: firstDay, $lt: nextMonth }, status: { $ne: 'Rejected' } },
    'category amount',
  ).lean()

  const spent: Record<string, number> = {}
  for (const e of expenses as any[]) {
    spent[e.category] = round2((spent[e.category] || 0) + e.amount)
  }

  res.json({
    month: `${y}-${String(m + 1).padStart(2, '0')}`,
    budgets,
    spent,
    totalBudget: round2(Object.values(budgets).reduce((s, v) => s + v, 0)),
    totalSpent: round2(Object.values(spent).reduce((s, v) => s + v, 0)),
  })
}))

// ─── PUT /api/expenses/budgets ──────────────────────────────────────────────
r.put('/budgets', ah(async (req, res) => {
  const body = req.body || {}
  if (!body.budgets || typeof body.budgets !== 'object' || Array.isArray(body.budgets)) {
    return res.status(400).json({ error: 'budgets object is required' })
  }
  const clean: Record<string, number> = {}
  for (const [k, v] of Object.entries(body.budgets)) {
    const n = Number(v)
    if (!k.trim()) continue
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: `Budget for "${k}" must be a non-negative number` })
    }
    if (n > 0) clean[k.trim()] = round2(n)
  }
  await Setting.findOneAndUpdate(
    { key: 'expense_budgets' },
    { $set: { value: JSON.stringify(clean) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  res.json({ ok: true, budgets: clean })
}))

// ─── Recurring templates ────────────────────────────────────────────────────
interface ExpenseTemplate {
  id: string
  name: string
  category: string
  amount: number
  vendor?: string
  method: string
  day: number
  active: boolean
}

const SETTING_KEY = 'expense_templates'

function sanitize(raw: unknown): { templates: ExpenseTemplate[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: 'templates must be an array' }
  const out: ExpenseTemplate[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i] as Partial<ExpenseTemplate>
    const name = String(t.name ?? '').trim()
    const category = String(t.category ?? '').trim()
    const method = String(t.method ?? 'Cash').trim() || 'Cash'
    const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
    const dayRaw = typeof t.day === 'string' ? parseInt(t.day, 10) : t.day
    const day = Number.isFinite(dayRaw) ? Math.min(28, Math.max(1, Math.round(dayRaw as number))) : 1
    if (!name) return { error: `templates[${i}]: name is required` }
    if (!category) return { error: `templates[${i}]: category is required` }
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
      return { error: `templates[${i}]: amount must be a positive number` }
    }
    if (!ALLOWED_METHODS.has(method)) {
      return { error: `templates[${i}]: method must be one of Cash, Bank, Card` }
    }
    let id = String(t.id ?? '').trim()
    if (!id || seen.has(id)) id = name.toLowerCase().replace(/\s+/g, '-')
    if (seen.has(id)) id = `${id}-${i}`
    seen.add(id)
    out.push({
      id,
      name,
      category,
      amount: round2(amount as number),
      vendor: String(t.vendor ?? '').trim() || undefined,
      method,
      day,
      active: t.active !== false,
    })
  }
  return { templates: out }
}

async function readTemplates(): Promise<ExpenseTemplate[]> {
  const row = await Setting.findOne({ key: SETTING_KEY }).lean()
  if (!row) return []
  try {
    const parsed = JSON.parse((row as any).value)
    const result = sanitize(parsed)
    return 'templates' in result ? result.templates : []
  } catch {
    return []
  }
}

r.get('/templates', ah(async (_req, res) => {
  const templates = await readTemplates()
  res.json({ templates })
}))

r.put('/templates', ah(async (req, res) => {
  const body = req.body || {}
  const result = sanitize(body.templates)
  if ('error' in result) return res.status(400).json({ error: result.error })
  await Setting.findOneAndUpdate(
    { key: SETTING_KEY },
    { $set: { value: JSON.stringify(result.templates) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  res.json({ templates: result.templates })
}))

r.post('/apply-templates', ah(async (req, res) => {
  const body = req.body || {}
  const month = (body.month || '').trim() || currentMonth()
  if (!isValidMonth(month)) return res.status(400).json({ error: 'month must be YYYY-MM' })

  const all = await readTemplates()
  const wanted = Array.isArray(body.templateIds) ? new Set(body.templateIds) : null
  const templates = all.filter((t) => t.active !== false && (!wanted || wanted.has(t.id)))

  if (templates.length === 0) {
    return res.json(
      { created: 0, createdTotal: 0, skipped: [], message: 'No active templates selected' },
    )
  }

  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)

  const existing = await Expense.find({ date: { $gte: start, $lt: end } }, 'description category').lean()
  const existingKeys = new Set((existing as any[]).map((e) => `${e.description}::${e.category}`))

  let created = 0
  let createdTotal = 0
  const skipped: { name: string; reason: string }[] = []

  for (const t of templates) {
    const key = `${t.name}::${t.category}`
    if (existingKeys.has(key)) {
      skipped.push({ name: t.name, reason: 'Already recorded this month' })
      continue
    }
    const day = Math.min(Math.max(1, Math.round(t.day || 1)), days)
    const date = new Date(Date.UTC(y, m - 1, day))
    const method = ALLOWED_METHODS.has(t.method) ? t.method : 'Cash'
    try {
      await Expense.create({
        date,
        category: t.category,
        description: t.name,
        amount: t.amount,
        method,
        vendor: t.vendor ?? null,
        note: 'Recurring template',
      })
      created += 1
      createdTotal += t.amount
      existingKeys.add(key)
    } catch {
      skipped.push({ name: t.name, reason: 'Database error while creating' })
    }
  }

  res.json({
    created,
    createdTotal: round2(createdTotal),
    skipped,
    message:
      created === 0
        ? skipped.length
          ? 'All selected templates were already recorded'
          : 'Nothing to apply'
        : `Created ${created} expense${created === 1 ? '' : 's'} for ${month}`,
  })
}))

// ─── GET /api/expenses/:id (INCLUDES receipt) ───────────────────────────────
r.get('/:id', ah(async (req, res) => {
  const e = await Expense.findById(req.params.id).lean()
  if (!e) return res.status(404).json({ error: 'Expense not found' })
  res.json(serialize(e, true))
}))

// ─── PUT /api/expenses/:id ──────────────────────────────────────────────────
r.put('/:id', ah(async (req, res) => {
  const existing = await Expense.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Expense not found' })
  const body = req.body || {}

  if (body.date !== undefined) {
    const date = parseIsoDate(body.date)
    if (!date) return res.status(400).json({ error: 'date must be a valid ISO date' })
    existing.date = date
  }
  if (body.category !== undefined) {
    const category = body.category?.trim()
    if (!category) return res.status(400).json({ error: 'category cannot be empty' })
    existing.category = category
  }
  if (body.description !== undefined) {
    const description = body.description?.trim()
    if (!description) return res.status(400).json({ error: 'description cannot be empty' })
    existing.description = description
  }
  if (body.amount !== undefined) {
    const amount = parseAmount(body.amount)
    if (amount === null || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' })
    }
    existing.amount = amount
  }
  if (body.method !== undefined) {
    const method = body.method?.trim() || 'Cash'
    if (!ALLOWED_METHODS.has(method)) {
      return res.status(400).json({ error: `method must be one of ${Array.from(ALLOWED_METHODS).join(', ')}` })
    }
    existing.method = method
  }
  if (body.vendor !== undefined) existing.vendor = body.vendor?.trim() || null
  if (body.note !== undefined) existing.note = body.note?.trim() || null
  if (body.receiptUrl !== undefined) {
    const ru = typeof body.receiptUrl === 'string' ? body.receiptUrl.trim() : ''
    if (ru && !/^data:image\//.test(ru)) {
      return res.status(400).json({ error: 'receiptUrl must be an image data URL' })
    }
    if (ru.length > 1_500_000) {
      return res.status(400).json({ error: 'receipt image is too large — please choose a smaller photo' })
    }
    existing.receiptUrl = ru || null
    existing.receiptName = body.receiptName?.trim() || null
  }
  if (body.status !== undefined && body.status !== null && body.status !== '') {
    const st = body.status.trim()
    if (!ALLOWED_STATUSES.has(st)) {
      return res.status(400).json({ error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` })
    }
    existing.status = st
    if (st !== existing.status) {
      if (st === 'Approved' || st === 'Rejected') {
        existing.reviewedAt = new Date()
        existing.reviewedBy = body.reviewedBy?.trim() || 'Administrator'
      } else {
        existing.reviewedAt = null
        existing.reviewedBy = null
      }
    }
  }

  await existing.save()
  res.json(serialize(existing.toJSON()))
}))

// ─── DELETE /api/expenses/:id ───────────────────────────────────────────────
r.delete('/:id', ah(async (req, res) => {
  const existing = await Expense.findById(req.params.id).lean()
  if (!existing) return res.status(404).json({ error: 'Expense not found' })
  await Expense.deleteOne({ _id: (existing as any)._id })
  res.json({ ok: true, id: (existing as any)._id.toString() })
}))

export default r
