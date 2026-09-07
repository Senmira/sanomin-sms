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

// ─── GET /api/students/[id] — full student profile ──────────────────────────
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const student = await db.student.findUnique({
    where: { id },
    include: {
      guardians: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      enrollments: { include: { program: true } },
      _count: { select: { attendance: true } },
    },
  })
  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }
  return NextResponse.json(serialize(student))
}

interface GuardianInput {
  id?: string
  name?: string
  phone?: string
  address?: string
  email?: string
  relationship?: string
  occupation?: string
  isPrimary?: boolean
}

interface UpdateBody {
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

// ─── PUT /api/students/[id] — update + sync guardians + enrollments ────────
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  let body: UpdateBody
  try {
    body = (await req.json()) as UpdateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await db.student.findUnique({ where: { id }, select: { id: true } })
  if (!existing) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  if (body.fullName !== undefined && !body.fullName.trim()) {
    return NextResponse.json({ error: 'fullName cannot be empty' }, { status: 400 })
  }
  if (body.gender !== undefined && !body.gender.trim()) {
    return NextResponse.json({ error: 'gender cannot be empty' }, { status: 400 })
  }

  // Validate program codes if provided
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
    // Build dynamic update object — only set fields that are explicitly provided
    const data: Prisma.StudentUpdateInput = {}
    if (body.fullName !== undefined) data.fullName = body.fullName.trim()
    if (body.gender !== undefined) data.gender = body.gender
    if (body.indexNo !== undefined) data.indexNo = body.indexNo?.trim() || null
    if (body.dob !== undefined) data.dob = parseDate(body.dob)
    if (body.ageGroup !== undefined) data.ageGroup = body.ageGroup || null
    if (body.admissionDate !== undefined)
      data.admissionDate = parseDate(body.admissionDate)
    if (body.religion !== undefined) data.religion = body.religion || null
    if (body.nationality !== undefined) data.nationality = body.nationality || null
    if (body.previousSchool !== undefined)
      data.previousSchool = body.previousSchool || null
    if (body.photoUrl !== undefined) data.photoUrl = body.photoUrl || null
    if (body.status !== undefined) data.status = body.status
    if (body.medicalNotes !== undefined)
      data.medicalNotes = body.medicalNotes || null

    // Sync guardians: simplest correct strategy — delete existing, create new from payload.
    // (Guardian rows don't have foreign references from elsewhere, so safe to replace.)
    if (body.guardians !== undefined) {
      const newGuardians = body.guardians
        .filter((g) => g && g.name && g.name.trim())
        .map((g, idx) => ({
          name: g!.name!.trim(),
          phone: (g!.phone || '').trim() || 'N/A',
          address: g!.address || null,
          email: g!.email || null,
          relationship: g!.relationship || 'Guardian',
          occupation: g!.occupation || null,
          isPrimary: g!.isPrimary ?? idx === 0,
        }))
      data.guardians = {
        deleteMany: {},
        create: newGuardians,
      }
    }

    // Sync enrollments: replace based on new program code set.
    if (body.programCodes !== undefined) {
      data.enrollments = {
        deleteMany: {},
        create: programs.map((p) => ({ programId: p.id, status: 'Active' })),
      }
    }

    const updated = await db.student.update({
      where: { id },
      data,
      include: {
        guardians: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        enrollments: { include: { program: true } },
        _count: { select: { attendance: true } },
      },
    })
    return NextResponse.json(serialize(updated))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update student'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/students/[id] — cascade (Prisma onDelete: Cascade) ─────────
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const existing = await db.student.findUnique({
    where: { id },
    select: { id: true, fullName: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }
  try {
    // Guardian / Enrollment / Attendance rows cascade via Prisma schema
    await db.student.delete({ where: { id } })
    return NextResponse.json({ ok: true, id, fullName: existing.fullName })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete student'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
