import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Celebrations — upcoming birthdays & work anniversaries ─────────────────
// GET /api/celebrations?days=30
// Scans active students (dob → birthday) and working teachers (hireDate →
// work anniversary) and returns the next occurrence of each within the window,
// sorted by days until. Powers the dashboard "Celebrations" card.

interface Celebration {
  personType: 'Student' | 'Teacher'
  ref: string // studentId / teacherId
  name: string
  // Next occurrence (ISO midnight UTC), always within `days` of today
  date: string
  daysUntil: number // 0 = today
  // Birthdays: age the person is turning. Anniversaries: completed years.
  milestone: number | null
  kind: 'birthday' | 'anniversary'
  // Best WhatsApp contact for greetings — primary guardian for students,
  // the teacher's own phone for staff. null when no reachable phone on file.
  contact: { name: string; phone: string } | null
}

function todayUtc(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

// Next occurrence of a month/day anniversary on or after `from`.
function nextOccurrence(month: number, day: number, from: Date): Date {
  const y = from.getUTCFullYear()
  let d = new Date(Date.UTC(y, month - 1, day))
  if (d.getTime() < from.getTime()) d = new Date(Date.UTC(y + 1, month - 1, day))
  return d
}

function yearsBetween(from: Date, to: Date): number {
  let age = to.getUTCFullYear() - from.getUTCFullYear()
  const beforeBirthday =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate())
  if (beforeBirthday) age -= 1
  return age
}

function isReachablePhone(phone?: string | null): boolean {
  if (!phone) return false
  return phone.replace(/\D/g, '').length >= 9
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30))
  const today = todayUtc()
  const horizon = new Date(today.getTime() + days * 86_400_000)

  const [students, teachers] = await Promise.all([
    db.student.findMany({
      where: { status: 'Active', dob: { not: null } },
      select: {
        studentId: true,
        fullName: true,
        dob: true,
        photoUrl: true,
        guardians: { select: { name: true, phone: true, isPrimary: true } },
      },
    }),
    db.teacher.findMany({
      where: { status: { not: 'Inactive' }, hireDate: { not: null } },
      select: { teacherId: true, fullName: true, hireDate: true, photoUrl: true, phone: true },
    }),
  ])

  const out: Celebration[] = []

  for (const s of students) {
    if (!s.dob) continue
    const dob = s.dob
    const next = nextOccurrence(dob.getUTCMonth() + 1, dob.getUTCDate(), today)
    if (next.getTime() > horizon.getTime()) continue
    const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000)
    // Primary guardian first, then any guardian with a reachable phone
    const guardians = s.guardians || []
    const best =
      guardians.find((g) => g.isPrimary && isReachablePhone(g.phone)) ??
      guardians.find((g) => isReachablePhone(g.phone)) ??
      null
    out.push({
      personType: 'Student',
      ref: s.studentId,
      name: s.fullName,
      date: next.toISOString(),
      daysUntil,
      milestone: yearsBetween(dob, next),
      kind: 'birthday',
      contact: best ? { name: best.name, phone: best.phone } : null,
    })
  }

  for (const t of teachers) {
    if (!t.hireDate) continue
    const hire = t.hireDate
    // Skip hires in the future or on day one (nothing to celebrate yet)
    if (hire.getTime() >= today.getTime()) continue
    const next = nextOccurrence(hire.getUTCMonth() + 1, hire.getUTCDate(), today)
    if (next.getTime() > horizon.getTime()) continue
    const years = yearsBetween(hire, next)
    if (years < 1) continue
    const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000)
    out.push({
      personType: 'Teacher',
      ref: t.teacherId,
      name: t.fullName,
      date: next.toISOString(),
      daysUntil,
      milestone: years,
      kind: 'anniversary',
      contact: isReachablePhone(t.phone) ? { name: t.fullName, phone: t.phone as string } : null,
    })
  }

  out.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))

  const todayCount = out.filter((c) => c.daysUntil === 0).length

  return NextResponse.json({ days, todayCount, total: out.length, celebrations: out })
}
