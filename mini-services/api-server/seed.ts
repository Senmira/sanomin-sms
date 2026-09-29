// ─── Seed script — realistic SANOMIN sample data for MongoDB ───────────────
// Fulfils the CW deliverable "Database with sample data".
// Run: bun run seed
//
// ID scheme (mirrors routes/people.ts):
//   Student:   S<YY><NNNN>   e.g. S240001, S240002, S250001
//   Teacher:   I<YY><NNN>    (Internal)  e.g. I24001, I24002
//              E<YY><NNN>    (External)  e.g. E24001, E24002
//   YY = year of admission (student) / hire (teacher)
//   Barcode = studentId exactly (no SAN prefix).
//   Programme info lives ONLY in the Enrollment collection.
//
// Programme model:
//   • category   — 'Preschool' | 'Daycare' | 'Tuition'
//                  Drives the Student tabs (All / Preschool / Daycare / Tuition)
//   • hasGrades  — boolean
//   • grades[]   — e.g. ['Grade 1'..'Grade 11'] for Maths
import mongoose from 'mongoose'
import {
  Program, Student, Guardian, Teacher, Class, Enrollment,
  Attendance, Setting, Payment, PayrollRecord, Expense, Announcement,
} from './models'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sanomin'

const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const randInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min
const pick = <T>(arr: T[], n: number): T[] => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}
const round2 = (n: number) => Math.round(n * 100) / 100

// ─── ID helpers (in-memory counters; mirrors routes/people.ts) ──────────────
const counters = new Map<string, number>()

function computeYear2(d: Date): string {
  return String(d.getFullYear()).slice(-2)
}

function nextStudentIdFor(admissionDate: Date): string {
  const prefix = `S${computeYear2(admissionDate)}`
  const next = (counters.get(prefix) ?? 0) + 1
  counters.set(prefix, next)
  return `${prefix}${String(next).padStart(4, '0')}`
}

function nextTeacherIdFor(type: 'Internal' | 'External', hireDate: Date): string {
  const prefix = `${type === 'Internal' ? 'I' : 'E'}${computeYear2(hireDate)}`
  const next = (counters.get(prefix) ?? 0) + 1
  counters.set(prefix, next)
  return `${prefix}${String(next).padStart(3, '0')}`
}

// ─── Timetable helpers for seed (in-memory mirrors of the API helpers) ─────
const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const GRACE_MINUTES = 10

function parseHHMM(date: Date, time: string | null | undefined): Date | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim())
  if (!m) return null
  const hh = Math.min(23, parseInt(m[1], 10))
  const mm = Math.min(59, parseInt(m[2], 10))
  const d = new Date(date)
  d.setHours(hh, mm, 0, 0)
  return d
}

interface ExpectedWindow {
  expectedStart: Date | null
  expectedEnd: Date | null
  classNames: string[]
}

function resolveExpectedFor(
  personType: 'Student' | 'Teacher',
  personId: string,
  date: Date,
  classes: any[],
  classEnrollDocs: any[],
  studentProgramIds: string[],
): ExpectedWindow {
  const dow = DAY_CODES[date.getDay()]

  let matched: any[] = []
  if (personType === 'Teacher') {
    matched = classes.filter((c) => c.teacherId === personId && c.dayOfWeek === dow && c.active !== false)
  } else {
    const classIds = classEnrollDocs
      .filter((e) => e.studentId === personId && e.classId)
      .map((e) => e.classId)
    const directClasses = classIds.length
      ? classes.filter((c) => classIds.includes(c._id.toString()) && c.dayOfWeek === dow && c.active !== false)
      : []
    if (directClasses.length > 0) {
      matched = directClasses
    } else if (studentProgramIds.length > 0) {
      matched = classes.filter(
        (c) => studentProgramIds.includes(c.programId) && c.dayOfWeek === dow && c.active !== false,
      )
    }
  }

  if (matched.length === 0) return { expectedStart: null, expectedEnd: null, classNames: [] }

  const starts = matched.map((c) => c.startTime).filter(Boolean).sort() as string[]
  const ends = matched.map((c) => c.endTime).filter(Boolean).sort() as string[]
  return {
    expectedStart: starts.length ? parseHHMM(date, starts[0]) : null,
    expectedEnd: ends.length ? parseHHMM(date, ends[ends.length - 1]) : null,
    classNames: matched.map((c) => c.name),
  }
}

