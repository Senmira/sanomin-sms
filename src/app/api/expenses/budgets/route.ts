import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Monthly expense budgets per category, stored in the Setting table as JSON
// under the key "expense_budgets" — { "<category>": amount, ... }.
//
// GET /api/expenses/budgets?month=YYYY-MM
//   → { budgets: {cat: amount}, spent: {cat: amount}, month, totalBudget, totalSpent }
// PUT /api/expenses/budgets  body: { budgets: Record<string, number> }
//   → validates non-negative numbers, drops zero/empty entries, upserts.
const BUDGET_KEY = 'expense_budgets'

function parseMonth(searchParams: URLSearchParams) {
  const monthStr = searchParams.get('month') // "2026-09"
  const now = new Date()
  const year = monthStr ? parseInt(monthStr.split('-')[0], 10) : now.getFullYear()
  const month = monthStr ? parseInt(monthStr.split('-')[1], 10) - 1 : now.getMonth()
  if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
    return { year: now.getFullYear(), month: now.getMonth() }
  }
  return { year, month }
}

async function readBudgets(): Promise<Record<string, number>> {
  const row = await db.setting.findUnique({ where: { key: BUDGET_KEY } })
  if (!row?.value) return {}
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v)
      if (k && Number.isFinite(n) && n > 0) out[k] = n
    }
    return out
  } catch {
    return {}
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const { year, month } = parseMonth(searchParams)
  const firstDay = new Date(year, month, 1)
  const nextMonth = new Date(year, month + 1, 1)

  const [budgets, expenses] = await Promise.all([
    readBudgets(),
    db.expense.findMany({
      // Budget tracking counts approved spend; rejected rows are voided.
      where: { date: { gte: firstDay, lt: nextMonth }, status: { not: 'Rejected' } },
      select: { category: true, amount: true },
    }),
  ])

  const spent: Record<string, number> = {}
  for (const e of expenses) {
    spent[e.category] = Math.round(((spent[e.category] || 0) + e.amount) * 100) / 100
  }
  const round2 = (n: number) => Math.round(n * 100) / 100

  return NextResponse.json({
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    budgets,
    spent,
    totalBudget: round2(Object.values(budgets).reduce((s, v) => s + v, 0)),
    totalSpent: round2(Object.values(spent).reduce((s, v) => s + v, 0)),
  })
}

export async function PUT(req: Request) {
  let body: { budgets?: Record<string, unknown> }
  try {
    body = (await req.json()) as { budgets?: Record<string, unknown> }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.budgets || typeof body.budgets !== 'object' || Array.isArray(body.budgets)) {
    return NextResponse.json({ error: 'budgets object is required' }, { status: 400 })
  }
  const clean: Record<string, number> = {}
  for (const [k, v] of Object.entries(body.budgets)) {
    const n = Number(v)
    if (!k.trim()) continue
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: `Budget for "${k}" must be a non-negative number` },
        { status: 400 },
      )
    }
    if (n > 0) clean[k.trim()] = Math.round(n * 100) / 100
  }
  await db.setting.upsert({
    where: { key: BUDGET_KEY },
    update: { value: JSON.stringify(clean) },
    create: { id: BUDGET_KEY, key: BUDGET_KEY, value: JSON.stringify(clean) },
  })
  return NextResponse.json({ ok: true, budgets: clean })
}
