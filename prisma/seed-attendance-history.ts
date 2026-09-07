// Seed ~14 days of historical attendance so dashboard charts have real data.
// Run: bun run prisma/seed-attendance-history.ts
import { db } from '../src/lib/db'

const DOW_FULL: Record<string, string> = {
  Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat', Sun: 'Sun',
}

function dow(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' })
}

async function main() {
  console.log('Seeding 14 days of historical attendance...')
  const students = await db.student.findMany({ where: { status: 'Active' }, select: { id: true, studentId: true } })
  const teachers = await db.teacher.findMany({ where: { status: 'Active' }, select: { id: true, teacherId: true } })
  console.log(`students=${students.length} teachers=${teachers.length}`)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let created = 0

  for (let i = 14; i >= 1; i--) {
    const day = new Date(today)
    day.setDate(day.getDate() - i)
    const wd = dow(day)
    // Weekend (Sun) — minimal attendance (daycare only, ~30% of students)
    const isWeekend = wd === 'Sun'
    const studentRatio = isWeekend ? 0.25 : 0.8 + (Math.random() * 0.15 - 0.075)
    const teacherRatio = isWeekend ? 0.3 : 0.85

    const studentCount = Math.round(students.length * studentRatio)
    const teacherCount = Math.round(teachers.length * teacherRatio)

    // shuffle + take subset
    const dayStudents = [...students].sort(() => Math.random() - 0.5).slice(0, studentCount)
    const dayTeachers = [...teachers].sort(() => Math.random() - 0.5).slice(0, teacherCount)

    for (const s of dayStudents) {
      // 10% absent, 12% late
      const r = Math.random()
      const status = r < 0.1 ? 'Absent' : r < 0.22 ? 'Late' : 'Present'
      if (status === 'Absent') {
        await db.attendance.create({
          data: {
            personType: 'Student', personId: s.id, personRef: s.studentId,
            date: day, method: 'Manual', status: 'Absent', note: 'Absent',
          },
        }).catch(() => null)
        continue
      }
      const checkIn = new Date(day)
      const late = status === 'Late'
      checkIn.setHours(late ? 9 : 8, late ? Math.floor(Math.random() * 30) + 5 : Math.floor(Math.random() * 25), 0, 0)
      const checkOut = new Date(day)
      checkOut.setHours(12 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 50), 0, 0)
      await db.attendance.create({
        data: {
          personType: 'Student', personId: s.id, personRef: s.studentId,
          date: day, checkIn, checkOut, method: Math.random() < 0.85 ? 'Barcode' : 'Manual',
          status,
        },
      }).catch(() => null)
      created++
    }

    for (const t of dayTeachers) {
      const checkIn = new Date(day)
      checkIn.setHours(7, 30 + Math.floor(Math.random() * 30), 0, 0)
      const checkOut = new Date(day)
      checkOut.setHours(15 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 50), 0, 0)
      await db.attendance.create({
        data: {
          personType: 'Teacher', personId: t.id, personRef: t.teacherId,
          date: day, checkIn, checkOut, method: 'Fingerprint', status: 'Present',
        },
      }).catch(() => null)
      created++
    }
  }
  console.log(`Created ~${created} historical attendance records (14 days).`)
  console.log('Done.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
