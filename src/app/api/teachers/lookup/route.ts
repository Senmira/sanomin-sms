import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer (matches TeacherRow interface) ──────────────────────────────
type TeacherWithRelations = Prisma.TeacherGetPayload<{
  include: {
    classes: {
      select: {
        id: true
        name: true
        dayOfWeek: true
        startTime: true
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
    })),
    _count: { classes: t._count.classes, attendance: t._count.attendance },
  }
}

// ─── GET /api/teachers/lookup?fingerprintId=FP-1001 ─────────────────────────
// Fast lookup for the fingerprint scanner. Returns the teacher (or 404).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const fingerprintId = url.searchParams.get('fingerprintId')?.trim()

  if (!fingerprintId) {
    return NextResponse.json(
      { error: 'Provide ?fingerprintId= query parameter' },
      { status: 400 },
    )
  }

  const teacher = await db.teacher.findUnique({
    where: { fingerprintId },
    include: {
      classes: {
        select: { id: true, name: true, dayOfWeek: true, startTime: true },
      },
      _count: { select: { classes: true, attendance: true } },
    },
  })

  if (!teacher) {
    return NextResponse.json(
      { error: 'No teacher matches that fingerprint ID' },
      { status: 404 },
    )
  }
  return NextResponse.json(serialize(teacher))
}
