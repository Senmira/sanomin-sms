import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/reports?type=attendance|enrollment|heatmap
//   attendance: ?from=yyyy-mm-dd &to=yyyy-mm-dd → daily aggregates + method/status breakdown + by program
//   enrollment: → by program, by age group, by gender, by religion, by status, recent admissions
//   heatmap: ?month=YYYY-MM → daily attendance grid for the month (rate per day)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'attendance'

  if (type === 'enrollment') {
    return enrollmentReport()
  }
  if (type === 'heatmap') {
    return heatmapReport(searchParams)
  }
  return attendanceReport(searchParams)
}

// Heatmap: daily attendance rate for a given month (or current month)
async function heatmapReport(searchParams: URLSearchParams) {
  const monthStr = searchParams.get('month') // "2026-09"
  const now = new Date()
  const year = monthStr ? parseInt(monthStr.split('-')[0], 10) : now.getFullYear()
  const month = monthStr ? parseInt(monthStr.split('-')[1], 10) - 1 : now.getMonth() // 0-indexed

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999)
  const daysInMonth = lastDay.getDate()

  const records = await db.attendance.findMany({
    where: { date: { gte: firstDay, lte: lastDay } },
    select: {
      date: true, personType: true, status: true,
    },
  })

  // Total active students (denominator for rate)
  const totalStudents = await db.student.count({ where: { status: 'Active' } })

  // Build per-day map
  const dayMap: Record<number, { present: number; late: number; absent: number; students: number; teachers: number }> = {}
  for (let d = 1; d <= daysInMonth; d++) {
    dayMap[d] = { present: 0, late: 0, absent: 0, students: 0, teachers: 0 }
  }
  for (const r of records) {
    const day = r.date.getDate()
    if (!dayMap[day]) continue
    if (r.status === 'Present') dayMap[day].present++
    if (r.status === 'Late') dayMap[day].late++
    if (r.status === 'Absent') dayMap[day].absent++
    if (r.personType === 'Student') dayMap[day].students++
    else dayMap[day].teachers++
  }

  // Build weeks grid (Mon-first). Compute leading blanks for the first week.
  // JS getDay: 0=Sun..6=Sat. Convert to Mon-first index: Mon=0..Sun=6
  const firstDow = (firstDay.getDay() + 6) % 7
  const cells: Array<{
    day: number | null
    present: number
    late: number
    absent: number
    students: number
    teachers: number
    rate: number | null // 0-100 student attendance rate
    isFuture: boolean
    isToday: boolean
  }> = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 0; i < firstDow; i++) {
    cells.push({ day: null, present: 0, late: 0, absent: 0, students: 0, teachers: 0, rate: null, isFuture: false, isToday: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dayData = dayMap[d]
    const cellDate = new Date(year, month, d)
    const rate = totalStudents > 0 && dayData.students > 0
      ? Math.round((dayData.present / totalStudents) * 100)
      : (dayData.students > 0 ? 0 : null)
    cells.push({
      day: d,
      present: dayData.present,
      late: dayData.late,
      absent: dayData.absent,
      students: dayData.students,
      teachers: dayData.teachers,
      rate,
      isFuture: cellDate > today,
      isToday: cellDate.getTime() === today.getTime(),
    })
  }
  // Pad trailing to complete the last week
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, present: 0, late: 0, absent: 0, students: 0, teachers: 0, rate: null, isFuture: false, isToday: false })
  }

  // Month summary
  const monthPresent = records.filter((r) => r.status === 'Present').length
  const monthLate = records.filter((r) => r.status === 'Late').length
  const monthAbsent = records.filter((r) => r.status === 'Absent').length
  const activeDays = Object.values(dayMap).filter((d) => d.students > 0).length
  const avgRate = activeDays > 0
    ? Math.round((monthPresent / (activeDays * totalStudents)) * 100)
    : 0

  return NextResponse.json({
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    monthLabel: new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    totalStudents,
    daysInMonth,
    activeDays,
    cells,
    summary: {
      present: monthPresent,
      late: monthLate,
      absent: monthAbsent,
      avgRate,
      bestDay: (() => {
        let best: { day: number; rate: number } | null = null
        for (const c of cells) {
          if (c.day && c.rate !== null) {
            if (!best || c.rate > best.rate) best = { day: c.day, rate: c.rate }
          }
        }
        return best
      })(),
      worstDay: (() => {
        let worst: { day: number; rate: number } | null = null
        for (const c of cells) {
          if (c.day && c.rate !== null) {
            if (!worst || c.rate < worst.rate) worst = { day: c.day, rate: c.rate }
          }
        }
        return worst
      })(),
    },
  })
}

