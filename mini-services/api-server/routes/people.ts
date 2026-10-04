// ─── People & classes routes — students, teachers, classes (+ lookups) ─────
// Static sub-paths (/students/lookup, /teachers/lookup) BEFORE /:id.
import { Router } from 'express'
import {
  Student, Guardian, Teacher, Class, Enrollment, Program, Attendance, PayrollRecord, Payment,
} from '../models'
import { ah, qs, containsRe, round2 } from '../helpers'

const r = Router()

// ─── Age bands (fixed) ──────────────────────────────────────────────────────
const VALID_AGE_GROUPS = new Set(['1-3', '3-5', '5-10', '10-15', '15-17', '17-19'])

// ─── Day constants & helpers ────────────────────────────────────────────────
const DAY_ORDER: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Category = 'Preschool' | 'Daycare' | 'Tuition'

function allowedDaysFor(category: Category | null): string[] {
  switch (category) {
    case 'Preschool': return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    case 'Daycare':   return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    default:          return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  }
}

/**
 * Normalises incoming day input (array `daysOfWeek` OR single `dayOfWeek`)
 * into a clean sorted array and validates it against the programme's category.
 *   • Preschool → Mon–Fri only, at least 1 day
 *   • Daycare   → Mon–Sat only, at least 1 day
 *   • Tuition (or none) → at most 1 day
 * Returns { error } on failure or { days } on success.
 */
async function resolveDays(
  rawDaysOfWeek: unknown,
  rawDayOfWeek: unknown,
  programId: string | null,
): Promise<{ error: string } | { days: string[] }> {
  let days: string[] = []
  if (Array.isArray(rawDaysOfWeek)) {
    days = rawDaysOfWeek.map((d) => String(d).trim()).filter(Boolean)
  } else if (typeof rawDayOfWeek === 'string' && rawDayOfWeek.trim()) {
    days = [rawDayOfWeek.trim()]
  }

  // Dedupe + sort by weekday order
  days = [...new Set(days)].sort((a, b) => (DAY_ORDER[a] ?? 99) - (DAY_ORDER[b] ?? 99))

  // Every value must be a real day name
  for (const d of days) {
    if (!VALID_DAYS.includes(d)) {
      return { error: `Invalid day "${d}" — must be one of ${VALID_DAYS.join(', ')}` }
    }
  }

  // Look up the programme category (if a programme was chosen)
  let category: Category | null = null
  if (programId) {
    const prog = await Program.findById(programId).lean()
    if (prog) category = ((prog as any).category ?? 'Tuition') as Category
  }

  // Tuition (or no programme) → at most one day
  if (!category || category === 'Tuition') {
    if (days.length > 1) {
      return { error: 'Only one day can be selected for Tuition programmes' }
    }
    return { days }
  }

  // Preschool / Daycare → within allowed set, at least one day
  const allowed = allowedDaysFor(category)
  const bad = days.find((d) => !allowed.includes(d))
  if (bad) {
    return {
      error: `${category} classes can only be scheduled on ${allowed.join(', ')} — "${bad}" is not allowed`,
    }
  }
  if (days.length === 0) {
    return { error: `${category} classes must have at least one day selected` }
  }

  return { days }
}

// ─── shared serialization ───────────────────────────────────────────────────
async function studentRelMaps(studentIds: string[], orderGuardians: boolean) {
  const [guardians, enrollments, attendanceCounts] = await Promise.all([
    studentIds.length
      ? Guardian.find({ studentId: { $in: studentIds } })
          .sort(orderGuardians ? { isPrimary: -1, createdAt: 1 } : {})
          .lean()
      : [],
    studentIds.length
      ? Enrollment.find({ studentId: { $in: studentIds } })
          .populate('programId', 'code name color category hasGrades grades')
          .populate('classId', 'name dayOfWeek daysOfWeek startTime endTime grade fee')
          .lean()
      : [],
    studentIds.length
      ? Attendance.aggregate([
          { $match: { personType: 'Student', personId: { $in: studentIds } } },
          { $group: { _id: '$personId', count: { $sum: 1 } } },
        ])
      : [],
  ])
  const gMap = new Map<string, any[]>()
  for (const g of guardians as any[]) {
    if (!gMap.has(g.studentId)) gMap.set(g.studentId, [])
    gMap.get(g.studentId)!.push(g)
  }
  const eMap = new Map<string, any[]>()
  for (const e of enrollments as any[]) {
    if (!eMap.has(e.studentId)) eMap.set(e.studentId, [])
    eMap.get(e.studentId)!.push(e)
  }
  const aMap = new Map<string, number>()
  for (const a of attendanceCounts as any[]) aMap.set(a._id, a.count)
  return { gMap, eMap, aMap }
}

