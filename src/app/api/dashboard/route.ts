import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const [
    totalStudents,
    totalTeachers,
    internalTeachers,
    externalTeachers,
    totalPrograms,
    totalClasses,
    todayStart,
  ] = await Promise.all([
    db.student.count(),
    db.teacher.count(),
    db.teacher.count({ where: { type: 'Internal' } }),
    db.teacher.count({ where: { type: 'External' } }),
    db.program.count({ where: { active: true } }),
    db.class.count({ where: { active: true } }),
    Promise.resolve(startOfToday()),
  ])

  const endOfToday = new Date(todayStart)
  endOfToday.setHours(23, 59, 59, 999)

  const [studentsPresentToday, teachersPresentToday, todayAttendanceRecords] =
    await Promise.all([
      db.attendance.count({
        where: {
          personType: 'Student',
          status: 'Present',
          date: { gte: todayStart, lte: endOfToday },
        },
      }),
      db.attendance.count({
        where: {
          personType: 'Teacher',
          status: 'Present',
          date: { gte: todayStart, lte: endOfToday },
        },
      }),
      db.attendance.count({
        where: { date: { gte: todayStart, lte: endOfToday } },
      }),
    ])

  const programs = await db.program.findMany({
    include: { _count: { select: { enrollments: true } } },
    orderBy: { enrollments: { _count: 'desc' } },
  })
  const byProgram = programs.map((p) => ({
    code: p.code,
    name: p.name,
    color: p.color,
    count: p._count.enrollments,
  }))

  const allStudents = await db.student.findMany({ select: { ageGroup: true, gender: true, religion: true } })
  const byAgeGroup: Record<string, number> = {}
  const byGender = { Male: 0, Female: 0 }
  const religionCount: Record<string, number> = {}
  for (const s of allStudents) {
    const g = s.ageGroup || 'Unknown'
    byAgeGroup[g] = (byAgeGroup[g] || 0) + 1
    if (s.gender in byGender) (byGender as any)[s.gender] += 1
    const r = s.religion || 'Other'
    religionCount[r] = (religionCount[r] || 0) + 1
  }

  const trend: { date: string; students: number; teachers: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart)
    d.setDate(d.getDate() - i)
    const dEnd = new Date(d)
    dEnd.setHours(23, 59, 59, 999)
    const [st, te] = await Promise.all([
      db.attendance.count({
        where: { personType: 'Student', date: { gte: d, lte: dEnd } },
      }),
      db.attendance.count({
        where: { personType: 'Teacher', date: { gte: d, lte: dEnd } },
      }),
    ])
    trend.push({
      date: d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' }),
      students: st,
      teachers: te,
    })
  }

  const recent = await db.attendance.findMany({
    take: 8,
    orderBy: { createdAt: 'desc' },
  })
  const recentWithNames = await Promise.all(
    recent.map(async (r) => {
      let name = r.personRef
      if (r.personType === 'Student') {
        const s = await db.student.findUnique({ where: { id: r.personId }, select: { fullName: true } })
        if (s) name = s.fullName
      } else {
        const t = await db.teacher.findUnique({ where: { id: r.personId }, select: { fullName: true } })
        if (t) name = t.fullName
      }
      return {
        ...r,
        personName: name,
        date: r.date.toISOString(),
        checkIn: r.checkIn?.toISOString() ?? null,
        checkOut: r.checkOut?.toISOString() ?? null,
      }
    }),
  )

  const todayDow = new Date().toLocaleDateString('en-US', { weekday: 'short' })
  const upcomingClasses = await db.class.findMany({
    where: { active: true, dayOfWeek: todayDow },
    include: {
      program: { select: { code: true, name: true, color: true } },
      teacher: { select: { teacherId: true, fullName: true, type: true } },
    },
    orderBy: { startTime: 'asc' },
    take: 5,
  })

  // Fees summary for current month
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthPayments = await db.payment.findMany({
    where: { month: monthKey },
    select: { amount: true, paidAmount: true, status: true },
  })
  const totalBilled = monthPayments.reduce((s, p) => s + p.amount, 0)
  const totalCollected = monthPayments.reduce((s, p) => s + p.paidAmount, 0)
  const overdueCount = monthPayments.filter((p) => p.status === 'Overdue').length
  const pendingCount = monthPayments.filter((p) => p.status === 'Pending' || p.status === 'Partial').length

  // Recent announcements (top 4 published, pinned first)
  const recentAnnouncements = await db.announcement.findMany({
    where: { status: 'Published' },
    orderBy: [{ pinned: 'desc' }, { publishDate: 'desc' }],
    take: 4,
    select: {
      id: true, title: true, body: true, category: true,
      audience: true, priority: true, pinned: true,
      publishDate: true,
    },
  })

  // At-risk students summary (last 14 days)
  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
  fourteenDaysAgo.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  const atRiskRecords = await db.attendance.findMany({
    where: {
      personType: 'Student',
      date: { gte: fourteenDaysAgo, lte: todayEnd },
    },
    select: { personId: true, date: true, status: true },
    orderBy: { date: 'asc' },
  })
  const byStudentAtRisk: Record<string, typeof atRiskRecords> = {}
  for (const r of atRiskRecords) {
    if (!byStudentAtRisk[r.personId]) byStudentAtRisk[r.personId] = []
    byStudentAtRisk[r.personId].push(r)
  }
  let atRiskCount = 0
  let decliningCount = 0
  let frequentLateCount = 0
  for (const id of Object.keys(byStudentAtRisk)) {
    const recs = byStudentAtRisk[id]
    const total = recs.length
    if (total < 3) continue
    const present = recs.filter((r) => r.status === 'Present' || r.status === 'Late').length
    const rate = total > 0 ? Math.round((present / total) * 100) : 100
    const lateCount = recs.filter((r) => r.status === 'Late').length
    const recent = recs.filter((r) => r.date >= sevenDaysAgo)
    const previous = recs.filter((r) => r.date < sevenDaysAgo)
    const recentRate = recent.length > 0 ? Math.round(recent.filter((r) => r.status === 'Present' || r.status === 'Late').length / recent.length * 100) : null
    const previousRate = previous.length > 0 ? Math.round(previous.filter((r) => r.status === 'Present' || r.status === 'Late').length / previous.length * 100) : null
    const isDeclining = recentRate !== null && previousRate !== null && (previousRate - recentRate) > 15
    const isFrequentLate = lateCount >= 3
    const isLowRate = rate < 60
    if (isLowRate || isDeclining || isFrequentLate) atRiskCount++
    if (isDeclining) decliningCount++
    if (isFrequentLate) frequentLateCount++
  }

  return NextResponse.json({
    totals: {
      students: totalStudents,
      teachers: totalTeachers,
      internalTeachers,
      externalTeachers,
      programs: totalPrograms,
      classes: totalClasses,
      studentsPresentToday,
      teachersPresentToday,
      todayAttendanceRecords,
    },
    byProgram,
    byAgeGroup,
    byGender,
    religionCount,
    trend,
    recent: recentWithNames,
    upcomingClasses,
    fees: {
      month: monthKey,
      totalBilled,
      totalCollected,
      outstanding: totalBilled - totalCollected,
      paidRate: totalBilled ? Math.round((totalCollected / totalBilled) * 100) : 0,
      overdueCount,
      pendingCount,
    },
    announcements: recentAnnouncements.map((a) => ({
      ...a,
      publishDate: a.publishDate.toISOString(),
    })),
    atRisk: {
      count: atRiskCount,
      declining: decliningCount,
      frequentLate: frequentLateCount,
      monitoredStudents: totalStudents,
      periodDays: 14,
    },
  })
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
