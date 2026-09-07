import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Expenses — institute operating expenses & outgoings ────────────────────
// GET  /api/expenses?month=YYYY-MM&q=&category=&status=&limit=&page=
//      → { data, summary: { total, count, byCategory, methodTotals, statusTotals },
//          page, totalPages, total }
// POST /api/expenses { date, category, description, amount, method?, vendor?,
//                      note?, status? }

const ALLOWED_METHODS = new Set(['Cash', 'Bank', 'Card'])
const ALLOWED_STATUSES = new Set(['Pending', 'Approved', 'Rejected'])

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isValidMonth(s?: string): boolean {
  return !!s && /^\d{4}-\d{2}$/.test(s)
}

// Calendar-month range for a "YYYY-MM" string (UTC-safe: expense dates are
// stored as midnight-UTC dates from `YYYY-MM-DD` client input).
function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  }
}

// ─── Serializer: Expense → ExpenseRow JSON ──────────────────────────────────
function serialize(e: ExpenseRecord) {
  return {
    id: e.id,
    date: e.date.toISOString(),
    category: e.category,
    description: e.description,
    amount: e.amount,
    method: e.method,
    vendor: e.vendor,
    note: e.note,
    status: e.status,
    reviewedAt: e.reviewedAt ? e.reviewedAt.toISOString() : null,
    reviewedBy: e.reviewedBy,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }
}

type ExpenseRecord = Prisma.ExpenseGetPayload<Record<string, never>>

// ─── GET /api/expenses — list with filters + summary ────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() || ''
  const category = url.searchParams.get('category')?.trim() || ''
  const status = url.searchParams.get('status')?.trim() || ''
  const month = url.searchParams.get('month')?.trim() || currentMonth()
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100),
  )

  if (!isValidMonth(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }

  if (status && !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` },
      { status: 400 },
    )
  }

  const where: Prisma.ExpenseWhereInput = {}
  const { start, end } = monthRange(month)
  where.date = { gte: start, lt: end }
  if (category) where.category = category
  if (status) where.status = status
  if (q) {
    where.OR = [
      { description: { contains: q } },
      { vendor: { contains: q } },
      { note: { contains: q } },
    ]
  }

  const [total, rows, agg, byCat, byMethod, byStatus] = await Promise.all([
    db.expense.count({ where }),
    db.expense.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.expense.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.expense.groupBy({
      by: ['category'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.expense.groupBy({
      by: ['method'],
      where,
      _sum: { amount: true },
    }),
    // Status split ignores the status filter so tab counts stay stable while
    // the user switches tabs.
    db.expense.groupBy({
      by: ['status'],
      where: { date: where.date, ...(category ? { category } : {}), ...(q ? { OR: where.OR } : {}) },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ])

  const byCategory = byCat
    .map((c) => ({
      category: c.category,
      total: round2(c._sum.amount ?? 0),
      count: c._count._all,
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category))

  const methodTotals: Record<string, number> = { Cash: 0, Bank: 0, Card: 0 }
  for (const m of byMethod) {
    if (m.method in methodTotals) methodTotals[m.method] = round2(m._sum.amount ?? 0)
  }

  const statusTotals: Record<string, { count: number; total: number }> = {
    Pending: { count: 0, total: 0 },
    Approved: { count: 0, total: 0 },
    Rejected: { count: 0, total: 0 },
  }
  for (const s of byStatus) {
    if (s.status in statusTotals) {
      statusTotals[s.status] = {
        count: s._count._all,
        total: round2(s._sum.amount ?? 0),
      }
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return NextResponse.json({
    data: rows.map(serialize),
    summary: {
      total: round2(agg._sum.amount ?? 0),
      count: agg._count._all,
      byCategory,
      methodTotals,
      statusTotals,
    },
    page,
    totalPages,
    total,
  })
}

// ─── Validation helpers ─────────────────────────────────────────────────────
interface ExpenseBody {
  date?: string | null
  category?: string | null
  description?: string | null
  amount?: number | string
  method?: string | null
  vendor?: string | null
  note?: string | null
  status?: string | null
}

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

// Validate a create/update payload. When `partial` is true (PUT), absent
// fields are skipped and kept as-is; present fields are fully validated.
function validate(
  body: ExpenseBody,
  partial: boolean,
): { error: string } | { values: Prisma.ExpenseUncheckedCreateInput } {
  const values: Partial<Prisma.ExpenseUncheckedCreateInput> = {}

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
    if (amount === null || amount <= 0) {
      return { error: 'amount must be a positive number' }
    }
    values.amount = amount
  }
  if (body.method !== undefined || !partial) {
    const method = body.method?.trim() || 'Cash'
    if (!ALLOWED_METHODS.has(method)) {
      return { error: `method must be one of ${Array.from(ALLOWED_METHODS).join(', ')}` }
    }
    values.method = method
  }
  if (body.vendor !== undefined) {
    values.vendor = body.vendor?.trim() || null
  }
  if (body.note !== undefined) {
    values.note = body.note?.trim() || null
  }
  if (body.status !== undefined && body.status !== null && body.status !== '') {
    const st = body.status.trim()
    if (!ALLOWED_STATUSES.has(st)) {
      return { error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` }
    }
    values.status = st
  }

  return { values: values as Prisma.ExpenseUncheckedCreateInput }
}

// ─── POST /api/expenses — create an expense ─────────────────────────────────
export async function POST(req: Request) {
  let body: ExpenseBody
  try {
    body = (await req.json()) as ExpenseBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = validate(body, false)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  try {
    const created = await db.expense.create({ data: result.values })
    return NextResponse.json(serialize(created), { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create expense'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
