import { db } from '../src/lib/db'
async function main() {
  const classes = await db.class.findMany({ include: { program: { select: { code: true } } } })
  const students = await db.student.findMany({
    include: { enrollments: { include: { program: { select: { code: true } } } } },
    where: { status: 'Active' },
  })
  let created = 0
  for (const c of classes) {
    if (!c.program) continue
    // enroll students who have this program in their enrollments, randomly pick ~30-60%
    const eligible = students.filter(s => s.enrollments.some(e => e.program.code === c.program!.code))
    const count = Math.max(3, Math.round(eligible.length * (0.3 + Math.random() * 0.3)))
    const picked = eligible.sort(() => Math.random() - 0.5).slice(0, Math.min(count, c.capacity))
    for (const s of picked) {
      const exists = await db.enrollment.findFirst({ where: { studentId: s.id, classId: c.id } })
      if (exists) continue
      await db.enrollment.create({ data: { studentId: s.id, classId: c.id, status: 'Active' } }).catch(() => null)
      created++
    }
    console.log(`${c.name}: enrolled ${picked.length} students`)
  }
  console.log(`Created ${created} class enrollments`)
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect())
