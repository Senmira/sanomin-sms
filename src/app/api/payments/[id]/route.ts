import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer: Payment (with line items) → PaymentRow JSON ───────────────
type PaymentWithRelations = Prisma.PaymentGetPayload<{
  include: {
    student: { select: { id: true; studentId: true; fullName: true } }
    program: { select: { id: true; code: true; name: true; color: true } }
    items: {
      orderBy: { createdAt: 'asc' }
      include: {
        program: { select: { id: true; code: true; name: true; color: true; monthlyFee: true } }
      }
    }
  }
}>

function serialize(p: PaymentWithRelations) {
  return {
    id: p.id,
    studentId: p.studentId,
    programId: p.programId,
    classId: p.classId,
    month: p.month,
    amount: p.amount,
    paidAmount: p.paidAmount,
    method: p.method,
    status: p.status,
    paidDate: p.paidDate ? p.paidDate.toISOString() : null,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    note: p.note,
    receiptNo: p.receiptNo,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    student: {
      id: p.student.id,
      studentId: p.student.studentId,
      fullName: p.student.fullName,
    },
    program: p.program
      ? {
          id: p.program.id,
          code: p.program.code,
          name: p.program.name,
          color: p.program.color,
        }
      : null,
    items: p.items.map((it) => ({
      id: it.id,
      programId: it.programId,
      description: it.description,
      amount: it.amount,
      program: it.program
        ? {
            id: it.program.id,
            code: it.program.code,
            name: it.program.name,
            color: it.program.color,
            monthlyFee: it.program.monthlyFee,
          }
        : null,
    })),
  }
}

const PAYMENT_INCLUDE = {
  student: { select: { id: true, studentId: true, fullName: true } },
  program: { select: { id: true, code: true, name: true, color: true } },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      program: {
        select: { id: true, code: true, name: true, color: true, monthlyFee: true },
      },
    },
  },
}

const ALLOWED_STATUSES = new Set(['Pending', 'Partial', 'Paid', 'Overdue'])
const ALLOWED_METHODS = new Set(['Cash', 'Card', 'Bank', 'Online'])

function parseDate(v?: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

interface RouteCtx {
  params: Promise<{ id: string }>
}

// ─── GET /api/payments/[id] ────────────────────────────────────────────────
export async function GET(_req: Request, { params }: RouteCtx) {
  const { id } = await params
  const payment = await db.payment.findUnique({
    where: { id },
    include: PAYMENT_INCLUDE,
  })
  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }
  return NextResponse.json(serialize(payment))
}

// ─── PUT /api/payments/[id] ────────────────────────────────────────────────
interface UpdateBody {
  studentId?: string
  programId?: string | null
  programIds?: string[]
  classId?: string | null
  month?: string
  amount?: number
  paidAmount?: number
  method?: string
  status?: string
  paidDate?: string | null
  dueDate?: string | null
  note?: string | null
  receiptNo?: string | null
  items?: Array<{ programId?: string | null; amount?: number; description?: string | null }>
}

