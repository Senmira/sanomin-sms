import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/attendance/trend — returns 7-day sparkline data for stat cards
export async function GET() {
  const days: { date: string; students: number; teachers: number; late: number }[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dEnd = new Date(d)
    dEnd.setHours(23, 59, 59, 999)
    const [st, te, lt] = await Promise.all([
      db.attendance.count({ where: { personType: 'Student', date: { gte: d, lte: dEnd } } }),
      db.attendance.count({ where: { personType: 'Teacher', date: { gte: d, lte: dEnd } } }),
      db.attendance.count({ where: { status: 'Late', date: { gte: d, lte: dEnd } } }),
    ])
    days.push({
      date: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      students: st,
      teachers: te,
      late: lt,
    })
  }
  return NextResponse.json({ trend: days })
}
