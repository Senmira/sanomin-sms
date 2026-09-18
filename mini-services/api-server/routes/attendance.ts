// ─── Attendance routes: /api/attendance, /[id], /trend, /register, /bulk,
//     /at-risk, /scan ─────────────────────────────────────────────────────────
import { Router } from 'express'
import { Attendance, Student, Teacher, Class, Enrollment, Program } from '../models'
import {
  ah, qs, dayRange, todayStr, timeToDate, round2,
} from '../helpers'

const r = Router()

// ─── Attendance serializer (resolves person names) ──────────────────────────
export async function serializeAttendance(rows: any[]) {
  const studentIds = [...new Set(rows.filter((a) => a.personType === 'Student').map((a) => a.personId))]
  const teacherIds = [...new Set(rows.filter((a) => a.personType === 'Teacher').map((a) => a.personId))]
  const [students, teachers] = await Promise.all([
    studentIds.length ? Student.find({ _id: { $in: studentIds } }, 'fullName').lean() : [],
    teacherIds.length ? Teacher.find({ _id: { $in: teacherIds } }, 'fullName').lean() : [],
  ])
  const sMap = new Map(students.map((s: any) => [s._id.toString(), s.fullName]))
  const tMap = new Map(teachers.map((t: any) => [t._id.toString(), t.fullName]))
  return rows.map((a) => {
    const j = a.toJSON ? a.toJSON() : a
    const id = j.id
    return {
      id,
      personType: j.personType,
      personId: j.personId,
      personRef: j.personRef,
      date: new Date(j.date).toISOString(),
      checkIn: j.checkIn ? new Date(j.checkIn).toISOString() : null,
      checkOut: j.checkOut ? new Date(j.checkOut).toISOString() : null,
      method: j.method,
      status: j.status,
      note: j.note ?? null,
      personName:
        j.personType === 'Student'
          ? sMap.get(j.personId) ?? '—'
          : tMap.get(j.personId) ?? '—',
    }
  })
}

// ─── GET /api/attendance ────────────────────────────────────────────────────
r.get('/', ah(async (req, res) => {
  const p = qs(req)
  const dateStr = p.get('date')?.trim() || todayStr()
  const personType = p.get('personType')?.trim() || ''
  const method = p.get('method')?.trim() || ''
  const status = p.get('status')?.trim() || ''
  const studentId = p.get('studentId')?.trim() || ''
  const page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(p.get('limit') || '50', 10) || 50))

  const { start, end } = dayRange(dateStr)
  const where: Record<string, unknown> = { date: { $gte: start, $lte: end } }
  if (personType) where.personType = personType
  if (method) where.method = method
  if (status) where.status = status
  if (studentId) {
    where.personId = studentId
    where.personType = 'Student'
  }

  const [total, rows, present, late, absent, summaryTotal] = await Promise.all([
    Attendance.countDocuments(where),
    Attendance.find(where).sort({ checkIn: 1, createdAt: 1 }).skip((page - 1) * limit).limit(limit),
    Attendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'Present' }),
    Attendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'Late' }),
    Attendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'Absent' }),
    Attendance.countDocuments({ date: { $gte: start, $lte: end } }),
  ])

  res.json({
    data: await serializeAttendance(rows),
    total,
    page,
    limit,
    summary: { present, late, absent, total: summaryTotal },
  })
}))

// ─── PUT /api/attendance/[id] ───────────────────────────────────────────────
const ALLOWED_STATUS = ['Present', 'Absent', 'Late', 'Leave']
const ALLOWED_METHOD = ['Barcode', 'Fingerprint', 'Manual']

r.put('/:id', ah(async (req, res) => {
  const row = await Attendance.findById(req.params.id)
  if (!row) return res.status(404).json({ error: 'Attendance record not found' })
  const body = req.body || {}
  if (body.status !== undefined && !ALLOWED_STATUS.includes(body.status)) {
    return res.status(400).json({ error: `status must be one of ${ALLOWED_STATUS.join(', ')}` })
  }
  if (body.method !== undefined && !ALLOWED_METHOD.includes(body.method)) {
    return res.status(400).json({ error: `method must be one of ${ALLOWED_METHOD.join(', ')}` })
  }
  if (body.status !== undefined) row.status = body.status
  if (body.method !== undefined) row.method = body.method
  if (body.note !== undefined) row.note = body.note || null
  if (body.checkIn !== undefined) {
    const d = body.checkIn ? new Date(body.checkIn) : null
    row.checkIn = d && !isNaN(d.getTime()) ? d : null
  }
  if (body.checkOut !== undefined) {
    const d = body.checkOut ? new Date(body.checkOut) : null
    row.checkOut = d && !isNaN(d.getTime()) ? d : null
  }
  if (body.date !== undefined) {
    const d = body.date ? new Date(body.date) : null
    row.date = d && !isNaN(d.getTime()) ? d : new Date()
  }
  if (
    row.checkIn && row.checkOut &&
    new Date(row.checkOut).getTime() < new Date(row.checkIn).getTime()
  ) {
    return res.status(400).json({ error: 'checkOut cannot be earlier than checkIn' })
  }
  await row.save()
  const [serialized] = await serializeAttendance([row])
  res.json(serialized)
}))