async function attendanceReport(searchParams: URLSearchParams) {
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  const today = new Date()
  const to = toStr ? new Date(toStr + 'T23:59:59') : new Date(today.setHours(23, 59, 59, 999))
  const from = fromStr ? new Date(fromStr + 'T00:00:00') : new Date(to.getTime() - 13 * 86400000)
  from.setHours(0, 0, 0, 0)

  const records = await db.attendance.findMany({
    where: { date: { gte: from, lte: to } },
    include: {
      student: { select: { id: true, fullName: true, studentId: true, enrollments: { include: { program: { select: { code: true, name: true, color: true } } } } } },
      teacher: { select: { id: true, fullName: true, teacherId: true, type: true, specialization: true } },
    },
    orderBy: { date: 'asc' },
  })

  // daily series
  const dayMap: Record<string, { date: string; students: number; teachers: number; late: number; present: number }> = {}
  for (let t = new Date(from); t <= to; t.setDate(t.getDate() + 1)) {
    const key = t.toISOString().slice(0, 10)
    dayMap[key] = { date: key, students: 0, teachers: 0, late: 0, present: 0 }
  }
  for (const r of records) {
    const key = r.date.toISOString().slice(0, 10)
    if (!dayMap[key]) dayMap[key] = { date: key, students: 0, teachers: 0, late: 0, present: 0 }
    if (r.personType === 'Student') dayMap[key].students++
    else dayMap[key].teachers++
    if (r.status === 'Present') dayMap[key].present++
    if (r.status === 'Late') dayMap[key].late++
  }
  const daily = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))

  // method breakdown
  const methodCount: Record<string, number> = { Barcode: 0, Fingerprint: 0, Manual: 0 }
  const statusCount: Record<string, number> = { Present: 0, Late: 0, Absent: 0, Leave: 0 }
  for (const r of records) {
    methodCount[r.method] = (methodCount[r.method] || 0) + 1
    statusCount[r.status] = (statusCount[r.status] || 0) + 1
  }

  // by program (student attendance grouped by their program enrollments)
  const programCount: Record<string, { code: string; name: string; color: string; count: number }> = {}
  for (const r of records) {
    if (r.personType !== 'Student' || !r.student) continue
    for (const e of r.student.enrollments) {
      if (!e.program) continue // enrollment may not have a program (class-only enrollment)
      const code = e.program.code
      if (!programCount[code])
        programCount[code] = { code, name: e.program.name, color: e.program.color, count: 0 }
      programCount[code].count++
    }
  }

  // top attendees (most present)
  const personCount: Record<string, { name: string; ref: string; type: string; count: number }> = {}
  for (const r of records) {
    if (r.status !== 'Present') continue
    const key = r.personId
    const name = r.personType === 'Student' ? r.student?.fullName : r.teacher?.fullName
    if (!name) continue
    if (!personCount[key])
      personCount[key] = { name, ref: r.personRef, type: r.personType, count: 0 }
    personCount[key].count++
  }
  const topAttendees = Object.values(personCount).sort((a, b) => b.count - a.count).slice(0, 8)

  // teacher type breakdown
  const teacherTypeCount = { Internal: 0, External: 0 }
  for (const r of records) {
    if (r.personType !== 'Teacher' || !r.teacher) continue
    if (r.teacher.type in teacherTypeCount) (teacherTypeCount as any)[r.teacher.type]++
  }

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      records: records.length,
      studentRecords: records.filter((r) => r.personType === 'Student').length,
      teacherRecords: records.filter((r) => r.personType === 'Teacher').length,
      present: statusCount.Present,
      late: statusCount.Late,
      absent: statusCount.Absent,
    },
    daily,
    methodCount,
    statusCount,
    programCount: Object.values(programCount),
    teacherTypeCount,
    topAttendees,
  })
}

async function enrollmentReport() {
  const students = await db.student.findMany({
    select: {
      id: true, studentId: true, fullName: true, gender: true, ageGroup: true,
      religion: true, nationality: true, status: true, admissionDate: true,
      enrollments: { include: { program: { select: { code: true, name: true, color: true } } } },
    },
  })
  const programs = await db.program.findMany({ include: { _count: { select: { enrollments: true, classes: true } } } })

  const byProgram = programs.map((p) => ({ code: p.code, name: p.name, color: p.color, count: p._count.enrollments, classes: p._count.classes }))
  const byAgeGroup: Record<string, number> = {}
  const byGender = { Male: 0, Female: 0 }
  const byReligion: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  const byNationality: Record<string, number> = {}
  for (const s of students) {
    const ag = s.ageGroup || 'Unknown'; byAgeGroup[ag] = (byAgeGroup[ag] || 0) + 1
    if (s.gender in byGender) (byGender as any)[s.gender]++
    const r = s.religion || 'Other'; byReligion[r] = (byReligion[r] || 0) + 1
    const st = s.status || 'Active'; byStatus[st] = (byStatus[st] || 0) + 1
    const n = s.nationality || 'Unknown'; byNationality[n] = (byNationality[n] || 0) + 1
  }

  // recent admissions (last 30 days)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
  const recentAdmissions = students
    .filter((s) => s.admissionDate && s.admissionDate >= cutoff)
    .sort((a, b) => (b.admissionDate?.getTime() || 0) - (a.admissionDate?.getTime() || 0))
    .slice(0, 10)
    .map((s) => ({
      studentId: s.studentId, fullName: s.fullName, gender: s.gender,
      admissionDate: s.admissionDate?.toISOString() ?? null,
      programs: s.enrollments.map((e) => e.program.code),
    }))

  return NextResponse.json({
    totals: {
      students: students.length,
      active: byStatus.Active || 0,
      inactive: byStatus.Inactive || 0,
      graduated: byStatus.Graduated || 0,
      recentAdmissions: students.filter((s) => s.admissionDate && s.admissionDate >= cutoff).length,
    },
    byProgram,
    byAgeGroup,
    byGender,
    byReligion,
    byStatus,
    byNationality,
    recentAdmissions,
  })
}
