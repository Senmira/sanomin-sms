import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/announcements
//   ?status=Published (default) | Draft | Archived | All
//   ?category=Event|Holiday|...
//   ?audience=All|Staff|Parents|Teachers
//   ?priority=High|Normal|Low
//   ?q=<search title/body>
//   ?pinned=true
//   ?limit=20 (max 100)
// Returns { data: AnnouncementRow[], total, summary }
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'Published'
  const category = searchParams.get('category')
  const audience = searchParams.get('audience')
  const priority = searchParams.get('priority')
  const q = searchParams.get('q')?.trim()
  const pinned = searchParams.get('pinned')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100)

  const where: any = {}
  if (status !== 'All') where.status = status
  if (category) where.category = category
  if (audience && audience !== 'All') where.audience = { in: [audience, 'All'] }
  if (priority) where.priority = priority
  if (pinned === 'true') where.pinned = true
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { body: { contains: q } },
    ]
  }

  const [rows, total, summaryRows] = await Promise.all([
    db.announcement.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { publishDate: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    }),
    db.announcement.count({ where }),
    db.announcement.findMany({
      where: { status: 'Published' },
      select: { category: true, priority: true, audience: true },
    }),
  ])

  const summary = {
    total: summaryRows.length,
    byCategory: {} as Record<string, number>,
    byPriority: { High: 0, Normal: 0, Low: 0 },
    byAudience: { All: 0, Staff: 0, Parents: 0, Teachers: 0 },
    pinnedCount: 0,
  }
  for (const r of summaryRows) {
    summary.byCategory[r.category] = (summary.byCategory[r.category] || 0) + 1
    if (r.priority in summary.byPriority) (summary.byPriority as any)[r.priority]++
    if (r.audience in summary.byAudience) (summary.byAudience as any)[r.audience]++
  }
  summary.pinnedCount = summaryRows.filter((r) => (r as any).pinned).length

  const data = rows.map((r) => ({
    ...r,
    publishDate: r.publishDate.toISOString(),
    expiryDate: r.expiryDate?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))

  return NextResponse.json({ data, total, summary })
}

// POST /api/announcements — create
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || !body.title || !body.body) {
    return NextResponse.json({ error: 'title and body are required' }, { status: 400 })
  }
  try {
    const created = await db.announcement.create({
      data: {
        title: String(body.title).trim(),
        body: String(body.body).trim(),
        category: body.category || 'General',
        audience: body.audience || 'All',
        priority: body.priority || 'Normal',
        pinned: !!body.pinned,
        status: body.status || 'Published',
        publishDate: body.publishDate ? new Date(body.publishDate) : new Date(),
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        authorName: body.authorName || 'Administrator',
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to create' }, { status: 500 })
  }
}
