import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function isBlank(v: string | null | undefined): boolean {
  return !v || !v.trim()
}
function phoneLooksReal(raw: string | null | undefined): boolean {
  if (isBlank(raw)) return false
  const digits = raw!.replace(/\D/g, '')
  return digits.length >= 9 // "N/A", "-", "xxx" all fail
}

// ─── GET /api/data-quality ─────────────────────────────────────────────────
// One audit sweep across every record type: surfaces incomplete profiles so
// the office can fix them before they hurt (WhatsApp reminders fail, payslips
// miss EPF numbers, registers have unassigned teachers...).
export async function GET() {
  const [students, teachers, classes, enrollGroups] = await Promise.all([
    db.student.findMany({
      where: { status: 'Active' },
      select: {
        id: true,
        studentId: true,
        fullName: true,
        photoUrl: true,
        dob: true,
        guardians: { select: { name: true, phone: true, isPrimary: true } },
      },
      orderBy: { fullName: 'asc' },
    }),
    db.teacher.findMany({
      select: {
        id: true,
        teacherId: true,
        fullName: true,
        type: true,
        status: true,
        phone: true,
        email: true,
        nic: true,
        epfNo: true,
        qualification: true,
        _count: { select: { classes: true } },
      },
      orderBy: { fullName: 'asc' },
    }),
    db.class.findMany({
      select: {
        id: true,
        name: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        room: true,
        capacity: true,
        active: true,
        teacher: { select: { fullName: true } },
        program: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { name: 'asc' },
    }),
    db.enrollment.groupBy({
      by: ['classId'],
      where: { status: 'Active', classId: { not: null } },
      _count: { classId: true },
    }),
  ])

  // ── Students ────────────────────────────────────────────────────────────
  const noGuardianPhone = students
    .filter((s) => !s.guardians.some((g) => phoneLooksReal(g.phone)))
    .map((s) => ({ ref: s.studentId, name: s.fullName, detail: s.guardians.length === 0 ? 'No guardian on file' : 'Guardian phone missing/invalid' }))
  const noGuardian = students
    .filter((s) => s.guardians.length === 0)
    .map((s) => ({ ref: s.studentId, name: s.fullName, detail: 'Add at least one guardian' }))
  const noDob = students
    .filter((s) => !s.dob)
    .map((s) => ({ ref: s.studentId, name: s.fullName, detail: 'Date of birth missing' }))

  // ── Teachers (staff issues only matter for working staff) ───────────────
  const working = teachers.filter((t) => t.status !== 'Inactive')
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

  // ── Classes ─────────────────────────────────────────────────────────────
  const enrolledByClass = new Map<string, number>()
  for (const g of enrollGroups) if (g.classId) enrolledByClass.set(g.classId, g._count.classId)
  const cNoTeacher = classes
    .filter((c) => c.active && !c.teacher)
    .map((c) => ({
      ref: c.program?.name || '—',
      name: c.name,
      detail: 'No teacher assigned',
    }))
  const cNoSchedule = classes
    .filter((c) => c.active && (!c.dayOfWeek || !c.startTime))
    .map((c) => ({
      ref: c.program?.name || '—',
      name: c.name,
      detail: !c.dayOfWeek ? 'Day of week not set' : 'Start time not set',
    }))
  const cOverCapacity = classes
    .filter((c) => (enrolledByClass.get(c.id) || 0) > c.capacity)
    .map((c) => ({
      ref: c.program?.name || '—',
      name: c.name,
      detail: `${enrolledByClass.get(c.id)} enrolled · capacity ${c.capacity}`,
    }))

  const groups = [
    {
      key: 'student_phone',
      label: 'Students without a reachable guardian phone',
      scope: 'students' as const,
      severity: 'high' as const,
      hint: 'WhatsApp reminders and fee notices cannot reach these families.',
      count: noGuardianPhone.length,
      items: noGuardianPhone,
    },
    {
      key: 'student_guardian',
      label: 'Students with no guardian record',
      scope: 'students' as const,
      severity: 'high' as const,
      hint: 'Every child should have at least one emergency contact.',
      count: noGuardian.length,
      items: noGuardian,
    },
    {
      key: 'student_dob',
      label: 'Students missing date of birth',
      scope: 'students' as const,
      severity: 'low' as const,
      hint: 'Needed for age-group reporting and certificates.',
      count: noDob.length,
      items: noDob,
    },
    {
      key: 'teacher_phone',
      label: 'Teachers without a phone number',
      scope: 'teachers' as const,
      severity: 'medium' as const,
      hint: 'Staff cannot be contacted for substitution or emergencies.',
      count: tNoPhone.length,
      items: tNoPhone,
    },
    {
      key: 'teacher_epf',
      label: 'Internal staff missing EPF number',
      scope: 'teachers' as const,
      severity: 'high' as const,
      hint: 'EPF/ETF contributions cannot be filed without the number.',
      count: tNoEpf.length,
      items: tNoEpf,
    },
    {
      key: 'teacher_nic',
      label: 'Teachers missing NIC number',
      scope: 'teachers' as const,
      severity: 'medium' as const,
      hint: 'Required for statutory records.',
      count: tNoNic.length,
      items: tNoNic,
    },
    {
      key: 'teacher_qual',
      label: 'Teachers without recorded qualification',
      scope: 'teachers' as const,
      severity: 'low' as const,
      hint: 'Useful for profiles and parent communication.',
      count: tNoQual.length,
      items: tNoQual,
    },
    {
      key: 'class_teacher',
      label: 'Active classes without a teacher',
      scope: 'classes' as const,
      severity: 'high' as const,
      hint: 'Sessions cannot run and registers have no owner.',
      count: cNoTeacher.length,
      items: cNoTeacher,
    },
    {
      key: 'class_schedule',
      label: 'Active classes missing schedule details',
      scope: 'classes' as const,
      severity: 'medium' as const,
      hint: 'Timetable and register printouts need day + time.',
      count: cNoSchedule.length,
      items: cNoSchedule,
    },
    {
      key: 'class_capacity',
      label: 'Classes over capacity',
      scope: 'classes' as const,
      severity: 'medium' as const,
      hint: 'More active enrollments than the class capacity allows.',
      count: cOverCapacity.length,
      items: cOverCapacity,
    },
  ]

  const totalIssues = groups.reduce((s, g) => s + g.count, 0)
  const highIssues = groups.filter((g) => g.severity === 'high').reduce((s, g) => s + g.count, 0)

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    counts: {
      students: students.length,
      teachers: working.length,
      classes: classes.filter((c) => c.active).length,
      totalIssues,
      highIssues,
    },
    groups,
  })
}
