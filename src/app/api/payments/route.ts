import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer: Payment → PaymentRow JSON ────────────────────────────────
type PaymentWithRelations = Prisma.PaymentGetPayload<{
  include: {
    student: { select: { id: true, studentId: true, fullName: true } }
    program: { select: { id: true, code: true, name: true, color: true } }
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
  }
}

const ALLOWED_STATUSES = new Set(['Pending', 'Partial', 'Paid', 'Overdue'])
const ALLOWED_METHODS = new Set(['Cash', 'Card', 'Bank', 'Online'])

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Generate next receiptNo like SAN-2025-0001
async function nextReceiptNo(): Promise<string> {
  const year = String(new Date().getFullYear())
  const prefix = `SAN-${year}-`
  const existing = await db.payment.findMany({
    where: { receiptNo: { startsWith: prefix } },
    select: { receiptNo: true },
  })
  let max = 0
  for (const r of existing) {
    if (!r.receiptNo) continue
    const num = parseInt(r.receiptNo.slice(prefix.length), 10)
    if (!isNaN(num) && num > max) max = num
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

// ─── GET /api/payments — list with filters + summary ────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() || ''
  const status = url.searchParams.get('status')?.trim() || ''
  const month = url.searchParams.get('month')?.trim() || ''
  const program = url.searchParams.get('program')?.trim() || ''
  const method = url.searchParams.get('method')?.trim() || ''
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50),
  )

  const where: Prisma.PaymentWhereInput = {}
  if (q) {
    where.OR = [
      { student: { fullName: { contains: q } } },
      { student: { studentId: { contains: q } } },
      { receiptNo: { contains: q } },
    ]
  }
  if (status && ALLOWED_STATUSES.has(status)) where.status = status
  if (month) where.month = month
  if (program) where.program = { code: program }
  if (method && ALLOWED_METHODS.has(method)) where.method = method

  const [total, rows, agg] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where,
      include: {
        student: { select: { id: true, studentId: true, fullName: true } },
        program: { select: { id: true, code: true, name: true, color: true } },
      },
      orderBy: [{ month: 'desc' }, { receiptNo: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.payment.aggregate({
      where,
      _sum: { amount: true, paidAmount: true },
      _count: { _all: true },
    }),
  ])

  const summaryMonth = month || currentMonth()
  const monthAgg = await db.payment.aggregate({
    where: { month: summaryMonth },
    _sum: { amount: true, paidAmount: true },
    _count: { _all: true },
  })
  const pendingCount = await db.payment.count({
    where: { month: summaryMonth, status: 'Pending' },
  })
  const overdueCount = await db.payment.count({
    where: { month: summaryMonth, status: 'Overdue' },
  })

  const totalBilled = monthAgg._sum.amount ?? 0
  const totalCollected = monthAgg._sum.paidAmount ?? 0
  const totalOutstanding = Math.max(0, totalBilled - totalCollected)

  return NextResponse.json({
    data: rows.map(serialize),
    total,
    page,
    limit,
    summary: {
      totalBilled,
      totalCollected,
      totalOutstanding,
      pendingCount,
      overdueCount,
    },
    filtered: {
      totalBilled: agg._sum.amount ?? 0,
      totalCollected: agg._sum.paidAmount ?? 0,
      count: agg._count._all,
    },
  })
}

// ─── POST /api/payments — create ────────────────────────────────────────────
interface CreateBody {
  studentId?: string
  programId?: string | null
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
}

function parseDate(v?: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function isValidMonth(s?: string): boolean {
  return !!s && /^\d{4}-\d{2}$/.test(s)
}

function computeStatus(
  amount: number,
  paidAmount: number,
  prevStatus?: string,
): { status: string; paidDate: Date | null; updatedPaidAmount: number } {
  if (paidAmount <= 0) {
    // No money received — overdue if dueDate passed, else pending
    return { status: prevStatus === 'Overdue' ? 'Overdue' : 'Pending', paidDate: null, updatedPaidAmount: 0 }
  }
  if (paidAmount >= amount) {
    return { status: 'Paid', paidDate: new Date(), updatedPaidAmount: paidAmount }
  }
  return { status: 'Partial', paidDate: new Date(), updatedPaidAmount: paidAmount }
}

export async function POST(req: Request) {
  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const studentId = body.studentId?.trim()
  if (!studentId) {
    return NextResponse.json({ error: 'studentId is required' }, { status: 400 })
  }
  const student = await db.student.findUnique({ where: { id: studentId }, select: { id: true } })
  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 400 })
  }

  if (!isValidMonth(body.month)) {
    return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 })
  }

  if (body.programId) {
    const program = await db.program.findUnique({ where: { id: body.programId }, select: { id: true } })
    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 400 })
    }
  }

  const amount =
    typeof body.amount === 'number' && !isNaN(body.amount) ? Math.max(0, body.amount) : 0
  const paidAmount =
    typeof body.paidAmount === 'number' && !isNaN(body.paidAmount)
      ? Math.max(0, body.paidAmount)
      : 0

  const method = body.method && ALLOWED_METHODS.has(body.method) ? body.method : 'Cash'

  // Compute status if not explicitly provided
  let status = body.status && ALLOWED_STATUSES.has(body.status) ? body.status : ''
  let paidDate = parseDate(body.paidDate)
  if (!status) {
    const computed = computeStatus(amount, paidAmount)
    status = computed.status
    paidDate = paidDate ?? computed.paidDate
  } else if (status === 'Paid' && !paidDate) {
    paidDate = new Date()
  }

  // Receipt number: use provided if unique, otherwise auto-generate
  let receiptNo = body.receiptNo?.trim() || null
  if (receiptNo) {
    const clash = await db.payment.findUnique({ where: { receiptNo }, select: { id: true } })
    if (clash) {
      return NextResponse.json({ error: `receiptNo "${receiptNo}" already exists` }, { status: 400 })
    }
  } else {
    receiptNo = await nextReceiptNo()
  }

  try {
    const created = await db.payment.create({
      data: {
        studentId,
        programId: body.programId || null,
        classId: body.classId || null,
        month: body.month!,
        amount,
        paidAmount,
        method,
        status,
        paidDate,
        dueDate: parseDate(body.dueDate),
        note: body.note?.trim() || null,
        receiptNo,
      },
      include: {
        student: { select: { id: true, studentId: true, fullName: true } },
        program: { select: { id: true, code: true, name: true, color: true } },
      },
    })
    return NextResponse.json(serialize(created), { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return NextResponse.json(
          { error: `receiptNo "${receiptNo}" already exists` },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: `DB error: ${err.message}` }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to create payment'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
