import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET → returns all settings as a key->value object
export async function GET() {
  const rows = await db.setting.findMany()
  const settings: Record<string, string> = {}
  for (const r of rows) settings[r.key] = r.value
  return NextResponse.json(settings)
}

// PUT → bulk upsert settings { key: value, ... }
export async function PUT(req: Request) {
  const body = (await req.json()) as Record<string, string>
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 })
  }
  for (const [key, value] of Object.entries(body)) {
    await db.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { id: key, key, value: String(value) },
    })
  }
  return NextResponse.json({ ok: true })
}
