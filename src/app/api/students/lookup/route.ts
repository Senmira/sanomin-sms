import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

type StudentWithRelations = Prisma.StudentGetPayload<{
  include: {
    guardians: true
    enrollments: { include: { program: true } }
    _count: { select: { attendance: true } }
  }
}>

function serialize(s: StudentWithRelations) {
  return {
    id: s.id,
    studentId: s.studentId,
    indexNo: s.indexNo,
    barcode: s.barcode,
    fullName: s.fullName,
    gender: s.gender,
    dob: s.dob ? s.dob.toISOString() : null,
    ageGroup: s.ageGroup,
    admissionDate: s.admissionDate ? s.admissionDate.toISOString() : null,
    religion: s.religion,
    nationality: s.nationality,
    previousSchool: s.previousSchool,
    photoUrl: s.photoUrl,
    status: s.status,
    medicalNotes: s.medicalNotes,
    guardians: s.guardians.map((g) => ({
      id: g.id,
      name: g.name,
      phone: g.phone,
      address: g.address,
      relationship: g.relationship,
      isPrimary: g.isPrimary,
    })),
    enrollments: s.enrollments.map((e) => ({
      id: e.id,
      program: e.program
        ? {
            id: e.program.id,
            code: e.program.code,
            name: e.program.name,
            color: e.program.color,
          }
        : null,
    })),
    _count: { attendance: s._count.attendance },
  }
}

// ─── GET /api/students/lookup?barcode=SANP24001 or ?studentId=P24001 ────────
// Fast lookup for the barcode scanner. Returns the student (or 404).
export async function GET(req: Request) {
  const url = new URL(req.url)
  const barcode = url.searchParams.get('barcode')?.trim()
  const studentId = url.searchParams.get('studentId')?.trim()

  if (!barcode && !studentId) {
    return NextResponse.json(
      { error: 'Provide either ?barcode= or ?studentId= query parameter' },
      { status: 400 },
    )
  }

  const where: Prisma.StudentWhereInput = {}
  if (barcode) where.barcode = barcode
  else if (studentId) where.studentId = studentId

  const student = await db.student.findFirst({
    where,
    include: {
      guardians: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      enrollments: { include: { program: true } },
      _count: { select: { attendance: true } },
    },
  })

  if (!student) {
    return NextResponse.json(
      { error: 'No student matches that barcode / ID' },
      { status: 404 },
    )
  }
  return NextResponse.json(serialize(student))
}