// ─── DELETE /api/attendance/[id] ────────────────────────────────────────────
r.delete('/:id', ah(async (req, res) => {
  const row = await Attendance.findById(req.params.id)
  if (!row) return res.status(404).json({ error: 'Attendance record not found' })
  const { id, personRef, personType } = { id: req.params.id, personRef: row.personRef, personType: row.personType }
  await row.deleteOne()
  res.json({ ok: true, id, personRef, personType })
}))

// ─── GET /api/attendance/trend ──────────────────────────────────────────────
r.get('/trend', ah(async (_req, res) => {
  const days: { date: string; students: number; teachers: number; late: number }[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dEnd = new Date(d)
    dEnd.setHours(23, 59, 59, 999)
    const [st, te, lt] = await Promise.all([
      Attendance.countDocuments({ personType: 'Student', date: { $gte: d, $lte: dEnd } }),
      Attendance.countDocuments({ personType: 'Teacher', date: { $gte: d, $lte: dEnd } }),
      Attendance.countDocuments({ status: 'Late', date: { $gte: d, $lte: dEnd } }),
    ])
    days.push({
      date: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      students: st,
      teachers: te,
      late: lt,
    })
  }
  res.json({ trend: days })
}))

// ─── GET /api/attendance/register?classId=&month= ───────────────────────────
r.get('/register', ah(async (req, res) => {
  const p = qs(req)
  const classId = p.get('classId')?.trim() || ''
  if (!classId) return res.status(400).json({ error: 'classId is required' })

  const cls = await Class.findById(classId)
    .populate('teacherId', 'fullName teacherId type')
    .populate('programId', 'name color code')
    .lean()
  if (!cls) return res.status(404).json({ error: 'Class not found' })

  const monthStr = p.get('month')
  const now = new Date()
  const year = monthStr ? parseInt(monthStr.split('-')[0], 10) : now.getFullYear()
  const month = monthStr ? parseInt(monthStr.split('-')[1], 10) - 1 : now.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999)
  const daysInMonth = lastDay.getDate()

  const enrollments = await Enrollment.find({ classId, status: 'Active' })
    .populate('studentId', 'studentId fullName status')
    .lean()
  const roster = enrollments
    .map((e: any) => e.studentId)
    .filter((s: any) => s && s.status === 'Active')
    .sort((a: any, b: any) => a.fullName.localeCompare(b.fullName))
  const studentIds = roster.map((s: any) => s._id.toString())

  const records =
    studentIds.length > 0
      ? await Attendance.find(
          {
            personType: 'Student',
            personId: { $in: studentIds },
            date: { $gte: firstDay, $lte: lastDay },
          },
          'personId date status',
        ).lean()
      : []

  const cellMap = new Map<string, string>()
  for (const rec of records) {
    cellMap.set(`${rec.personId}-${new Date(rec.date).getDate()}`, rec.status)
  }

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    const dow = d.getDay()
    return {
      day: i + 1,
      dow: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      isWeekend: dow === 0 || dow === 6,
      isFuture: d > today,
    }
  })

  const students = roster.map((s: any) => {
    const sid = s._id.toString()
    const cells = days.map((d) => cellMap.get(`${sid}-${d.day}`) ?? null)
    const present = cells.filter((c) => c === 'Present').length
    const late = cells.filter((c) => c === 'Late').length
    const absent = cells.filter((c) => c === 'Absent').length
    const leave = cells.filter((c) => c === 'Leave').length
    const marked = present + late + absent + leave
    const rate = marked > 0 ? Math.round(((present + late) / marked) * 100) : null
    return { id: sid, studentId: s.studentId, fullName: s.fullName, cells, present, late, absent, leave, rate }
  })

  const dayTotals = days.map((d, i) => ({
    day: d.day,
    present: students.filter((s) => s.cells[i] === 'Present').length,
    late: students.filter((s) => s.cells[i] === 'Late').length,
    absent: students.filter((s) => s.cells[i] === 'Absent').length,
    marked: students.filter((s) => s.cells[i] !== null).length,
  }))

  const totalPresent = students.reduce((n, s) => n + s.present, 0)
  const totalLate = students.reduce((n, s) => n + s.late, 0)
  const totalAbsent = students.reduce((n, s) => n + s.absent, 0)
  const totalLeave = students.reduce((n, s) => n + s.leave, 0)
  const totalMarked = totalPresent + totalLate + totalAbsent + totalLeave

  const markedDayStats = dayTotals
    .filter((d) => d.marked > 0)
    .map((d) => ({ day: d.day, present: d.present, marked: d.marked, rate: Math.round(((d.present + d.late) / d.marked) * 100) }))
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

  const teacher = cls.teacherId as any
  const program = cls.programId as any
  res.json({
    class: {
      id: (cls._id as any).toString(),
      name: cls.name,
      teacher: teacher ? `${teacher.fullName} (${teacher.teacherId})` : null,
      program: program?.name ?? null,
      programColor: program?.color ?? null,
      schedule: [cls.dayOfWeek, cls.startTime && cls.endTime ? `${cls.startTime}–${cls.endTime}` : cls.startTime]
        .filter(Boolean)
        .join(' · '),
      room: cls.room ?? null,
    },
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    monthLabel: new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    days,
    students,
    dayTotals,
    summary: {
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
    },
    totalStudents: students.length,
  })
}))

