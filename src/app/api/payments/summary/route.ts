import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── GET /api/payments/summary?month=YYYY-MM ────────────────────────────────
// Returns total billed / collected / outstanding + byStatus + byProgram.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const month = url.searchParams.get('month')?.trim() || currentMonth()

  const monthWhere = { month }
  const monthAgg = await db.payment.aggregate({
    where: monthWhere,
    _sum: { amount: true, paidAmount: true },
    _count: { _all: true },
  })

  const totalBilled = monthAgg._sum.amount ?? 0
  const totalCollected = monthAgg._sum.paidAmount ?? 0
  const totalOutstanding = Math.max(0, totalBilled - totalCollected)

  const statusRows = await db.payment.groupBy({
    by: ['status'],
    where: monthWhere,
    _count: { _all: true },
    _sum: { amount: true, paidAmount: true },
  })
  const byStatus: Record<string, { count: number; billed: number; collected: number }> = {
    Pending: { count: 0, billed: 0, collected: 0 },
    Partial: { count: 0, billed: 0, collected: 0 },
    Paid: { count: 0, billed: 0, collected: 0 },
    Overdue: { count: 0, billed: 0, collected: 0 },
  }
  for (const r of statusRows) {
    byStatus[r.status] = {
      count: r._count._all,
      billed: r._sum.amount ?? 0,
      collected: r._sum.paidAmount ?? 0,
    }
  }

  const programRows = await db.payment.findMany({
    where: monthWhere,
    select: {
      amount: true,
      paidAmount: true,
      program: { select: { id: true, code: true, name: true, color: true } },
    },
  })
  const programMap = new Map<
    string,
    {
      id: string
      code: string
      name: string
      color: string
      count: number
      billed: number
      collected: number
    }
  >()
  for (const p of programRows) {
    if (!p.program) continue
    const key = p.program.id
    const existing = programMap.get(key)
    if (existing) {
      existing.count += 1
      existing.billed += p.amount
      existing.collected += p.paidAmount
    } else {
      programMap.set(key, {
        id: p.program.id,
        code: p.program.code,
        name: p.program.name,
        color: p.program.color,
        count: 1,
        billed: p.amount,
        collected: p.paidAmount,
      })
    }
  }
  const byProgram = Array.from(programMap.values()).sort((a, b) => b.billed - a.billed)

  return NextResponse.json({
    month,
    totalBilled,
    totalCollected,
    totalOutstanding,
    paidRate: totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 1000) / 10 : 0,
    overdueCount: byStatus.Overdue.count,
    pendingCount: byStatus.Pending.count,
    byStatus,
    byProgram,
  })
}
