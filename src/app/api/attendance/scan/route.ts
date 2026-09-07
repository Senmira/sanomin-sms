import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer: Attendance → AttendanceRow JSON ────────────────────────────
type AttendanceWithRelations = Prisma.AttendanceGetPayload<{
  include: { student: true; teacher: true }
}>

function serialize(a: AttendanceWithRelations) {
  const personName =
    a.personType === 'Student'
      ? a.student?.fullName ?? '—'
      : a.teacher?.fullName ?? '—'
  return {
    id: a.id,
    personType: a.personType,
    personId: a.personId,
    personRef: a.personRef,
    date: a.date.toISOString(),
    checkIn: a.checkIn ? a.checkIn.toISOString() : null,
    checkOut: a.checkOut ? a.checkOut.toISOString() : null,
    method: a.method,
    status: a.status,
    note: a.note,
    personName,
  }
}

// Today's [start, end] range (local time, matches Date.now() semantics)
function todayRange(): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

// School grace period — check-ins after this local time on a school day are
// marked "Late". 08:30 AM is the SANOMIN default; tweak here as needed.
function isLate(now: Date): boolean {
  const cutoff = new Date(now)
  cutoff.setHours(8, 30, 0, 0)
  return now.getTime() > cutoff.getTime()
}

interface ScanBody {
  method?: string
  value?: string
  personType?: string // required when method === "manual"
}

// ─── POST /api/attendance/scan ──────────────────────────────────────────────
// Body: { method: "barcode" | "fingerprint" | "manual", value: string,
//         personType?: "Student" | "Teacher" (required for manual) }
//
// For barcode  → lookup student by barcode OR studentId
// For fingerprint → lookup teacher by fingerprintId
// For manual    → lookup student/teacher by id (value = personId)
//
// Behaviour:
//   - miss → 404 { error }
//   - no record today → create check-IN (Present or Late, method from input)
//   - record w/ checkIn but no checkOut → set checkOut = now
//   - record w/ both set → 400 { error: "Already checked out", record }
//
// Returns: { action: "check-in" | "check-out", record: AttendanceRow,
//            person: { name, ref, type } }
export async function POST(req: Request) {
  let body: ScanBody
  try {
    body = (await req.json()) as ScanBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const method = body.method?.trim().toLowerCase()
  const value = body.value?.trim()
  if (!value) {
    return NextResponse.json(
      { error: 'value is required' },
      { status: 400 },
    )
  }
  if (
    method !== 'barcode' &&
    method !== 'fingerprint' &&
    method !== 'manual'
  ) {
    return NextResponse.json(
      { error: 'method must be "barcode", "fingerprint" or "manual"' },
      { status: 400 },
    )
  }

  // ── Resolve person ──
  let personType: 'Student' | 'Teacher'
  let personId: string
  let personRef: string
  let personName: string
  let prismaMethod: 'Barcode' | 'Fingerprint' | 'Manual'

  if (method === 'barcode') {
    prismaMethod = 'Barcode'
    // Lookup by barcode OR studentId
    const student = await db.student.findFirst({
      where: {
        OR: [{ barcode: value }, { studentId: value }],
      },
      select: { id: true, studentId: true, fullName: true },
    })
    if (!student) {
      return NextResponse.json(
        { error: `No student matches barcode "${value}"` },
        { status: 404 },
      )
    }
    personType = 'Student'
    personId = student.id
    personRef = student.studentId
    personName = student.fullName
  } else if (method === 'fingerprint') {
    prismaMethod = 'Fingerprint'
    const teacher = await db.teacher.findUnique({
      where: { fingerprintId: value },
      select: { id: true, teacherId: true, fullName: true },
    })
    if (!teacher) {
      return NextResponse.json(
        { error: `No teacher matches fingerprint "${value}"` },
        { status: 404 },
      )
    }
    personType = 'Teacher'
    personId = teacher.id
    personRef = teacher.teacherId
    personName = teacher.fullName
  } else {
    // Manual — value is the personId, personType disambiguates
    prismaMethod = 'Manual'
    const pt = body.personType?.trim()
    if (pt !== 'Student' && pt !== 'Teacher') {
      return NextResponse.json(
        {
          error:
            'personType must be "Student" or "Teacher" for manual entry',
        },
        { status: 400 },
      )
    }
    if (pt === 'Student') {
      const student = await db.student.findUnique({
        where: { id: value },
        select: { id: true, studentId: true, fullName: true },
      })
      if (!student) {
        return NextResponse.json(
          { error: 'Student not found' },
          { status: 404 },
        )
      }
      personType = 'Student'
      personId = student.id
      personRef = student.studentId
      personName = student.fullName
    } else {
      const teacher = await db.teacher.findUnique({
        where: { id: value },
        select: { id: true, teacherId: true, fullName: true },
      })
      if (!teacher) {
        return NextResponse.json(
          { error: 'Teacher not found' },
          { status: 404 },
        )
      }
      personType = 'Teacher'
      personId = teacher.id
      personRef = teacher.teacherId
      personName = teacher.fullName
    }
  }

  const now = new Date()
  const { start, end } = todayRange()

  // ── Find today's record for this person (any method) ──
  const existing = await db.attendance.findFirst({
    where: {
      personId,
      personType,
      date: { gte: start, lte: end },
    },
    orderBy: { createdAt: 'desc' },
    include: { student: true, teacher: true },
  })

  // Case A: no record → create check-IN
  if (!existing) {
    const status = isLate(now) ? 'Late' : 'Present'
    // NOTE: personId is a polymorphic field that backs BOTH the `student` and
    // `teacher` relations (see schema). We set it directly as a plain string;
    // Prisma resolves the matching relation automatically on read via `include`.
    // We must NOT also `connect` the relation — that would conflict (Prisma
    // treats personId as a foreign-key scalar owned by the relation).
    const created = await db.attendance.create({
      data: {
        personType,
        personId,
        personRef,
        date: now,
        checkIn: now,
        checkOut: null,
        method: prismaMethod,
        status,
        note: null,
      },
      include: { student: true, teacher: true },
    })
    return NextResponse.json({
      action: 'check-in',
      record: serialize(created),
      person: { name: personName, ref: personRef, type: personType },
    })
  }

  // Case B: has checkIn but no checkOut → check-OUT
  if (existing.checkIn && !existing.checkOut) {
    const updated = await db.attendance.update({
      where: { id: existing.id },
      data: { checkOut: now },
      include: { student: true, teacher: true },
    })
    return NextResponse.json({
      action: 'check-out',
      record: serialize(updated),
      person: { name: personName, ref: personRef, type: personType },
    })
  }

  // Case C: both set → already checked out
  return NextResponse.json(
    {
      error: 'Already checked out',
      record: serialize(existing),
      person: { name: personName, ref: personRef, type: personType },
    },
    { status: 400 },
  )
}
