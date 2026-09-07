import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const row = await db.announcement.findUnique({ where: { id } })
  if (!row) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
  return NextResponse.json({
    ...row,
    publishDate: row.publishDate.toISOString(),
    expiryDate: row.expiryDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const existing = await db.announcement.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  try {
    const updated = await db.announcement.update({
      where: { id },
      data: {
        title: body.title !== undefined ? String(body.title).trim() : undefined,
        body: body.body !== undefined ? String(body.body).trim() : undefined,
        category: body.category,
        audience: body.audience,
        priority: body.priority,
        pinned: body.pinned !== undefined ? !!body.pinned : undefined,
        status: body.status,
        publishDate: body.publishDate ? new Date(body.publishDate) : undefined,
        expiryDate: body.expiryDate === null ? null : body.expiryDate ? new Date(body.expiryDate) : undefined,
        authorName: body.authorName,
      },
    })
    return NextResponse.json({
      ...updated,
      publishDate: updated.publishDate.toISOString(),
      expiryDate: updated.expiryDate?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  try {
    await db.announcement.delete({ where: { id } })
    return NextResponse.json({ ok: true, id })
  } catch {
    return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
  }
}
