import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer: Attendance → AttendanceRow JSON (camelCase, ISO strings) ─────
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

// Compute the [startOfDay, endOfDay) range for a given yyyy-mm-dd string
// (interpreted in the server's local timezone, which matches Date.now() usage).
function dayRange(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10))
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0)
  const end = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999)
  return { start, end }
}

function todayStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── GET /api/attendance ────────────────────────────────────────────────────
// Query: date (yyyy-mm-dd, default today), personType, method, status,
//        studentId (filter by specific student's id), page, limit (default 50)
// Returns: { data, total, page, limit, summary: { present, late, absent, total } }
export async function GET(req: Request) {
  const url = new URL(req.url)
  const dateStr = url.searchParams.get('date')?.trim() || todayStr()
  const personType = url.searchParams.get('personType')?.trim() || ''
  const method = url.searchParams.get('method')?.trim() || ''
  const status = url.searchParams.get('status')?.trim() || ''
  const studentId = url.searchParams.get('studentId')?.trim() || ''
  const page = Math.max(
    1,
    parseInt(url.searchParams.get('page') || '1', 10) || 1,
  )
  const limit = Math.min(
    200,
    Math.max(
      1,
      parseInt(url.searchParams.get('limit') || '50', 10) || 50,
    ),
  )

  const { start, end } = dayRange(dateStr)

  // ── Main where: always scoped to the selected day ──
  const where: Prisma.AttendanceWhereInput = {
    date: { gte: start, lte: end },
  }
  if (personType) where.personType = personType
  if (method) where.method = method
  if (status) where.status = status
  if (studentId) {
    where.personId = studentId
    where.personType = 'Student'
  }

  // ── Summary where: scoped to the same day but ignores type/method/status ──
  const summaryWhere: Prisma.AttendanceWhereInput = {
    date: { gte: start, lte: end },
  }

  const [total, rows, present, late, absent, summaryTotal] = await Promise.all([
    db.attendance.count({ where }),
    db.attendance.findMany({
      where,
      include: { student: true, teacher: true },
      orderBy: [{ checkIn: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.attendance.count({
      where: { ...summaryWhere, status: 'Present' },
    }),
    db.attendance.count({
      where: { ...summaryWhere, status: 'Late' },
    }),
    db.attendance.count({
      where: { ...summaryWhere, status: 'Absent' },
    }),
    db.attendance.count({ where: summaryWhere }),
  ])

  return NextResponse.json({
    data: rows.map(serialize),
    total,
    page,
    limit,
    summary: { present, late, absent, total: summaryTotal },
  })
}
