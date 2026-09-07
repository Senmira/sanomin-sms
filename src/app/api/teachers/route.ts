import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer: map a Prisma teacher (with relations) to TeacherRow JSON ───
type TeacherWithRelations = Prisma.TeacherGetPayload<{
  include: {
    classes: {
      select: {
        id: true
        name: true
        dayOfWeek: true
        startTime: true
      }
    }
    _count: { select: { classes: true, attendance: true } }
    attendance: {
      orderBy: { date: 'desc' }
      take: 1
      select: { date: true, checkIn: true }
    }
  }
}>

function serialize(t: TeacherWithRelations) {
  const lastAtt = t.attendance[0]
  return {
    id: t.id,
    teacherId: t.teacherId,
    fingerprintId: t.fingerprintId,
    fullName: t.fullName,
    type: t.type,
    gender: t.gender,
    phone: t.phone,
    email: t.email,
    address: t.address,
    nic: t.nic,
    qualification: t.qualification,
    specialization: t.specialization,
    photoUrl: t.photoUrl,
    status: t.status,
    hireDate: t.hireDate ? t.hireDate.toISOString() : null,
    monthlyRate: t.monthlyRate,
    basicSalary: t.basicSalary,
    allowances: t.allowances,
    epfNo: t.epfNo,
    salaryNote: t.salaryNote,
    lastActive: lastAtt ? (lastAtt.checkIn ?? lastAtt.date).toISOString() : null,
    classes: t.classes.map((c) => ({
      id: c.id,
      name: c.name,
      dayOfWeek: c.dayOfWeek,
      startTime: c.startTime,
    })),
    _count: { classes: t._count.classes, attendance: t._count.attendance },
  }
}

// ─── GET /api/teachers — list with filters ──────────────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() || ''
  const type = url.searchParams.get('type')?.trim() || ''
  const status = url.searchParams.get('status')?.trim() || ''
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20),
  )

  const where: Prisma.TeacherWhereInput = {}
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { teacherId: { contains: q } },
      { fingerprintId: { contains: q } },
      { phone: { contains: q } },
    ]
  }
  if (type) where.type = type
  if (status) where.status = status

  const [total, rows, totalTeachers, internalCount, externalCount, onLeaveCount] =
    await Promise.all([
      db.teacher.count({ where }),
      db.teacher.findMany({
        where,
        include: {
          classes: {
            select: { id: true, name: true, dayOfWeek: true, startTime: true },
          },
          _count: { select: { classes: true, attendance: true } },
          attendance: {
            orderBy: { date: 'desc' },
            take: 1,
            select: { date: true, checkIn: true },
          },
        },
        orderBy: [{ type: 'asc' }, { teacherId: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.teacher.count(), // unfiltered total
      db.teacher.count({ where: { type: 'Internal' } }),
      db.teacher.count({ where: { type: 'External' } }),
      db.teacher.count({ where: { status: 'On Leave' } }),
    ])

  return NextResponse.json({
    data: rows.map(serialize),
    total,
    page,
    limit,
    stats: {
      totalTeachers,
      internalCount,
      externalCount,
      onLeaveCount,
      filteredCount: total,
    },
  })
}

// ─── POST /api/teachers — create with auto teacherId ────────────────────────
interface CreateBody {
  fullName?: string
  type?: string
  gender?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  nic?: string | null
  qualification?: string | null
  specialization?: string | null
  photoUrl?: string | null
  status?: string
  hireDate?: string | null
  monthlyRate?: number | null
  basicSalary?: number | null
  allowances?: number | null
  epfNo?: string | null
  salaryNote?: string | null
  fingerprintId?: string | null
}

function parseDate(v?: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// Generate next teacherId like T008 from max existing sequence
async function nextTeacherId(): Promise<string> {
  const existing = await db.teacher.findMany({ select: { teacherId: true } })
  let max = 0
  for (const t of existing) {
    const m = /^T(\d+)$/.exec(t.teacherId)
    if (m) {
      const n = parseInt(m[1], 10)
      if (!isNaN(n) && n > max) max = n
    }
  }
  return `T${String(max + 1).padStart(3, '0')}`
}

// Generate next fingerprintId like FP-1008 (max existing + 1)
async function nextFingerprintId(): Promise<string> {
  const existing = await db.teacher.findMany({
    where: { fingerprintId: { not: null } },
    select: { fingerprintId: true },
  })
  let max = 1000
  for (const t of existing) {
    if (!t.fingerprintId) continue
    const m = /^FP-(\d+)$/.exec(t.fingerprintId)
    if (m) {
      const n = parseInt(m[1], 10)
      if (!isNaN(n) && n > max) max = n
    }
  }
  return `FP-${String(max + 1).padStart(4, '0')}`
}

export async function POST(req: Request) {
  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const fullName = body.fullName?.trim()
  if (!fullName) {
    return NextResponse.json({ error: 'fullName is required' }, { status: 400 })
  }

  const type = (body.type || 'Internal').trim()
  if (type !== 'Internal' && type !== 'External') {
    return NextResponse.json(
      { error: 'type must be Internal or External' },
      { status: 400 },
    )
  }

  // If fingerprintId provided, ensure unique
  let fingerprintId = body.fingerprintId?.trim() || null
  if (fingerprintId) {
    const clash = await db.teacher.findUnique({
      where: { fingerprintId },
      select: { id: true },
    })
    if (clash) {
      return NextResponse.json(
        { error: `fingerprintId "${fingerprintId}" is already in use` },
        { status: 400 },
      )
    }
  }

  try {
    const teacherId = await nextTeacherId()

    const created = await db.teacher.create({
      data: {
        teacherId,
        fingerprintId,
        fullName,
        type,
        gender: body.gender || null,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        nic: body.nic || null,
        qualification: body.qualification || null,
        specialization: body.specialization || null,
        photoUrl: body.photoUrl || null,
        status: body.status || 'Active',
        hireDate: parseDate(body.hireDate),
        monthlyRate:
          typeof body.monthlyRate === 'number' ? body.monthlyRate : 0,
        basicSalary:
          typeof body.basicSalary === 'number' ? Math.max(0, body.basicSalary) : 0,
        allowances:
          typeof body.allowances === 'number' ? Math.max(0, body.allowances) : 0,
        epfNo: body.epfNo?.trim() || null,
        salaryNote: body.salaryNote?.trim() || null,
      },
      include: {
        classes: {
          select: { id: true, name: true, dayOfWeek: true, startTime: true },
        },
        _count: { select: { classes: true, attendance: true } },
        attendance: {
          orderBy: { date: 'desc' },
          take: 1,
          select: { date: true, checkIn: true },
        },
      },
    })

    return NextResponse.json(serialize(created), { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create teacher'
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: `DB error: ${err.message}` }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
