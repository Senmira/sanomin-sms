import { db } from '../src/lib/db'
import studentData from './students.json'

// Normalize messy nationality values
function normalizeNationality(n?: string): string {
  if (!n) return 'Sri Lankan'
  const v = n.trim()
  if (['S', 'I', 'T', 'C'].includes(v)) {
    return { S: 'Sri Lankan', I: 'Indian', T: 'Tamil', C: 'Christian' }[v] as string
  }
  if (['Jayamina Fonseka', 'Nagarjuna'].includes(v)) return 'Sri Lankan'
  if (v.toLowerCase().includes('sinhala')) return 'Sinhalese'
  return v
}

function fmtDate(d?: string): Date | null {
  if (!d || d === '-' || d === '') return null
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? null : dt
}

async function main() {
  console.log('Seeding SANOMIN database...')

  // 1) Programs
  const programs = [
    { code: 'PRESCHOOL', name: 'Preschool', color: '#1e40af', monthlyFee: 4500, description: 'Core preschool curriculum (Play Group, Nursery, Kindergarten)' },
    { code: 'Daycare', name: 'Daycare', color: '#7c3aed', monthlyFee: 6000, description: 'Full-day daycare and child minding' },
    { code: 'IT', name: 'IT / Computer', color: '#dc2626', monthlyFee: 1500, description: 'Introductory computer & IT skills' },
    { code: 'Elocution', name: 'Elocution', color: '#0d9488', monthlyFee: 2000, description: 'Spoken English & speech training' },
    { code: 'Dancing', name: 'Dancing', color: '#d97706', monthlyFee: 1800, description: 'Kandyan & modern dancing' },
  ]
  for (const p of programs) {
    await db.program.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    })
  }
  console.log(`✓ ${programs.length} programs`)

  // 2) Teachers — internal staff + external tuition teachers
  const teachers = [
    { teacherId: 'T001', fingerprintId: 'FP-1001', fullName: 'Mrs. Kumari Jayawardena', type: 'Internal', gender: 'Female', phone: '0771234567', email: 'kumari@sanomin.lk', qualification: 'Dip. in Early Childhood', specialization: 'Preschool,Daycare', hireDate: new Date('2023-01-15'), monthlyRate: 0 },
    { teacherId: 'T002', fingerprintId: 'FP-1002', fullName: 'Mr. Samantha Perera', type: 'Internal', gender: 'Male', phone: '0772345678', email: 'samantha@sanomin.lk', qualification: 'B.A. (Edu)', specialization: 'Preschool', hireDate: new Date('2023-03-01'), monthlyRate: 0 },
    { teacherId: 'T003', fingerprintId: 'FP-1003', fullName: 'Ms. Dilani Fonseka', type: 'Internal', gender: 'Female', phone: '0773456789', email: 'dilani@sanomin.lk', qualification: 'Dip. Montessori', specialization: 'Daycare', hireDate: new Date('2023-06-10'), monthlyRate: 0 },
    { teacherId: 'T004', fingerprintId: 'FP-1004', fullName: 'Mr. Ravi Bandara', type: 'External', gender: 'Male', phone: '0711112233', email: 'ravi.it@gmail.com', qualification: 'B.Sc IT', specialization: 'IT', hireDate: new Date('2024-01-20'), monthlyRate: 8000 },
    { teacherId: 'T005', fingerprintId: 'FP-1005', fullName: 'Ms. Anne Roberts', type: 'External', gender: 'Female', phone: '0722223344', email: 'anne.elocution@gmail.com', qualification: 'Trinity Grade 8', specialization: 'Elocution', hireDate: new Date('2024-02-01'), monthlyRate: 10000 },
    { teacherId: 'T006', fingerprintId: 'FP-1006', fullName: 'Mr. Kasun Nilantha', type: 'External', gender: 'Male', phone: '0733334455', email: 'kasun.dance@gmail.com', qualification: 'Dip. Kandyan Dance', specialization: 'Dancing', hireDate: new Date('2024-02-15'), monthlyRate: 9000 },
    { teacherId: 'T007', fingerprintId: 'FP-1007', fullName: 'Mrs. Nadeesha Silva', type: 'Internal', gender: 'Female', phone: '0744445566', email: 'nadeesha@sanomin.lk', qualification: 'B.Ed', specialization: 'Preschool,Daycare', hireDate: new Date('2024-04-01'), monthlyRate: 0 },
  ]
  for (const t of teachers) {
    await db.teacher.upsert({
      where: { teacherId: t.teacherId },
      update: {},
      create: t,
    })
  }
  console.log(`✓ ${teachers.length} teachers`)

  // 3) Students + guardians + enrollments
  let studentCount = 0
  for (const s of studentData as any[]) {
    const barcode = `SAN${s.id}` // e.g. SANP24001
    const student = await db.student.upsert({
      where: { studentId: s.id },
      update: {},
      create: {
        studentId: s.id,
        indexNo: s.indexNo,
        barcode,
        fullName: s.fullName,
        gender: s.gender,
        dob: fmtDate(s.dob),
        ageGroup: s.ageGroup,
        admissionDate: fmtDate(s.admissionDate),
        religion: s.religion,
        nationality: normalizeNationality(s.nationality),
        previousSchool: s.previous_school && s.previous_school !== '-' ? s.previous_school : null,
        status: 'Active',
      },
    })

    // guardians
    for (const g of s.guardians || []) {
      if (!g.name) continue
      await db.guardian.upsert({
        where: { id: `${student.id}-g0` },
        update: {},
        create: {
          id: `${student.id}-g0`,
          studentId: student.id,
          name: g.name,
          phone: g.phone || 'N/A',
          address: g.address,
          relationship: g.relationship || 'Guardian',
          isPrimary: true,
        },
      })
    }

    // enrollments
    for (const code of s.enrolledPrograms || []) {
      const program = await db.program.findUnique({ where: { code } })
      if (!program) continue
      await db.enrollment.upsert({
        where: { id: `${student.id}-${program.id}` },
        update: {},
        create: {
          id: `${student.id}-${program.id}`,
          studentId: student.id,
          programId: program.id,
          status: 'Active',
        },
      })
    }
    studentCount++
  }
  console.log(`✓ ${studentCount} students`)

  // 4) Classes (tuition sessions for external teachers)
  const classes = [
    { name: 'IT Basics — Beginners', programCode: 'IT', teacherId: 'T004', dayOfWeek: 'Sat', startTime: '09:00', endTime: '10:30', room: 'IT Lab', capacity: 15, fee: 1500 },
    { name: 'Elocution — Speech & Drama', programCode: 'Elocution', teacherId: 'T005', dayOfWeek: 'Wed', startTime: '15:00', endTime: '16:30', room: 'Hall A', capacity: 12, fee: 2000 },
    { name: 'Kandyan Dancing', programCode: 'Dancing', teacherId: 'T006', dayOfWeek: 'Fri', startTime: '15:30', endTime: '17:00', room: 'Dance Studio', capacity: 18, fee: 1800 },
    { name: 'Elocution — Senior', programCode: 'Elocution', teacherId: 'T005', dayOfWeek: 'Sat', startTime: '10:00', endTime: '11:30', room: 'Hall A', capacity: 12, fee: 2200 },
    { name: 'IT — Advanced', programCode: 'IT', teacherId: 'T004', dayOfWeek: 'Sun', startTime: '09:00', endTime: '11:00', room: 'IT Lab', capacity: 12, fee: 1800 },
  ]
  for (const c of classes) {
    const program = await db.program.findUnique({ where: { code: c.programCode } })
    const teacher = await db.teacher.findUnique({ where: { teacherId: c.teacherId } })
    await db.class.create({
      data: {
        name: c.name,
        programId: program?.id,
        teacherId: teacher?.id,
        dayOfWeek: c.dayOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        room: c.room,
        capacity: c.capacity,
        fee: c.fee,
        active: true,
      },
    }).catch(() => null)
  }
  console.log(`✓ ${classes.length} classes`)

  // 5) Settings
  const settings = [
    { id: 'school_name', key: 'school_name', value: 'SANOMIN International Preschool' },
    { id: 'school_address', key: 'school_address', value: 'Angoda, Colombo, Sri Lanka' },
    { id: 'school_phone', key: 'school_phone', value: '+94 11 234 5678' },
    { id: 'school_email', key: 'school_email', value: 'info@sanomin.lk' },
    { id: 'barcode_prefix', key: 'barcode_prefix', value: 'SAN' },
    { id: 'barcode_enabled', key: 'barcode_enabled', value: 'true' },
    { id: 'fingerprint_enabled', key: 'fingerprint_enabled', value: 'true' },
    { id: 'checkin_grace_minutes', key: 'checkin_grace_minutes', value: '15' },
    { id: 'academic_year', key: 'academic_year', value: '2025' },
  ]
  for (const s of settings) {
    await db.setting.upsert({ where: { key: s.key }, update: {}, create: s })
  }
  console.log(`✓ ${settings.length} settings`)

  // 6) Sample attendance for today (a few students + teachers)
  const today = new Date()
  const someStudents = await db.student.findMany({ take: 12 })
  for (const st of someStudents) {
    const checkIn = new Date(today)
    checkIn.setHours(8, Math.floor(Math.random() * 30), 0, 0)
    await db.attendance.create({
      data: {
        personType: 'Student',
        personId: st.id,
        personRef: st.studentId,
        date: today,
        checkIn,
        method: 'Barcode',
        status: 'Present',
      },
    }).catch(() => null)
  }
  const someTeachers = await db.teacher.findMany({ take: 4 })
  for (const t of someTeachers) {
    const checkIn = new Date(today)
    checkIn.setHours(7, 45, 0, 0)
    await db.attendance.create({
      data: {
        personType: 'Teacher',
        personId: t.id,
        personRef: t.teacherId,
        date: today,
        checkIn,
        method: 'Fingerprint',
        status: 'Present',
      },
    }).catch(() => null)
  }
  console.log('✓ sample attendance')

  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