export async function PUT(req: Request, { params }: RouteCtx) {
  const { id } = await params
  let body: UpdateBody
  try {
    body = (await req.json()) as UpdateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await db.payment.findUnique({
    where: { id },
    select: { id: true, amount: true, paidAmount: true, status: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  // Validate references if they're being changed
  if (body.studentId) {
    const s = await db.student.findUnique({ where: { id: body.studentId }, select: { id: true } })
    if (!s) return NextResponse.json({ error: 'Student not found' }, { status: 400 })
  }
  if (body.programId) {
    const p = await db.program.findUnique({ where: { id: body.programId }, select: { id: true } })
    if (!p) return NextResponse.json({ error: 'Program not found' }, { status: 400 })
  }
  if (body.month && !/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }
  if (body.method && !ALLOWED_METHODS.has(body.method)) {
    return NextResponse.json(
      { error: `method must be one of ${Array.from(ALLOWED_METHODS).join(', ')}` },
      { status: 400 },
    )
  }
  if (body.status && !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` },
      { status: 400 },
    )
  }
  if (body.receiptNo) {
    const clash = await db.payment.findUnique({
      where: { receiptNo: body.receiptNo },
      select: { id: true },
    })
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: `receiptNo "${body.receiptNo}" already exists` }, { status: 400 })
    }
  }

  // ── Resolve new line items when provided (replace-all semantics) ─────────
  let replaceItems: Array<{ programId: string | null; amount: number; description: string | null }> | null = null
  let itemsTotal = 0
  if (Array.isArray(body.items) || Array.isArray(body.programIds)) {
    const lines: Array<{ programId: string | null; amount: number; description: string | null }> = []
    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const it of body.items) {
        const pid = it.programId?.trim() || null
        if (pid) {
          const prog = await db.program.findUnique({ where: { id: pid } })
          if (!prog) return NextResponse.json({ error: 'Program not found' }, { status: 400 })
          lines.push({
            programId: pid,
            amount:
              typeof it.amount === 'number' && !isNaN(it.amount) && it.amount >= 0
                ? it.amount
                : prog.monthlyFee,
            description: it.description?.trim() || prog.name,
          })
        } else {
          lines.push({
            programId: null,
            amount: typeof it.amount === 'number' && !isNaN(it.amount) && it.amount >= 0 ? it.amount : 0,
            description: it.description?.trim() || 'Custom charge',
          })
        }
      }
    } else if (Array.isArray(body.programIds) && body.programIds.length > 0) {
      const programs = await db.program.findMany({
        where: { id: { in: body.programIds } },
        select: { id: true, name: true, monthlyFee: true },
      })
      if (programs.length !== new Set(body.programIds).size) {
        return NextResponse.json({ error: 'One or more programs not found' }, { status: 400 })
      }
      const byId = new Map(programs.map((p) => [p.id, p]))
      for (const pid of body.programIds) {
        const prog = byId.get(pid)!
        lines.push({ programId: prog.id, amount: prog.monthlyFee, description: prog.name })
      }
    }
    // Deduplicate programmes — the same programme twice on one bill is a mistake
    const seen = new Set<string>()
    replaceItems = lines.filter((li) => {
      if (!li.programId) return true
      if (seen.has(li.programId)) return false
      seen.add(li.programId)
      return true
    })
    itemsTotal = replaceItems.reduce((s, li) => s + li.amount, 0)
  }

  // Merge incoming changes over existing
  const amount =
    typeof body.amount === 'number' && !isNaN(body.amount)
      ? Math.max(0, body.amount)
      : replaceItems
        ? itemsTotal
        : existing.amount
  const paidAmount =
    typeof body.paidAmount === 'number' && !isNaN(body.paidAmount)
      ? Math.max(0, body.paidAmount)
      : existing.paidAmount

  let status = body.status || existing.status
  let paidDate = body.paidDate !== undefined ? parseDate(body.paidDate) : undefined

  // Auto-promote: if paidAmount >= amount → Paid
  if (paidAmount >= amount && amount > 0) {
    status = 'Paid'
    if (paidDate === undefined) {
      // keep existing paidDate; only set to now if currently null
      const cur = await db.payment.findUnique({ where: { id }, select: { paidDate: true } })
      paidDate = cur?.paidDate ?? new Date()
    }
  } else if (paidAmount > 0 && paidAmount < amount) {
    // If they didn't explicitly set status, force Partial
    if (!body.status) {
      status = 'Partial'
      if (paidDate === undefined) {
        const cur = await db.payment.findUnique({ where: { id }, select: { paidDate: true } })
        paidDate = cur?.paidDate ?? new Date()
      }
    }
  } else if (paidAmount <= 0) {
    // No money; back to Pending unless status explicitly set
    if (!body.status) status = 'Pending'
    if (paidDate === undefined) paidDate = null
  }

  const data: Prisma.PaymentUncheckedUpdateInput = {}
  if (body.studentId) data.studentId = body.studentId
  if (body.programId !== undefined && !replaceItems) {
    data.programId = body.programId || null
  }
  if (replaceItems) {
    // keep the legacy programId column in sync for single-programme bills
    data.programId = replaceItems.length === 1 ? replaceItems[0].programId : null
    data.items = {
      deleteMany: {},
      create: replaceItems.map((li) => ({
        programId: li.programId,
        amount: li.amount,
        description: li.description,
      })),
    }
  }
  if (body.classId !== undefined) data.classId = body.classId
  if (body.month) data.month = body.month
  if ((typeof body.amount === 'number' && !isNaN(body.amount)) || replaceItems)
    data.amount = amount
  if (typeof body.paidAmount === 'number' && !isNaN(body.paidAmount)) data.paidAmount = paidAmount
  if (body.method) data.method = body.method
  if (status) data.status = status
  if (paidDate !== undefined) data.paidDate = paidDate
  if (body.dueDate !== undefined) data.dueDate = parseDate(body.dueDate)
  if (body.note !== undefined) data.note = body.note?.trim() || null
  if (body.receiptNo !== undefined) data.receiptNo = body.receiptNo?.trim() || null

  try {
    const updated = await db.payment.update({
      where: { id },
      data,
      include: PAYMENT_INCLUDE,
    })
    return NextResponse.json(serialize(updated))
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return NextResponse.json(
          { error: `receiptNo "${body.receiptNo}" already exists` },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: `DB error: ${err.message}` }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to update payment'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/payments/[id] ─────────────────────────────────────────────
export async function DELETE(_req: Request, { params }: RouteCtx) {
  const { id } = await params
  const existing = await db.payment.findUnique({
    where: { id },
    select: { id: true, receiptNo: true, month: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }
  await db.payment.delete({ where: { id } })
  return NextResponse.json({
    ok: true,
    id,
    receiptNo: existing.receiptNo,
    month: existing.month,
  })
}
