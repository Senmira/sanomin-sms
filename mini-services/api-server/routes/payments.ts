// ─── Payments routes (bills with EMBEDDED line items) ──────────────────────
// /api/payments, /:id, /summary, /statement, /send-reminder,
// /bulk-generate, /bulk-generate/preview, /outstanding-guardians
// NOTE: static sub-paths are registered BEFORE /:id on purpose.
import { Router } from 'express'
import { Payment, Student, Guardian, Program, Announcement, Setting } from '../models'
import {
  ah, qs, round2, currentMonth, parseDate, computeStatus, toWaPhone, containsRe,
} from '../helpers'

const r = Router()

const ALLOWED_STATUSES = new Set(['Pending', 'Partial', 'Paid', 'Overdue'])
const ALLOWED_METHODS = new Set(['Cash', 'Card', 'Bank', 'Online'])

// ─── Serializers ────────────────────────────────────────────────────────────
interface ProgInfo { id: string; code: string; name: string; color: string; monthlyFee?: number }

async function programInfoMaps(paymentDocs: any[]) {
  const progIds = new Set<string>()
  for (const p of paymentDocs) {
    if (p.programId) progIds.add(p.programId)
    for (const it of p.items || []) if (it.programId) progIds.add(it.programId)
  }
  const sIds = [...new Set(paymentDocs.map((p) => p.studentId))]
  const [progs, students, guardians] = await Promise.all([
    progIds.size ? Program.find({ _id: { $in: [...progIds] } }).lean() : [],
    sIds.length ? Student.find({ _id: { $in: sIds } }, 'studentId fullName').lean() : [],
    sIds.length
      ? Guardian.find({ studentId: { $in: sIds } }, 'studentId name phone relationship isPrimary')
          .sort({ isPrimary: -1, name: 1 })
          .lean()
      : [],
  ])
  const pMap = new Map<string, any>()
  for (const p of progs as any[]) pMap.set(p._id.toString(), p)
  const sMap = new Map<string, any>()
  for (const s of students as any[]) sMap.set(s._id.toString(), s)
  const gMap = new Map<string, any[]>()
  for (const g of guardians as any[]) {
    if (!gMap.has(g.studentId)) gMap.set(g.studentId, [])
    gMap.get(g.studentId)!.push(g)
  }
  return { pMap, sMap, gMap }
}

function progBrief(p: any): { id: string; code: string; name: string; color: string } {
  return { id: p._id.toString(), code: p.code, name: p.name, color: p.color }
}

function progBriefFee(p: any): { id: string; code: string; name: string; color: string; monthlyFee: number } {
  return { id: p._id.toString(), code: p.code, name: p.name, color: p.color, monthlyFee: p.monthlyFee }
}

function serializePayment(doc: any, maps: Awaited<ReturnType<typeof programInfoMaps>>, withGuardians: boolean) {
  const id = doc._id.toString()
  const s = maps.sMap.get(doc.studentId)
  const prog = doc.programId ? maps.pMap.get(doc.programId) : null
  const items = (doc.items || []).map((it: any) => ({
    id: it._id.toString(),
    programId: it.programId ?? null,
    description: it.description ?? null,
    amount: it.amount,
    program: it.programId ? (maps.pMap.has(it.programId) ? progBriefFee(maps.pMap.get(it.programId)) : null) : null,
  }))
  return {
    id,
    studentId: doc.studentId,
    programId: doc.programId ?? null,
    classId: doc.classId ?? null,
    month: doc.month,
    amount: doc.amount,
    paidAmount: doc.paidAmount,
    method: doc.method,
    status: doc.status,
    paidDate: doc.paidDate ? new Date(doc.paidDate).toISOString() : null,
    dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : null,
    note: doc.note ?? null,
    receiptNo: doc.receiptNo ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
    student: withGuardians
      ? {
          id: doc.studentId,
          studentId: s?.studentId ?? '',
          fullName: s?.fullName ?? '',
          guardians: (maps.gMap.get(doc.studentId) || []).map((g: any) => ({
            name: g.name,
            phone: g.phone,
            relationship: g.relationship,
            isPrimary: g.isPrimary,
          })),
        }
      : {
          id: doc.studentId,
          studentId: s?.studentId ?? '',
          fullName: s?.fullName ?? '',
        },
    program: prog ? progBrief(prog) : null,
    items,
  }
}

