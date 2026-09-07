import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/search?q=<query>
// Unified quick-search across students, teachers, payments, announcements.
// Returns grouped results, max 5 per entity. Designed for the topbar ⌘K palette.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ students: [], teachers: [], payments: [], announcements: [] })
  }

  const [students, teachers, payments, announcements] = await Promise.all([
    db.student.findMany({
      where: {
        OR: [
          { fullName: { contains: q } },
          { studentId: { contains: q } },
          { barcode: { contains: q } },
          { indexNo: { contains: q } },
        ],
      },
      take: 5,
      select: {
        id: true, studentId: true, fullName: true, gender: true,
        ageGroup: true, status: true, barcode: true,
        guardians: { select: { name: true, phone: true }, take: 1 },
      },
    }),
    db.teacher.findMany({
      where: {
        OR: [
          { fullName: { contains: q } },
          { teacherId: { contains: q } },
          { fingerprintId: { contains: q } },
          { phone: { contains: q } },
          { specialization: { contains: q } },
        ],
      },
      take: 5,
      select: {
        id: true, teacherId: true, fullName: true, type: true,
        status: true, specialization: true,
      },
    }),
    db.payment.findMany({
      where: {
        OR: [
          { receiptNo: { contains: q } },
          { student: { fullName: { contains: q } } },
          { student: { studentId: { contains: q } } },
        ],
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, receiptNo: true, month: true, amount: true,
        paidAmount: true, status: true,
        student: { select: { studentId: true, fullName: true } },
        program: { select: { code: true, name: true, color: true } },
      },
    }),
    db.announcement.findMany({
      where: {
        OR: [{ title: { contains: q } }, { body: { contains: q } }],
        status: 'Published',
      },
      take: 4,
      orderBy: [{ pinned: 'desc' }, { publishDate: 'desc' }],
      select: {
        id: true, title: true, category: true, audience: true,
        priority: true, pinned: true, publishDate: true,
      },
    }),
  ])

  return NextResponse.json({
    students: students.map((s) => ({
      id: s.id,
      studentId: s.studentId,
      fullName: s.fullName,
      gender: s.gender,
      ageGroup: s.ageGroup,
      status: s.status,
      barcode: s.barcode,
      guardianName: s.guardians[0]?.name ?? null,
      guardianPhone: s.guardians[0]?.phone ?? null,
    })),
    teachers: teachers.map((t) => ({
      id: t.id,
      teacherId: t.teacherId,
      fullName: t.fullName,
      type: t.type,
      status: t.status,
      specialization: t.specialization,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      month: p.month,
      amount: p.amount,
      paidAmount: p.paidAmount,
      status: p.status,
      studentId: p.student.studentId,
      studentName: p.student.fullName,
      programCode: p.program?.code ?? null,
      programColor: p.program?.color ?? null,
    })),
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      audience: a.audience,
      priority: a.priority,
      pinned: a.pinned,
      publishDate: a.publishDate.toISOString(),
    })),
  })
}
