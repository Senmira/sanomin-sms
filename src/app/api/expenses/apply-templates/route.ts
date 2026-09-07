import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { ExpenseTemplate } from '../templates/route'

// ─── Apply recurring templates to a month ────────────────────────────────────
// POST /api/expenses/apply-templates { month: "YYYY-MM", templateIds?: string[] }
// Creates one expense per selected active template, dated on the template's
// day-of-month (clamped to the month length). Templates that already produced
// an expense with the same description+category in that month are skipped so
// double-clicking never duplicates entries.

const SETTING_KEY = 'expense_templates'
const ALLOWED_METHODS = new Set(['Cash', 'Bank', 'Card'])

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isValidMonth(s?: string): boolean {
  return !!s && /^\d{4}-\d{2}$/.test(s)
}

function monthRange(month: string): { start: Date; end: Date; days: number } {
  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 1))
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return { start, end, days }
}

async function readTemplates(): Promise<ExpenseTemplate[]> {
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } })
  if (!row) return []
  try {
    return (JSON.parse(row.value) as ExpenseTemplate[]) ?? []
  } catch {
    return []
  }
}

// POST → { created: n, createdTotal: LKR, skipped: [{ name, reason }] }
export async function POST(req: Request) {
  let body: { month?: string; templateIds?: string[] }
  try {
    body = (await req.json()) as { month?: string; templateIds?: string[] }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const month = (body.month || '').trim() || currentMonth()
  if (!isValidMonth(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }

  const all = await readTemplates()
  const wanted = Array.isArray(body.templateIds) ? new Set(body.templateIds) : null
  const templates = all.filter(
    (t) => t.active !== false && (!wanted || wanted.has(t.id)),
  )

  if (templates.length === 0) {
    return NextResponse.json(
      { created: 0, createdTotal: 0, skipped: [], message: 'No active templates selected' },
      { status: 200 },
    )
  }

  const { start, end, days } = monthRange(month)

  // Expenses this month — used to detect already-applied templates.
  const existing = await db.expense.findMany({
    where: { date: { gte: start, lt: end } },
    select: { description: true, category: true },
  })
  const existingKeys = new Set(existing.map((e) => `${e.description}::${e.category}`))

  let created = 0
  let createdTotal = 0
  const skipped: { name: string; reason: string }[] = []

  for (const t of templates) {
    const key = `${t.name}::${t.category}`
    if (existingKeys.has(key)) {
      skipped.push({ name: t.name, reason: 'Already recorded this month' })
      continue
    }
    const day = Math.min(Math.max(1, Math.round(t.day || 1)), days)
    const date = new Date(Date.UTC(parseInt(month.slice(0, 4), 10), parseInt(month.slice(5, 7), 10) - 1, day))
    const method = ALLOWED_METHODS.has(t.method) ? t.method : 'Cash'
    const data: Prisma.ExpenseUncheckedCreateInput = {
      date,
      category: t.category,
      description: t.name,
      amount: t.amount,
      method,
      vendor: t.vendor ?? null,
      note: 'Recurring template',
    }
    try {
      await db.expense.create({ data })
      created += 1
      createdTotal += t.amount
      existingKeys.add(key)
    } catch {
      skipped.push({ name: t.name, reason: 'Database error while creating' })
    }
  }

  return NextResponse.json({
    created,
    createdTotal: Math.round(createdTotal * 100) / 100,
    skipped,
    message:
      created === 0
        ? skipped.length
          ? 'All selected templates were already recorded'
          : 'Nothing to apply'
        : `Created ${created} expense${created === 1 ? '' : 's'} for ${month}`,
  })
}
