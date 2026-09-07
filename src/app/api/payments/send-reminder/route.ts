import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/payments/send-reminder
// Body: { month?: "YYYY-MM" (defaults to current month) }
// Auto-creates a high-priority announcement notifying parents about outstanding fees.
// Returns { announcement, outstandingCount, outstandingAmount, message }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const now = new Date()
  const month: string = body.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Get all outstanding (Pending/Partial/Overdue) payments for the month
  const outstanding = await db.payment.findMany({
    where: {
      month,
      status: { in: ['Pending', 'Partial', 'Overdue'] },
    },
    select: {
      id: true,
      amount: true,
      paidAmount: true,
      status: true,
      student: { select: { studentId: true, fullName: true } },
      program: { select: { code: true, name: true } },
    },
    orderBy: { status: 'desc' }, // Overdue first
  })

  if (outstanding.length === 0) {
    return NextResponse.json({
      announcement: null,
      outstandingCount: 0,
      outstandingAmount: 0,
      message: `No outstanding fees for ${month}. All payments are settled.`,
    })
  }

  const outstandingAmount = outstanding.reduce((s, p) => s + (p.amount - p.paidAmount), 0)
  const overdueCount = outstanding.filter((p) => p.status === 'Overdue').length
  const partialCount = outstanding.filter((p) => p.status === 'Partial').length
  const pendingCount = outstanding.filter((p) => p.status === 'Pending').length

  // Build announcement body
  const monthLabel = new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const title = `Fee Payment Reminder — ${monthLabel}`

  // School signature from settings (falls back to SANOMIN default)
  const settingsRows = await db.setting.findMany({
    where: { key: { in: ['school_name', 'school_phone'] } },
  })
  const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]))
  const schoolName = settingsMap.school_name?.trim() || 'SANOMIN International Preschool'
  const schoolPhone = settingsMap.school_phone?.trim()

  const body_text = [
    `Dear Parents,`,
    ``,
    `This is a friendly reminder that ${outstanding.length} fee payment${outstanding.length === 1 ? '' : 's'} remain outstanding for ${monthLabel}:`,
    ``,
    `• ${overdueCount} overdue payment${overdueCount === 1 ? '' : 's'}`,
    `• ${pendingCount} pending payment${pendingCount === 1 ? '' : 's'}`,
    partialCount > 0 ? `• ${partialCount} partial payment${partialCount === 1 ? '' : 's'}` : null,
    ``,
    `Total outstanding amount: LKR ${outstandingAmount.toLocaleString()}.`,
    ``,
    `Please settle your child's tuition fees at your earliest convenience. Payments can be made via Cash, Card, Bank Transfer, or Online at the accounts desk. If you have already paid, please share the receipt number so our records can be updated.`,
    ``,
    `For any queries regarding your fee statement, please contact the school office${schoolPhone ? ` (${schoolPhone})` : ''}. Thank you for your cooperation.`,
    ``,
    `— ${schoolName} Administration`,
  ].filter(Boolean).join('\n')

  // Create the announcement
  const announcement = await db.announcement.create({
    data: {
      title,
      body: body_text,
      category: 'Payment',
      audience: 'Parents',
      priority: overdueCount > 0 ? 'High' : 'Normal',
      pinned: true,
      status: 'Published',
      publishDate: new Date(),
      expiryDate: (() => {
        const d = new Date()
        d.setDate(d.getDate() + 14)
        return d
      })(),
      authorName: 'Administrator',
    },
  })

  return NextResponse.json({
    announcement: {
      id: announcement.id,
      title: announcement.title,
    },
    outstandingCount: outstanding.length,
    outstandingAmount,
    overdueCount,
    pendingCount,
    partialCount,
    month,
    message: `Published "${title}" — notifying parents about ${outstanding.length} outstanding payment${outstanding.length === 1 ? '' : 's'} (LKR ${outstandingAmount.toLocaleString()}).`,
  })
}
