// ─── Analytics routes — dashboard, data-quality, reports (+digest) ─────────
import { Router } from 'express'
import {
  Student, Guardian, Teacher, Class, Enrollment, Program, Attendance,
  Payment, PayrollRecord, Expense, Announcement, Setting,
} from '../models'
import { ah, qs, round2, lkr, dayLabel, todayUtc, nextOccurrence } from '../helpers'

const r = Router()

const round2L = round2
const monthKeyOfL = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

async function enrollmentCountByClass(): Promise<Map<string, number>> {
  const rows = await Enrollment.find({ status: 'Active', classId: { $ne: null } }, 'classId').lean()
  const m = new Map<string, number>()
  for (const e of rows as any[]) m.set(e.classId, (m.get(e.classId) || 0) + 1)
  return m
}

// ─── GET /api/dashboard ─────────────────────────────────────────────────────
r.get('/dashboard', ah(async (_req, res) => {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const endOfToday = new Date(todayStart)
  endOfToday.setHours(23, 59, 59, 999)

  const [
    totalStudents, totalTeachers, internalTeachers, externalTeachers,
    totalPrograms, totalClasses,
    studentsPresentToday, teachersPresentToday, todayAttendanceRecords,
  ] = await Promise.all([
    Student.countDocuments({}),
    Teacher.countDocuments({}),
    Teacher.countDocuments({ type: 'Internal' }),
    Teacher.countDocuments({ type: 'External' }),
    Program.countDocuments({ active: true }),
    Class.countDocuments({ active: true }),
    Attendance.countDocuments({ personType: 'Student', status: 'Present', date: { $gte: todayStart, $lte: endOfToday } }),
    Attendance.countDocuments({ personType: 'Teacher', status: 'Present', date: { $gte: todayStart, $lte: endOfToday } }),
    Attendance.countDocuments({ date: { $gte: todayStart, $lte: endOfToday } }),
  ])

  const programs = await Program.find({}).lean()
  const enrRows = await Enrollment.find({}, 'programId').lean()
  const enrByProgram = new Map<string, number>()
  for (const e of enrRows as any[]) {
    if (!e.programId) continue
    enrByProgram.set(e.programId, (enrByProgram.get(e.programId) || 0) + 1)
  }
  const byProgram = (programs as any[])
    .map((p) => ({ code: p.code, name: p.name, color: p.color, count: enrByProgram.get(p._id.toString()) || 0 }))
    .sort((a, b) => b.count - a.count)

  const allStudents = await Student.find({}, 'ageGroup gender religion').lean()
  const byAgeGroup: Record<string, number> = {}
  const byGender = { Male: 0, Female: 0 }
  const religionCount: Record<string, number> = {}
  for (const s of allStudents as any[]) {
    const g = s.ageGroup || 'Unknown'
    byAgeGroup[g] = (byAgeGroup[g] || 0) + 1
    if (s.gender in byGender) (byGender as any)[s.gender] += 1
    const rl = s.religion || 'Other'
    religionCount[rl] = (religionCount[rl] || 0) + 1
  }

  const trend: { date: string; students: number; teachers: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart)
    d.setDate(d.getDate() - i)
    const dEnd = new Date(d)
    dEnd.setHours(23, 59, 59, 999)
    const [st, te] = await Promise.all([
      Attendance.countDocuments({ personType: 'Student', date: { $gte: d, $lte: dEnd } }),
      Attendance.countDocuments({ personType: 'Teacher', date: { $gte: d, $lte: dEnd } }),
    ])
    trend.push({
      date: d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' }),
      students: st,
      teachers: te,
    })
  }

  const recent = await Attendance.find({}).sort({ createdAt: -1 }).limit(8).lean()
  const personIds = [...new Set((recent as any[]).map((x) => x.personId))]
  const [studs, tchs] = await Promise.all([
    personIds.length ? Student.find({ _id: { $in: personIds } }, 'fullName').lean() : [],
    personIds.length ? Teacher.find({ _id: { $in: personIds } }, 'fullName').lean() : [],
  ])
  const nameMap = new Map<string, string>()
  for (const s of studs as any[]) nameMap.set(s._id.toString(), s.fullName)
  for (const t of tchs as any[]) nameMap.set(t._id.toString(), t.fullName)
  const recentWithNames = (recent as any[]).map((x) => ({
    ...x,
    id: x._id.toString(),
    personName: nameMap.get(x.personId) || x.personRef,
    date: new Date(x.date).toISOString(),
    checkIn: x.checkIn ? new Date(x.checkIn).toISOString() : null,
    checkOut: x.checkOut ? new Date(x.checkOut).toISOString() : null,
    createdAt: new Date(x.createdAt).toISOString(),
    updatedAt: new Date(x.updatedAt).toISOString(),
    note: x.note ?? null,
  }))

  const todayDow = new Date().toLocaleDateString('en-US', { weekday: 'short' })
  const upcomingClasses = await Class.find({ active: true, dayOfWeek: todayDow })
    .populate('programId', 'code name color')
    .populate('teacherId', 'teacherId fullName type')
    .sort({ startTime: 1 })
    .limit(5)
    .lean()
  const upcoming = (upcomingClasses as any[]).map((c) => ({
    id: c._id.toString(),
    name: c.name,
    dayOfWeek: c.dayOfWeek,
    startTime: c.startTime,
    endTime: c.endTime,
    room: c.room,
    capacity: c.capacity,
    fee: c.fee,
    instituteSharePct: c.instituteSharePct,
    active: c.active,
    notes: c.notes,
    program: c.programId
      ? { id: c.programId._id.toString(), code: c.programId.code, name: c.programId.name, color: c.programId.color }
      : null,
    teacher: c.teacherId
      ? { id: c.teacherId._id.toString(), teacherId: c.teacherId.teacherId, fullName: c.teacherId.fullName, type: c.teacherId.type }
      : null,
    _count: { enrollments: 0 },
  }))

  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthPayments = await Payment.find({ month: monthKey }, 'amount paidAmount status').lean()
  const totalBilled = (monthPayments as any[]).reduce((s, p) => s + p.amount, 0)
  const totalCollected = (monthPayments as any[]).reduce((s, p) => s + p.paidAmount, 0)
  const overdueCount = (monthPayments as any[]).filter((p) => p.status === 'Overdue').length
  const pendingCount = (monthPayments as any[]).filter((p) => p.status === 'Pending' || p.status === 'Partial').length

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  const [monthExpenses, activeTeachers] = await Promise.all([
    Expense.find({ date: { $gte: monthStart, $lte: monthEnd }, status: { $ne: 'Rejected' } }, 'amount').lean(),
    Teacher.find({ status: 'Active' }, 'type basicSalary allowances monthlyRate').lean(),
  ])
  const totalExpenses = (monthExpenses as any[]).reduce((s, e) => s + e.amount, 0)

  const [shareClasses, enrollCounts] = await Promise.all([
    Class.find({ active: true, teacherId: { $ne: null } }, 'fee instituteSharePct').lean(),
    enrollmentCountByClass(),
  ])
  const tuitionShare = round2L(
    (shareClasses as any[]).reduce((s, c) => {
      const enrolled = enrollCounts.get(c._id.toString()) || 0
      const gross = (c.fee || 0) * enrolled
      return s + (gross * Math.min(100, Math.max(0, c.instituteSharePct))) / 100
    }, 0),
  )

  const payrollNet = (activeTeachers as any[]).reduce((sum, t) => {
    const basic = Math.max(0, t.basicSalary || 0)
    const allowances = Math.max(0, t.allowances || 0)
    if (t.type === 'External' && basic <= 0 && allowances <= 0) {
      return sum + Math.max(0, t.monthlyRate || 0)
    }
    return sum + (basic + allowances - basic * 0.08)
  }, 0)

  const recentAnnouncements = await Announcement.find({ status: 'Published' })
    .sort({ pinned: -1, publishDate: -1 })
    .limit(4)
    .lean()
  const announcements = (recentAnnouncements as any[]).map((a) => ({
    id: a._id.toString(),
    title: a.title,
    body: a.body,
    category: a.category,
    audience: a.audience,
    priority: a.priority,
    pinned: a.pinned,
    publishDate: new Date(a.publishDate).toISOString(),
  }))

  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)
  fourteenDaysAgo.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  const atRiskRecords = await Attendance.find(
    { personType: 'Student', date: { $gte: fourteenDaysAgo, $lte: todayEnd } },
    'personId date status',
  )
    .sort({ date: 1 })
    .lean()
  const byStudentAtRisk: Record<string, any[]> = {}
  for (const x of atRiskRecords as any[]) {
    if (!byStudentAtRisk[x.personId]) byStudentAtRisk[x.personId] = []
    byStudentAtRisk[x.personId].push(x)
  }
  let atRiskCount = 0
  let decliningCount = 0
  let frequentLateCount = 0
  for (const id of Object.keys(byStudentAtRisk)) {
    const recs = byStudentAtRisk[id]
    const total = recs.length
    if (total < 3) continue
    const present = recs.filter((x) => x.status === 'Present' || x.status === 'Late').length
    const rate = total > 0 ? Math.round((present / total) * 100) : 100
    const lateCount = recs.filter((x) => x.status === 'Late').length
    const recentRecs = recs.filter((x) => new Date(x.date) >= sevenDaysAgo)
    const previousRecs = recs.filter((x) => new Date(x.date) < sevenDaysAgo)
    const recentRate = recentRecs.length > 0
      ? Math.round(recentRecs.filter((x) => x.status === 'Present' || x.status === 'Late').length / recentRecs.length * 100)
      : null
    const previousRate = previousRecs.length > 0
      ? Math.round(previousRecs.filter((x) => x.status === 'Present' || x.status === 'Late').length / previousRecs.length * 100)
      : null
    const isDeclining = recentRate !== null && previousRate !== null && previousRate - recentRate > 15
    const isFrequentLate = lateCount >= 3
    const isLowRate = rate < 60
    if (isLowRate || isDeclining || isFrequentLate) atRiskCount++
    if (isDeclining) decliningCount++
    if (isFrequentLate) frequentLateCount++
  }

  res.json({
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
    upcomingClasses: upcoming,
    fees: {
      month: monthKey,
      totalBilled,
      totalCollected,
      outstanding: totalBilled - totalCollected,
      paidRate: totalBilled ? Math.round((totalCollected / totalBilled) * 100) : 0,
      overdueCount,
      pendingCount,
      expenses: round2L(totalExpenses),
      payroll: round2L(payrollNet),
      tuitionShare,
      net: round2L(totalCollected + tuitionShare - totalExpenses - payrollNet),
    },
    announcements,
    atRisk: {
      count: atRiskCount,
      declining: decliningCount,
      frequentLate: frequentLateCount,
      monitoredStudents: totalStudents,
      periodDays: 14,
    },
  })
}))

