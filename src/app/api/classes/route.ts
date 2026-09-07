import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer: Class → ClassRow JSON ──────────────────────────────────────
type ClassWithRelations = Prisma.ClassGetPayload<{
  include: {
    program: { select: { id: true; code: true; name: true; color: true } }
    teacher: { select: { id: true; teacherId: true; fullName: true; type: true } }
    _count: { select: { enrollments: true } }
  }
}>

function serialize(c: ClassWithRelations) {
  return {
    id: c.id,
    name: c.name,
    dayOfWeek: c.dayOfWeek,
    startTime: c.startTime,
    endTime: c.endTime,
    room: c.room,
    capacity: c.capacity,
    fee: c.fee,
    instituteSharePct: c.instituteSharePct,
    active: c.active,
    notes: c.notes,
    program: c.program
      ? {
          id: c.program.id,
          code: c.program.code,
          name: c.program.name,
          color: c.program.color,
        }
      : null,
    teacher: c.teacher
      ? {
          id: c.teacher.id,
          teacherId: c.teacher.teacherId,
          fullName: c.teacher.fullName,
          type: c.teacher.type,
        }
      : null,
    _count: { enrollments: c._count.enrollments },
  }
}

const DAY_ORDER: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

// ─── GET /api/classes — list with filters ───────────────────────────────────
// Query: day (Mon..Sun), program (program code), teacherId, active ("true"/"false"),
//        page, limit (default 50, capped 200)
// Returns: { data: ClassRow[], total }
export async function GET(req: Request) {
  const url = new URL(req.url)
  const day = url.searchParams.get('day')?.trim() || ''
  const programCode = url.searchParams.get('program')?.trim() || ''
  const teacherId = url.searchParams.get('teacherId')?.trim() || ''
  const activeParam = url.searchParams.get('active')
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50),
  )

  const where: Prisma.ClassWhereInput = {}
  if (day) where.dayOfWeek = day
  if (programCode) where.program = { code: programCode }
  if (teacherId) where.teacherId = teacherId
  if (activeParam === 'true') where.active = true
  if (activeParam === 'false') where.active = false

  const [total, rows] = await Promise.all([
    db.class.count({ where }),
    db.class.findMany({
      where,
      include: {
        program: { select: { id: true, code: true, name: true, color: true } },
        teacher: { select: { id: true, teacherId: true, fullName: true, type: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: [
        // Sort by day-of-week (Mon first), then start time
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
        { name: 'asc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  // Re-sort by DAY_ORDER so Mon..Sun is correct regardless of DB collation
  const sorted = [...rows].sort((a, b) => {
    const da = DAY_ORDER[a.dayOfWeek || ''] ?? 99
    const db_ = DAY_ORDER[b.dayOfWeek || ''] ?? 99
    if (da !== db_) return da - db_
    return (a.startTime || '').localeCompare(b.startTime || '')
  })

  return NextResponse.json({ data: sorted.map(serialize), total })
}

// ─── POST /api/classes — create a new class ─────────────────────────────────
interface CreateBody {
  name?: string
  programId?: string | null
  teacherId?: string | null
  dayOfWeek?: string | null
  startTime?: string | null
  endTime?: string | null
  room?: string | null
  capacity?: number | null
  fee?: number | null
  instituteSharePct?: number | null
  active?: boolean | null
  notes?: string | null
}

const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export async function POST(req: Request) {
  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  if (body.dayOfWeek && !VALID_DAYS.includes(body.dayOfWeek)) {
    return NextResponse.json(
      { error: `dayOfWeek must be one of ${VALID_DAYS.join(', ')}` },
      { status: 400 },
    )
  }

  // Validate programId/teacherId if provided
  if (body.programId) {
    const p = await db.program.findUnique({
      where: { id: body.programId },
      select: { id: true },
    })
    if (!p) {
      return NextResponse.json({ error: 'programId not found' }, { status: 400 })
    }
  }
  if (body.teacherId) {
    const t = await db.teacher.findUnique({
      where: { id: body.teacherId },
      select: { id: true },
    })
    if (!t) {
      return NextResponse.json({ error: 'teacherId not found' }, { status: 400 })
    }
  }

  const data: Prisma.ClassCreateInput = {
    name,
    dayOfWeek: body.dayOfWeek || null,
    startTime: body.startTime?.trim() || null,
    endTime: body.endTime?.trim() || null,
    room: body.room?.trim() || null,
    capacity:
      typeof body.capacity === 'number' && !isNaN(body.capacity)
        ? Math.max(0, Math.floor(body.capacity))
        : 20,
    fee:
      typeof body.fee === 'number' && !isNaN(body.fee) ? Math.max(0, body.fee) : 0,
    instituteSharePct:
      typeof body.instituteSharePct === 'number' && !isNaN(body.instituteSharePct)
        ? Math.min(100, Math.max(0, body.instituteSharePct))
        : 25,
    active: body.active ?? true,
    notes: body.notes?.trim() || null,
  }
  if (body.programId) {
    data.program = { connect: { id: body.programId } }
  }
  if (body.teacherId) {
    data.teacher = { connect: { id: body.teacherId } }
  }

  try {
    const created = await db.class.create({
      data,
      include: {
        program: { select: { id: true, code: true, name: true, color: true } },
        teacher: { select: { id: true, teacherId: true, fullName: true, type: true } },
        _count: { select: { enrollments: true } },
      },
    })
    return NextResponse.json(serialize(created), { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: `DB error: ${err.message}` }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to create class'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
