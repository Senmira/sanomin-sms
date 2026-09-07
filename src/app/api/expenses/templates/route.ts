import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─── Recurring expense templates ─────────────────────────────────────────────
// Monthly standing expenses (rent, utility bills, fixed subscriptions…) stored
// as a JSON array under the Setting key "expense_templates". One-off setups
// here replace re-typing the same expense every month — apply them via
// POST /api/expenses/apply-templates.

export interface ExpenseTemplate {
  id: string
  name: string
  category: string
  amount: number
  vendor?: string
  method: string // Cash | Bank | Card
  day: number // day-of-month the expense is dated on (1–28)
  active: boolean
}

const SETTING_KEY = 'expense_templates'
const ALLOWED_METHODS = new Set(['Cash', 'Bank', 'Card'])

function sanitize(raw: unknown): { templates: ExpenseTemplate[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: 'templates must be an array' }
  const out: ExpenseTemplate[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i] as Partial<ExpenseTemplate>
    const name = String(t.name ?? '').trim()
    const category = String(t.category ?? '').trim()
    const method = String(t.method ?? 'Cash').trim() || 'Cash'
    const amount = typeof t.amount === 'string' ? parseFloat(t.amount) : t.amount
    const dayRaw = typeof t.day === 'string' ? parseInt(t.day, 10) : t.day
    const day = Number.isFinite(dayRaw) ? Math.min(28, Math.max(1, Math.round(dayRaw as number))) : 1
    if (!name) return { error: `templates[${i}]: name is required` }
    if (!category) return { error: `templates[${i}]: category is required` }
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
      return { error: `templates[${i}]: amount must be a positive number` }
    }
    if (!ALLOWED_METHODS.has(method)) {
      return { error: `templates[${i}]: method must be one of Cash, Bank, Card` }
    }
    // Stable id — keep provided id when unique, else derive from the name.
    let id = String(t.id ?? '').trim()
    if (!id || seen.has(id)) id = name.toLowerCase().replace(/\s+/g, '-')
    if (seen.has(id)) id = `${id}-${i}`
    seen.add(id)
    out.push({
      id,
      name,
      category,
      amount: Math.round((amount as number) * 100) / 100,
      vendor: String(t.vendor ?? '').trim() || undefined,
      method,
      day,
      active: t.active !== false,
    })
  }
  return { templates: out }
}

async function readTemplates(): Promise<ExpenseTemplate[]> {
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } })
  if (!row) return []
  try {
    const parsed = JSON.parse(row.value)
    const result = sanitize(parsed)
    return 'templates' in result ? result.templates : []
  } catch {
    return []
  }
}

// GET /api/expenses/templates → { templates }
export async function GET() {
  const templates = await readTemplates()
  return NextResponse.json({ templates })
}

// PUT /api/expenses/templates { templates: [...] } → replaces the whole list
export async function PUT(req: Request) {
  let body: { templates?: unknown }
  try {
    body = (await req.json()) as { templates?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = sanitize(body.templates)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  await db.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(result.templates) },
    create: { id: SETTING_KEY, key: SETTING_KEY, value: JSON.stringify(result.templates) },
  })
  return NextResponse.json({ templates: result.templates })
}
