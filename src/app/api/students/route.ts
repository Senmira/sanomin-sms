import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer: map a Prisma student (with relations) to StudentRow JSON ───
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

// ─── GET /api/students — list with filters ──────────────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() || ''
  const program = url.searchParams.get('program') || ''
  const ageGroup = url.searchParams.get('ageGroup') || ''
  const gender = url.searchParams.get('gender') || ''
  const status = url.searchParams.get('status') || ''
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20),
  )

  const where: Prisma.StudentWhereInput = {}
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { studentId: { contains: q } },
      { indexNo: { contains: q } },
      { barcode: { contains: q } },
    ]
  }
  if (ageGroup) where.ageGroup = ageGroup
  if (gender) where.gender = gender
  if (status) where.status = status
  if (program) {
    where.enrollments = { some: { program: { code: program } } }
  }

  // Start of current month — for "new this month" stat
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [total, rows, totalStudents, activeStudents, newThisMonth] =
    await Promise.all([
      db.student.count({ where }),
      db.student.findMany({
        where,
        include: {
          guardians: true,
          enrollments: { include: { program: true } },
          _count: { select: { attendance: true } },
        },
        orderBy: { studentId: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.student.count(), // unfiltered total
      db.student.count({ where: { status: 'Active' } }),
      db.student.count({
        where: {
          OR: [
            { admissionDate: { gte: monthStart } },
            { admissionDate: null, createdAt: { gte: monthStart } },
          ],
        },
      }),
    ])

  return NextResponse.json({
    data: rows.map(serialize),
    total,
    page,
    limit,
    stats: {
      totalStudents,
      activeStudents,
      newThisMonth,
      filteredCount: total,
    },
  })
}

// ─── POST /api/students — create with auto studentId + barcode ──────────────
interface GuardianInput {
  name?: string
  phone?: string
  address?: string
  email?: string
  relationship?: string
  occupation?: string
  isPrimary?: boolean
}

interface CreateBody {
  fullName?: string
  gender?: string
  dob?: string | null
  ageGroup?: string | null
  admissionDate?: string | null
  religion?: string | null
  nationality?: string | null
  previousSchool?: string | null
  photoUrl?: string | null
  status?: string
  medicalNotes?: string | null
  indexNo?: string | null
  guardians?: GuardianInput[]
  programCodes?: string[]
}

function parseDate(v?: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// Generate next studentId like P25001 from current year + max existing sequence
async function nextStudentId(): Promise<string> {
  const year2 = String(new Date().getFullYear()).slice(-2)
  const prefix = `P${year2}`
  const existing = await db.student.findMany({
    where: { studentId: { startsWith: prefix } },
    select: { studentId: true },
  })
  let max = 0
  for (const s of existing) {
    const num = parseInt(s.studentId.slice(prefix.length), 10)
    if (!isNaN(num) && num > max) max = num
  }
  const next = max + 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

export async function POST(req: Request) {
  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const fullName = body.fullName?.trim()
  const gender = body.gender?.trim()
  if (!fullName) {
    return NextResponse.json({ error: 'fullName is required' }, { status: 400 })
  }
  if (!gender) {
    return NextResponse.json({ error: 'gender is required' }, { status: 400 })
  }

  // Validate program codes (if provided) up front so we can fail fast
  const programCodes = (body.programCodes || []).filter(Boolean)
  const programs =
    programCodes.length > 0
      ? await db.program.findMany({ where: { code: { in: programCodes } } })
      : []
  if (programCodes.length > 0 && programs.length !== programCodes.length) {
    const found = new Set(programs.map((p) => p.code))
    const missing = programCodes.filter((c) => !found.has(c))
    return NextResponse.json(
      { error: `Unknown program codes: ${missing.join(', ')}` },
      { status: 400 },
    )
  }

  try {
    const studentId = await nextStudentId()
    const barcode = `SAN${studentId}`

    const created = await db.student.create({
      data: {
        studentId,
        barcode,
        fullName,
        gender,
        indexNo: body.indexNo?.trim() || null,
        dob: parseDate(body.dob),
        ageGroup: body.ageGroup || null,
        admissionDate: parseDate(body.admissionDate) || new Date(),
        religion: body.religion || null,
        nationality: body.nationality || null,
        previousSchool: body.previousSchool || null,
        photoUrl: body.photoUrl || null,
        status: body.status || 'Active',
        medicalNotes: body.medicalNotes || null,
        guardians: {
          create: (body.guardians || [])
            .filter((g) => g && g.name && g.name.trim())
            .map((g, idx) => ({
              name: g.name!.trim(),
              phone: (g.phone || '').trim() || 'N/A',
              address: g.address || null,
              email: g.email || null,
              relationship: g.relationship || 'Guardian',
              occupation: g.occupation || null,
              isPrimary: g.isPrimary ?? idx === 0,
            })),
        },
        enrollments:
          programs.length > 0
            ? { create: programs.map((p) => ({ programId: p.id, status: 'Active' })) }
            : undefined,
      },
      include: {
        guardians: true,
        enrollments: { include: { program: true } },
        _count: { select: { attendance: true } },
      },
    })

    return NextResponse.json(serialize(created), { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create student'
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: `DB error: ${err.message}` }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
