import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/attendance/register?classId=...&month=YYYY-MM
// → Monthly class register: roster rows (students enrolled in the class) ×
//   day columns with each student's daily attendance status, per-student
//   totals and per-day class totals. Attendance is recorded per student per
//   day (barcode/manual), so a student's day status applies across all their
//   classes — the register presents it per class roster for printing.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId')?.trim() || ''
  if (!classId) {
    return NextResponse.json({ error: 'classId is required' }, { status: 400 })
  }

  const cls = await db.class.findUnique({
    where: { id: classId },
    include: {
      teacher: { select: { fullName: true, teacherId: true, type: true } },
      program: { select: { name: true, color: true, code: true } },
    },
  })
  if (!cls) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 })
  }

  // Month range (local calendar, same convention as the heatmap report)
  const monthStr = searchParams.get('month') // "2026-09"
  const now = new Date()
  const year = monthStr ? parseInt(monthStr.split('-')[0], 10) : now.getFullYear()
  const month = monthStr ? parseInt(monthStr.split('-')[1], 10) - 1 : now.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999)
  const daysInMonth = lastDay.getDate()

  // Roster: students actively enrolled in this class
  const enrollments = await db.enrollment.findMany({
    where: { classId, status: 'Active' },
    include: {
      student: { select: { id: true, studentId: true, fullName: true, status: true } },
    },
  })
  const roster = enrollments
    .filter((e) => e.student && e.student.status === 'Active')
    .map((e) => e.student)
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
  const studentIds = roster.map((s) => s.id)

  // Attendance for those students within the month
  const records =
    studentIds.length > 0
      ? await db.attendance.findMany({
          where: {
            personType: 'Student',
            personId: { in: studentIds },
            date: { gte: firstDay, lte: lastDay },
          },
          select: { personId: true, date: true, status: true },
        })
      : []

  // Map "personId-day" → status
  const cellMap = new Map<string, string>()
  for (const r of records) {
    cellMap.set(`${r.personId}-${r.date.getDate()}`, r.status)
  }

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    const dow = d.getDay() // 0=Sun..6=Sat
    return {
      day: i + 1,
      dow: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      isWeekend: dow === 0 || dow === 6,
      isFuture: d > today,
    }
  })

  const students = roster.map((s) => {
    const cells = days.map((d) => cellMap.get(`${s.id}-${d.day}`) ?? null)
    const present = cells.filter((c) => c === 'Present').length
    const late = cells.filter((c) => c === 'Late').length
    const absent = cells.filter((c) => c === 'Absent').length
    const leave = cells.filter((c) => c === 'Leave').length
    const marked = present + late + absent + leave
    const rate = marked > 0 ? Math.round(((present + late) / marked) * 100) : null
    return {
      id: s.id,
      studentId: s.studentId,
      fullName: s.fullName,
      cells,
      present,
      late,
      absent,
      leave,
      rate,
    }
  })

  // Per-day class totals
  const dayTotals = days.map((d, i) => ({
    day: d.day,
    present: students.filter((s) => s.cells[i] === 'Present').length,
    late: students.filter((s) => s.cells[i] === 'Late').length,
    absent: students.filter((s) => s.cells[i] === 'Absent').length,
    marked: students.filter((s) => s.cells[i] !== null).length,
  }))

  // ── Class-level summary insights ──
  const totalPresent = students.reduce((n, s) => n + s.present, 0)
  const totalLate = students.reduce((n, s) => n + s.late, 0)
  const totalAbsent = students.reduce((n, s) => n + s.absent, 0)
  const totalLeave = students.reduce((n, s) => n + s.leave, 0)
  const totalMarked = totalPresent + totalLate + totalAbsent + totalLeave

  const markedDayStats = dayTotals
    .filter((d) => d.marked > 0)
    .map((d) => ({
      day: d.day,
      present: d.present,
      marked: d.marked,
      rate: Math.round(((d.present + d.late) / d.marked) * 100),
    }))
  const bestDay =
    markedDayStats.length > 0
      ? markedDayStats.reduce((best, d) =>
          d.rate > best.rate || (d.rate === best.rate && d.present > best.present) ? d : best,
        )
      : null
  const worstDay =
    markedDayStats.length > 0
      ? markedDayStats.reduce((worst, d) =>
          d.rate < worst.rate || (d.rate === worst.rate && d.present < worst.present) ? d : worst,
        )
      : null

  const atRisk = students
    .filter((s) => s.rate !== null && s.rate < 75)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))
    .slice(0, 6)
    .map((s) => ({ studentId: s.studentId, fullName: s.fullName, rate: s.rate as number }))

  const summary = {
    rate: totalMarked > 0 ? Math.round(((totalPresent + totalLate) / totalMarked) * 100) : null,
    present: totalPresent,
    late: totalLate,
    absent: totalAbsent,
    leave: totalLeave,
    marked: totalMarked,
    daysWithRecords: markedDayStats.length,
    bestDay: bestDay ? { day: bestDay.day, present: bestDay.present, rate: bestDay.rate } : null,
    worstDay: worstDay ? { day: worstDay.day, present: worstDay.present, rate: worstDay.rate } : null,
    perfect: students.filter((s) => s.rate === 100).length,
    atRiskCount: students.filter((s) => s.rate !== null && s.rate < 75).length,
    atRisk,
  }

  return NextResponse.json({
    class: {
      id: cls.id,
      name: cls.name,
      teacher: cls.teacher ? `${cls.teacher.fullName} (${cls.teacher.teacherId})` : null,
      program: cls.program?.name ?? null,
      programColor: cls.program?.color ?? null,
      schedule: [cls.dayOfWeek, cls.startTime && cls.endTime ? `${cls.startTime}–${cls.endTime}` : cls.startTime]
        .filter(Boolean)
        .join(' · '),
      room: cls.room,
    },
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    monthLabel: new Date(year, month, 1).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    }),
    days,
    students,
    dayTotals,
    summary,
    totalStudents: students.length,
  })
}
