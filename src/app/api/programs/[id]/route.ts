import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

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

// ─── GET /api/programs/[id] ─────────────────────────────────────────────────
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const program = await db.program.findUnique({
    where: { id },
    include: { _count: { select: { enrollments: true, classes: true } } },
  })
  if (!program) {
    return NextResponse.json({ error: 'Program not found' }, { status: 404 })
  }
  return NextResponse.json(serialize(program))
}

interface UpdateBody {
  code?: string
  name?: string
  description?: string | null
  color?: string | null
  monthlyFee?: number | null
  active?: boolean | null
}

// ─── PUT /api/programs/[id] ─────────────────────────────────────────────────
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

  const existing = await db.program.findUnique({
    where: { id },
    select: { id: true, code: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Program not found' }, { status: 404 })
  }

  const data: Prisma.ProgramUpdateInput = {}

  if (body.code !== undefined) {
    const code = body.code.trim().toUpperCase()
    if (!code) {
      return NextResponse.json({ error: 'code cannot be empty' }, { status: 400 })
    }
    if (code !== existing.code) {
      const clash = await db.program.findFirst({
        where: { code, NOT: { id } },
        select: { id: true },
      })
      if (clash) {
        return NextResponse.json(
          { error: `Program code "${code}" already exists` },
          { status: 400 },
        )
      }
    }
    data.code = code
  }

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    }
    data.name = name
  }

  if (body.description !== undefined) {
    data.description = body.description?.trim() || null
  }

  if (body.color !== undefined) {
    const raw = body.color?.trim() || ''
    data.color = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : '#7c3aed'
  }

  if (body.monthlyFee !== undefined) {
    data.monthlyFee =
      typeof body.monthlyFee === 'number' && !isNaN(body.monthlyFee)
        ? Math.max(0, body.monthlyFee)
        : 0
  }

  if (body.active !== undefined) {
    data.active = Boolean(body.active)
  }

  try {
    const updated = await db.program.update({
      where: { id },
      data,
      include: { _count: { select: { enrollments: true, classes: true } } },
    })
    return NextResponse.json(serialize(updated))
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return NextResponse.json(
          { error: 'Program code already exists' },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: `DB error: ${err.message}` }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Failed to update program'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/programs/[id] ──────────────────────────────────────────────
// Block deletion when enrollments or classes reference the program — return 400.
// This protects data integrity; admins should reassign enrollments first.
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const existing = await db.program.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      _count: { select: { enrollments: true, classes: true } },
    },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Program not found' }, { status: 404 })
  }

  const enrolled = existing._count.enrollments
  const classes = existing._count.classes
  if (enrolled > 0 || classes > 0) {
    return NextResponse.json(
      {
        error:
          `Cannot delete "${existing.name}" — it has ${enrolled} enrollment(s)` +
          ` and ${classes} class(es) attached. Reassign or remove them first.`,
      },
      { status: 400 },
    )
  }

  try {
    await db.program.delete({ where: { id } })
    return NextResponse.json({
      ok: true,
      id,
      code: existing.code,
      name: existing.name,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete program'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