async function nextReceiptNo(): Promise<string> {
  const year = String(new Date().getFullYear())
  const prefix = `SAN-${year}-`
  const rows = await Payment.find({ receiptNo: { $regex: `^${prefix}` } }, 'receiptNo').lean()
  let max = 0
  for (const row of rows as any[]) {
    if (!row.receiptNo) continue
    const num = parseInt(row.receiptNo.slice(prefix.length), 10)
    if (!isNaN(num) && num > max) max = num
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

// ─── GET /api/payments ──────────────────────────────────────────────────────
r.get('/', ah(async (req, res) => {
  const p = qs(req)
  const q = p.get('q')?.trim() || ''
  const status = p.get('status')?.trim() || ''
  const month = p.get('month')?.trim() || ''
  const program = p.get('program')?.trim() || ''
  const method = p.get('method')?.trim() || ''
  const page = Math.max(1, parseInt(p.get('page') || '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(p.get('limit') || '50', 10) || 50))

  const where: Record<string, unknown> = {}
  if (q) {
    // match by receiptNo OR student name/code — resolve students first
    const matched = await Student.find(
      { $or: [{ fullName: containsRe(q) }, { studentId: containsRe(q) }] },
      '_id',
    ).lean()
    const ids = matched.map((s: any) => s._id.toString())
    where.$or = [
      { receiptNo: containsRe(q) },
      ...(ids.length ? [{ studentId: { $in: ids } }] : []),
    ]
  }
  if (status && ALLOWED_STATUSES.has(status)) where.status = status
  if (month) where.month = month
  if (program) {
    // programme match (direct or via embedded line item) — same precedence
    // quirk as the original: overrides the q $or when both are given
    const prog = await Program.findOne({ code: program }, '_id').lean()
    const pid = prog ? (prog as any)._id.toString() : '___none___'
    where.$or = [{ programId: pid }, { 'items.programId': pid }]
  }
  if (method && ALLOWED_METHODS.has(method)) where.method = method

  const [total, rows, aggRows] = await Promise.all([
    Payment.countDocuments(where),
    Payment.find(where).sort({ month: -1, receiptNo: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Payment.find(where, 'amount paidAmount').lean(),
  ])

  const summaryMonth = month || currentMonth()
  const [monthRows, pendingCount, overdueCount] = await Promise.all([
    Payment.find({ month: summaryMonth }, 'amount paidAmount').lean(),
    Payment.countDocuments({ month: summaryMonth, status: 'Pending' }),
    Payment.countDocuments({ month: summaryMonth, status: 'Overdue' }),
  ])
  const totalBilled = round2(monthRows.reduce((s: number, x: any) => s + x.amount, 0))
  const totalCollected = round2(monthRows.reduce((s: number, x: any) => s + x.paidAmount, 0))
  const totalOutstanding = Math.max(0, round2(totalBilled - totalCollected))

  const filteredBilled = round2(aggRows.reduce((s: number, x: any) => s + x.amount, 0))
  const filteredCollected = round2(aggRows.reduce((s: number, x: any) => s + x.paidAmount, 0))

  const maps = await programInfoMaps(rows)
  res.json({
    data: rows.map((row: any) => serializePayment(row, maps, true)),
    total,
    page,
    limit,
    summary: {
      totalBilled,
      totalCollected,
      totalOutstanding,
      pendingCount,
      overdueCount,
    },
    filtered: {
      totalBilled: filteredBilled,
      totalCollected: filteredCollected,
      count: total,
    },
  })
}))

// ─── POST /api/payments ─────────────────────────────────────────────────────
r.post('/', ah(async (req, res) => {
  const body = req.body || {}
  const studentId = (body.studentId || '').trim()
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })
  const student = await Student.findById(studentId)
  if (!student) return res.status(400).json({ error: 'Student not found' })
  if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return res.status(400).json({ error: 'month is required (YYYY-MM)' })
  }

  type LineItem = { programId: string | null; amount: number; description: string | null }
  let lineItems: LineItem[] = []
  let hasExplicitAmounts = false

  if (Array.isArray(body.items) && body.items.length > 0) {
    for (const it of body.items) {
      const pid = it.programId?.trim() || null
      if (pid) {
        const prog = await Program.findById(pid).lean()
        if (!prog) return res.status(400).json({ error: 'Program not found' })
        lineItems.push({
          programId: pid,
          amount: typeof it.amount === 'number' && !isNaN(it.amount) && it.amount >= 0 ? it.amount : (prog as any).monthlyFee,
          description: it.description?.trim() || (prog as any).name,
        })
      } else {
        lineItems.push({
          programId: null,
          amount: typeof it.amount === 'number' && !isNaN(it.amount) && it.amount >= 0 ? it.amount : 0,
          description: it.description?.trim() || 'Custom charge',
        })
      }
    }
    hasExplicitAmounts = body.items.some((it: any) => typeof it.amount === 'number' && !isNaN(it.amount))
  } else if (Array.isArray(body.programIds) && body.programIds.length > 0) {
    const programs = await Program.find({ _id: { $in: body.programIds } }).lean()
    if (programs.length !== new Set(body.programIds).size) {
      return res.status(400).json({ error: 'One or more programs not found' })
    }
    const byId = new Map((programs as any[]).map((p) => [p._id.toString(), p]))
    for (const pid of body.programIds) {
      const prog = byId.get(pid)!
      lineItems.push({ programId: pid, amount: prog.monthlyFee, description: prog.name })
    }
  } else if (body.programId) {
    const prog = await Program.findById(body.programId).lean()
    if (!prog) return res.status(400).json({ error: 'Program not found' })
    lineItems = [
      {
        programId: body.programId,
        amount: typeof body.amount === 'number' && !isNaN(body.amount) ? Math.max(0, body.amount) : (prog as any).monthlyFee,
        description: (prog as any).name,
      },
    ]
  }

  // Deduplicate programmes
  const seenProgram = new Set<string>()
  lineItems = lineItems.filter((li) => {
    if (!li.programId) return true
    if (seenProgram.has(li.programId)) return false
    seenProgram.add(li.programId)
    return true
  })

  const itemsTotal = lineItems.reduce((sum, li) => sum + li.amount, 0)
  const amount =
    typeof body.amount === 'number' && !isNaN(body.amount) && body.amount >= 0
      ? body.amount
      : itemsTotal

  if (amount <= 0) {
    return res.status(400).json({
      error: 'Amount must be greater than 0 — select at least one programme or enter an amount',
    })
  }

  const paidAmount =
    typeof body.paidAmount === 'number' && !isNaN(body.paidAmount) ? Math.max(0, body.paidAmount) : 0
  const method = body.method && ALLOWED_METHODS.has(body.method) ? body.method : 'Cash'

  let status = body.status && ALLOWED_STATUSES.has(body.status) ? body.status : ''
  let paidDate = parseDate(body.paidDate)
  if (!status) {
    const computed = computeStatus(amount, paidAmount)
    status = computed.status
    paidDate = paidDate ?? computed.paidDate
  } else if (status === 'Paid' && !paidDate) {
    paidDate = new Date()
  }

  let receiptNo = body.receiptNo?.trim() || null
  if (receiptNo) {
    const clash = await Payment.findOne({ receiptNo })
    if (clash) return res.status(400).json({ error: `receiptNo "${receiptNo}" already exists` })
  } else {
    receiptNo = await nextReceiptNo()
  }

  const created = await Payment.create({
    studentId,
    programId: lineItems.length === 1 ? lineItems[0].programId : null,
    classId: body.classId || null,
    month: body.month,
    amount,
    paidAmount,
    method,
    status,
    paidDate,
    dueDate: parseDate(body.dueDate),
    note: body.note?.trim() || null,
    receiptNo,
    items: lineItems.map((li) => ({
      programId: li.programId,
      amount: li.amount,
      description: li.description,
    })),
  })

  const doc = await Payment.findById(created._id).lean()
  const maps = await programInfoMaps([doc])
  res.status(201).json(serializePayment(doc, maps, true))
}))

// ─── GET /api/payments/summary?month= ───────────────────────────────────────
r.get('/summary', ah(async (req, res) => {
  const month = qs(req).get('month')?.trim() || currentMonth()
  const rows = await Payment.find({ month }, 'amount paidAmount status programId').lean()
  const progIds = [...new Set(rows.map((x: any) => x.programId).filter(Boolean))]
  const progs = progIds.length ? await Program.find({ _id: { $in: progIds } }).lean() : []
  const pMap = new Map((progs as any[]).map((p) => [p._id.toString(), p]))

  const totalBilled = round2(rows.reduce((s: number, x: any) => s + x.amount, 0))
  const totalCollected = round2(rows.reduce((s: number, x: any) => s + x.paidAmount, 0))
  const totalOutstanding = Math.max(0, round2(totalBilled - totalCollected))

  const byStatus: Record<string, { count: number; billed: number; collected: number }> = {
    Pending: { count: 0, billed: 0, collected: 0 },
    Partial: { count: 0, billed: 0, collected: 0 },
    Paid: { count: 0, billed: 0, collected: 0 },
    Overdue: { count: 0, billed: 0, collected: 0 },
  }
  for (const x of rows as any[]) {
    if (byStatus[x.status]) {
      byStatus[x.status].count++
      byStatus[x.status].billed = round2(byStatus[x.status].billed + x.amount)
      byStatus[x.status].collected = round2(byStatus[x.status].collected + x.paidAmount)
    }
  }

  const programMap = new Map<string, { id: string; code: string; name: string; color: string; count: number; billed: number; collected: number }>()
  for (const x of rows as any[]) {
    if (!x.programId) continue
    const prog = pMap.get(x.programId)
    if (!prog) continue
    const key = x.programId
    const existing = programMap.get(key)
    if (existing) {
      existing.count += 1
      existing.billed = round2(existing.billed + x.amount)
      existing.collected = round2(existing.collected + x.paidAmount)
    } else {
      programMap.set(key, {
        id: key, code: prog.code, name: prog.name, color: prog.color,
        count: 1, billed: round2(x.amount), collected: round2(x.paidAmount),
      })
    }
  }
  const byProgram = Array.from(programMap.values()).sort((a, b) => b.billed - a.billed)

  res.json({
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
}))

// ─── GET /api/payments/statement?studentId= ─────────────────────────────────
r.get('/statement', ah(async (req, res) => {
  const studentId = qs(req).get('studentId')?.trim() || ''
  if (!studentId) return res.status(400).json({ error: 'studentId is required' })

  const student = await Student.findById(studentId).lean()
  if (!student) return res.status(404).json({ error: 'Student not found' })
  const s = student as any

  const { Enrollment, Class } = await import('../models')
  const [guardians, enrollments, payments] = await Promise.all([
    Guardian.find({ studentId }, 'name phone relationship isPrimary').lean(),
    Enrollment.find({ studentId, status: 'Active' })
      .populate('programId', 'name color')
      .populate('classId', 'name')
      .lean(),
    Payment.find({ studentId }).sort({ month: -1, createdAt: -1 }).lean(),
  ])

  const progIds = new Set<string>()
  for (const p of payments as any[]) {
    if (p.programId) progIds.add(p.programId)
    for (const it of p.items || []) if (it.programId) progIds.add(it.programId)
  }
  const progs = progIds.size ? await Program.find({ _id: { $in: [...progIds] } }, 'name color').lean() : []
  const pMap = new Map((progs as any[]).map((p) => [p._id.toString(), p]))

  const months = (payments as any[]).map((p) => {
    const lines =
      (p.items || []).length > 0
        ? (p.items || []).map((it: any) => ({
            description: it.description || (it.programId ? pMap.get(it.programId)?.name : null) || 'Programme',
            amount: it.amount,
            color: it.programId ? pMap.get(it.programId)?.color ?? null : null,
          }))
        : [
            {
              description: (p.programId ? pMap.get(p.programId)?.name : null) || 'Programme fee',
              amount: p.amount,
              color: p.programId ? pMap.get(p.programId)?.color ?? null : null,
            },
          ]
    return {
      id: p._id.toString(),
      month: p.month,
      amount: p.amount,
      paidAmount: p.paidAmount,
      balance: Math.max(0, round2(p.amount - p.paidAmount)),
      status: p.status,
      method: p.method,
      paidDate: p.paidDate ? new Date(p.paidDate).toISOString() : null,
      receiptNo: p.receiptNo ?? null,
      lines,
    }
  })

  const totals = {
    billed: round2((payments as any[]).reduce((s, p) => s + p.amount, 0)),
    paid: round2((payments as any[]).reduce((s, p) => s + p.paidAmount, 0)),
    balance: round2((payments as any[]).reduce((s, p) => s + Math.max(0, p.amount - p.paidAmount), 0)),
    billCount: (payments as any[]).length,
  }

  res.json({
    student: {
      id: s._id.toString(),
      studentId: s.studentId,
      fullName: s.fullName,
      gender: s.gender,
      status: s.status,
      admissionDate: s.admissionDate ? new Date(s.admissionDate).toISOString() : null,
      guardians: (guardians as any[]).map((g) => ({
        name: g.name, phone: g.phone, relationship: g.relationship, isPrimary: g.isPrimary,
      })),
      enrollments: (enrollments as any[]).map((e) => ({
        program: e.programId?.name ?? null,
        programColor: e.programId?.color ?? null,
        class: e.classId?.name ?? null,
      })),
    },
    months,
    totals,
    generatedAt: new Date().toISOString(),
  })
}))

// ─── POST /api/payments/send-reminder ───────────────────────────────────────
r.post('/send-reminder', ah(async (req, res) => {
  const body = req.body || {}
  const now = new Date()
  const month = body.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const outstanding = await Payment.find({ month, status: { $in: ['Pending', 'Partial', 'Overdue'] } })
    .sort({ status: -1 })
    .lean()

  if (outstanding.length === 0) {
    return res.json({
      announcement: null,
      outstandingCount: 0,
      outstandingAmount: 0,
      message: `No outstanding fees for ${month}. All payments are settled.`,
    })
  }

  const outstandingAmount = outstanding.reduce((s: number, p: any) => s + (p.amount - p.paidAmount), 0)
  const overdueCount = outstanding.filter((p: any) => p.status === 'Overdue').length
  const partialCount = outstanding.filter((p: any) => p.status === 'Partial').length
  const pendingCount = outstanding.filter((p: any) => p.status === 'Pending').length

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const title = `Fee Payment Reminder — ${monthLabel}`

  const settingsRows = await Setting.find({ key: { $in: ['school_name', 'school_phone'] } }).lean()
  const settingsMap = Object.fromEntries((settingsRows as any[]).map((row) => [row.key, row.value]))
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

  const expiry = new Date()
  expiry.setDate(expiry.getDate() + 14)
  const announcement = await Announcement.create({
    title,
    body: body_text,
    category: 'Payment',
    audience: 'Parents',
    priority: overdueCount > 0 ? 'High' : 'Normal',
    pinned: true,
    status: 'Published',
    publishDate: new Date(),
    expiryDate: expiry,
    authorName: 'Administrator',
  })

  res.json({
    announcement: { id: (announcement as any)._id.toString(), title: announcement.title },
    outstandingCount: outstanding.length,
    outstandingAmount,
    overdueCount,
    pendingCount,
    partialCount,
    month,
    message: `Published "${title}" — notifying parents about ${outstanding.length} outstanding payment${outstanding.length === 1 ? '' : 's'} (LKR ${outstandingAmount.toLocaleString()}).`,
  })
}))

// ─── GET /api/payments/bulk-generate/preview?month= ─────────────────────────
r.get('/bulk-generate/preview', ah(async (req, res) => {
  const month = qs(req).get('month')?.trim() || ''
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month is required in YYYY-MM format' })
  }

  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })

  const { Enrollment } = await import('../models')
  const students = await Student.find({ status: 'Active' }).sort({ studentId: 1 }).lean()
  const studentIds = (students as any[]).map((s) => s._id.toString())
  const enrollments = studentIds.length
    ? await Enrollment.find({ studentId: { $in: studentIds }, status: 'Active' })
        .sort({ enrolledAt: 1 })
        .populate('programId', 'id monthlyFee code name color')
        .lean()
    : []
  const existing = await Payment.find({ month }, 'studentId amount').lean()
  const existingByStudent = new Map<string, number>()
  for (const p of existing as any[]) {
    existingByStudent.set(p.studentId, (existingByStudent.get(p.studentId) ?? 0) + p.amount)
  }

  const toBill: Array<{ studentId: string; studentCode: string; fullName: string; lines: Array<{ programId: string; code: string; name: string; color: string | null; amount: number }>; total: number }> = []
  const skipped: Array<{ studentId: string; studentCode: string; fullName: string; billedAmount: number }> = []
  const noProgrammes: Array<{ studentId: string; studentCode: string; fullName: string }> = []

  for (const s of students as any[]) {
    const sid = s._id.toString()
    if (existingByStudent.has(sid)) {
      skipped.push({
        studentId: sid,
        studentCode: s.studentId,
        fullName: s.fullName,
        billedAmount: existingByStudent.get(sid) ?? 0,
      })
      continue
    }
    const seen = new Set<string>()
    const lines: Array<{ programId: string; code: string; name: string; color: string | null; amount: number }> = []
    for (const en of enrollments as any[]) {
      if (en.studentId !== sid) continue
      const prog = en.programId
      if (!prog) continue
      if (seen.has(prog._id.toString())) continue
      seen.add(prog._id.toString())
      lines.push({
        programId: prog._id.toString(),
        code: prog.code,
        name: prog.name,
        color: prog.color ?? null,
        amount: prog.monthlyFee,
      })
    }
    if (lines.length === 0) {
      noProgrammes.push({ studentId: sid, studentCode: s.studentId, fullName: s.fullName })
      continue
    }
    toBill.push({
      studentId: sid,
      studentCode: s.studentId,
      fullName: s.fullName,
      lines,
      total: lines.reduce((sum, li) => sum + li.amount, 0),
    })
  }

  const lineCount = toBill.reduce((sum, b) => sum + b.lines.length, 0)
  const grandTotal = toBill.reduce((sum, b) => sum + b.total, 0)

  res.json({
    month,
    monthLabel,
    toBill,
    skipped,
    noProgrammes,
    totals: {
      billCount: toBill.length,
      lineCount,
      grandTotal,
      skippedCount: skipped.length,
      noProgrammeCount: noProgrammes.length,
      studentCount: (students as any[]).length,
    },
  })
}))

// ─── POST /api/payments/bulk-generate ───────────────────────────────────────
r.post('/bulk-generate', ah(async (req, res) => {
  const body = req.body || {}
  if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return res.status(400).json({ error: 'month is required in YYYY-MM format' })
  }
  const month: string = body.month
  const skipExisting = body.skipExisting !== false
  const skipEmpty = body.skipEmpty === true
  const dueDate = body.dueDate ? new Date(body.dueDate + 'T23:59:59') : null

  const lastPayment = await Payment.findOne({ receiptNo: { $regex: '^SAN-' } })
    .sort({ receiptNo: -1 })
    .select('receiptNo')
    .lean()
  let seq = 1
  if ((lastPayment as any)?.receiptNo) {
    const m = /SAN-\d{4}-(\d+)/.exec((lastPayment as any).receiptNo)
    if (m) seq = parseInt(m[1], 10) + 1
  }

  const { Enrollment } = await import('../models')
  const students = await Student.find({ status: 'Active' }).sort({ studentId: 1 }).lean()
  const studentIds = (students as any[]).map((s) => s._id.toString())
  const enrollments = studentIds.length
    ? await Enrollment.find({ studentId: { $in: studentIds }, status: 'Active' })
        .sort({ enrolledAt: 1 })
        .populate('programId', 'monthlyFee code name')
        .lean()
    : []
  const existing = await Payment.find({ month }, 'studentId').lean()
  const existingStudents = new Set((existing as any[]).map((p) => p.studentId))

  type BillDraft = {
    studentId: string
    amount: number
    receiptNo: string
    lines: Array<{ programId: string | null; amount: number; description: string | null }>
  }
  const bills: BillDraft[] = []
  let skipped = 0

  for (const s of students as any[]) {
    const sid = s._id.toString()
    if (skipExisting && existingStudents.has(sid)) {
      skipped++
      continue
    }
    const seenProgram = new Set<string>()
    const lines: BillDraft['lines'] = []
    for (const en of enrollments as any[]) {
      if (en.studentId !== sid) continue
      const prog = en.programId
      if (!prog) continue
      const pid = prog._id.toString()
      if (seenProgram.has(pid)) continue
      seenProgram.add(pid)
      lines.push({ programId: pid, amount: prog.monthlyFee, description: prog.name })
    }
    const amount = lines.reduce((sum, li) => sum + li.amount, 0)
    if (skipEmpty && lines.length === 0) {
      skipped++
      continue
    }
    const receiptNo = `SAN-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
    seq++
    bills.push({ studentId: sid, amount, receiptNo, lines })
  }

  if (bills.length === 0) {
    return res.json({
      created: 0,
      skipped,
      total: (students as any[]).length,
      message: skipExisting
        ? `All ${(students as any[]).length} active students already have bills for ${month}.`
        : 'No students to generate bills for.',
    })
  }

  await Payment.insertMany(
    bills.map((b) => ({
      studentId: b.studentId,
      programId: b.lines.length === 1 ? b.lines[0].programId : null,
      month,
      amount: b.amount,
      paidAmount: 0,
      method: 'Cash',
      status: b.amount > 0 ? 'Pending' : 'Paid',
      dueDate,
      receiptNo: b.receiptNo,
      note: `Monthly bill for ${month}`,
      items: b.lines.map((li) => ({
        programId: li.programId,
        amount: li.amount,
        description: li.description,
      })),
    })),
  )

  const lineCount = bills.reduce((sum, b) => sum + b.lines.length, 0)
  res.json({
    created: bills.length,
    skipped,
    total: (students as any[]).length,
    month,
    message: `Created ${bills.length} bill${bills.length === 1 ? '' : 's'} for ${month} covering ${lineCount} programme line item${lineCount === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} student${skipped === 1 ? '' : 's'} already billed, skipped)` : ''}.`,
  })
}))

