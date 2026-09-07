import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── POST /api/attendance/bulk ──────────────────────────────────────────────
// Manual bulk attendance sheet — mark a whole list of students/teachers in one
// shot, each row with its own status + check-in + check-out time.
//
// Body: {
//   date: "YYYY-MM-DD",
//   entries: Array<{
//     personType: "Student" | "Teacher"
//     personId: string          // student.id / teacher.id
//     status?: "Present" | "Absent" | "Late" | "Leave"   (default Present)
//     checkIn?: string | null   // "HH:MM" 24h
//     checkOut?: string | null  // "HH:MM" 24h
//     note?: string | null
//   }>
// }
//
// Behaviour: for every entry we UPSERT the attendance row for that person on
// that date — an existing record is updated (times/status overwritten),
// a missing one is created with method "Manual".

interface BulkBody {
  date?: string
  entries?: Array<{
    personType?: string
    personId?: string
    status?: string
    checkIn?: string | null
    checkOut?: string | null
    note?: string | null
  }>
}

const ALLOWED_STATUS = new Set(['Present', 'Absent', 'Late', 'Leave'])

function dayRange(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10))
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0)
  const end = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999)
  return { start, end }
}

// "HH:MM" (or "HH:MM:SS") → Date on the given date; null if invalid/empty
function timeToDate(dateStr: string, time?: string | null): Date | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim())
  if (!m) return null
  const [y, mo, d] = dateStr.split('-').map((n) => parseInt(n, 10))
  const hh = Math.min(23, parseInt(m[1], 10))
  const mm = Math.min(59, parseInt(m[2], 10))
  const ss = m[3] ? Math.min(59, parseInt(m[3], 10)) : 0
  return new Date(y, (mo || 1) - 1, d || 1, hh, mm, ss, 0)
}

export async function POST(req: Request) {
  let body: BulkBody
  try {
    body = (await req.json()) as BulkBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const dateStr = body.date?.trim()
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json(
      { error: 'date is required in YYYY-MM-DD format' },
      { status: 400 },
    )
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: 'entries array is required' }, { status: 400 })
  }
  if (body.entries.length > 500) {
    return NextResponse.json({ error: 'Too many entries (max 500 per request)' }, { status: 400 })
  }

  const { start, end } = dayRange(dateStr)

  // Load every existing record for that day once, index by `${personType}:${personId}`
  const existing = await db.attendance.findMany({
    where: { date: { gte: start, lte: end } },
    select: { id: true, personType: true, personId: true },
  })
  const existingKey = new Map<string, string>()
  for (const e of existing) {
    existingKey.set(`${e.personType}:${e.personId}`, e.id)
  }

  // Resolve referenced people (validate + get personRef codes)
  const studentIds = new Set(
    body.entries.filter((e) => e.personType === 'Student').map((e) => e.personId!),
  )
  const teacherIds = new Set(
    body.entries.filter((e) => e.personType === 'Teacher').map((e) => e.personId!),
  )
  const [students, teachers] = await Promise.all([
    studentIds.size
      ? db.student.findMany({
          where: { id: { in: Array.from(studentIds) } },
          select: { id: true, studentId: true },
        })
      : Promise.resolve([] as Array<{ id: string; studentId: string }>),
    teacherIds.size
      ? db.teacher.findMany({
          where: { id: { in: Array.from(teacherIds) } },
          select: { id: true, teacherId: true },
        })
      : Promise.resolve([] as Array<{ id: string; teacherId: string }>),
  ])
  const studentMap = new Map(students.map((s) => [s.id, s.studentId]))
  const teacherMap = new Map(teachers.map((t) => [t.id, t.teacherId]))

  let created = 0
  let updated = 0
  const errors: string[] = []

  await db.$transaction(async (tx) => {
    for (let i = 0; i < body.entries!.length; i++) {
      const entry = body.entries![i]
      const personType =
        entry.personType === 'Teacher' ? 'Teacher' : entry.personType === 'Student' ? 'Student' : null
      if (!personType) {
        errors.push(`Row ${i + 1}: personType must be Student or Teacher`)
        continue
      }
      const personId = entry.personId?.trim()
      if (!personId) {
        errors.push(`Row ${i + 1}: personId is required`)
        continue
      }
      const personRef =
        personType === 'Student' ? studentMap.get(personId) : teacherMap.get(personId)
      if (!personRef) {
        errors.push(`Row ${i + 1}: ${personType} not found`)
        continue
      }

      const status = entry.status && ALLOWED_STATUS.has(entry.status) ? entry.status : 'Present'
      const checkIn = timeToDate(dateStr, entry.checkIn)
      const checkOut = timeToDate(dateStr, entry.checkOut)
      const note = entry.note?.trim() || null

      // Sanity: if both times exist and checkOut < checkIn, drop checkOut
      const finalCheckOut =
        checkIn && checkOut && checkOut.getTime() < checkIn.getTime() ? null : checkOut

      const existingId = existingKey.get(`${personType}:${personId}`)
      if (existingId) {
        await tx.attendance.update({
          where: { id: existingId },
          data: {
            checkIn,
            checkOut: finalCheckOut,
            method: 'Manual',
            status,
            note,
            date: new Date(`${dateStr}T12:00:00`),
          },
        })
        updated++
      } else {
        await tx.attendance.create({
          data: {
            personType,
            personId,
            personRef,
            date: new Date(`${dateStr}T12:00:00`),
            checkIn,
            checkOut: finalCheckOut,
            method: 'Manual',
            status,
            note,
          },
        })
        created++
      }
    }
  })

  return NextResponse.json({
    ok: true,
    created,
    updated,
    failed: errors.length,
    errors: errors.slice(0, 20),
    message: `Saved ${created + updated} attendance record${created + updated === 1 ? '' : 's'} (${created} new, ${updated} updated)${errors.length ? `, ${errors.length} row${errors.length === 1 ? '' : 's'} failed` : ''}.`,
  })
}
