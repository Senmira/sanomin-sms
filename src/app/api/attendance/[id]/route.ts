import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer ─────────────────────────────────────────────────────────────
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

function parseDate(v?: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

interface UpdateBody {
  status?: string
  note?: string | null
  checkIn?: string | null
  checkOut?: string | null
  method?: string
  date?: string | null
}

const ALLOWED_STATUS = ['Present', 'Absent', 'Late', 'Leave']
const ALLOWED_METHOD = ['Barcode', 'Fingerprint', 'Manual']

// ─── PUT /api/attendance/[id] ───────────────────────────────────────────────
// Partial update of an attendance record's editable fields.
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

  const existing = await db.attendance.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json(
      { error: 'Attendance record not found' },
      { status: 404 },
    )
  }

  if (body.status !== undefined && !ALLOWED_STATUS.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of ${ALLOWED_STATUS.join(', ')}` },
      { status: 400 },
    )
  }
  if (body.method !== undefined && !ALLOWED_METHOD.includes(body.method)) {
    return NextResponse.json(
      { error: `method must be one of ${ALLOWED_METHOD.join(', ')}` },
      { status: 400 },
    )
  }

  // Build dynamic update — only set fields that are explicitly provided.
  const data: Prisma.AttendanceUpdateInput = {}
  if (body.status !== undefined) data.status = body.status
  if (body.method !== undefined) data.method = body.method
  if (body.note !== undefined) data.note = body.note || null
  if (body.checkIn !== undefined) data.checkIn = parseDate(body.checkIn)
  if (body.checkOut !== undefined) data.checkOut = parseDate(body.checkOut)
  if (body.date !== undefined) data.date = parseDate(body.date) ?? new Date()

  // Sanity: checkOut must be after checkIn (if both set)
  if (
    data.checkIn !== undefined &&
    data.checkOut !== undefined &&
    data.checkIn &&
    data.checkOut &&
    data.checkOut.getTime() < data.checkIn.getTime()
  ) {
    return NextResponse.json(
      { error: 'checkOut cannot be earlier than checkIn' },
      { status: 400 },
    )
  }

  try {
    const updated = await db.attendance.update({
      where: { id },
      data,
      include: { student: true, teacher: true },
    })
    return NextResponse.json(serialize(updated))
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Failed to update attendance record'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/attendance/[id] ────────────────────────────────────────────
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const existing = await db.attendance.findUnique({
    where: { id },
    select: { id: true, personRef: true, personType: true, date: true },
  })
  if (!existing) {
    return NextResponse.json(
      { error: 'Attendance record not found' },
      { status: 404 },
    )
  }
  try {
    await db.attendance.delete({ where: { id } })
    return NextResponse.json({
      ok: true,
      id,
      personRef: existing.personRef,
      personType: existing.personType,
    })
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Failed to delete attendance record'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