function serializeStudent(s: any, maps: Awaited<ReturnType<typeof studentRelMaps>>) {
  const id = s._id.toString()
  return {
    id,
    studentId: s.studentId,
    indexNo: s.indexNo ?? null,
    barcode: s.barcode,
    fullName: s.fullName,
    gender: s.gender,
    dob: s.dob ? new Date(s.dob).toISOString() : null,
    ageGroup: s.ageGroup ?? null,
    grade: s.grade ?? null,
    admissionDate: s.admissionDate ? new Date(s.admissionDate).toISOString() : null,
    religion: s.religion ?? null,
    nationality: s.nationality ?? null,
    previousSchool: s.previousSchool ?? null,
    photoUrl: s.photoUrl ?? null,
    status: s.status,
    medicalNotes: s.medicalNotes ?? null,
    guardians: (maps.gMap.get(id) || []).map((g: any) => ({
      id: g._id.toString(),
      name: g.name,
      phone: g.phone,
      address: g.address ?? null,
      relationship: g.relationship,
      isPrimary: g.isPrimary,
    })),
    enrollments: (maps.eMap.get(id) || []).map((e: any) => ({
      id: e._id.toString(),
      program: e.programId
        ? {
            id: e.programId._id.toString(),
            code: e.programId.code,
            name: e.programId.name,
            color: e.programId.color,
            category: e.programId.category ?? 'Tuition',
            hasGrades: !!e.programId.hasGrades,
            grades: Array.isArray(e.programId.grades) ? e.programId.grades : [],
          }
        : null,
      class: e.classId
        ? {
            id: e.classId._id.toString(),
            name: e.classId.name,
            dayOfWeek: e.classId.dayOfWeek ?? null,
            daysOfWeek: Array.isArray(e.classId.daysOfWeek) && e.classId.daysOfWeek.length > 0
              ? e.classId.daysOfWeek
              : (e.classId.dayOfWeek ? [e.classId.dayOfWeek] : []),
            startTime: e.classId.startTime ?? null,
            endTime: e.classId.endTime ?? null,
            grade: e.classId.grade ?? null,
            fee: typeof e.classId.fee === 'number' ? e.classId.fee : 0,
          }
        : null,
    })),
    _count: { attendance: maps.aMap.get(id) || 0 },
  }
}

// ─── ID generation ──────────────────────────────────────────────────────────
function computeYear2(d: Date | null): string {
  const dt = d && !isNaN(d.getTime()) ? d : new Date()
  return String(dt.getFullYear()).slice(-2)
}