// ─── POST /api/attendance/bulk ──────────────────────────────────────────────
const BULK_STATUS = new Set(['Present', 'Absent', 'Late', 'Leave'])

r.post('/bulk', ah(async (req, res) => {
  const body = req.body || {}
  const dateStr = (body.date || '').trim()
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'date is required in YYYY-MM-DD format' })
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return res.status(400).json({ error: 'entries array is required' })
  }
  if (body.entries.length > 500) {
    return res.status(400).json({ error: 'Too many entries (max 500 per request)' })
  }

  const { start, end } = dayRange(dateStr)
  const existing = await Attendance.find({ date: { $gte: start, $lte: end } }, 'personType personId').lean()
  const existingKey = new Map<string, string>()
  for (const e of existing) existingKey.set(`${e.personType}:${e.personId}`, e._id.toString())

  const studentIds = [...new Set(body.entries.filter((e: any) => e.personType === 'Student').map((e: any) => e.personId))]
  const teacherIds = [...new Set(body.entries.filter((e: any) => e.personType === 'Teacher').map((e: any) => e.personId))]
  const [students, teachers] = await Promise.all([
    studentIds.length ? Student.find({ _id: { $in: studentIds } }, 'studentId').lean() : [],
    teacherIds.length ? Teacher.find({ _id: { $in: teacherIds } }, 'teacherId').lean() : [],
  ])
  const studentMap = new Map(students.map((s: any) => [s._id.toString(), s.studentId]))
  const teacherMap = new Map(teachers.map((t: any) => [t._id.toString(), t.teacherId]))

  let created = 0
  let updated = 0
  const errors: string[] = []

  for (let i = 0; i < body.entries.length; i++) {
    const entry = body.entries[i]
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

    const status = entry.status && BULK_STATUS.has(entry.status) ? entry.status : 'Present'
    const checkIn = timeToDate(dateStr, entry.checkIn)
    const checkOut = timeToDate(dateStr, entry.checkOut)
    const note = entry.note?.trim() || null
    const finalCheckOut =
      checkIn && checkOut && checkOut.getTime() < checkIn.getTime() ? null : checkOut

    const existingId = existingKey.get(`${personType}:${personId}`)
    if (existingId) {
      await Attendance.updateOne(
        { _id: existingId },
        {
          $set: {
            checkIn,
            checkOut: finalCheckOut,
            method: 'Manual',
            status,
            note,
            date: new Date(`${dateStr}T12:00:00`),
          },
        },
      )
      updated++
    } else {
      await Attendance.create({
        personType,
        personId,
        personRef,
        date: new Date(`${dateStr}T12:00:00`),
        checkIn,
        checkOut: finalCheckOut,
        method: 'Manual',
        status,
        note,
      })
      created++
    }
  }

  res.json({
    ok: true,
    created,
    updated,
    failed: errors.length,
    errors: errors.slice(0, 20),
    message: `Saved ${created + updated} attendance record${created + updated === 1 ? '' : 's'} (${created} new, ${updated} updated)${errors.length ? `, ${errors.length} row${errors.length === 1 ? '' : 's'} failed` : ''}.`,
  })
}))

