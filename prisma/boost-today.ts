import { db } from '../src/lib/db'
async function main() {
  const today = new Date(); today.setHours(0,0,0,0)
  // remove old today records
  const end = new Date(today); end.setHours(23,59,59,999)
  await db.attendance.deleteMany({ where: { date: { gte: today, lte: end } } })
  const students = await db.student.findMany({ where: { status: 'Active' }, select: { id: true, studentId: true } })
  const teachers = await db.teacher.findMany({ where: { status: 'Active' }, select: { id: true, teacherId: true } })
  const dayStudents = students.sort(() => Math.random() - 0.5).slice(0, 38)
  for (const s of dayStudents) {
    const late = Math.random() < 0.12
    const checkIn = new Date(today)
    checkIn.setHours(late ? 9 : 8, late ? Math.floor(Math.random()*30)+5 : Math.floor(Math.random()*25), 0, 0)
    await db.attendance.create({ data: { personType:'Student', personId:s.id, personRef:s.studentId, date:today, checkIn, method:'Barcode', status: late?'Late':'Present' } }).catch(()=>null)
  }
  for (const t of teachers) {
    const checkIn = new Date(today); checkIn.setHours(7, 35+Math.floor(Math.random()*25), 0, 0)
    await db.attendance.create({ data: { personType:'Teacher', personId:t.id, personRef:t.teacherId, date:today, checkIn, method:'Fingerprint', status:'Present' } }).catch(()=>null)
  }
  console.log('today boosted')
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect())