// ─── GET /api/payments/outstanding-guardians?month= ─────────────────────────
r.get('/outstanding-guardians', ah(async (req, res) => {
  const month = qs(req).get('month')?.trim() || currentMonth()

  const payments = await Payment.find({ month })
    .sort({ receiptNo: 1 })
    .lean()
  const sIds = [...new Set((payments as any[]).map((p) => p.studentId))]
  const [students, guardians] = await Promise.all([
    sIds.length ? Student.find({ _id: { $in: sIds } }, 'studentId fullName').lean() : [],
    sIds.length
      ? Guardian.find({ studentId: { $in: sIds } }, 'studentId name phone isPrimary')
          .sort({ isPrimary: -1, name: 1 })
          .lean()
      : [],
  ])
  const sMap = new Map((students as any[]).map((s) => [s._id.toString(), s]))
  const gByStudent = new Map<string, any[]>()
  for (const g of guardians as any[]) {
    if (!gByStudent.has(g.studentId)) gByStudent.set(g.studentId, [])
    gByStudent.get(g.studentId)!.push(g)
  }

  const buckets = new Map<string, any>()
  const unreachable: Array<{ studentRef: string; studentName: string; guardianName: string | null; balance: number; reason: string }> = []
  let billCount = 0
  let totalBalance = 0

  for (const p of payments as any[]) {
    const balance = round2(p.amount - p.paidAmount)
    if (balance <= 0) continue
    billCount++
    totalBalance = round2(totalBalance + balance)

    const lines =
      (p.items || []).length > 0
        ? (p.items || []).map((it: any) => ({
            description: it.description || 'Fee',
            amount: it.amount,
          }))
        : [{ description: 'Tuition fee', amount: p.amount }]

    const bill = {
      id: p._id.toString(),
      receiptNo: p.receiptNo ?? null,
      month: p.month,
      total: p.amount,
      paid: p.paidAmount,
      balance,
      dueDate: p.dueDate ? new Date(p.dueDate).toISOString() : null,
      status: p.status,
      lines,
    }

    const student = sMap.get(p.studentId)
    const gs = gByStudent.get(p.studentId) || []
    const reachable = gs.filter((g: any) => toWaPhone(g.phone) !== null)
    const chosen = reachable.find((g: any) => g.isPrimary) ?? reachable[0] ?? null

    if (!chosen) {
      unreachable.push({
        studentRef: student?.studentId ?? '',
        studentName: student?.fullName ?? '',
        guardianName: gs[0]?.name ?? null,
        balance,
        reason: gs.length === 0 ? 'No guardian on file' : 'No valid phone number',
      })
      continue
    }

    const wa = toWaPhone(chosen.phone)!
    let bucket = buckets.get(wa)
    if (!bucket) {
      bucket = {
        phone: wa,
        displayPhone: chosen.phone,
        guardianName: chosen.name,
        isPrimary: chosen.isPrimary,
        students: [],
        billCount: 0,
        totalBalance: 0,
      }
      buckets.set(wa, bucket)
    }
    bucket.billCount++
    bucket.totalBalance = round2(bucket.totalBalance + balance)

    let studentEntry = bucket.students.find((s: any) => s.studentId === p.studentId)
    if (!studentEntry) {
      studentEntry = {
        studentId: p.studentId,
        studentRef: student?.studentId ?? '',
        studentName: student?.fullName ?? '',
        bills: [],
        balance: 0,
      }
      bucket.students.push(studentEntry)
    }
    studentEntry.bills.push(bill)
    studentEntry.balance = round2(studentEntry.balance + balance)
  }

  const guardiansOut = Array.from(buckets.values()).sort((a: any, b: any) => b.totalBalance - a.totalBalance)
  res.json({
    month,
    totals: {
      guardians: guardiansOut.length,
      bills: billCount,
      outstanding: totalBalance,
      unreachable: unreachable.length,
    },
    guardians: guardiansOut,
    unreachable,
  })
}))