// ─── GET /api/data-quality ──────────────────────────────────────────────────
r.get('/data-quality', ah(async (_req, res) => {
  const isBlank = (v: string | null | undefined): boolean => !v || !v.trim()
  const phoneLooksReal = (raw: string | null | undefined): boolean => {
    if (isBlank(raw)) return false
    return raw!.replace(/\D/g, '').length >= 9
  }

  const [students, teachers, classes, enrollCounts] = await Promise.all([
    Student.find({ status: 'Active' })
      .select('studentId fullName photoUrl dob')
      .sort({ fullName: 1 })
      .lean(),
    Teacher.find({})
      .select('teacherId fullName type status phone email nic epfNo qualification')
      .sort({ fullName: 1 })
      .lean(),
    Class.find({})
      .populate('teacherId', 'fullName')
      .populate('programId', 'name')
      .sort({ name: 1 })
      .lean(),
    enrollmentCountByClass(),
  ])

  const guardianRows = await Guardian.find(
    { studentId: { $in: (students as any[]).map((s) => s._id.toString()) } },
    'studentId name phone isPrimary',
  ).lean()
  const gByStudent = new Map<string, any[]>()
  for (const g of guardianRows as any[]) {
    if (!gByStudent.has(g.studentId)) gByStudent.set(g.studentId, [])
    gByStudent.get(g.studentId)!.push(g)
  }

  const noGuardianPhone = (students as any[])
    .filter((s) => {
      const gs = gByStudent.get(s._id.toString()) || []
      return !gs.some((g) => phoneLooksReal(g.phone))
    })
    .map((s) => {
      const gs = gByStudent.get(s._id.toString()) || []
      return {
        ref: s.studentId,
        name: s.fullName,
        detail: gs.length === 0 ? 'No guardian on file' : 'Guardian phone missing/invalid',
      }
    })
  const noGuardian = (students as any[])
    .filter((s) => (gByStudent.get(s._id.toString()) || []).length === 0)
    .map((s) => ({ ref: s.studentId, name: s.fullName, detail: 'Add at least one guardian' }))
  const noDob = (students as any[])
    .filter((s) => !s.dob)
    .map((s) => ({ ref: s.studentId, name: s.fullName, detail: 'Date of birth missing' }))

  const working = (teachers as any[]).filter((t) => t.status !== 'Inactive')
  const tNoPhone = working
    .filter((t) => !phoneLooksReal(t.phone))
    .map((t) => ({ ref: t.teacherId, name: t.fullName, detail: 'Phone number missing/invalid' }))
  const tNoEpf = working
    .filter((t) => t.type === 'Internal' && isBlank(t.epfNo))
    .map((t) => ({ ref: t.teacherId, name: t.fullName, detail: 'EPF number missing (required for payroll)' }))
  const tNoNic = working
    .filter((t) => isBlank(t.nic))
    .map((t) => ({ ref: t.teacherId, name: t.fullName, detail: 'NIC number missing' }))
  const tNoQual = working
    .filter((t) => isBlank(t.qualification))
    .map((t) => ({ ref: t.teacherId, name: t.fullName, detail: 'Qualification not recorded' }))

  const cNoTeacher = (classes as any[])
    .filter((c) => c.active && !c.teacherId)
    .map((c) => ({
      ref: c.programId?.name || '—',
      name: c.name,
      detail: 'No teacher assigned',
    }))
  const cNoSchedule = (classes as any[])
    .filter((c) => c.active && (!c.dayOfWeek || !c.startTime))
    .map((c) => ({
      ref: c.programId?.name || '—',
      name: c.name,
      detail: !c.dayOfWeek ? 'Day of week not set' : 'Start time not set',
    }))
  const cOverCapacity = (classes as any[])
    .filter((c) => (enrollCounts.get(c._id.toString()) || 0) > c.capacity)
    .map((c) => ({
      ref: c.programId?.name || '—',
      name: c.name,
      detail: `${enrollCounts.get(c._id.toString())} enrolled · capacity ${c.capacity}`,
    }))

  const groups = [
    { key: 'student_phone', label: 'Students without a reachable guardian phone', scope: 'students' as const, severity: 'high' as const, hint: 'WhatsApp reminders and fee notices cannot reach these families.', count: noGuardianPhone.length, items: noGuardianPhone },
    { key: 'student_guardian', label: 'Students with no guardian record', scope: 'students' as const, severity: 'high' as const, hint: 'Every child should have at least one emergency contact.', count: noGuardian.length, items: noGuardian },
    { key: 'student_dob', label: 'Students missing date of birth', scope: 'students' as const, severity: 'low' as const, hint: 'Needed for age-group reporting and certificates.', count: noDob.length, items: noDob },
    { key: 'teacher_phone', label: 'Teachers without a phone number', scope: 'teachers' as const, severity: 'medium' as const, hint: 'Staff cannot be contacted for substitution or emergencies.', count: tNoPhone.length, items: tNoPhone },
    { key: 'teacher_epf', label: 'Internal staff missing EPF number', scope: 'teachers' as const, severity: 'high' as const, hint: 'EPF/ETF contributions cannot be filed without the number.', count: tNoEpf.length, items: tNoEpf },
    { key: 'teacher_nic', label: 'Teachers missing NIC number', scope: 'teachers' as const, severity: 'medium' as const, hint: 'Required for statutory records.', count: tNoNic.length, items: tNoNic },
    { key: 'teacher_qual', label: 'Teachers without recorded qualification', scope: 'teachers' as const, severity: 'low' as const, hint: 'Useful for profiles and parent communication.', count: tNoQual.length, items: tNoQual },
    { key: 'class_teacher', label: 'Active classes without a teacher', scope: 'classes' as const, severity: 'high' as const, hint: 'Sessions cannot run and registers have no owner.', count: cNoTeacher.length, items: cNoTeacher },
    { key: 'class_schedule', label: 'Active classes missing schedule details', scope: 'classes' as const, severity: 'medium' as const, hint: 'Timetable and register printouts need day + time.', count: cNoSchedule.length, items: cNoSchedule },
    { key: 'class_capacity', label: 'Classes over capacity', scope: 'classes' as const, severity: 'medium' as const, hint: 'More active enrollments than the class capacity allows.', count: cOverCapacity.length, items: cOverCapacity },
  ]

  const totalIssues = groups.reduce((s, g) => s + g.count, 0)
  const highIssues = groups.filter((g) => g.severity === 'high').reduce((s, g) => s + g.count, 0)

  res.json({
    checkedAt: new Date().toISOString(),
    counts: {
      students: (students as any[]).length,
      teachers: working.length,
      classes: (classes as any[]).filter((c) => c.active).length,
      totalIssues,
      highIssues,
    },
    groups,
  })
}))

