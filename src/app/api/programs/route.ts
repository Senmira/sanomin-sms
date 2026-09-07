import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Serializer: Program → ProgramRow JSON ──────────────────────────────────
type ProgramWithRelations = Prisma.ProgramGetPayload<{
  include: { _count: { select: { enrollments: true; classes: true } } }
}>

function serialize(p: ProgramWithRelations) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    color: p.color,
    monthlyFee: p.monthlyFee,
    active: p.active,
    _count: {
      enrollments: p._count.enrollments,
      classes: p._count.classes,
    },
  }
}

// ─── GET /api/programs — list all programs (optionally only active) ─────────
// Returns: { data: ProgramRow[] }
export async function GET(req: Request) {
  const url = new URL(req.url)
  const onlyActive = url.searchParams.get('active') === 'true'

  const rows = await db.program.findMany({
    where: onlyActive ? { active: true } : undefined,
    include: { _count: { select: { enrollments: true, classes: true } } },
    orderBy: [{ code: 'asc' }],
  })

  return NextResponse.json({ data: rows.map(serialize) })
}

// ─── POST /api/programs — create a new program ──────────────────────────────
interface CreateBody {
  code?: string
  name?: string
  description?: string | null
  color?: string | null
  monthlyFee?: number | null
  active?: boolean | null
}

export async function POST(req: Request) {
  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const code = body.code?.trim().toUpperCase()
  const name = body.name?.trim()

  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Unique code check (pre-emptive; the DB also enforces @unique)
  const clash = await db.program.findUnique({ where: { code }, select: { id: true } })
  if (clash) {
    return NextResponse.json(
      { error: `Program code "${code}" already exists` },
      { status: 400 },
    )
  }

  // Normalize color — default to brand purple if missing/invalid
  const rawColor = body.color?.trim() || ''
  const color = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawColor)
    ? rawColor
    : '#7c3aed'

  const monthlyFee =
    typeof body.monthlyFee === 'number' && !isNaN(body.monthlyFee)
      ? Math.max(0, body.monthlyFee)
      : 0

  try {
    const created = await db.program.create({
      data: {
        code,
        name,
        description: body.description?.trim() || null,
        color,
        monthlyFee,
        active: body.active ?? true,
      },
      include: { _count: { select: { enrollments: true, classes: true } } },
    })
    return NextResponse.json(serialize(created), { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return NextResponse.json(
          { error: `Program code "${code}" already exists` },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: `DB error: ${err.message}` }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to create program'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