// ─── GET /api/payments/:id (AFTER static sub-paths) ─────────────────────────
r.get('/:id', ah(async (req, res) => {
  const doc = await Payment.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ error: 'Payment not found' })
  const maps = await programInfoMaps([doc])
  res.json(serializePayment(doc, maps, false))
}))

// ─── PUT /api/payments/:id ──────────────────────────────────────────────────
r.put('/:id', ah(async (req, res) => {
  const existing = await Payment.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Payment not found' })
  const body = req.body || {}

  if (body.studentId) {
    const s = await Student.findById(body.studentId)
    if (!s) return res.status(400).json({ error: 'Student not found' })
  }
  if (body.programId) {
    const p = await Program.findById(body.programId)
    if (!p) return res.status(400).json({ error: 'Program not found' })
  }
  if (body.month && !/^\d{4}-\d{2}$/.test(body.month)) {
    return res.status(400).json({ error: 'month must be YYYY-MM' })
  }
  if (body.method && !ALLOWED_METHODS.has(body.method)) {
    return res.status(400).json({ error: `method must be one of ${Array.from(ALLOWED_METHODS).join(', ')}` })
  }
  if (body.status && !ALLOWED_STATUSES.has(body.status)) {
    return res.status(400).json({ error: `status must be one of ${Array.from(ALLOWED_STATUSES).join(', ')}` })
  }
  if (body.receiptNo) {
    const clash = await Payment.findOne({ receiptNo: body.receiptNo })
    if (clash && clash._id.toString() !== req.params.id) {
      return res.status(400).json({ error: `receiptNo "${body.receiptNo}" already exists` })
    }
  }

  // Replace-all line items when items[]/programIds[] provided
  let replaceItems: Array<{ programId: string | null; amount: number; description: string | null }> | null = null
  let itemsTotal = 0
  if (Array.isArray(body.items) || Array.isArray(body.programIds)) {
    const lines: Array<{ programId: string | null; amount: number; description: string | null }> = []
    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const it of body.items) {
        const pid = it.programId?.trim() || null
        if (pid) {
          const prog = await Program.findById(pid).lean()
          if (!prog) return res.status(400).json({ error: 'Program not found' })
          lines.push({
            programId: pid,
            amount: typeof it.amount === 'number' && !isNaN(it.amount) && it.amount >= 0 ? it.amount : (prog as any).monthlyFee,
            description: it.description?.trim() || (prog as any).name,
          })
        } else {
          lines.push({
            programId: null,
            amount: typeof it.amount === 'number' && !isNaN(it.amount) && it.amount >= 0 ? it.amount : 0,
            description: it.description?.trim() || 'Custom charge',
          })
        }
      }
    } else if (Array.isArray(body.programIds) && body.programIds.length > 0) {
      const programs = await Program.find({ _id: { $in: body.programIds } }).lean()
      if (programs.length !== new Set(body.programIds).size) {
        return res.status(400).json({ error: 'One or more programs not found' })
      }
      const byId = new Map((programs as any[]).map((p) => [p._id.toString(), p]))
      for (const pid of body.programIds) {
        const prog = byId.get(pid)!
        lines.push({ programId: pid, amount: prog.monthlyFee, description: prog.name })
      }
    }
    const seen = new Set<string>()
    replaceItems = lines.filter((li) => {
      if (!li.programId) return true
      if (seen.has(li.programId)) return false
      seen.add(li.programId)
      return true
    })
    itemsTotal = replaceItems.reduce((s, li) => s + li.amount, 0)
  }

  const amount =
    typeof body.amount === 'number' && !isNaN(body.amount)
      ? Math.max(0, body.amount)
      : replaceItems
        ? itemsTotal
        : existing.amount
  const paidAmount =
    typeof body.paidAmount === 'number' && !isNaN(body.paidAmount)
      ? Math.max(0, body.paidAmount)
      : existing.paidAmount

  let status = body.status || existing.status
  let paidDate: Date | null | undefined = body.paidDate !== undefined ? parseDate(body.paidDate) : undefined

  if (paidAmount >= amount && amount > 0) {
    status = 'Paid'
    if (paidDate === undefined) paidDate = existing.paidDate ?? new Date()
  } else if (paidAmount > 0 && paidAmount < amount) {
    if (!body.status) {
      status = 'Partial'
      if (paidDate === undefined) paidDate = existing.paidDate ?? new Date()
    }
  } else if (paidAmount <= 0) {
    if (!body.status) status = 'Pending'
    if (paidDate === undefined) paidDate = null
  }

  if (body.studentId) existing.studentId = body.studentId
  if (replaceItems) {
    existing.programId = replaceItems.length === 1 ? replaceItems[0].programId : null
    existing.items = replaceItems.map((li) => ({
      programId: li.programId,
      amount: li.amount,
      description: li.description,
    })) as any
  } else if (body.programId !== undefined) {
    existing.programId = body.programId || null
  }
  if (body.classId !== undefined) existing.classId = body.classId
  if (body.month) existing.month = body.month
  if ((typeof body.amount === 'number' && !isNaN(body.amount)) || replaceItems) existing.amount = amount
  if (typeof body.paidAmount === 'number' && !isNaN(body.paidAmount)) existing.paidAmount = paidAmount
  if (body.method) existing.method = body.method
  if (status) existing.status = status
  if (paidDate !== undefined) existing.paidDate = paidDate
  if (body.dueDate !== undefined) existing.dueDate = parseDate(body.dueDate)
  if (body.note !== undefined) existing.note = body.note?.trim() || null
  if (body.receiptNo !== undefined) existing.receiptNo = body.receiptNo?.trim() || null

  await existing.save()
  const doc = await Payment.findById(existing._id).lean()
  const maps = await programInfoMaps([doc])
  res.json(serializePayment(doc, maps, false))
}))

// ─── DELETE /api/payments/:id ───────────────────────────────────────────────
r.delete('/:id', ah(async (req, res) => {
  const existing = await Payment.findById(req.params.id).lean()
  if (!existing) return res.status(404).json({ error: 'Payment not found' })
  await Payment.deleteOne({ _id: (existing as any)._id })
  res.json({
    ok: true,
    id: (existing as any)._id.toString(),
    receiptNo: (existing as any).receiptNo ?? null,
    month: (existing as any).month,
  })
}))

export default r