// ─── GET /api/reports?type=attendance|enrollment|heatmap|financial ──────────
r.get('/reports', ah(async (req, res) => {
  const p = qs(req)
  const type = p.get('type') || 'attendance'
  if (type === 'enrollment') return enrollmentReport(res)
  if (type === 'heatmap') return heatmapReport(p, res)
  if (type === 'financial') return financialReport(p, res)
  return attendanceReport(p, res)
}))

async function financialReport(searchParams: URLSearchParams, res: any) {
  const monthStr = searchParams.get('month')
  const now = new Date()
  const year = monthStr ? parseInt(monthStr.split('-')[0], 10) : now.getFullYear()
  const month = monthStr ? parseInt(monthStr.split('-')[1], 10) - 1 : now.getMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`

  const firstDay = new Date(Date.UTC(year, month, 1))
  const nextMonthFirst = new Date(Date.UTC(year, month + 1, 1))

  const expenses = await Expense.find(
    { date: { $gte: firstDay, $lt: nextMonthFirst }, status: { $ne: 'Rejected' } },
    'amount category method',
  ).lean()
  const expenseTotal = round2L((expenses as any[]).reduce((s, e) => s + e.amount, 0))
  const catMap: Record<string, { total: number; count: number }> = {}
  const methodMap: Record<string, number> = { Cash: 0, Bank: 0, Card: 0 }
  for (const e of expenses as any[]) {
    if (!catMap[e.category]) catMap[e.category] = { total: 0, count: 0 }
    catMap[e.category].total += e.amount
    catMap[e.category].count++
    if (e.method in methodMap) (methodMap as any)[e.method] += e.amount
  }
  const byCategory = Object.entries(catMap)
    .map(([category, v]) => ({ category, total: round2L(v.total), count: v.count }))
    .sort((a, b) => b.total - a.total)

  const payments = await Payment.find({ month: monthKey }, 'amount paidAmount').lean()
  const billed = round2L((payments as any[]).reduce((s, p) => s + p.amount, 0))
  const collected = round2L((payments as any[]).reduce((s, p) => s + p.paidAmount, 0))

  // Revenue by programme from embedded bill line items (legacy fallback)
  const revPayments = await Payment.find({ month: monthKey })
    .select('studentId amount programId items')
    .lean()
  const progIds = new Set<string>()
  for (const p of revPayments as any[]) {
    if (p.programId) progIds.add(p.programId)
    for (const it of p.items || []) if (it.programId) progIds.add(it.programId)
  }
  const progs = progIds.size ? await Program.find({ _id: { $in: [...progIds] } }, 'code name color').lean() : []
  const pMap = new Map((progs as any[]).map((p) => [p._id.toString(), p]))

  const revMap: Record<string, { code: string; name: string; color: string; billed: number; billIds: Set<string>; studentIds: Set<string> }> = {}
  const addRev = (key: string, name: string, color: string, amount: number, paymentId: string, studentId: string) => {
    if (!revMap[key]) {
      revMap[key] = { code: key, name, color, billed: 0, billIds: new Set(), studentIds: new Set() }
    }
    revMap[key].billed += amount
    revMap[key].billIds.add(paymentId)
    revMap[key].studentIds.add(studentId)
  }
  for (const p of revPayments as any[]) {
    const pid = p._id.toString()
    if ((p.items || []).length > 0) {
      for (const it of p.items) {
        const prog = it.programId ? pMap.get(it.programId) : null
        addRev(
          prog?.code || 'OTHER',
          prog?.name || 'Other charges',
          prog?.color || '#94a3b8',
          it.amount,
          pid,
          p.studentId,
        )
      }
    } else {
      const prog = p.programId ? pMap.get(p.programId) : null
      addRev(
        prog?.code || 'OTHER',
        prog?.name || 'Other charges',
        prog?.color || '#94a3b8',
        p.amount,
        pid,
        p.studentId,
      )
    }
  }
  const programRevenue = Object.values(revMap)
    .map((x) => ({
      code: x.code,
      name: x.name,
      color: x.color,
      billed: round2L(x.billed),
      bills: x.billIds.size,
      students: x.studentIds.size,
      sharePct: billed > 0 ? round2L((x.billed / billed) * 100) : 0,
    }))
    .sort((a, b) => b.billed - a.billed)

  const activeTeachers = await Teacher.find({ status: 'Active' }, 'basicSalary allowances').lean()
  const monthRecords = await PayrollRecord.find({ month: monthKey }).lean()
  const recMap = new Map((monthRecords as any[]).map((x) => [x.teacherId, x]))
  let payrollCost = 0
  let payrollNet = 0
  let paidCount = 0
  let pendingCount = 0
  for (const t of activeTeachers as any[]) {
    const rec = recMap.get(t._id.toString())
    const basic = rec ? rec.basicSalary : t.basicSalary
    const allow = rec ? rec.allowances : t.allowances
    const gross = (basic || 0) + (allow || 0)
    const net = gross - (basic || 0) * 0.08
    const employer = gross + (basic || 0) * 0.12 + (basic || 0) * 0.03
    payrollCost += employer
    payrollNet += net
    if (rec?.status === 'Paid') paidCount++
    else pendingCount++
  }
  payrollCost = round2L(payrollCost)
  payrollNet = round2L(payrollNet)

  const classes = await Class.find({ active: true, teacherId: { $ne: null } })
    .populate('teacherId', 'teacherId fullName type')
    .populate('programId', 'code name color')
    .lean()
  const enrollCounts = await enrollmentCountByClass()

  const shareClasses: Array<{
    classId: string; className: string; program: string | null; programColor: string | null
    teacherId: string; teacherName: string; teacherType: string
    enrolled: number; fee: number; sharePct: number
    gross: number; instituteAmount: number; teacherAmount: number
  }> = []
  for (const c of classes as any[]) {
    if (!c.teacherId) continue
    const enrolled = enrollCounts.get(c._id.toString()) || 0
    const gross = round2L((c.fee || 0) * enrolled)
    if (gross <= 0) continue
    const pct = Math.min(100, Math.max(0, c.instituteSharePct))
    const instituteAmount = round2L((gross * pct) / 100)
    shareClasses.push({
      classId: c._id.toString(),
      className: c.name,
      program: c.programId?.name ?? null,
      programColor: c.programId?.color ?? null,
      teacherId: c.teacherId._id.toString(),
      teacherName: c.teacherId.fullName,
      teacherType: c.teacherId.type,
      enrolled,
      fee: c.fee,
      sharePct: pct,
      gross,
      instituteAmount,
      teacherAmount: round2L(gross - instituteAmount),
    })
  }
  shareClasses.sort((a, b) => b.gross - a.gross)

  const teachMap: Record<string, {
    teacherId: string; teacherRef: string; teacherName: string; teacherType: string
    classCount: number; enrolled: number; gross: number; instituteAmount: number; teacherAmount: number
  }> = {}
  for (const c of shareClasses) {
    if (!teachMap[c.teacherId]) {
      teachMap[c.teacherId] = {
        teacherId: c.teacherId, teacherRef: '', teacherName: c.teacherName, teacherType: c.teacherType,
        classCount: 0, enrolled: 0, gross: 0, instituteAmount: 0, teacherAmount: 0,
      }
    }
    const t = teachMap[c.teacherId]
    t.classCount++
    t.enrolled += c.enrolled
    t.gross = round2L(t.gross + c.gross)
    t.instituteAmount = round2L(t.instituteAmount + c.instituteAmount)
    t.teacherAmount = round2L(t.teacherAmount + c.teacherAmount)
  }
  const byTeacher = Object.values(teachMap).sort((a, b) => b.gross - a.gross)
  const shareTotals = {
    gross: round2L(shareClasses.reduce((s, c) => s + c.gross, 0)),
    institute: round2L(shareClasses.reduce((s, c) => s + c.instituteAmount, 0)),
    teacher: round2L(shareClasses.reduce((s, c) => s + c.teacherAmount, 0)),
  }

  const liveEmployerCost = (activeTeachers as any[]).reduce((s, t) => {
    const gross = (t.basicSalary || 0) + (t.allowances || 0)
    return s + gross + (t.basicSalary || 0) * 0.15
  }, 0)
  const trendMonths: { month: string; label: string; collected: number; expenses: number; payroll: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1))
    const key = monthKeyOfL(d)
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    const [pSumRows, eSumRows, recs] = await Promise.all([
      Payment.find({ month: key }, 'paidAmount').lean(),
      Expense.find({ date: { $gte: start, $lt: end }, status: { $ne: 'Rejected' } }, 'amount').lean(),
      PayrollRecord.find({ month: key }, 'employerCost').lean(),
    ])
    trendMonths.push({
      month: key,
      label: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      collected: round2L((pSumRows as any[]).reduce((s, x) => s + x.paidAmount, 0)),
      expenses: round2L((eSumRows as any[]).reduce((s, x) => s + x.amount, 0)),
      payroll:
        (recs as any[]).length > 0
          ? round2L((recs as any[]).reduce((s, x) => s + x.employerCost, 0))
          : round2L(liveEmployerCost),
    })
  }

  res.json({
    month: monthKey,
    monthLabel: new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-GB', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    }),
    fees: {
      billed,
      collected,
      outstanding: round2L(billed - collected),
      billCount: (payments as any[]).length,
    },
    programRevenue: { total: billed, programs: programRevenue },
    expenses: {
      total: expenseTotal,
      count: (expenses as any[]).length,
      byCategory,
      byMethod: methodMap,
    },
    payroll: {
      teacherCount: (activeTeachers as any[]).length,
      paidCount,
      pendingCount,
      totalNet: payrollNet,
      totalEmployerCost: payrollCost,
    },
    revenueShare: { classes: shareClasses, byTeacher, totals: shareTotals },
    summary: {
      collected,
      instituteShare: shareTotals.institute,
      expenses: expenseTotal,
      payrollCost,
      net: round2L(collected + shareTotals.institute - expenseTotal - payrollCost),
    },
    trend: trendMonths,
  })
}

async function heatmapReport(searchParams: URLSearchParams, res: any) {
  const monthStr = searchParams.get('month')
  const now = new Date()
  const year = monthStr ? parseInt(monthStr.split('-')[0], 10) : now.getFullYear()
  const month = monthStr ? parseInt(monthStr.split('-')[1], 10) - 1 : now.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999)
  const daysInMonth = lastDay.getDate()

  const records = await Attendance.find(
    { date: { $gte: firstDay, $lte: lastDay } },
    'date personType status',
  ).lean()
  const totalStudents = await Student.countDocuments({ status: 'Active' })

  const dayMap: Record<number, { present: number; late: number; absent: number; students: number; teachers: number }> = {}
  for (let d = 1; d <= daysInMonth; d++) {
    dayMap[d] = { present: 0, late: 0, absent: 0, students: 0, teachers: 0 }
  }
  for (const x of records as any[]) {
    const day = new Date(x.date).getDate()
    if (!dayMap[day]) continue
    if (x.status === 'Present') dayMap[day].present++
    if (x.status === 'Late') dayMap[day].late++
    if (x.status === 'Absent') dayMap[day].absent++
    if (x.personType === 'Student') dayMap[day].students++
    else dayMap[day].teachers++
  }

  const firstDow = (firstDay.getDay() + 6) % 7
  const cells: Array<{
    day: number | null; present: number; late: number; absent: number
    students: number; teachers: number; rate: number | null; isFuture: boolean; isToday: boolean
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
      : dayData.students > 0 ? 0 : null
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
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, present: 0, late: 0, absent: 0, students: 0, teachers: 0, rate: null, isFuture: false, isToday: false })
  }

  const monthPresent = (records as any[]).filter((x) => x.status === 'Present').length
  const monthLate = (records as any[]).filter((x) => x.status === 'Late').length
  const monthAbsent = (records as any[]).filter((x) => x.status === 'Absent').length
  const activeDays = Object.values(dayMap).filter((d) => d.students > 0).length
  const avgRate = activeDays > 0 ? Math.round((monthPresent / (activeDays * totalStudents)) * 100) : 0

  res.json({
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

async function attendanceReport(searchParams: URLSearchParams, res: any) {
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')
  const today = new Date()
  const to = toStr ? new Date(toStr + 'T23:59:59') : new Date(today.setHours(23, 59, 59, 999))
  const from = fromStr ? new Date(fromStr + 'T00:00:00') : new Date(to.getTime() - 13 * 86400000)
  from.setHours(0, 0, 0, 0)

  const records = await Attendance.find({ date: { $gte: from, $lte: to } }).lean()

  // Resolve people + student enrollments for program grouping
  const sIds = [...new Set((records as any[]).filter((x) => x.personType === 'Student').map((x) => x.personId))]
  const tIds = [...new Set((records as any[]).filter((x) => x.personType === 'Teacher').map((x) => x.personId))]
  const [studs, tchs, enrollments, programs] = await Promise.all([
    sIds.length ? Student.find({ _id: { $in: sIds } }, 'studentId fullName').lean() : [],
    tIds.length ? Teacher.find({ _id: { $in: tIds } }, 'teacherId fullName type specialization').lean() : [],
    sIds.length ? Enrollment.find({ studentId: { $in: sIds } }).lean() : [],
    Program.find({}, 'code name color').lean(),
  ])
  const sMap = new Map((studs as any[]).map((s) => [s._id.toString(), s]))
  const tMap = new Map((tchs as any[]).map((t) => [t._id.toString(), t]))
  const progMap = new Map((programs as any[]).map((p) => [p._id.toString(), p]))
  const enrByStudent = new Map<string, any[]>()
  for (const e of enrollments as any[]) {
    if (!enrByStudent.has(e.studentId)) enrByStudent.set(e.studentId, [])
    enrByStudent.get(e.studentId)!.push(e)
  }

  // daily series
  const dayMap: Record<string, { date: string; students: number; teachers: number; late: number; present: number }> = {}
  for (let t = new Date(from); t <= to; t.setDate(t.getDate() + 1)) {
    const key = t.toISOString().slice(0, 10)
    dayMap[key] = { date: key, students: 0, teachers: 0, late: 0, present: 0 }
  }
  for (const x of records as any[]) {
    const key = new Date(x.date).toISOString().slice(0, 10)
    if (!dayMap[key]) dayMap[key] = { date: key, students: 0, teachers: 0, late: 0, present: 0 }
    if (x.personType === 'Student') dayMap[key].students++
    else dayMap[key].teachers++
    if (x.status === 'Present') dayMap[key].present++
    if (x.status === 'Late') dayMap[key].late++
  }
  const daily = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))

  const methodCount: Record<string, number> = { Barcode: 0, Fingerprint: 0, Manual: 0 }
  const statusCount: Record<string, number> = { Present: 0, Late: 0, Absent: 0, Leave: 0 }
  for (const x of records as any[]) {
    methodCount[x.method] = (methodCount[x.method] || 0) + 1
    statusCount[x.status] = (statusCount[x.status] || 0) + 1
  }

  const programCount: Record<string, { code: string; name: string; color: string; count: number }> = {}
  for (const x of records as any[]) {
    if (x.personType !== 'Student') continue
    const student = sMap.get(x.personId)
    if (!student) continue
    for (const e of enrByStudent.get(x.personId) || []) {
      if (!e.programId) continue
      const prog = progMap.get(e.programId)
      if (!prog) continue
      if (!programCount[prog.code]) {
        programCount[prog.code] = { code: prog.code, name: prog.name, color: prog.color, count: 0 }
      }
      programCount[prog.code].count++
    }
  }

  const personCount: Record<string, { name: string; ref: string; type: string; count: number }> = {}
  for (const x of records as any[]) {
    if (x.status !== 'Present') continue
    const key = x.personId
    const name = x.personType === 'Student' ? sMap.get(x.personId)?.fullName : tMap.get(x.personId)?.fullName
    if (!name) continue
    if (!personCount[key]) personCount[key] = { name, ref: x.personRef, type: x.personType, count: 0 }
    personCount[key].count++
  }
  const topAttendees = Object.values(personCount).sort((a, b) => b.count - a.count).slice(0, 8)

  const teacherTypeCount = { Internal: 0, External: 0 }
  for (const x of records as any[]) {
    if (x.personType !== 'Teacher') continue
    const t = tMap.get(x.personId)
    if (t && t.type in teacherTypeCount) (teacherTypeCount as any)[t.type]++
  }

  const workingTeachers = await Teacher.find({ status: { $ne: 'Inactive' } })
    .select('teacherId fullName type specialization')
    .sort({ fullName: 1 })
    .lean()
  const teacherAgg = new Map<string, { present: number; late: number; absent: number; leave: number; total: number }>()
  for (const t of workingTeachers as any[]) {
    teacherAgg.set(t._id.toString(), { present: 0, late: 0, absent: 0, leave: 0, total: 0 })
  }
  for (const x of records as any[]) {
    if (x.personType !== 'Teacher') continue
    const agg = teacherAgg.get(x.personId)
    if (!agg) continue
    agg.total++
    if (x.status === 'Present') agg.present++
    else if (x.status === 'Late') agg.late++
    else if (x.status === 'Absent') agg.absent++
    else if (x.status === 'Leave') agg.leave++
  }
  const teacherStats = (workingTeachers as any[])
    .map((t) => {
      const a = teacherAgg.get(t._id.toString())!
      const rate = a.total > 0 ? Math.round((a.present / a.total) * 100) : null
      return {
        id: t._id.toString(),
        ref: t.teacherId,
        name: t.fullName,
        type: t.type,
        specialization: t.specialization ?? null,
        present: a.present,
        late: a.late,
        absent: a.absent,
        leave: a.leave,
        total: a.total,
        rate,
      }
    })
    .sort((a, b) => {
      if (a.rate === null && b.rate === null) return a.name.localeCompare(b.name)
      if (a.rate === null) return 1
      if (b.rate === null) return -1
      return b.rate - a.rate || b.total - a.total
    })

  res.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      records: (records as any[]).length,
      studentRecords: (records as any[]).filter((x) => x.personType === 'Student').length,
      teacherRecords: (records as any[]).filter((x) => x.personType === 'Teacher').length,
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
    teacherStats,
  })
}

async function enrollmentReport(res: any) {
  const students = await Student.find({}, 'studentId fullName gender ageGroup religion nationality status admissionDate').lean()
  const programs = await Program.find({}).lean()
  const enrRows = await Enrollment.find({}, 'programId studentId').lean()

  const enrByProgram = new Map<string, number>()
  for (const e of enrRows as any[]) {
    if (!e.programId) continue
    enrByProgram.set(e.programId, (enrByProgram.get(e.programId) || 0) + 1)
  }
  const clsByProgram = new Map<string, number>()
  for (const p of programs as any[]) {
    const n = await Class.countDocuments({ programId: p._id.toString() })
    clsByProgram.set(p._id.toString(), n)
  }

  const byProgram = (programs as any[]).map((p) => ({
    code: p.code,
    name: p.name,
    color: p.color,
    count: enrByProgram.get(p._id.toString()) || 0,
    classes: clsByProgram.get(p._id.toString()) || 0,
  }))
  const byAgeGroup: Record<string, number> = {}
  const byGender = { Male: 0, Female: 0 }
  const byReligion: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  const byNationality: Record<string, number> = {}
  for (const s of students as any[]) {
    const ag = s.ageGroup || 'Unknown'; byAgeGroup[ag] = (byAgeGroup[ag] || 0) + 1
    if (s.gender in byGender) (byGender as any)[s.gender]++
    const rl = s.religion || 'Other'; byReligion[rl] = (byReligion[rl] || 0) + 1
    const st = s.status || 'Active'; byStatus[st] = (byStatus[st] || 0) + 1
    const n = s.nationality || 'Unknown'; byNationality[n] = (byNationality[n] || 0) + 1
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const enrByStudentMap = new Map<string, any[]>()
  for (const e of enrRows as any[]) {
    if (!enrByStudentMap.has(e.studentId)) enrByStudentMap.set(e.studentId, [])
    enrByStudentMap.get(e.studentId)!.push(e)
  }
  const recentAdmissions = (students as any[])
    .filter((s) => s.admissionDate && new Date(s.admissionDate) >= cutoff)
    .sort((a, b) => new Date(b.admissionDate).getTime() - new Date(a.admissionDate).getTime())
    .slice(0, 10)
    .map((s) => ({
      studentId: s.studentId,
      fullName: s.fullName,
      gender: s.gender,
      admissionDate: s.admissionDate ? new Date(s.admissionDate).toISOString() : null,
      programs: (enrByStudentMap.get(s._id.toString()) || []).map((e) => {
        const prog = progMapGet(e.programId)
        return prog?.code ?? ''
      }),
    }))
  function progMapGet(pid: string) {
    return (programs as any[]).find((p) => p._id.toString() === pid)
  }

  res.json({
    totals: {
      students: (students as any[]).length,
      active: byStatus.Active || 0,
      inactive: byStatus.Inactive || 0,
      graduated: byStatus.Graduated || 0,
      recentAdmissions: (students as any[]).filter((s) => s.admissionDate && new Date(s.admissionDate) >= cutoff).length,
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

// ─── GET /api/reports/digest?days=7 ─────────────────────────────────────────
r.get('/reports/digest', ah(async (req, res) => {
  const days = Math.min(31, Math.max(1, parseInt(qs(req).get('days') || '7', 10) || 7))
  const now = new Date()

  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  const prevEnd = new Date(start)
  prevEnd.setDate(prevEnd.getDate() - 1)
  prevEnd.setHours(23, 59, 59, 999)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - (days - 1))
  prevStart.setHours(0, 0, 0, 0)

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const settingRow = await Setting.findOne({ key: 'school_name' }).lean()
  const name = ((settingRow as any)?.value || '').trim() || 'SANOMIN International Preschool'

  const [att, prevAtt, windowAtt, monthPayments, monthExpenses, monthPayroll, announcements, students] =
    await Promise.all([
      Attendance.find({ personType: 'Student', date: { $gte: start, $lte: end } }, 'status').lean(),
      Attendance.find({ personType: 'Student', date: { $gte: prevStart, $lte: prevEnd } }, 'status').lean(),
      Attendance.find(
        { personType: 'Student', date: { $gte: prevStart, $lte: end } },
        'personId personRef status',
      ).lean(),
      Payment.find({ month: monthKey }, 'amount paidAmount status').lean(),
      Expense.find(
        { date: { $gte: monthStart, $lt: monthEnd }, status: { $ne: 'Rejected' } },
        'amount category status',
      ).lean(),
      PayrollRecord.find({ month: monthKey, status: 'Paid' }, 'netSalary').lean(),
      Announcement.countDocuments({ publishDate: { $gte: start, $lte: end }, status: 'Published' }),
      Student.find({ status: 'Active', dob: { $ne: null } }, 'studentId fullName dob').lean(),
    ])

  const rateOf = (rows: any[]) => {
    const marked = rows.length
    const positive = rows.filter((x) => x.status === 'Present' || x.status === 'Late').length
    return marked > 0 ? Math.round((positive / marked) * 100) : null
  }
  const statusCount = (rows: any[], s: string) => rows.filter((x) => x.status === s).length

  const rate = rateOf(att as any[])
  const prevRate = rateOf(prevAtt as any[])
  const delta = rate !== null && prevRate !== null ? rate - prevRate : null

  const perStudent = new Map<string, { ref: string; present: number; marked: number }>()
  for (const x of windowAtt as any[]) {
    const cur = perStudent.get(x.personId) ?? { ref: x.personRef, present: 0, marked: 0 }
    cur.marked += 1
    if (x.status === 'Present' || x.status === 'Late') cur.present += 1
    perStudent.set(x.personId, cur)
  }
  const atRiskAll = [...perStudent.entries()]
    .filter(([, v]) => v.marked >= 3 && v.present / v.marked < 0.75)
    .map(([personId, v]) => ({ id: personId, ref: v.ref, rate: Math.round((v.present / v.marked) * 100) }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 5)
  const riskNames = new Map(
    ((await Student.find({ _id: { $in: atRiskAll.map((a) => a.id) } }, 'fullName').lean()) as any[]).map(
      (s) => [s._id.toString(), s.fullName],
    ),
  )
  const atRisk = atRiskAll.map((a) => ({ ref: a.ref, name: riskNames.get(a.id) ?? 'Unknown', rate: a.rate }))

  const collected = (monthPayments as any[]).reduce((n, p) => n + p.paidAmount, 0)
  const billed = (monthPayments as any[]).reduce((n, p) => n + p.amount, 0)
  const outstandingBills = (monthPayments as any[]).filter((p) => p.amount - p.paidAmount > 0.01)
  const outstanding = outstandingBills.reduce((n, p) => n + (p.amount - p.paidAmount), 0)
  const overdue = (monthPayments as any[]).filter((p) => p.status === 'Overdue').length

  const expenseTotal = (monthExpenses as any[]).reduce((n, e) => n + e.amount, 0)
  const byCategory = new Map<string, number>()
  for (const e of monthExpenses as any[]) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount)
  }
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  const pendingExpenses = (monthExpenses as any[]).filter((e) => e.status === 'Pending')
  const pendingExpenseTotal = pendingExpenses.reduce((n, e) => n + e.amount, 0)

  const paidSalaries = (monthPayroll as any[]).reduce((n, p) => n + p.netSalary, 0)
  const paidTeachers = (monthPayroll as any[]).length

  const today = todayUtc()
  const horizon = new Date(today.getTime() + days * 86_400_000)
  const celebrations: { name: string; kind: 'birthday' | 'anniversary'; when: string; daysUntil: number }[] = []
  for (const s of students as any[]) {
    if (!s.dob) continue
    const next = nextOccurrence(new Date(s.dob).getUTCMonth() + 1, new Date(s.dob).getUTCDate(), today)
    if (next.getTime() > horizon.getTime()) continue
    celebrations.push({
      name: s.fullName,
      kind: 'birthday',
      when: next.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      daysUntil: Math.round((next.getTime() - today.getTime()) / 86_400_000),
    })
  }
  celebrations.sort((a, b) => a.daysUntil - b.daysUntil)

  const periodLabel = `${dayLabel(start)} – ${dayLabel(end)} ${end.getFullYear()}`
  const monthLabel = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  const data = {
    days,
    period: { start: start.toISOString(), end: end.toISOString(), label: periodLabel },
    schoolName: name,
    attendance: {
      records: (att as any[]).length,
      present: statusCount(att as any[], 'Present'),
      late: statusCount(att as any[], 'Late'),
      absent: statusCount(att as any[], 'Absent'),
      leave: statusCount(att as any[], 'Leave'),
      rate,
      prevRate,
      delta,
      atRiskTotal: atRiskAll.length,
      atRisk,
    },
    fees: {
      month: monthKey,
      monthLabel,
      billed,
      collected,
      outstanding,
      outstandingBills: outstandingBills.length,
      overdue,
    },
    expenses: {
      total: expenseTotal,
      count: (monthExpenses as any[]).length,
      topCategory: topCategory ? { name: topCategory[0], total: topCategory[1] } : null,
      pendingCount: pendingExpenses.length,
      pendingTotal: pendingExpenseTotal,
    },
    payroll: { paidCount: paidTeachers, paidTotal: paidSalaries },
    people: { celebrationsCount: celebrations.length, celebrations: celebrations.slice(0, 5) },
    announcementsPosted: announcements,
    generatedAt: new Date().toISOString(),
  }

  const attLine =
    rate !== null
      ? `${rate}% average attendance (${(att as any[]).length} record${(att as any[]).length === 1 ? '' : 's'}` +
        (delta !== null ? `, ${delta >= 0 ? '+' : '−'}${Math.abs(delta)}% vs previous ${days} days` : '') +
        ')'
      : `No attendance records in the last ${days} days`
  const lines: string[] = [
    `📋 ${name} — ${days}-Day Digest`,
    periodLabel,
    '',
    'ATTENDANCE',
    `• ${attLine}`,
    atRisk.length > 0
      ? `• ⚠️ ${atRisk.length} student${atRisk.length === 1 ? '' : 's'} below 75% — needs follow-up`
      : '• ✅ No attendance concerns detected',
    '',
    `FEES — ${monthLabel}`,
    `• ${lkr(collected)} collected of ${lkr(billed)} billed`,
    outstanding > 0
      ? `• ${lkr(outstanding)} outstanding across ${outstandingBills.length} bill${outstandingBills.length === 1 ? '' : 's'}${overdue > 0 ? ` (${overdue} overdue)` : ''}`
      : '• ✅ All bills settled',
    '',
    `FINANCES — ${monthLabel}`,
    `• Expenses ${lkr(expenseTotal)}${topCategory ? ` (top: ${topCategory[0]} ${lkr(topCategory[1])})` : ''}`,
    ...(pendingExpenses.length > 0
      ? [`• ⏳ ${pendingExpenses.length} expense${pendingExpenses.length === 1 ? '' : 's'} awaiting approval — ${lkr(pendingExpenseTotal)}`]
      : []),
    ...(paidTeachers > 0
      ? [`• Salaries paid to ${paidTeachers} staff member${paidTeachers === 1 ? '' : 's'} — ${lkr(paidSalaries)}`]
      : []),
    '',
    'PEOPLE',
    celebrations.length > 0
      ? `• 🎉 ${celebrations.length} celebration${celebrations.length === 1 ? '' : 's'} ahead: ${celebrations
          .slice(0, 3)
          .map((c) => `${c.name.split(' ')[0]} (${c.when})`)
          .join(', ')}${celebrations.length > 3 ? '…' : ''}`
      : '• No birthdays or anniversaries in the window',
    `• ${announcements} announcement${announcements === 1 ? '' : 's'} published this period`,
  ]

  const text = lines.join('\n')
  res.json({ ...data, text })
}))

export default r