async function nextStudentId(admissionDate: Date | null): Promise<string> {
  const prefix = `S${computeYear2(admissionDate)}`
  const existing = await Student.find({ studentId: { $regex: `^${prefix}` } }, 'studentId').lean()
  let max = 0
  for (const s of existing as any[]) {
    const num = parseInt(s.studentId.slice(prefix.length), 10)
    if (!isNaN(num) && num > max) max = num
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

async function nextTeacherId(
  type: 'Internal' | 'External',
  hireDate: Date | null,
): Promise<string> {
  const prefix = `${type === 'Internal' ? 'I' : 'E'}${computeYear2(hireDate)}`
  const existing = await Teacher.find({ teacherId: { $regex: `^${prefix}` } }, 'teacherId').lean()
  let max = 0
  for (const t of existing as any[]) {
    const num = parseInt(t.teacherId.slice(prefix.length), 10)
    if (!isNaN(num) && num > max) max = num
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

// ─── Enrolment resolution ───────────────────────────────────────────────────
type EnrollInput = { programId: string; classId: string | null }

async function resolveEnrollments(raw: unknown): Promise<
  { error: string } | { list: EnrollInput[] }
> {
  if (!Array.isArray(raw)) return { list: [] }
  const list: EnrollInput[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    const programId = String((r as any)?.programId ?? '').trim()
    if (!programId) continue
    const classRaw = (r as any)?.classId
    const classId = classRaw ? String(classRaw).trim() : null

    const key = `${programId}|${classId ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)

    const prog = await Program.findById(programId).lean()
    if (!prog) return { error: `Programme ${programId} not found` }

    if (classId) {
      const cls = await Class.findById(classId).lean()
      if (!cls) return { error: 'Selected class not found' }
      if ((cls as any).programId && (cls as any).programId !== programId) {
        return { error: `Class "${(cls as any).name}" is not part of ${(prog as any).name}` }
      }
    }
    list.push({ programId, classId })
  }
  return { list }
}

// ─── GET /api/students/lookup?barcode= | ?studentId= ────────────────────────
r.get('/students/lookup', ah(async (req, res) => {
  const p = qs(req)
  const barcode = p.get('barcode')?.trim()
  const studentId = p.get('studentId')?.trim()
  if (!barcode && !studentId) {
    return res.status(400).json({ error: 'Provide either ?barcode= or ?studentId= query parameter' })
  }
  const where: Record<string, unknown> = {}
  if (barcode) where.barcode = barcode
  else if (studentId) where.studentId = studentId

  const student = await Student.findOne(where).lean()
  if (!student) return res.status(404).json({ error: 'No student matches that barcode / ID' })
  const maps = await studentRelMaps([(student as any)._id.toString()], true)
  res.json(serializeStudent(student, maps))
}))

// ─── GET /api/students ──────────────────────────────────────────────────────
r.get('/students', ah(async (req, res) => {
  const p = qs(req)
  const q = p.get('q')?.trim() || ''
  const program = p.get('program') || ''
  const category = p.get('category')?.trim().toLowerCase() || ''
  const ageGroup = p.get('ageGroup') || ''
  const gender = p.get('gender') || ''
  const status = p.get('status') || ''
  const page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(p.get('limit') || '20', 10) || 20))

  const where: Record<string, unknown> = {}
  if (q) {
    where.$or = [
      { fullName: containsRe(q) },
      { studentId: containsRe(q) },
      { indexNo: containsRe(q) },
      { barcode: containsRe(q) },
    ]
  }
  if (ageGroup) where.ageGroup = ageGroup
  if (gender) where.gender = gender
  if (status) where.status = status

  if (category && category !== 'all') {
    const catName = category === 'preschool' ? 'Preschool'
      : category === 'daycare' ? 'Daycare'
      : 'Tuition'
    const progs = await Program.find({ category: catName }, '_id').lean()
    const pids = (progs as any[]).map((x) => x._id.toString())
    const enr = await Enrollment.find(
      { programId: { $in: pids }, status: 'Active' },
      'studentId',
    ).lean()
    where._id = { $in: [...new Set((enr as any[]).map((e) => e.studentId))] }
  }

  if (program) {
    const prog = await Program.findOne({ code: program }, '_id').lean()
    const pid = prog ? (prog as any)._id.toString() : '___none___'
    const enr = await Enrollment.find({ programId: pid }, 'studentId').lean()
    where._id = { $in: (enr as any[]).map((e) => e.studentId) }
  }

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [total, rows, totalStudents, activeStudents, newThisMonth] = await Promise.all([
    Student.countDocuments(where),
    Student.find(where).sort({ studentId: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Student.countDocuments({}),
    Student.countDocuments({ status: 'Active' }),
    Student.countDocuments({
      $or: [
        { admissionDate: { $gte: monthStart } },
        { admissionDate: null, createdAt: { $gte: monthStart } },
      ],
    }),
  ])

  const ids = (rows as any[]).map((s) => s._id.toString())
  const maps = await studentRelMaps(ids, false)

  const allProgs = await Program.find({}, 'category _id').lean()
  const progIdToCat = new Map(
    (allProgs as any[]).map((x) => [x._id.toString(), x.category ?? 'Tuition']),
  )
  const allActiveEnrolls = await Enrollment.find(
    { status: 'Active' },
    'studentId programId',
  ).lean()
  const studentCats = new Map<string, Set<string>>()
  for (const e of allActiveEnrolls as any[]) {
    if (!e.programId) continue
    const cat = progIdToCat.get(e.programId) ?? 'Tuition'
    if (!studentCats.has(e.studentId)) studentCats.set(e.studentId, new Set())
    studentCats.get(e.studentId)!.add(cat)
  }
  const byCategory = { all: 0, preschool: 0, daycare: 0, tuition: 0 }
  for (const cats of studentCats.values()) {
    byCategory.all++
    if (cats.has('Preschool')) byCategory.preschool++
    else if (cats.has('Daycare')) byCategory.daycare++
    else byCategory.tuition++
  }

  res.json({
    data: (rows as any[]).map((s) => serializeStudent(s, maps)),
    total,
    page,
    limit,
    stats: {
      totalStudents,
      activeStudents,
      newThisMonth,
      filteredCount: total,
      byCategory,
    },
  })
}))

// ─── POST /api/students ─────────────────────────────────────────────────────
r.post('/students', ah(async (req, res) => {
  const body = req.body || {}
  const fullName = body.fullName?.trim()
  const gender = body.gender?.trim()
  if (!fullName) return res.status(400).json({ error: 'fullName is required' })
  if (!gender) return res.status(400).json({ error: 'gender is required' })

  const ageGroup = String(body.ageGroup ?? '').trim()
  if (ageGroup && !VALID_AGE_GROUPS.has(ageGroup)) {
    return res.status(400).json({ error: `ageGroup must be one of ${[...VALID_AGE_GROUPS].join(', ')}` })
  }

  const enrollmentsToCreate = await resolveEnrollments(body.enrollments ?? [])
  if ('error' in enrollmentsToCreate) return res.status(400).json({ error: enrollmentsToCreate.error })

  const parseDate = (v?: string | null): Date | null => {
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }

  const admissionDate = parseDate(body.admissionDate) || new Date()
  const studentId = await nextStudentId(admissionDate)

  const created = await Student.create({
    studentId,
    barcode: studentId,
    fullName,
    gender,
    indexNo: body.indexNo?.trim() || null,
    dob: parseDate(body.dob),
    ageGroup: ageGroup || null,
    grade: body.grade?.trim() || null,
    admissionDate,
    religion: body.religion || null,
    nationality: body.nationality || null,
    previousSchool: body.previousSchool || null,
    photoUrl: body.photoUrl || null,
    status: body.status || 'Active',
    medicalNotes: body.medicalNotes || null,
  })

  const guardians = (body.guardians || [])
    .filter((g: any) => g && g.name && g.name.trim())
    .map((g: any, idx: number) => ({
      studentId: (created as any)._id.toString(),
      name: g.name.trim(),
      phone: (g.phone || '').trim() || 'N/A',
      address: g.address || null,
      email: g.email || null,
      relationship: g.relationship || 'Guardian',
      occupation: g.occupation || null,
      isPrimary: g.isPrimary ?? idx === 0,
    }))
  if (guardians.length) await Guardian.insertMany(guardians)

  if (enrollmentsToCreate.list.length) {
    await Enrollment.insertMany(
      enrollmentsToCreate.list.map((e) => ({
        studentId: (created as any)._id.toString(),
        programId: e.programId,
        classId: e.classId,
        status: 'Active',
      })),
    )
  }

  const doc = await Student.findById((created as any)._id).lean()
  const maps = await studentRelMaps([(created as any)._id.toString()], false)
  res.status(201).json(serializeStudent(doc, maps))
}))

// ─── GET /api/students/:id ──────────────────────────────────────────────────
r.get('/students/:id', ah(async (req, res) => {
  const student = await Student.findById(req.params.id).lean()
  if (!student) return res.status(404).json({ error: 'Student not found' })
  const maps = await studentRelMaps([req.params.id], true)
  res.json(serializeStudent(student, maps))
}))

// ─── PUT /api/students/:id ──────────────────────────────────────────────────
r.put('/students/:id', ah(async (req, res) => {
  const existing = await Student.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Student not found' })
  const body = req.body || {}

  if (body.fullName !== undefined && !body.fullName.trim()) {
    return res.status(400).json({ error: 'fullName cannot be empty' })
  }
  if (body.gender !== undefined && !body.gender.trim()) {
    return res.status(400).json({ error: 'gender cannot be empty' })
  }
  if (body.ageGroup !== undefined && body.ageGroup && !VALID_AGE_GROUPS.has(String(body.ageGroup))) {
    return res.status(400).json({ error: `ageGroup must be one of ${[...VALID_AGE_GROUPS].join(', ')}` })
  }

  let toCreate: EnrollInput[] | null = null
  if (body.enrollments !== undefined) {
    const resolved = await resolveEnrollments(body.enrollments)
    if ('error' in resolved) return res.status(400).json({ error: resolved.error })
    toCreate = resolved.list
  }

  const parseDate = (v?: string | null): Date | null => {
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }

  if (body.fullName !== undefined) existing.fullName = body.fullName.trim()
  if (body.gender !== undefined) existing.gender = body.gender
  if (body.indexNo !== undefined) existing.indexNo = body.indexNo?.trim() || null
  if (body.dob !== undefined) existing.dob = parseDate(body.dob)
  if (body.ageGroup !== undefined) existing.ageGroup = body.ageGroup || null
  if (body.grade !== undefined) existing.grade = body.grade?.trim() || null
  if (body.admissionDate !== undefined) existing.admissionDate = parseDate(body.admissionDate)
  if (body.religion !== undefined) existing.religion = body.religion || null
  if (body.nationality !== undefined) existing.nationality = body.nationality || null
  if (body.previousSchool !== undefined) existing.previousSchool = body.previousSchool || null
  if (body.photoUrl !== undefined) existing.photoUrl = body.photoUrl || null
  if (body.status !== undefined) existing.status = body.status
  if (body.medicalNotes !== undefined) existing.medicalNotes = body.medicalNotes || null
  await existing.save()

  if (body.guardians !== undefined) {
    await Guardian.deleteMany({ studentId: req.params.id })
    const newGuardians = (body.guardians || [])
      .filter((g: any) => g && g.name && g.name.trim())
      .map((g: any, idx: number) => ({
        studentId: req.params.id,
        name: g.name.trim(),
        phone: (g.phone || '').trim() || 'N/A',
        address: g.address || null,
        email: g.email || null,
        relationship: g.relationship || 'Guardian',
        occupation: g.occupation || null,
        isPrimary: g.isPrimary ?? idx === 0,
      }))
    if (newGuardians.length) await Guardian.insertMany(newGuardians)
  }

  if (toCreate !== null) {
    await Enrollment.deleteMany({ studentId: req.params.id })
    if (toCreate.length) {
      await Enrollment.insertMany(
        toCreate.map((e) => ({
          studentId: req.params.id,
          programId: e.programId,
          classId: e.classId,
          status: 'Active',
        })),
      )
    }
  }

  const doc = await Student.findById(req.params.id).lean()
  const maps = await studentRelMaps([req.params.id], true)
  res.json(serializeStudent(doc, maps))
}))

// ─── DELETE /api/students/:id (cascade) ─────────────────────────────────────
r.delete('/students/:id', ah(async (req, res) => {
  const existing = await Student.findById(req.params.id).lean()
  if (!existing) return res.status(404).json({ error: 'Student not found' })
  const id = req.params.id
  await Promise.all([
    Guardian.deleteMany({ studentId: id }),
    Enrollment.deleteMany({ studentId: id }),
    Attendance.deleteMany({ personType: 'Student', personId: id }),
    Payment.deleteMany({ studentId: id }),
  ])
  await Student.deleteOne({ _id: (existing as any)._id })
  res.json({ ok: true, id, fullName: (existing as any).fullName })
}))

// ─── Teachers ───────────────────────────────────────────────────────────────
async function teacherRelData(teacherIds: string[]) {
  const [classes, lastAttRows, attCounts] = await Promise.all([
    teacherIds.length ? Class.find({ teacherId: { $in: teacherIds } }).populate('programId', 'code name color').lean() : [],
    teacherIds.length
      ? Attendance.find({ personType: 'Teacher', personId: { $in: teacherIds } })
          .sort({ date: -1 })
          .limit(teacherIds.length * 3)
          .lean()
      : [],
    teacherIds.length
      ? Attendance.aggregate([
          { $match: { personType: 'Teacher', personId: { $in: teacherIds } } },
          { $group: { _id: '$personId', count: { $sum: 1 } } },
        ])
      : [],
  ])
  const cMap = new Map<string, any[]>()
  for (const c of classes as any[]) {
    if (!c.teacherId) continue
    const tid = c.teacherId.toString()
    if (!cMap.has(tid)) cMap.set(tid, [])
    cMap.get(tid)!.push(c)
  }
  const lastMap = new Map<string, any>()
  for (const a of lastAttRows as any[]) {
    if (!lastMap.has(a.personId)) lastMap.set(a.personId, a)
  }
  const aMap = new Map<string, number>()
  for (const a of attCounts as any[]) aMap.set(a._id, a.count)
  return { cMap, lastMap, aMap }
}

function serializeTeacher(t: any, rel: Awaited<ReturnType<typeof teacherRelData>>, detailed: boolean) {
  const id = t._id.toString()
  const lastAtt = rel.lastMap.get(id)
  return {
    id,
    teacherId: t.teacherId,
    fingerprintId: t.fingerprintId ?? null,
    fullName: t.fullName,
    type: t.type,
    gender: t.gender ?? null,
    phone: t.phone ?? null,
    email: t.email ?? null,
    address: t.address ?? null,
    nic: t.nic ?? null,
    qualification: t.qualification ?? null,
    specialization: t.specialization ?? null,
    photoUrl: t.photoUrl ?? null,
    status: t.status,
    hireDate: t.hireDate ? new Date(t.hireDate).toISOString() : null,
    monthlyRate: t.monthlyRate,
    basicSalary: t.basicSalary,
    allowances: t.allowances,
    epfNo: t.epfNo ?? null,
    salaryNote: t.salaryNote ?? null,
    lastActive: lastAtt ? new Date(lastAtt.checkIn ?? lastAtt.date).toISOString() : null,
    classes: (rel.cMap.get(id) || [])
      .slice()
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
      .map((c: any) => ({
        id: c._id.toString(),
        name: c.name,
        dayOfWeek: c.dayOfWeek ?? null,
        daysOfWeek: Array.isArray(c.daysOfWeek) && c.daysOfWeek.length > 0
          ? c.daysOfWeek
          : (c.dayOfWeek ? [c.dayOfWeek] : []),
        startTime: c.startTime ?? null,
        grade: c.grade ?? null,
        ...(detailed
          ? {
              endTime: c.endTime ?? null,
              room: c.room ?? null,
              program: c.programId
                ? {
                    id: c.programId._id.toString(),
                    code: c.programId.code,
                    name: c.programId.name,
                    color: c.programId.color,
                  }
                : null,
            }
          : {}),
      })),
    _count: { classes: (rel.cMap.get(id) || []).length, attendance: rel.aMap.get(id) || 0 },
  }
}

// ─── GET /api/teachers/lookup?fingerprintId= ────────────────────────────────
r.get('/teachers/lookup', ah(async (req, res) => {
  const fingerprintId = qs(req).get('fingerprintId')?.trim()
  if (!fingerprintId) return res.status(400).json({ error: 'Provide ?fingerprintId= query parameter' })
  const teacher = await Teacher.findOne({ fingerprintId }).lean()
  if (!teacher) return res.status(404).json({ error: 'No teacher matches that fingerprint ID' })
  const rel = await teacherRelData([(teacher as any)._id.toString()])
  res.json(serializeTeacher(teacher, rel, false))
}))

// ─── GET /api/teachers ──────────────────────────────────────────────────────
r.get('/teachers', ah(async (req, res) => {
  const p = qs(req)
  const q = p.get('q')?.trim() || ''
  const type = p.get('type')?.trim() || ''
  const status = p.get('status')?.trim() || ''
  const page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(p.get('limit') || '20', 10) || 20))

  const where: Record<string, unknown> = {}
  if (q) {
    where.$or = [
      { fullName: containsRe(q) },
      { teacherId: containsRe(q) },
      { fingerprintId: containsRe(q) },
      { phone: containsRe(q) },
    ]
  }
  if (type) where.type = type
  if (status) where.status = status

  const [total, rows, totalTeachers, internalCount, externalCount, onLeaveCount] = await Promise.all([
    Teacher.countDocuments(where),
    Teacher.find(where).sort({ type: 1, teacherId: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Teacher.countDocuments({}),
    Teacher.countDocuments({ type: 'Internal' }),
    Teacher.countDocuments({ type: 'External' }),
    Teacher.countDocuments({ status: 'On Leave' }),
  ])

  const rel = await teacherRelData((rows as any[]).map((t) => t._id.toString()))
  res.json({
    data: (rows as any[]).map((t) => serializeTeacher(t, rel, false)),
    total,
    page,
    limit,
    stats: { totalTeachers, internalCount, externalCount, onLeaveCount, filteredCount: total },
  })
}))

// ─── POST /api/teachers ─────────────────────────────────────────────────────
r.post('/teachers', ah(async (req, res) => {
  const body = req.body || {}
  const fullName = body.fullName?.trim()
  if (!fullName) return res.status(400).json({ error: 'fullName is required' })

  const type = (body.type || 'Internal').trim()
  if (type !== 'Internal' && type !== 'External') {
    return res.status(400).json({ error: 'type must be Internal or External' })
  }

  let fingerprintId = body.fingerprintId?.trim() || null
  if (fingerprintId) {
    const clash = await Teacher.findOne({ fingerprintId })
    if (clash) return res.status(400).json({ error: `fingerprintId "${fingerprintId}" is already in use` })
  }

  const parseDate = (v?: string | null): Date | null => {
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }

  const hireDate = parseDate(body.hireDate)
  const teacherId = await nextTeacherId(type as 'Internal' | 'External', hireDate)

  const created = await Teacher.create({
    teacherId,
    fingerprintId,
    fullName,
    type,
    gender: body.gender || null,
    phone: body.phone || null,
    email: body.email || null,
    address: body.address || null,
    nic: body.nic || null,
    qualification: body.qualification || null,
    specialization: body.specialization || null,
    photoUrl: body.photoUrl || null,
    status: body.status || 'Active',
    hireDate,
    monthlyRate: typeof body.monthlyRate === 'number' ? body.monthlyRate : 0,
    basicSalary: typeof body.basicSalary === 'number' ? Math.max(0, body.basicSalary) : 0,
    allowances: typeof body.allowances === 'number' ? Math.max(0, body.allowances) : 0,
    epfNo: body.epfNo?.trim() || null,
    salaryNote: body.salaryNote?.trim() || null,
  })

  const doc = await Teacher.findById((created as any)._id).lean()
  const rel = await teacherRelData([(created as any)._id.toString()])
  res.status(201).json(serializeTeacher(doc, rel, false))
}))

// ─── GET /api/teachers/:id ──────────────────────────────────────────────────
r.get('/teachers/:id', ah(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id).lean()
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
  const rel = await teacherRelData([req.params.id])
  res.json(serializeTeacher(teacher, rel, true))
}))

// ─── PUT /api/teachers/:id ──────────────────────────────────────────────────
r.put('/teachers/:id', ah(async (req, res) => {
  const existing = await Teacher.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Teacher not found' })
  const body = req.body || {}

  if (body.fullName !== undefined && !body.fullName.trim()) {
    return res.status(400).json({ error: 'fullName cannot be empty' })
  }
  if (body.type !== undefined && !['Internal', 'External'].includes(body.type)) {
    return res.status(400).json({ error: 'type must be Internal or External' })
  }
  if (body.fingerprintId !== undefined) {
    const newFp = body.fingerprintId?.trim() || null
    if (newFp) {
      const clash = await Teacher.findOne({ fingerprintId: newFp, _id: { $ne: req.params.id } })
      if (clash) {
        return res.status(400).json({ error: `fingerprintId "${newFp}" is already assigned to another teacher` })
      }
    }
  }

  const parseDate = (v?: string | null): Date | null => {
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }

  if (body.fullName !== undefined) existing.fullName = body.fullName.trim()
  if (body.type !== undefined) existing.type = body.type
  if (body.gender !== undefined) existing.gender = body.gender || null
  if (body.phone !== undefined) existing.phone = body.phone || null
  if (body.email !== undefined) existing.email = body.email || null
  if (body.address !== undefined) existing.address = body.address || null
  if (body.nic !== undefined) existing.nic = body.nic || null
  if (body.qualification !== undefined) existing.qualification = body.qualification || null
  if (body.specialization !== undefined) existing.specialization = body.specialization || null
  if (body.photoUrl !== undefined) existing.photoUrl = body.photoUrl || null
  if (body.status !== undefined) existing.status = body.status
  if (body.hireDate !== undefined) existing.hireDate = parseDate(body.hireDate)
  if (body.monthlyRate !== undefined) existing.monthlyRate = typeof body.monthlyRate === 'number' ? body.monthlyRate : 0
  if (body.basicSalary !== undefined) existing.basicSalary = typeof body.basicSalary === 'number' ? Math.max(0, body.basicSalary) : 0
  if (body.allowances !== undefined) existing.allowances = typeof body.allowances === 'number' ? Math.max(0, body.allowances) : 0
  if (body.epfNo !== undefined) existing.epfNo = body.epfNo?.trim() || null
  if (body.salaryNote !== undefined) existing.salaryNote = body.salaryNote?.trim() || null
  if (body.fingerprintId !== undefined) existing.fingerprintId = body.fingerprintId?.trim() || null

  await existing.save()
  const doc = await Teacher.findById(req.params.id).lean()
  const rel = await teacherRelData([req.params.id])
  res.json(serializeTeacher(doc, rel, true))
}))

// ─── DELETE /api/teachers/:id ───────────────────────────────────────────────
r.delete('/teachers/:id', ah(async (req, res) => {
  const existing = await Teacher.findById(req.params.id).lean()
  if (!existing) return res.status(404).json({ error: 'Teacher not found' })
  const id = req.params.id
  await Promise.all([
    Class.updateMany({ teacherId: id }, { $set: { teacherId: null } }),
    Attendance.deleteMany({ personType: 'Teacher', personId: id }),
    PayrollRecord.deleteMany({ teacherId: id }),
  ])
  await Teacher.deleteOne({ _id: (existing as any)._id })
  res.json({ ok: true, id, fullName: (existing as any).fullName, teacherId: (existing as any).teacherId })
}))

// ─── Classes ────────────────────────────────────────────────────────────────
async function classRelMaps(classes: any[]) {
  const ids = classes.map((c) => c._id.toString())
  const [enrRows] = await Promise.all([
    ids.length ? Enrollment.find({ classId: { $in: ids } }, 'classId').lean() : [],
  ])
  const eMap = new Map<string, number>()
  for (const e of enrRows as any[]) {
    const k = e.classId
    if (!k) continue
    eMap.set(k, (eMap.get(k) || 0) + 1)
  }
  return { eMap }
}

function serializeClass(c: any, eMap: Map<string, number>) {
  return {
    id: c._id.toString(),
    name: c.name,
    dayOfWeek: c.dayOfWeek ?? null,
    daysOfWeek: Array.isArray(c.daysOfWeek) && c.daysOfWeek.length > 0
      ? c.daysOfWeek
      : (c.dayOfWeek ? [c.dayOfWeek] : []),
    startTime: c.startTime ?? null,
    endTime: c.endTime ?? null,
    room: c.room ?? null,
    capacity: c.capacity,
    fee: c.fee,
    instituteSharePct: c.instituteSharePct,
    grade: c.grade ?? null,
    active: c.active,
    notes: c.notes ?? null,
    program: c.programId
      ? {
          id: c.programId._id.toString(),
          code: c.programId.code,
          name: c.programId.name,
          color: c.programId.color,
          category: c.programId.category ?? 'Tuition',
        }
      : null,
    teacher: c.teacherId
      ? {
          id: c.teacherId._id ? c.teacherId._id.toString() : c.teacherId.toString(),
          teacherId: c.teacherId.teacherId,
          fullName: c.teacherId.fullName,
          type: c.teacherId.type,
        }
      : null,
    _count: { enrollments: eMap.get(c._id.toString()) || 0 },
  }
}

// ─── GET /api/classes ───────────────────────────────────────────────────────
r.get('/classes', ah(async (req, res) => {
  const p = qs(req)
  const day = p.get('day')?.trim() || ''
  const programCode = p.get('program')?.trim() || ''
  const teacherId = p.get('teacherId')?.trim() || ''
  const activeParam = p.get('active')
  const page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(p.get('limit') || '50', 10) || 50))

  const where: Record<string, unknown> = {}
  if (day) {
    // Match classes that have `day` as their primary day OR as any entry in daysOfWeek
    where.$or = [{ dayOfWeek: day }, { daysOfWeek: day }]
  }
  if (programCode) {
    const prog = await Program.findOne({ code: programCode }, '_id').lean()
    where.programId = prog ? (prog as any)._id.toString() : '___none___'
  }
  if (teacherId) where.teacherId = teacherId
  if (activeParam === 'true') where.active = true
  if (activeParam === 'false') where.active = false

  const [total, rows] = await Promise.all([
    Class.countDocuments(where),
    Class.find(where)
      .populate('programId', 'code name color category')
      .populate('teacherId', 'teacherId fullName type')
      .lean(),
  ])

  const sorted = (rows as any[]).sort((a, b) => {
    const da = DAY_ORDER[a.dayOfWeek || ''] ?? 99
    const db = DAY_ORDER[b.dayOfWeek || ''] ?? 99
    if (da !== db) return da - db
    return (a.startTime || '').localeCompare(b.startTime || '')
  })
  const pageRows = sorted.slice((page - 1) * limit, (page - 1) * limit + limit)

  const { eMap } = await classRelMaps(pageRows)
  res.json({ data: pageRows.map((c) => serializeClass(c, eMap)), total })
}))

// ─── POST /api/classes ──────────────────────────────────────────────────────
r.post('/classes', ah(async (req, res) => {
  const body = req.body || {}
  const name = body.name?.trim()
  if (!name) return res.status(400).json({ error: 'name is required' })

  if (body.programId) {
    const p = await Program.findById(body.programId)
    if (!p) return res.status(400).json({ error: 'programId not found' })
  }
  if (body.teacherId) {
    const t = await Teacher.findById(body.teacherId)
    if (!t) return res.status(400).json({ error: 'teacherId not found' })
  }

  // Validate day(s) against the chosen programme's category
  const daysResult = await resolveDays(body.daysOfWeek, body.dayOfWeek, body.programId || null)
  if ('error' in daysResult) return res.status(400).json({ error: daysResult.error })
  const days = daysResult.days

  const created = await Class.create({
    name,
    programId: body.programId || null,
    teacherId: body.teacherId || null,
    dayOfWeek: days[0] ?? null,
    daysOfWeek: days,
    startTime: body.startTime?.trim() || null,
    endTime: body.endTime?.trim() || null,
    room: body.room?.trim() || null,
    capacity:
      typeof body.capacity === 'number' && !isNaN(body.capacity) ? Math.max(0, Math.floor(body.capacity)) : 20,
    fee: typeof body.fee === 'number' && !isNaN(body.fee) ? Math.max(0, body.fee) : 0,
    instituteSharePct:
      typeof body.instituteSharePct === 'number' && !isNaN(body.instituteSharePct)
        ? Math.min(100, Math.max(0, body.instituteSharePct))
        : 25,
    grade: body.grade?.trim() || null,
    active: body.active ?? true,
    notes: body.notes?.trim() || null,
  })

  const doc = await Class.findById((created as any)._id)
    .populate('programId', 'code name color category')
    .populate('teacherId', 'teacherId fullName type')
    .lean()
  const { eMap } = await classRelMaps([doc as any])
  res.status(201).json(serializeClass(doc, eMap))
}))

// ─── GET /api/classes/:id ───────────────────────────────────────────────────
r.get('/classes/:id', ah(async (req, res) => {
  const cls = await Class.findById(req.params.id)
    .populate('programId', 'code name color category')
    .populate('teacherId', 'teacherId fullName type')
    .lean()
  if (!cls) return res.status(404).json({ error: 'Class not found' })
  const { eMap } = await classRelMaps([cls as any])
  res.json(serializeClass(cls, eMap))
}))

// ─── PUT /api/classes/:id ───────────────────────────────────────────────────
r.put('/classes/:id', ah(async (req, res) => {
  const existing = await Class.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Class not found' })
  const body = req.body || {}

  if (body.programId !== undefined && body.programId) {
    const p = await Program.findById(body.programId)
    if (!p) return res.status(400).json({ error: 'programId not found' })
  }
  if (body.teacherId !== undefined && body.teacherId) {
    const t = await Teacher.findById(body.teacherId)
    if (!t) return res.status(400).json({ error: 'teacherId not found' })
  }

  // Validate day(s) if either daysOfWeek or dayOfWeek was provided
  let newDays: string[] | undefined
  if (body.daysOfWeek !== undefined || body.dayOfWeek !== undefined) {
    const targetProgramId = body.programId !== undefined
      ? (body.programId || null)
      : ((existing as any).programId?.toString() ?? null)
    const daysResult = await resolveDays(body.daysOfWeek, body.dayOfWeek, targetProgramId)
    if ('error' in daysResult) return res.status(400).json({ error: daysResult.error })
    newDays = daysResult.days
  }

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return res.status(400).json({ error: 'name cannot be empty' })
    existing.name = name
  }
  if (body.programId !== undefined) existing.programId = body.programId || null
  if (body.teacherId !== undefined) existing.teacherId = body.teacherId || null
  if (newDays !== undefined) {
    existing.dayOfWeek = newDays[0] ?? null
    existing.daysOfWeek = newDays
  }
  if (body.startTime !== undefined) existing.startTime = body.startTime?.trim() || null
  if (body.endTime !== undefined) existing.endTime = body.endTime?.trim() || null
  if (body.room !== undefined) existing.room = body.room?.trim() || null
  if (body.capacity !== undefined) {
    existing.capacity =
      typeof body.capacity === 'number' && !isNaN(body.capacity) ? Math.max(0, Math.floor(body.capacity)) : 20
  }
  if (body.fee !== undefined) {
    existing.fee = typeof body.fee === 'number' && !isNaN(body.fee) ? Math.max(0, body.fee) : 0
  }
  if (body.instituteSharePct !== undefined) {
    existing.instituteSharePct =
      typeof body.instituteSharePct === 'number' && !isNaN(body.instituteSharePct)
        ? Math.min(100, Math.max(0, body.instituteSharePct))
        : 25
  }
  if (body.grade !== undefined) existing.grade = body.grade?.trim() || null
  if (body.active !== undefined) existing.active = Boolean(body.active)
  if (body.notes !== undefined) existing.notes = body.notes?.trim() || null

  await existing.save()
  const doc = await Class.findById(req.params.id)
    .populate('programId', 'code name color category')
    .populate('teacherId', 'teacherId fullName type')
    .lean()
  const { eMap } = await classRelMaps([doc as any])
  res.json(serializeClass(doc, eMap))
}))

// ─── DELETE /api/classes/:id (block when enrollments exist) ─────────────────
r.delete('/classes/:id', ah(async (req, res) => {
  const id = req.params.id
  const existing = await Class.findById(id).lean()
  if (!existing) return res.status(404).json({ error: 'Class not found' })
  const enrolled = await Enrollment.countDocuments({ classId: id })
  if (enrolled > 0) {
    return res.status(400).json({
      error: `Cannot delete "${(existing as any).name}" — ${enrolled} student(s) are enrolled. Withdraw them first.`,
    })
  }
  await Class.deleteOne({ _id: (existing as any)._id })
  res.json({ ok: true, id, name: (existing as any).name })
}))

export default r