function computeFlagsLocal(
  checkIn: Date | null,
  checkOut: Date | null,
  expected: ExpectedWindow,
): { lateMinutes: number | null; earlyMinutes: number | null; lateCheckoutMinutes: number | null } {
  let lateMinutes: number | null = null
  let earlyMinutes: number | null = null
  let lateCheckoutMinutes: number | null = null
  const graceMs = GRACE_MINUTES * 60_000
  if (checkIn && expected.expectedStart) {
    const diff = checkIn.getTime() - (expected.expectedStart.getTime() + graceMs)
    if (diff > 0) lateMinutes = Math.round(diff / 60_000)
  }
  if (checkOut && expected.expectedEnd) {
    const beforeMs = expected.expectedEnd.getTime() - graceMs - checkOut.getTime()
    if (beforeMs > 0) earlyMinutes = Math.round(beforeMs / 60_000)
    else {
      const over = checkOut.getTime() - (expected.expectedEnd.getTime() + graceMs)
      if (over > 0) lateCheckoutMinutes = Math.round(over / 60_000)
    }
  }
  return { lateMinutes, earlyMinutes, lateCheckoutMinutes }
}

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log('[seed] connected to', MONGODB_URI)

  // ── Wipe ─────────────────────────────────────────────────────────────────
  await Promise.all([
    Program.deleteMany({}), Student.deleteMany({}), Guardian.deleteMany({}),
    Teacher.deleteMany({}), Class.deleteMany({}), Enrollment.deleteMany({}),
    Attendance.deleteMany({}), Setting.deleteMany({}), Payment.deleteMany({}),
    PayrollRecord.deleteMany({}), Expense.deleteMany({}), Announcement.deleteMany({}),
  ])
  console.log('[seed] collections cleared')

  // ── Programmes — dynamic, with category + optional grades ────────────────
  //
  // • category drives the Student tabs (Preschool / Daycare / Tuition)
  // • MATHS demonstrates a graded programme (Grade 1 … Grade 11)
  const programDocs = await Program.insertMany([
    {
      code: 'PRESCHOOL',
      name: 'Preschool',
      description: 'Early years foundation programme (ages 2–5)',
      color: '#7c3aed',
      monthlyFee: 4500,
      category: 'Preschool',
      hasGrades: false,
      grades: [],
    },
    {
      code: 'DAYCARE',
      name: 'Daycare',
      description: 'Full-day childcare with meals and nap time',
      color: '#f59e0b',
      monthlyFee: 6000,
      category: 'Daycare',
      hasGrades: false,
      grades: [],
    },
    {
      code: 'IT',
      name: 'IT Kids',
      description: 'Computer literacy & coding for kids',
      color: '#10b981',
      monthlyFee: 2000,
      category: 'Tuition',
      hasGrades: false,
      grades: [],
    },
    {
      code: 'ELOCUTION',
      name: 'Elocution',
      description: 'Speech, drama & communication (ESRA/Trinity)',
      color: '#ef4444',
      monthlyFee: 2000,
      category: 'Tuition',
      hasGrades: false,
      grades: [],
    },
    {
      code: 'DANCING',
      name: 'Dancing',
      description: 'Kandyan & freestyle dancing classes',
      color: '#ec4899',
      monthlyFee: 1500,
      category: 'Tuition',
      hasGrades: false,
      grades: [],
    },
    {
      code: 'MATHS',
      name: 'Maths',
      description: 'Maths tuition — grade 1 through grade 11',
      color: '#0ea5e9',
      monthlyFee: 2500,
      category: 'Tuition',
      hasGrades: true,
      grades: [
        'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
        'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11',
      ],
    },
  ])
  const progByCode = Object.fromEntries(programDocs.map((p) => [p.code, p]))
  console.log('[seed] programs:', programDocs.length, '(incl. graded MATHS demo)')

  // ── Teachers ─────────────────────────────────────────────────────────────
  const teacherDefs = [
    { fullName: 'Mrs. Nirmala Perera', type: 'Internal', gender: 'Female', basicSalary: 65000, allowances: 5000, epfNo: 'EPF-88121', specialization: 'Early childhood', qualification: 'Diploma in Montessori', hireYear: 2018 },
    { fullName: 'Ms. Sanduni Fernando', type: 'Internal', gender: 'Female', basicSalary: 55000, allowances: 3500, epfNo: 'EPF-88122', specialization: 'Preschool', qualification: 'AMI Diploma', hireYear: 2019 },
    { fullName: 'Mr. Kasun Jayasuriya', type: 'Internal', gender: 'Male', basicSalary: 72000, allowances: 6000, epfNo: 'EPF-88123', specialization: 'IT, Coding', qualification: 'BSc (Hons) Computing', hireYear: 2020 },
    { fullName: 'Mrs. Anusha Wickramasinghe', type: 'Internal', gender: 'Female', basicSalary: 58000, allowances: 4000, epfNo: 'EPF-88124', specialization: 'Elocution', qualification: 'LTCL Speech & Drama', hireYear: 2021 },
    { fullName: 'Ms. Dilani Rathnayake', type: 'Internal', gender: 'Female', basicSalary: 52000, allowances: 3000, epfNo: 'EPF-88125', specialization: 'Daycare', qualification: 'NVQ Level 4 Childcare', hireYear: 2022 },
    { fullName: 'Mr. Suresh Bandara', type: 'External', gender: 'Male', basicSalary: 45000, allowances: 2000, epfNo: 'EPF-88126', specialization: 'Dancing', qualification: 'Kandyan dance (Bhaswara)', hireYear: 2021 },
    { fullName: 'Mrs. Chathurika Silva', type: 'External', gender: 'Female', basicSalary: 0, allowances: 0, monthlyRate: 18000, specialization: 'Elocution (visiting)', qualification: 'BEd English', hireYear: 2023 },
    { fullName: 'Mr. Nuwan Edirisinghe', type: 'External', gender: 'Male', basicSalary: 0, allowances: 0, monthlyRate: 20000, specialization: 'Abacus & Mental Maths', qualification: 'Abacus trainer cert.', hireYear: 2023 },
    { fullName: 'Mrs. Priyani Gunawardena', type: 'Internal', gender: 'Female', basicSalary: 60000, allowances: 4500, epfNo: 'EPF-88127', specialization: 'Preschool, Sinhala', qualification: 'Dip. Primary Education', status: 'On Leave', hireYear: 2024 },
  ]
  const teacherDocs: any[] = []
  for (let i = 0; i < teacherDefs.length; i++) {
    const d = teacherDefs[i]
    const hireDate = new Date(d.hireYear, randInt(0, 11), randInt(1, 28))
    const teacherId = nextTeacherIdFor(d.type as 'Internal' | 'External', hireDate)
    teacherDocs.push({
      teacherId,
      fingerprintId: `FP-${1001 + i}`,
      fullName: d.fullName,
      type: d.type,
      gender: d.gender,
      phone: `07${randInt(1, 8)}${randInt(1000000, 9999999)}`,
      email: `${d.fullName.split(' ').pop()!.toLowerCase()}@sanomin.lk`,
      nic: `19${randInt(80, 99)}${randInt(100000, 999999)}`,
      qualification: d.qualification,
      specialization: d.specialization,
      status: d.status || 'Active',
      hireDate,
      monthlyRate: d.monthlyRate ?? 0,
      basicSalary: d.basicSalary,
      allowances: d.allowances,
      epfNo: d.epfNo ?? null,
    })
  }
  const teachers = await Teacher.insertMany(teacherDocs)
  const T = (i: number) => teachers[i]._id.toString()
  console.log('[seed] teachers:', teachers.length, '(I<YY><NNN> / E<YY><NNN>)')

  // ── Students — programmes decided first, then ID derived from year only ──
  const firstNames = ['Ayesha', 'Dimuthu', 'Thisara', 'Nethmi', 'Sahan', 'Rashmi', 'Kavindu', 'Amaya', 'Ravindu', 'Sewmi', 'Dinuka', 'Hasini', 'Tharindu', 'Nethra', 'Sanula', 'Yenuli', 'Vihanga', 'Methuli', 'Ranithu', 'Oneli', 'Minula', 'Thinudi', 'Aesha', 'Kavya', 'Lihini', 'Sandev', 'Resandi', 'Tanudi', 'Vinudi', 'Mahith', 'Anula', 'Pamudu', 'Nadun', 'Rithma', 'Senith', 'Hiruni', 'Janith', 'Methara', 'Nuvin', 'Thehara', 'Ashen', 'Disna', 'Rukshan', 'Sayuru']
  const lastNames = ['Perera', 'Fernando', 'Silva', 'Jayasuriya', 'Wickramasinghe', 'Bandara', 'Rathnayake', 'Gunawardena', 'Edirisinghe', 'Dissanayake', 'Herath', 'Weerasinghe']
  const ageGroups = ['2-3', '3-4', '4-5', '5-6']

  type Draft = {
    fullName: string
    gender: string
    ageGroup: string
    dob: Date
    admissionDate: Date
    religion: string
    status: string
    medicalNotes: string | null
    programCodes: string[]
    // per-programme grade when the programme has grades (e.g. { MATHS: 'Grade 5' })
    grades: Record<string, string | null>
  }

  // A small pool of grades for the MATHS demo
  const mathsGrades = ['Grade 1', 'Grade 3', 'Grade 5', 'Grade 7', 'Grade 8', 'Grade 10']

  const drafts: Draft[] = []
  for (let i = 0; i < 44; i++) {
    const gender = i % 2 === 0 ? 'Female' : 'Male'
    const ageGroup = rand(ageGroups)
    const dobYear = 2026 - (parseInt(ageGroup[0]) + 1)

    // Programme distribution (does NOT influence the ID — IDs are opaque)
    const codes: string[] = ['PRESCHOOL']
    const r = Math.random()
    if (r < 0.25) codes.push('DAYCARE')
    else if (r < 0.45) { codes.push('IT'); codes.push('ELOCUTION') }
    else if (r < 0.6) codes.push('ELOCUTION')
    else if (r < 0.72) codes.push('DANCING')
    else if (r < 0.8) { codes.push('IT'); codes.push('DANCING') }

    // A few single-programme students so the app shows variety
    if (i === 5 || i === 12 || i === 20) { codes.length = 0; codes.push('DAYCARE') }
    if (i === 8 || i === 15) { codes.length = 0; codes.push('ELOCUTION') }
    if (i === 22) { codes.length = 0; codes.push('IT') }

    // ~35 % of students also take MATHS — assign a random grade to demonstrate
    // the graded-enrolment UI without bloating the seeded dataset.
    const grades: Record<string, string | null> = {}
    if (Math.random() < 0.35) {
      codes.push('MATHS')
      grades.MATHS = rand(mathsGrades)
    }

    // Admission year varies across 2024, 2025, 2026 so IDs show multiple years
    const admissionYear = i < 20 ? 2024 : i < 35 ? 2025 : 2026
    const admissionDate = new Date(admissionYear, randInt(0, 11), randInt(1, 28))

    drafts.push({
      fullName: `${rand(firstNames)} ${rand(lastNames)}`,
      gender,
      ageGroup,
      dob: new Date(dobYear, randInt(0, 11), randInt(1, 28)),
      admissionDate,
      religion: rand(['Buddhist', 'Catholic', 'Hindu', 'Muslim', 'Christian']),
      status: i < 40 ? 'Active' : rand(['Inactive', 'Graduated']),
      medicalNotes: i % 11 === 0 ? 'Mild asthma — inhaler in office' : null,
      programCodes: codes,
      grades,
    })
  }
  // Birthday-in-next-10-days for the celebrations card
  for (let k = 0; k < 3; k++) {
    const soon = new Date()
    soon.setDate(soon.getDate() + k * 3 + 1)
    drafts[k].dob = new Date(soon.getFullYear() - randInt(3, 5), soon.getMonth(), soon.getDate())
  }

  const studentDocs: any[] = drafts.map((d) => {
    const studentId = nextStudentIdFor(d.admissionDate)
    return {
      studentId,                        // e.g. S240001, S250001, S260001
      indexNo: studentId.slice(1),      // e.g. "240001"
      barcode: studentId,               // barcode === studentId
      fullName: d.fullName,
      gender: d.gender,
      dob: d.dob,
      ageGroup: d.ageGroup,
      admissionDate: d.admissionDate,
      religion: d.religion,
      nationality: 'Sri Lankan',
      status: d.status,
      medicalNotes: d.medicalNotes,
    }
  })
  const students = await Student.insertMany(studentDocs)
  console.log('[seed] students:', students.length, '(S<YY><NNNN>)')

  // ── Guardians ────────────────────────────────────────────────────────────
  const guardianDocs: any[] = []
  for (const s of students) {
    guardianDocs.push({
      studentId: s._id.toString(),
      name: `Mr. & Mrs. ${s.fullName.split(' ').pop()}`,
      phone: `07${randInt(1, 8)}${randInt(1000000, 9999999)}`,
      relationship: 'Mother',
      isPrimary: true,
      occupation: rand(['Teacher', 'Engineer', 'Nurse', 'Business owner', 'Bank officer', 'Farmer']),
    })
    if (Math.random() < 0.3) {
      guardianDocs.push({
        studentId: s._id.toString(),
        name: `${rand(['Mr.', 'Mrs.'])} ${rand(lastNames)}`,
        phone: Math.random() < 0.8 ? `07${randInt(1, 8)}${randInt(1000000, 9999999)}` : 'N/A',
        relationship: 'Father',
        isPrimary: false,
      })
    }
  }
  // 2 students without reachable guardian phone (data-quality demo)
  guardianDocs[0].phone = 'N/A'
  const guardians = await Guardian.insertMany(guardianDocs)
  console.log('[seed] guardians:', guardians.length)

  // ── Enrollments — carry grade where the programme has grades ─────────────
  const activeStudents = students.filter((s) => s.status === 'Active')
  const enrollmentDocs: any[] = []
  const enrollmentsByStudent = new Map<string, string[]>()
  const studentProgramIds = new Map<string, string[]>()
  const studentGrades = new Map<string, Record<string, string | null>>()
  for (let i = 0; i < students.length; i++) {
    const s = students[i]
    if (s.status !== 'Active') continue
    const codes = drafts[i].programCodes
    const grades = drafts[i].grades
    const programIds: string[] = []
    for (const code of codes) {
      const pid = progByCode[code]._id.toString()
      enrollmentDocs.push({
        studentId: s._id.toString(),
        programId: pid,
        enrolledAt: new Date(2024, randInt(0, 11), randInt(1, 28)),
        status: 'Active',
        grade: grades[code] ?? null,
      })
      programIds.push(pid)
    }
    enrollmentsByStudent.set(s._id.toString(), codes)
    studentProgramIds.set(s._id.toString(), programIds)
    studentGrades.set(s._id.toString(), grades)
  }
  const enrollments = await Enrollment.insertMany(enrollmentDocs)
  console.log('[seed] enrollments:', enrollments.length, '(incl. graded)')

  // ── Classes (with 25% institute share) ───────────────────────────────────
  const classDocs = [
    { name: 'Preschool — Sunbeams', programId: progByCode.PRESCHOOL._id.toString(), teacherId: T(1), dayOfWeek: 'Mon', startTime: '08:30', endTime: '11:30', room: 'Room A', capacity: 25, fee: 4500, instituteSharePct: 25 },
    { name: 'Preschool — Rainbows', programId: progByCode.PRESCHOOL._id.toString(), teacherId: T(0), dayOfWeek: 'Tue', startTime: '08:30', endTime: '11:30', room: 'Room B', capacity: 25, fee: 4500, instituteSharePct: 25 },
    { name: 'Daycare — Full Day', programId: progByCode.DAYCARE._id.toString(), teacherId: T(4), dayOfWeek: 'Mon', startTime: '07:30', endTime: '17:30', room: 'Daycare Wing', capacity: 15, fee: 6000, instituteSharePct: 25 },
    { name: 'IT Kids — Beginners', programId: progByCode.IT._id.toString(), teacherId: T(2), dayOfWeek: 'Wed', startTime: '14:00', endTime: '15:30', room: 'IT Lab', capacity: 16, fee: 2000, instituteSharePct: 25 },
    { name: 'IT Kids — Coding Club', programId: progByCode.IT._id.toString(), teacherId: T(2), dayOfWeek: 'Fri', startTime: '14:00', endTime: '16:00', room: 'IT Lab', capacity: 12, fee: 2500, instituteSharePct: 30 },
    { name: 'Elocution — Grade 1', programId: progByCode.ELOCUTION._id.toString(), teacherId: T(3), dayOfWeek: 'Thu', startTime: '13:00', endTime: '14:30', room: 'Room C', capacity: 20, fee: 2000, instituteSharePct: 25 },
    { name: 'Elocution — Advanced', programId: progByCode.ELOCUTION._id.toString(), teacherId: T(6), dayOfWeek: 'Sat', startTime: '09:00', endTime: '11:00', room: 'Main Hall', capacity: 18, fee: 2500, instituteSharePct: 25 },
    { name: 'Dancing — Kandyan Juniors', programId: progByCode.DANCING._id.toString(), teacherId: T(5), dayOfWeek: 'Sat', startTime: '10:00', endTime: '12:00', room: 'Main Hall', capacity: 20, fee: 1500, instituteSharePct: 25 },
    { name: 'Abacus — Level 1', programId: progByCode.IT._id.toString(), teacherId: T(7), dayOfWeek: 'Sun', startTime: '09:00', endTime: '10:30', room: 'Room D', capacity: 15, fee: 2200, instituteSharePct: 25 },
  ]
  const classes = await Class.insertMany(classDocs)
  console.log('[seed] classes:', classes.length)

  // Class enrollments (subset per class, respecting capacity)
  const classEnrollDocs: any[] = []
  for (const c of classes) {
    const n = randInt(5, Math.min(12, c.capacity))
    const members = pick(activeStudents, n)
    for (const s of members) {
      classEnrollDocs.push({
        studentId: s._id.toString(),
        programId: c.programId,
        classId: c._id.toString(),
        enrolledAt: new Date(2025, randInt(0, 8), randInt(1, 28)),
        status: 'Active',
        grade: null,
      })
    }
  }
  await Enrollment.insertMany(classEnrollDocs)

  // ── Attendance (last ~9 weeks, timetable-aware) ─────────────────────────
  const attendanceDocs: any[] = []
  const today = new Date()
  for (let dayBack = 60; dayBack >= 0; dayBack--) {
    const d = new Date(today)
    d.setDate(d.getDate() - dayBack)
    const dow = d.getDay()
    if (dow === 0) continue                      // Sundays off
    const isSaturday = dow === 6
    if (dayBack === 0 && Math.random() < 0.5) continue

    for (const s of activeStudents) {
      if (isSaturday) {
        const inSatClass = classEnrollDocs.some(
          (e) => e.studentId === s._id.toString() &&
            ['Thu', 'Sat', 'Sun', 'Wed', 'Fri'].includes(
              classes.find((c) => c._id.toString() === e.classId)?.dayOfWeek || '',
            ),
        )
        if (!inSatClass || Math.random() < 0.5) continue
      } else if (Math.random() < 0.12) {
        continue
      }

      const expected = resolveExpectedFor(
        'Student',
        s._id.toString(),
        d,
        classes,
        classEnrollDocs,
        studentProgramIds.get(s._id.toString()) ?? [],
      )

      const r = Math.random()
      const status = r < 0.82 ? 'Present' : r < 0.9 ? 'Late' : r < 0.96 ? 'Absent' : 'Leave'

      let checkIn: Date | null = null
      let checkOut: Date | null = null
      if (status !== 'Absent' && status !== 'Leave') {
        const baseIn = expected.expectedStart ?? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 30)
        const offsetMin = status === 'Late' ? randInt(5, 25) : -randInt(0, 9)
        checkIn = new Date(baseIn.getTime() + offsetMin * 60_000)

        const baseOut = expected.expectedEnd ?? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 15, 30)
        const outRand = Math.random()
        if (outRand < 0.05) checkOut = new Date(baseOut.getTime() - randInt(5, 20) * 60_000)
        else if (outRand < 0.15) checkOut = new Date(baseOut.getTime() + randInt(5, 30) * 60_000)
        else checkOut = new Date(baseOut.getTime() + randInt(-3, 3) * 60_000)
      }

      const flags = computeFlagsLocal(checkIn, checkOut, expected)

      attendanceDocs.push({
        personType: 'Student',
        personId: s._id.toString(),
        personRef: s.studentId,
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0),
        checkIn,
        checkOut,
        method: rand(['Barcode', 'Barcode', 'Manual']),
        status,
        note: status === 'Leave' ? 'Family event' : null,
        expectedStart: expected.expectedStart,
        expectedEnd: expected.expectedEnd,
        lateMinutes: flags.lateMinutes,
        earlyMinutes: flags.earlyMinutes,
        lateCheckoutMinutes: flags.lateCheckoutMinutes,
      })
    }

    for (const t of teachers) {
      if (t.status === 'On Leave' && Math.random() < 0.8) continue
      if (isSaturday && Math.random() < 0.6) continue

      const expected = resolveExpectedFor(
        'Teacher',
        t._id.toString(),
        d,
        classes,
        classEnrollDocs,
        [],
      )

      const r = Math.random()
      const status = r < 0.88 ? 'Present' : r < 0.95 ? 'Late' : r < 0.98 ? 'Absent' : 'Leave'
      const hasTimes = status === 'Present' || status === 'Late'

      let checkIn: Date | null = null
      let checkOut: Date | null = null
      if (hasTimes) {
        const baseIn = expected.expectedStart ?? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0)
        const offsetMin = status === 'Late' ? randInt(5, 20) : -randInt(0, 12)
        checkIn = new Date(baseIn.getTime() + offsetMin * 60_000)

        const baseOut = expected.expectedEnd ?? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 15, 0)
        checkOut = new Date(baseOut.getTime() + randInt(-5, 10) * 60_000)
      }
      const flags = computeFlagsLocal(checkIn, checkOut, expected)

      attendanceDocs.push({
        personType: 'Teacher',
        personId: t._id.toString(),
        personRef: t.teacherId,
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0),
        checkIn,
        checkOut,
        method: rand(['Fingerprint', 'Fingerprint', 'Manual']),
        status,
        note: null,
        expectedStart: expected.expectedStart,
        expectedEnd: expected.expectedEnd,
        lateMinutes: flags.lateMinutes,
        earlyMinutes: flags.earlyMinutes,
        lateCheckoutMinutes: flags.lateCheckoutMinutes,
      })
    }
  }
  await Attendance.insertMany(attendanceDocs)
  console.log('[seed] attendance:', attendanceDocs.length, '(timetable-aware)')

  // ── Payments: last month (settled) + current month (mixed) ──────────────
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`

  let seq = 1
  const nextReceipt = () => `SAN-${now.getFullYear()}-${String(seq++).padStart(4, '0')}`

  const paymentDocs: any[] = []
  for (const month of [lastMonth, thisMonth]) {
    const isCurrent = month === thisMonth
    for (const s of activeStudents) {
      const codes = enrollmentsByStudent.get(s._id.toString()) || []
      if (codes.length === 0) continue
      const grades = studentGrades.get(s._id.toString()) ?? {}
      const items = codes.map((code) => {
        const prog = progByCode[code]
        const g = grades[code]
        const desc = g ? `${prog.name} · ${g}` : prog.name
        return { programId: prog._id.toString(), amount: prog.monthlyFee, description: desc }
      })
      const amount = items.reduce((sum, it) => sum + it.amount, 0)

      let paidAmount = 0
      let status = 'Pending'
      let paidDate: Date | null = null
      if (!isCurrent) {
        paidAmount = amount
        status = 'Paid'
        paidDate = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), randInt(1, 10))
      } else {
        const r = Math.random()
        if (r < 0.55) { paidAmount = amount; status = 'Paid'; paidDate = new Date(now.getFullYear(), now.getMonth(), randInt(1, Math.max(1, now.getDate()))) }
        else if (r < 0.7) { paidAmount = Math.round(amount * 0.5); status = 'Partial'; paidDate = new Date(now.getFullYear(), now.getMonth(), randInt(1, Math.max(1, now.getDate()))) }
        else if (r < 0.85) { paidAmount = 0; status = 'Pending' }
        else { paidAmount = 0; status = 'Overdue' }
      }

      paymentDocs.push({
        studentId: s._id.toString(),
        programId: items.length === 1 ? items[0].programId : null,
        month,
        amount,
        paidAmount,
        method: rand(['Cash', 'Cash', 'Bank', 'Card']),
        status,
        paidDate,
        dueDate: new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]) - 1, 10, 23, 59, 59),
        note: `Monthly bill for ${month}`,
        receiptNo: nextReceipt(),
        items,
      })
    }
  }
  const payments = await Payment.insertMany(paymentDocs)
  const multiCount = paymentDocs.filter((p) => p.items.length > 1).length
  console.log('[seed] payments:', payments.length, `(${multiCount} multi-programme bills)`)

  // ── Payroll: last month paid, current month pending ─────────────────────
  const payrollDocs: any[] = []
  for (const month of [lastMonth, thisMonth]) {
    const isCurrent = month === thisMonth
    for (const t of teachers) {
      const b = Math.max(0, t.basicSalary || 0)
      const a = Math.max(0, t.allowances || 0)
      const gross = b + a
      const epfEmployee = b * 0.08
      const netSalary = gross - epfEmployee
      const epfEmployer = b * 0.12
      const etfEmployer = b * 0.03
      const employerCost = gross + epfEmployer + etfEmployer
      const rateOnlyExternal = t.type === 'External' && b <= 0 && (t.monthlyRate || 0) > 0
      const grossR = rateOnlyExternal ? t.monthlyRate : gross
      payrollDocs.push({
        teacherId: t._id.toString(),
        month,
        basicSalary: rateOnlyExternal ? t.monthlyRate : b,
        allowances: rateOnlyExternal ? 0 : a,
        gross: grossR,
        epfEmployee: rateOnlyExternal ? 0 : round2(epfEmployee),
        netSalary: rateOnlyExternal ? t.monthlyRate : round2(netSalary),
        epfEmployer: rateOnlyExternal ? 0 : round2(epfEmployer),
        etfEmployer: rateOnlyExternal ? 0 : round2(etfEmployer),
        employerCost: rateOnlyExternal ? t.monthlyRate : round2(employerCost),
        status: isCurrent ? 'Pending' : 'Paid',
        method: rand(['Bank', 'Cash']),
        paidDate: isCurrent ? null : new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), 25),
        note: null,
      })
    }
  }
  const payroll = await PayrollRecord.insertMany(payrollDocs)
  console.log('[seed] payroll records:', payroll.length)

  // ── Expenses ─────────────────────────────────────────────────────────────
  const expenseDefs = [
    { category: 'Rent', description: 'Building rent — September', vendor: 'Lanka Properties', amount: 85000 },
    { category: 'Utilities', description: 'CEB electricity bill', vendor: 'CEB', amount: 23400 },
    { category: 'Utilities', description: 'Water board — monthly', vendor: 'NWSDB', amount: 4800 },
    { category: 'Supplies', description: 'Art & craft materials', vendor: 'Kidz Station', amount: 12750 },
    { category: 'Transport', description: 'School van diesel', vendor: 'Ceypetco', amount: 18000 },
    { category: 'Maintenance', description: 'Playground repainting', vendor: 'FixIt Lanka', amount: 31000 },
    { category: 'Internet & Phone', description: 'Fibre broadband', vendor: 'SLT', amount: 6500 },
    { category: 'Stationery', description: 'Report card printing', vendor: 'Gunaratne Printers', amount: 9200 },
  ]
  const expenseDocs = expenseDefs.map((e, i) => ({
    date: new Date(now.getFullYear(), now.getMonth(), randInt(1, Math.max(1, Math.min(now.getDate(), 28)))),
    category: e.category,
    description: e.description,
    amount: e.amount,
    method: rand(['Cash', 'Bank', 'Card']),
    vendor: e.vendor,
    status: i === 1 || i === 5 ? 'Pending' : 'Approved',
    reviewedAt: i === 1 || i === 5 ? null : new Date(now.getFullYear(), now.getMonth(), 2),
    reviewedBy: i === 1 || i === 5 ? null : 'Administrator',
  }))
  const expenses = await Expense.insertMany(expenseDocs)
  console.log('[seed] expenses:', expenses.length)

  // ── Announcements ────────────────────────────────────────────────────────
  const announcements = await Announcement.insertMany([
    { title: 'Annual Sports Meet 2026', body: 'Our Annual Sports Meet will be held at the school grounds on the last Friday of this month. All parents are warmly invited. Children should wear their house colours.', category: 'Event', audience: 'All', priority: 'High', pinned: true, publishDate: new Date(now.getTime() - 2 * 86400000), authorName: 'Administration' },
    { title: 'Fee Payment Reminder', body: "Kindly settle this month's tuition fees before the 10th. Payments are accepted at the accounts desk (Cash/Card) or via bank transfer.", category: 'Payment', audience: 'Parents', priority: 'Normal', publishDate: new Date(now.getTime() - 4 * 86400000), authorName: 'Accounts' },
    { title: 'Vehicle Parade Holiday', body: 'The institute will remain closed on the day of the municipal procession. A makeup class schedule will be shared via WhatsApp.', category: 'Holiday', audience: 'All', priority: 'High', publishDate: new Date(now.getTime() - 6 * 86400000), authorName: 'Administration' },
    { title: 'Staff Meeting — Curriculum Review', body: 'All teaching staff: curriculum review meeting this Wednesday at 1:30 PM in the staff room.', category: 'Meeting', audience: 'Teachers', priority: 'Normal', publishDate: new Date(now.getTime() - 7 * 86400000), authorName: 'Principal' },
    { title: 'New IT Lab Computers', body: 'Ten new computers are now live in the IT Lab. Coding Club members get first access this term.', category: 'General', audience: 'All', priority: 'Low', publishDate: new Date(now.getTime() - 10 * 86400000), authorName: 'IT Coordinator' },
    { title: 'Elocution Exam Registrations', body: 'Trinity College exam registrations close at the end of this month. Please hand completed forms to the front desk.', category: 'Event', audience: 'Parents', priority: 'Normal', publishDate: new Date(now.getTime() - 12 * 86400000), authorName: 'Elocution Dept' },
  ])
  console.log('[seed] announcements:', announcements.length)

  // ── Settings ─────────────────────────────────────────────────────────────
  const settings = await Setting.insertMany([
    { key: 'school_name', value: 'SANOMIN International Preschool' },
    { key: 'school_address', value: 'No. 42, Temple Road, Kandy' },
    { key: 'school_phone', value: '081 234 5678' },
    { key: 'school_email', value: 'info@sanomin.lk' },
    { key: 'late_grace_minutes', value: String(GRACE_MINUTES) },
    {
      key: 'expense_budgets',
      value: JSON.stringify({ Rent: 85000, Utilities: 32000, Supplies: 20000, Transport: 25000, Maintenance: 40000 }),
    },
    {
      key: 'expense_templates',
      value: JSON.stringify([
        { id: 'rent', name: 'Building rent', category: 'Rent', amount: 85000, vendor: 'Lanka Properties', method: 'Bank', day: 1, active: true },
        { id: 'ceb', name: 'CEB electricity bill', category: 'Utilities', amount: 23000, vendor: 'CEB', method: 'Bank', day: 5, active: true },
        { id: 'slt', name: 'Fibre broadband', category: 'Internet & Phone', amount: 6500, vendor: 'SLT', method: 'Card', day: 8, active: true },
      ]),
    },
  ])
  console.log('[seed] settings:', settings.length)

  // ── Summary ──────────────────────────────────────────────────────────────
  const byStudentYear: Record<string, number> = {}
  for (const s of students) {
    const m = /^S(\d{2})/.exec(s.studentId)
    const yy = m ? m[1] : '?'
    byStudentYear[yy] = (byStudentYear[yy] ?? 0) + 1
  }
  const byTeacherType: Record<string, number> = {}
  for (const t of teachers) {
    const type = t.type === 'Internal' ? 'I' : 'E'
    byTeacherType[type] = (byTeacherType[type] ?? 0) + 1
  }

  // Category counts (using Programme.category, not code)
  const catById = new Map(programDocs.map((p) => [p._id.toString(), p.category]))
  const catsByStudent = new Map<string, Set<string>>()
  for (const e of enrollmentDocs) {
    const cat = catById.get(e.programId)
    if (!cat) continue
    if (!catsByStudent.has(e.studentId)) catsByStudent.set(e.studentId, new Set())
    catsByStudent.get(e.studentId)!.add(cat)
  }
  const catCounts = { all: 0, preschool: 0, daycare: 0, tuition: 0 }
  for (const cats of catsByStudent.values()) {
    catCounts.all++
    if (cats.has('Preschool')) catCounts.preschool++
    else if (cats.has('Daycare')) catCounts.daycare++
    else catCounts.tuition++
  }

  const gradedEnrollCount = enrollmentDocs.filter((e) => e.grade != null).length
  const lateCount = attendanceDocs.filter((a) => a.lateMinutes != null && a.lateMinutes > 0).length
  const earlyOutCount = attendanceDocs.filter((a) => a.lateCheckoutMinutes != null && a.lateCheckoutMinutes > 0).length

  console.log('\n[seed] ✅ Sample data inserted:',
    `\n  programs=${programDocs.length} students=${students.length} guardians=${guardians.length}`,
    `\n  teachers=${teachers.length} classes=${classes.length} enrollments=${enrollments.length + classEnrollDocs.length}`,
    `\n  attendance=${attendanceDocs.length} payments=${payments.length} payroll=${payroll.length}`,
    `\n  expenses=${expenses.length} announcements=${announcements.length} settings=${settings.length}`)
  console.log('  student IDs by year:', byStudentYear)
  console.log('  teacher IDs by type:', byTeacherType)
  console.log('  student categories:', catCounts)
  console.log('  graded enrollments (non-null grade):', gradedEnrollCount)
  console.log('  attendance late arrivals:', lateCount, '· late pickups:', earlyOutCount)

  await mongoose.disconnect()
  console.log('[seed] done.')
}

main().catch((e) => {
  console.error('[seed] FAILED:', e)
  process.exit(1)
})
