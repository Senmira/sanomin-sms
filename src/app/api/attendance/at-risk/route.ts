import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/attendance/at-risk
// Flags students with attendance concerns over the last 14 days:
//   - Low attendance rate (< 60% of school days)
//   - Declining trend (last 7 days vs previous 7 days, drop > 15%)
//   - Frequent lateness (>= 3 late days in last 14 days)
//   - Consecutive absences (>= 2 absent days in a row recently)
// Returns { atRisk: [...], summary: { total, lowRate, declining, frequentLate, consecutiveAbsent } }
export async function GET() {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const fourteenDaysAgo = new Date(today)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
  fourteenDaysAgo.setHours(0, 0, 0, 0)

  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  const fourteenToSevenAgo = new Date(sevenDaysAgo)
  fourteenToSevenAgo.setHours(0, 0, 0, 0)
  const fourteenToSevenEnd = new Date(sevenDaysAgo)
  fourteenToSevenEnd.setSeconds(fourteenToSevenEnd.getSeconds() - 1)

  const students = await db.student.findMany({
    where: { status: 'Active' },
    select: {
      id: true,
      studentId: true,
      fullName: true,
      gender: true,
      ageGroup: true,
      guardians: { select: { name: true, phone: true }, take: 1 },
      enrollments: { include: { program: { select: { code: true, name: true, color: true } } }, where: { status: 'Active' } },
    },
    orderBy: { studentId: 'asc' },
  })

  // Fetch all attendance for these students in the last 14 days
  const records = await db.attendance.findMany({
    where: {
      personType: 'Student',
      date: { gte: fourteenDaysAgo, lte: today },
    },
    select: {
      personId: true,
      date: true,
      status: true,
    },
    orderBy: { date: 'asc' },
  })

  // Group by student
  const byStudent: Record<string, typeof records> = {}
  for (const r of records) {
    if (!byStudent[r.personId]) byStudent[r.personId] = []
    byStudent[r.personId].push(r)
  }

  const atRisk: Array<{
    id: string
    studentId: string
    fullName: string
    gender: string
    ageGroup: string | null
    guardianName: string | null
    guardianPhone: string | null
    programs: Array<{ code: string; name: string; color: string }>
    rate: number
    recentRate: number
    previousRate: number
    lateCount: number
    absentCount: number
    presentCount: number
    totalDays: number
    concerns: string[]
    severity: 'high' | 'medium' | 'low'
  }> = []

  let lowRateCount = 0
  let decliningCount = 0
  let frequentLateCount = 0
  let consecutiveAbsentCount = 0

  for (const s of students) {
    const sRecords = byStudent[s.id] || []
    if (sRecords.length === 0) continue // skip students with no attendance at all

    const totalDays = sRecords.length
    const presentCount = sRecords.filter((r) => r.status === 'Present').length
    const lateCount = sRecords.filter((r) => r.status === 'Late').length
    const absentCount = sRecords.filter((r) => r.status === 'Absent').length
    const rate = totalDays > 0 ? Math.round(((presentCount + lateCount) / totalDays) * 100) : 0

    // Recent (last 7 days) vs previous (7-14 days ago)
    const recent = sRecords.filter((r) => r.date >= sevenDaysAgo)
    const previous = sRecords.filter((r) => r.date >= fourteenDaysAgo && r.date < fourteenToSevenEnd)

    const recentRate = recent.length > 0
      ? Math.round((recent.filter((r) => r.status === 'Present' || r.status === 'Late').length / recent.length) * 100)
      : null
    const previousRate = previous.length > 0
      ? Math.round((previous.filter((r) => r.status === 'Present' || r.status === 'Late').length / previous.length) * 100)
      : null

    const concerns: string[] = []

    // 1. Low attendance rate (< 60%)
    if (rate < 60 && totalDays >= 3) {
      concerns.push(`Low attendance rate (${rate}%)`)
      lowRateCount++
    }

    // 2. Declining trend (drop > 15% from previous week to recent week)
    if (recentRate !== null && previousRate !== null && (previousRate - recentRate) > 15) {
      concerns.push(`Attendance declining (${previousRate}% → ${recentRate}%)`)
      decliningCount++
    }

    // 3. Frequent lateness (>= 3 late in 14 days)
    if (lateCount >= 3) {
      concerns.push(`Frequently late (${lateCount} times in 14 days)`)
      frequentLateCount++
    }

    // 4. Consecutive absences (>= 2 absent in a row recently)
    let consecutiveAbsent = 0
    let maxConsecutive = 0
    for (const r of sRecords) {
      if (r.status === 'Absent') {
        consecutiveAbsent++
        maxConsecutive = Math.max(maxConsecutive, consecutiveAbsent)
      } else {
        consecutiveAbsent = 0
      }
    }
    if (maxConsecutive >= 2) {
      concerns.push(`${maxConsecutive} consecutive absences`)
      consecutiveAbsentCount++
    }

    if (concerns.length === 0) continue

    // Severity: high if rate < 40% or >= 3 concerns; medium if rate < 60% or 2 concerns; low otherwise
    const severity: 'high' | 'medium' | 'low' =
      rate < 40 || concerns.length >= 3 ? 'high' : rate < 60 || concerns.length >= 2 ? 'medium' : 'low'

    atRisk.push({
      id: s.id,
      studentId: s.studentId,
      fullName: s.fullName,
      gender: s.gender,
      ageGroup: s.ageGroup,
      guardianName: s.guardians[0]?.name ?? null,
      guardianPhone: s.guardians[0]?.phone ?? null,
      programs: s.enrollments
        .filter((e) => e.program)
        .map((e) => ({ code: e.program.code, name: e.program.name, color: e.program.color })),
      rate,
      recentRate: recentRate ?? 0,
      previousRate: previousRate ?? 0,
      lateCount,
      absentCount,
      presentCount,
      totalDays,
      concerns,
      severity,
    })
  }

  // Sort by severity (high first), then by rate (lowest first)
  const severityOrder = { high: 0, medium: 1, low: 2 }
  atRisk.sort((a, b) => {
    const sv = severityOrder[a.severity] - severityOrder[b.severity]
    if (sv !== 0) return sv
    return a.rate - b.rate
  })

  return NextResponse.json({
    atRisk,
    summary: {
      total: atRisk.length,
      lowRate: lowRateCount,
      declining: decliningCount,
      frequentLate: frequentLateCount,
      consecutiveAbsent: consecutiveAbsentCount,
      monitoredStudents: students.length,
      periodDays: 14,
    },
  })
}
