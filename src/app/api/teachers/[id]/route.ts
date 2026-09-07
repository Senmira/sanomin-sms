import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer: map a Prisma teacher (with relations) to TeacherRow JSON ───
type TeacherWithRelations = Prisma.TeacherGetPayload<{
  include: {
    classes: {
      select: {
        id: true
        name: true
        dayOfWeek: true
        startTime: true
        endTime: true
        room: true
        program: { select: { id: true, code: true, name: true, color: true } }
      }
    }
    _count: { select: { classes: true, attendance: true } }
  }
}>

function serialize(t: TeacherWithRelations) {
  return {
    id: t.id,
    teacherId: t.teacherId,
    fingerprintId: t.fingerprintId,
    fullName: t.fullName,
    type: t.type,
    gender: t.gender,
    phone: t.phone,
    email: t.email,
    address: t.address,
    nic: t.nic,
    qualification: t.qualification,
    specialization: t.specialization,
    photoUrl: t.photoUrl,
    status: t.status,
    hireDate: t.hireDate ? t.hireDate.toISOString() : null,
    monthlyRate: t.monthlyRate,
    classes: t.classes.map((c) => ({
      id: c.id,
      name: c.name,
      dayOfWeek: c.dayOfWeek,
      startTime: c.startTime,
      endTime: c.endTime,
      room: c.room,
      program: c.program
        ? {
            id: c.program.id,
            code: c.program.code,
            name: c.program.name,
            color: c.program.color,
          }
        : null,
    })),
    _count: { classes: t._count.classes, attendance: t._count.attendance },
  }
}

// ─── GET /api/teachers/[id] — full teacher profile ──────────────────────────
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const teacher = await db.teacher.findUnique({
    where: { id },
    include: {
      classes: {
        select: {
          id: true,
          name: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          room: true,
          program: { select: { id: true, code: true, name: true, color: true } },
        },
        orderBy: { name: 'asc' },
      },
      _count: { select: { classes: true, attendance: true } },
    },
  })
  if (!teacher) {
    return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
  }
  return NextResponse.json(serialize(teacher))
}

interface UpdateBody {
  fullName?: string
  type?: string
  gender?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  nic?: string | null
  qualification?: string | null
  specialization?: string | null
  photoUrl?: string | null
  status?: string
  hireDate?: string | null
  monthlyRate?: number | null
  fingerprintId?: string | null
}

function parseDate(v?: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// ─── PUT /api/teachers/[id] — partial update ───────────────────────────────
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

  const existing = await db.teacher.findUnique({
    where: { id },
    select: { id: true, fingerprintId: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
  }

  if (body.fullName !== undefined && !body.fullName.trim()) {
    return NextResponse.json({ error: 'fullName cannot be empty' }, { status: 400 })
  }
  if (body.type !== undefined && !['Internal', 'External'].includes(body.type)) {
    return NextResponse.json(
      { error: 'type must be Internal or External' },
      { status: 400 },
    )
  }

  // If fingerprintId is being changed, ensure unique (and not assigned to someone else)
  if (body.fingerprintId !== undefined) {
    const newFp = body.fingerprintId?.trim() || null
    if (newFp) {
      const clash = await db.teacher.findFirst({
        where: { fingerprintId: newFp, NOT: { id } },
        select: { id: true },
      })
      if (clash) {
        return NextResponse.json(
          { error: `fingerprintId "${newFp}" is already assigned to another teacher` },
          { status: 400 },
        )
      }
    }
  }

  try {
    const data: Prisma.TeacherUpdateInput = {}
    if (body.fullName !== undefined) data.fullName = body.fullName.trim()
    if (body.type !== undefined) data.type = body.type
    if (body.gender !== undefined) data.gender = body.gender || null
    if (body.phone !== undefined) data.phone = body.phone || null
    if (body.email !== undefined) data.email = body.email || null
    if (body.address !== undefined) data.address = body.address || null
    if (body.nic !== undefined) data.nic = body.nic || null
    if (body.qualification !== undefined)
      data.qualification = body.qualification || null
    if (body.specialization !== undefined)
      data.specialization = body.specialization || null
    if (body.photoUrl !== undefined) data.photoUrl = body.photoUrl || null
    if (body.status !== undefined) data.status = body.status
    if (body.hireDate !== undefined) data.hireDate = parseDate(body.hireDate)
    if (body.monthlyRate !== undefined)
      data.monthlyRate = typeof body.monthlyRate === 'number' ? body.monthlyRate : 0
    if (body.fingerprintId !== undefined)
      data.fingerprintId = body.fingerprintId?.trim() || null

    const updated = await db.teacher.update({
      where: { id },
      data,
      include: {
        classes: {
          select: {
            id: true,
            name: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            room: true,
            program: { select: { id: true, code: true, name: true, color: true } },
          },
          orderBy: { name: 'asc' },
        },
        _count: { select: { classes: true, attendance: true } },
      },
    })
    return NextResponse.json(serialize(updated))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update teacher'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/teachers/[id] ──────────────────────────────────────────────
// Classes.linked via teacherId with onDelete: SetNull — they will be unassigned.
// Attendance rows cascade via Prisma schema (onDelete: Cascade).
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const existing = await db.teacher.findUnique({
    where: { id },
    select: { id: true, fullName: true, teacherId: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
  }
  try {
    await db.teacher.delete({ where: { id } })
    return NextResponse.json({
      ok: true,
      id,
      fullName: existing.fullName,
      teacherId: existing.teacherId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete teacher'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