// ─── GET /api/attendance/at-risk ────────────────────────────────────────────
r.get('/at-risk', ah(async (_req, res) => {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const fourteenDaysAgo = new Date(today)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
  fourteenDaysAgo.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)
  const fourteenToSevenEnd = new Date(sevenDaysAgo)
  fourteenToSevenEnd.setSeconds(fourteenToSevenEnd.getSeconds() - 1)

  const students = await Student.find({ status: 'Active' })
    .select('studentId fullName gender ageGroup')
    .sort({ studentId: 1 })
    .lean()
  const studentIds = students.map((s: any) => s._id.toString())

  const [records, guardians, enrollments, programs] = await Promise.all([
    Attendance.find(
      { personType: 'Student', date: { $gte: fourteenDaysAgo, $lte: today } },
      'personId date status',
    )
      .sort({ date: 1 })
      .lean(),
    (async () => {
      const { Guardian } = await import('../models')
      return Guardian.find({ studentId: { $in: studentIds } }, 'studentId name phone').lean()
    })(),
    Enrollment.find({ studentId: { $in: studentIds }, status: 'Active' }).lean(),
    Program.find({}, 'code name color').lean(),
  ])

  const gByStudent = new Map<string, any[]>()
  for (const g of guardians as any[]) {
    if (!gByStudent.has(g.studentId)) gByStudent.set(g.studentId, [])
    gByStudent.get(g.studentId)!.push(g)
  }
  const progMap = new Map((programs as any[]).map((p) => [p._id.toString(), p]))

  const byStudent: Record<string, any[]> = {}
  for (const rec of records) {
    if (!byStudent[rec.personId]) byStudent[rec.personId] = []
    byStudent[rec.personId].push(rec)
  }

  const atRisk: Array<{
    id: string; studentId: string; fullName: string; gender: string; ageGroup: string | null
    guardianName: string | null; guardianPhone: string | null
    programs: Array<{ code: string; name: string; color: string }>
    rate: number; recentRate: number; previousRate: number
    lateCount: number; absentCount: number; presentCount: number; totalDays: number
    concerns: string[]; severity: 'high' | 'medium' | 'low'
  }> = []

  let lowRateCount = 0
  let decliningCount = 0
  let frequentLateCount = 0
  let consecutiveAbsentCount = 0

  for (const s of students as any[]) {
    const sid = s._id.toString()
    const sRecords = byStudent[sid] || []
    if (sRecords.length === 0) continue

    const totalDays = sRecords.length
    const presentCount = sRecords.filter((x) => x.status === 'Present').length
    const lateCount = sRecords.filter((x) => x.status === 'Late').length
    const absentCount = sRecords.filter((x) => x.status === 'Absent').length
    const rate = totalDays > 0 ? Math.round(((presentCount + lateCount) / totalDays) * 100) : 0

    const recent = sRecords.filter((x) => new Date(x.date) >= sevenDaysAgo)
    const previous = sRecords.filter(
      (x) => new Date(x.date) >= fourteenDaysAgo && new Date(x.date) < fourteenToSevenEnd,
    )
    const recentRate = recent.length > 0
      ? Math.round((recent.filter((x) => x.status === 'Present' || x.status === 'Late').length / recent.length) * 100)
      : null
    const previousRate = previous.length > 0
      ? Math.round((previous.filter((x) => x.status === 'Present' || x.status === 'Late').length / previous.length) * 100)
      : null

    const concerns: string[] = []
    if (rate < 60 && totalDays >= 3) {
      concerns.push(`Low attendance rate (${rate}%)`)
      lowRateCount++
    }
    if (recentRate !== null && previousRate !== null && previousRate - recentRate > 15) {
      concerns.push(`Attendance declining (${previousRate}% → ${recentRate}%)`)
      decliningCount++
    }
    if (lateCount >= 3) {
      concerns.push(`Frequently late (${lateCount} times in 14 days)`)
      frequentLateCount++
    }
    let consecutiveAbsent = 0
    let maxConsecutive = 0
    for (const x of sRecords) {
      if (x.status === 'Absent') {
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

    const severity: 'high' | 'medium' | 'low' =
      rate < 40 || concerns.length >= 3 ? 'high' : rate < 60 || concerns.length >= 2 ? 'medium' : 'low'

    const gs = (gByStudent.get(sid) || []).sort(
      (a: any, b: any) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0),
    )
    const progRows = (enrollments as any[])
      .filter((e) => e.studentId === sid && e.programId)
      .map((e) => progMap.get(e.programId))
      .filter(Boolean)
      .map((p: any) => ({ code: p.code, name: p.name, color: p.color }))

    atRisk.push({
      id: sid,
      studentId: s.studentId,
      fullName: s.fullName,
      gender: s.gender,
      ageGroup: s.ageGroup ?? null,
      guardianName: gs[0]?.name ?? null,
      guardianPhone: gs[0]?.phone ?? null,
      programs: progRows,
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

  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
  atRisk.sort((a, b) => {
    const sv = severityOrder[a.severity] - severityOrder[b.severity]
    if (sv !== 0) return sv
    return a.rate - b.rate
  })

  res.json({
    atRisk,
    summary: {
      total: atRisk.length,
      lowRate: lowRateCount,
      declining: decliningCount,
      frequentLate: frequentLateCount,
      consecutiveAbsent: consecutiveAbsentCount,
      monitoredStudents: (students as any[]).length,
      periodDays: 14,
    },
  })
}))

// ─── POST /api/attendance/scan ──────────────────────────────────────────────
function isLateScan(now: Date): boolean {
  const cutoff = new Date(now)
  cutoff.setHours(8, 30, 0, 0)
  return now.getTime() > cutoff.getTime()
}

r.post('/scan', ah(async (req, res) => {
  const body = req.body || {}
  const method = (body.method || '').trim().toLowerCase()
  const value = (body.value || '').trim()
  if (!value) return res.status(400).json({ error: 'value is required' })
  if (method !== 'barcode' && method !== 'fingerprint' && method !== 'manual') {
    return res.status(400).json({ error: 'method must be "barcode", "fingerprint" or "manual"' })
  }

  let personType: 'Student' | 'Teacher'
  let personId: string
  let personRef: string
  let personName: string
  let scanMethod: 'Barcode' | 'Fingerprint' | 'Manual'

  if (method === 'barcode') {
    scanMethod = 'Barcode'
    const student = await Student.findOne({ $or: [{ barcode: value }, { studentId: value }] })
      .select('studentId fullName')
      .lean()
    if (!student) return res.status(404).json({ error: `No student matches barcode "${value}"` })
    personType = 'Student'
    personId = (student as any)._id.toString()
    personRef = (student as any).studentId
    personName = (student as any).fullName
  } else if (method === 'fingerprint') {
    scanMethod = 'Fingerprint'
    const teacher = await Teacher.findOne({ fingerprintId: value }).select('teacherId fullName').lean()
    if (!teacher) return res.status(404).json({ error: `No teacher matches fingerprint "${value}"` })
    personType = 'Teacher'
    personId = (teacher as any)._id.toString()
    personRef = (teacher as any).teacherId
    personName = (teacher as any).fullName
  } else {
    scanMethod = 'Manual'
    const pt = (body.personType || '').trim()
    if (pt !== 'Student' && pt !== 'Teacher') {
      return res.status(400).json({ error: 'personType must be "Student" or "Teacher" for manual entry' })
    }
    if (pt === 'Student') {
      const student = await Student.findById(value).select('studentId fullName').lean()
      if (!student) return res.status(404).json({ error: 'Student not found' })
      personType = 'Student'
      personId = (student as any)._id.toString()
      personRef = (student as any).studentId
      personName = (student as any).fullName
    } else {
      const teacher = await Teacher.findById(value).select('teacherId fullName').lean()
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
      personType = 'Teacher'
      personId = (teacher as any)._id.toString()
      personRef = (teacher as any).teacherId
      personName = (teacher as any).fullName
    }
  }

  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  const existing = await Attendance.findOne({
    personId,
    personType,
    date: { $gte: start, $lte: end },
  }).sort({ createdAt: -1 })

  if (!existing) {
    const status = isLateScan(now) ? 'Late' : 'Present'
    const created = await Attendance.create({
      personType,
      personId,
      personRef,
      date: now,
      checkIn: now,
      checkOut: null,
      method: scanMethod,
      status,
      note: null,
    })
    const [serialized] = await serializeAttendance([created])
    return res.json({
      action: 'check-in',
      record: serialized,
      person: { name: personName, ref: personRef, type: personType },
    })
  }

  if (existing.checkIn && !existing.checkOut) {
    existing.checkOut = now
    await existing.save()
    const [serialized] = await serializeAttendance([existing])
    return res.json({
      action: 'check-out',
      record: serialized,
      person: { name: personName, ref: personRef, type: personType },
    })
  }

  const [serialized] = await serializeAttendance([existing])
  res.status(400).json({
    error: 'Already checked out',
    record: serialized,
    person: { name: personName, ref: personRef, type: personType },
  })
}))

export default r
