import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── GET / PUT / DELETE /api/expenses/[id] ──────────────────────────────
// PUT is partial-tolerant: absent fields keep their existing values, present
// fields are fully validated (same rules as POST /api/expenses).
// Status transitions (Pending → Approved/Rejected, back to Pending) stamp
// reviewedAt + reviewedBy on the row for the approvals audit trail.

const ALLOWED_METHODS = new Set(['Cash', 'Bank', 'Card'])
const ALLOWED_STATUSES = new Set(['Pending', 'Approved', 'Rejected'])

function serialize(e: ExpenseRecord, includeReceipt = false) {
  const base = {
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
    hasReceipt: !!e.receiptUrl,
    receiptName: e.receiptName,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }
  return includeReceipt ? { ...base, receiptUrl: e.receiptUrl } : base
}

type ExpenseRecord = Prisma.ExpenseGetPayload<Record<string, never>>

interface RouteCtx {
  params: Promise<{ id: string }>
}

// ─── GET /api/expenses/[id] ─────────────────────────────────────────────────
// Single-expense fetch INCLUDES the receipt data URL (list responses don't) —
// this is the endpoint the receipt viewer calls.
export async function GET(_req: Request, { params }: RouteCtx) {
  const { id } = await params
  const expense = await db.expense.findUnique({ where: { id } })
  if (!expense) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }
  return NextResponse.json(serialize(expense, true))
}

// ─── PUT /api/expenses/[id] ─────────────────────────────────────────────────
interface UpdateBody {
  date?: string | null
  category?: string | null
  description?: string | null
  amount?: number | string
  method?: string | null
  vendor?: string | null
  note?: string | null
  status?: string | null
  reviewedBy?: string | null
  receiptUrl?: string | null
  receiptName?: string | null
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

export async function PUT(req: Request, { params }: RouteCtx) {
  const { id } = await params
  let body: UpdateBody
  try {
    body = (await req.json()) as UpdateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await db.expense.findUnique({
    where: { id },
    select: { id: true, status: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  const data: Prisma.ExpenseUncheckedUpdateInput = {}

  if (body.date !== undefined) {
    const date = parseIsoDate(body.date)
    if (!date) return NextResponse.json({ error: 'date must be a valid ISO date' }, { status: 400 })
    data.date = date
  }
  if (body.category !== undefined) {
    const category = body.category?.trim()
    if (!category) return NextResponse.json({ error: 'category cannot be empty' }, { status: 400 })
    data.category = category
  }
  if (body.description !== undefined) {
    const description = body.description?.trim()
    if (!description)
      return NextResponse.json({ error: 'description cannot be empty' }, { status: 400 })
    data.description = description
  }
  if (body.amount !== undefined) {
    const amount = parseAmount(body.amount)
    if (amount === null || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
    }
    data.amount = amount
  }
  if (body.method !== undefined) {
    const method = body.method?.trim() || 'Cash'
    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json(
        { error: `method must be one of ${Array.from(ALLOWED_METHODS).join(', ')}` },
        { status: 400 },
      )
    }
    data.method = method
  }
  if (body.vendor !== undefined) data.vendor = body.vendor?.trim() || null
  if (body.note !== undefined) data.note = body.note?.trim() || null
  // Receipt attachment — image data URL only; empty string clears it.
  if (body.receiptUrl !== undefined) {
    const ru = typeof body.receiptUrl === 'string' ? body.receiptUrl.trim() : ''
    if (ru && !/^data:image\//.test(ru)) {
      return NextResponse.json({ error: 'receiptUrl must be an image data URL' }, { status: 400 })
    }
    if (ru.length > 1_500_000) {
      return NextResponse.json(
        { error: 'receipt image is too large — please choose a smaller photo' },
        { status: 400 },
      )
    }
    data.receiptUrl = ru || null
    data.receiptName = body.receiptName?.trim() || null
  }
  if (body.status !== undefined && body.status !== null && body.status !== '') {
    const st = body.status.trim()
    if (!ALLOWED_STATUSES.has(st)) {
      return NextResponse.json(
        { error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` },
        { status: 400 },
      )
    }
    data.status = st
    // Stamp review metadata only on an actual status change.
    if (st !== existing.status) {
      if (st === 'Approved' || st === 'Rejected') {
        data.reviewedAt = new Date()
        data.reviewedBy = body.reviewedBy?.trim() || 'Administrator'
      } else {
        // Back to Pending — clear the previous review stamp.
        data.reviewedAt = null
        data.reviewedBy = null
      }
    }
  }

  try {
    const updated = await db.expense.update({ where: { id }, data })
    return NextResponse.json(serialize(updated))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update expense'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/expenses/[id] ──────────────────────────────────────────────
export async function DELETE(_req: Request, { params }: RouteCtx) {
  const { id } = await params
  const existing = await db.expense.findUnique({
    where: { id },
    select: { id: true, description: true, category: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }
  await db.expense.delete({ where: { id } })
  return NextResponse.json({ ok: true, id })
}
