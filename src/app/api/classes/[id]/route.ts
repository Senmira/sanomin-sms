import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

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

const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ─── GET /api/classes/[id] ──────────────────────────────────────────────────
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const cls = await db.class.findUnique({
    where: { id },
    include: {
      program: { select: { id: true, code: true, name: true, color: true } },
      teacher: { select: { id: true, teacherId: true, fullName: true, type: true } },
      _count: { select: { enrollments: true } },
    },
  })
  if (!cls) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  }
  return NextResponse.json(serialize(cls))
}

interface UpdateBody {
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

// ─── PUT /api/classes/[id] ──────────────────────────────────────────────────
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  let body: UpdateBody
  try {
    body = (await req.json()) as UpdateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await db.class.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  }

  if (body.dayOfWeek !== undefined && body.dayOfWeek && !VALID_DAYS.includes(body.dayOfWeek)) {
    return NextResponse.json(
      { error: `dayOfWeek must be one of ${VALID_DAYS.join(', ')}` },
      { status: 400 },
    )
  }

  if (body.programId !== undefined && body.programId) {
    const p = await db.program.findUnique({
      where: { id: body.programId },
      select: { id: true },
    })
    if (!p) {
      return NextResponse.json({ error: 'programId not found' }, { status: 400 })
    }
  }
  if (body.teacherId !== undefined && body.teacherId) {
    const t = await db.teacher.findUnique({
      where: { id: body.teacherId },
      select: { id: true },
    })
    if (!t) {
      return NextResponse.json({ error: 'teacherId not found' }, { status: 400 })
    }
  }

  const data: Prisma.ClassUpdateInput = {}

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    }
    data.name = name
  }

  if (body.programId !== undefined) {
    // null or '' disconnects; a real id connects
    if (body.programId) {
      data.program = { connect: { id: body.programId } }
    } else {
      data.program = { disconnect: true }
    }
  }

  if (body.teacherId !== undefined) {
    if (body.teacherId) {
      data.teacher = { connect: { id: body.teacherId } }
    } else {
      data.teacher = { disconnect: true }
    }
  }

  if (body.dayOfWeek !== undefined) data.dayOfWeek = body.dayOfWeek || null
  if (body.startTime !== undefined) data.startTime = body.startTime?.trim() || null
  if (body.endTime !== undefined) data.endTime = body.endTime?.trim() || null
  if (body.room !== undefined) data.room = body.room?.trim() || null

  if (body.capacity !== undefined) {
    data.capacity =
      typeof body.capacity === 'number' && !isNaN(body.capacity)
        ? Math.max(0, Math.floor(body.capacity))
        : 20
  }

  if (body.fee !== undefined) {
    data.fee =
      typeof body.fee === 'number' && !isNaN(body.fee) ? Math.max(0, body.fee) : 0
  }

  if (body.instituteSharePct !== undefined) {
    data.instituteSharePct =
      typeof body.instituteSharePct === 'number' && !isNaN(body.instituteSharePct)
        ? Math.min(100, Math.max(0, body.instituteSharePct))
        : 25
  }

  if (body.active !== undefined) data.active = Boolean(body.active)
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null

  try {
    const updated = await db.class.update({
      where: { id },
      data,
      include: {
        program: { select: { id: true, code: true, name: true, color: true } },
        teacher: { select: { id: true, teacherId: true, fullName: true, type: true } },
        _count: { select: { enrollments: true } },
      },
    })
    return NextResponse.json(serialize(updated))
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: `DB error: ${err.message}` }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to update class'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/classes/[id] ───────────────────────────────────────────────
// Enrollment.class has onDelete: Cascade — deleting the class will also remove
// the enrollment rows that reference it. Block deletion when enrollments exist
// so admins don't accidentally wipe student enrolment history; warn otherwise.
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const existing = await db.class.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      _count: { select: { enrollments: true } },
    },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  }

  if (existing._count.enrollments > 0) {
    return NextResponse.json(
      {
        error:
          `Cannot delete "${existing.name}" — ${existing._count.enrollments}` +
          ` student(s) are enrolled. Withdraw them first.`,
      },
      { status: 400 },
    )
  }

  try {
    await db.class.delete({ where: { id } })
    return NextResponse.json({ ok: true, id, name: existing.name })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete class'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
