'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Printer,
  Search,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'

import { api } from '@/lib/api'
import { PaymentRow, StudentRow, PAYMENT_METHODS } from '@/lib/types'
import { currency, fmtDate, initials, avatarColor } from '@/lib/format'
import { useSchoolInfo } from '@/lib/school'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Helpers ────────────────────────────────────────────────────────────────
function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map((n) => parseInt(n, 10))
  return new Date(y, mm - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function lkr(n: number): string {
  return `LKR ${Number(n || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// ─── Receipt print (self-contained popup) ───────────────────────────────────
type SchoolInfoShape = ReturnType<typeof useSchoolInfo>

function printReceiptDocument(payment: PaymentRow, school: SchoolInfoShape): void {
  const win = window.open('', '_blank', 'width=860,height=1000')
  if (!win) {
    toast.error('Pop-up blocked — allow pop-ups to print receipts.')
    return
  }

  const balance = Math.max(0, payment.amount - payment.paidAmount)
  const lines =
    (payment.items ?? []).length > 0
      ? (payment.items ?? []).map((it) => ({
          desc: it.description ?? it.program?.name ?? 'Fee',
          amount: it.amount,
          color: it.program?.color ?? null,
        }))
      : [
          {
            desc: payment.program?.name ?? 'Fee',
            amount: payment.amount,
            color: payment.program?.color ?? null,
          },
        ]

  const generated = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Receipt ${escapeHtml(payment.receiptNo ?? '')} — ${escapeHtml(payment.student.fullName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; background: #f1f5f9; color: #0f172a; padding: 24px; }
  .sheet { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
  .head { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid #e2e8f0; gap: 12px; }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand img { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; border: 1px solid #e2e8f0; flex-shrink: 0; }
  .brand-name { font-size: 14px; font-weight: 700; line-height: 1.2; }
  .brand-sub { font-size: 10px; text-transform: uppercase; letter-spacing: 1.4px; color: #64748b; margin-top: 2px; }
  .brand-meta { font-size: 10px; color: #94a3b8; margin-top: 3px; }
  .badge-tag { display: inline-block; padding: 3px 10px; border-radius: 999px; border: 1px solid #cbd5e1; font-size: 10px; font-weight: 600; color: #334155; background: #f8fafc; flex-shrink: 0; }
  .body { padding: 20px 24px; }
  .row-between { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
  .field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 2px; }
  .field-value { font-size: 14px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .field-value-plain { font-size: 14px; font-weight: 700; }
  .student-box { background: #f8fafc; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
  .student-name { font-size: 14px; font-weight: 700; }
  .student-id { font-family: ui-monospace, monospace; font-size: 11px; color: #64748b; margin-top: 2px; }
  .lines { border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 12px 0; margin-bottom: 16px; }
  .line { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 3px 0; }
  .line-label { color: #64748b; display: flex; align-items: center; gap: 6px; min-width: 0; }
  .line-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
  .line-value { font-variant-numeric: tabular-nums; font-weight: 500; white-space: nowrap; }
  .line.total { border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 8px; font-weight: 700; }
  .line.paid .line-value { color: #059669; font-weight: 700; }
  .line.balance-due .line-value { color: #dc2626; font-weight: 700; }
  .line.balance-clear .line-value { color: #059669; font-weight: 700; }
  .status-pill { display: inline-block; padding: 4px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .note-box { background: #f8fafc; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #475569; margin-bottom: 14px; }
  .footer { text-align: center; font-size: 10px; color: #94a3b8; padding-top: 10px; }
  @media print { body { background: #fff; padding: 0; } .sheet { border: none; border-radius: 0; } }
</style></head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="brand">
        <img src="${escapeHtml(school.logoUrl)}" alt="${escapeHtml(school.shortName)}" />
        <div>
          <div class="brand-name">${escapeHtml(school.shortName)}</div>
          <div class="brand-sub">${escapeHtml(school.subtitle)}</div>
          <div class="brand-meta">${escapeHtml([school.address, school.phone].filter(Boolean).join(' · '))}</div>
        </div>
      </div>
      <span class="badge-tag">Payment Receipt</span>
    </div>
    <div class="body">
      <div class="row-between">
        <div>
          <div class="field-label">Receipt No</div>
          <div class="field-value">${escapeHtml(payment.receiptNo ?? '—')}</div>
        </div>
        <div style="text-align:right">
          <div class="field-label">Billed Month</div>
          <div class="field-value-plain">${escapeHtml(monthLabel(payment.month))}</div>
        </div>
      </div>
      <div class="student-box">
        <div class="field-label">Student</div>
        <div class="student-name">${escapeHtml(payment.student.fullName)}</div>
        <div class="student-id">${escapeHtml(payment.student.studentId)}</div>
      </div>
      <div class="lines">
        ${lines.map((l) => `
          <div class="line">
            <span class="line-label">
              ${l.color ? `<span class="line-dot" style="background:${escapeHtml(l.color)}"></span>` : ''}
              <span>${escapeHtml(l.desc)}</span>
            </span>
            <span class="line-value">${lkr(l.amount)}</span>
          </div>`).join('')}
        <div class="line total"><span class="line-label">Total billed</span><span class="line-value">${lkr(payment.amount)}</span></div>
        <div class="line paid"><span class="line-label">Amount paid</span><span class="line-value">${lkr(payment.paidAmount)}</span></div>
        <div class="line ${balance > 0 ? 'balance-due' : 'balance-clear'}"><span class="line-label">Balance</span><span class="line-value">${lkr(balance)}</span></div>
        <div class="line"><span class="line-label">Method</span><span class="line-value">${escapeHtml(payment.method)}</span></div>
        <div class="line"><span class="line-label">Paid date</span><span class="line-value">${escapeHtml(payment.paidDate ? fmtDate(payment.paidDate) : '—')}</span></div>
      </div>
      <div style="margin-bottom:16px"><span class="status-pill" style="background:#d1fae5;color:#065f46">${escapeHtml(payment.status)}</span></div>
      ${payment.note ? `<div class="note-box"><strong>Note:</strong> ${escapeHtml(payment.note)}</div>` : ''}
      <div class="footer">Computer-generated receipt · ${escapeHtml(generated)}</div>
    </div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)};</script>
</body></html>`)
  win.document.close()
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function PaymentDataEntryPage() {
  const school = useSchoolInfo()
  const searchRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<StudentRow[]>([])
  const [searching, setSearching] = useState(false)
  const [student, setStudent] = useState<StudentRow | null>(null)

  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([])
  const [month, setMonth] = useState(currentMonth())
  const [method, setMethod] = useState('Cash')
  const [paidAmount, setPaidAmount] = useState('0')
  const [note, setNote] = useState('')

  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<PaymentRow | null>(null)
  const [sessionLog, setSessionLog] = useState<PaymentRow[]>([])

  // Debounce search
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(h)
  }, [query])

  // Fetch search results
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([])
      return
    }
    let alive = true
    setSearching(true)
    api<{ data: StudentRow[] }>(
      `/api/students?q=${encodeURIComponent(debouncedQuery)}&limit=8`,
    )
      .then((r) => alive && setResults(r.data ?? []))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setSearching(false))
    return () => {
      alive = false
    }
  }, [debouncedQuery])

  // Focus the search box on mount and after reset
  useEffect(() => {
    if (!student) searchRef.current?.focus()
  }, [student])

  // Programmes available for the selected student's enrolments
  const enrolledProgrammes = useMemo(() => {
    if (!student) return []
    const seen = new Set<string>()
    const out: { id: string; code: string; name: string; color: string; amount: number; className: string | null }[] = []
    for (const e of student.enrollments ?? []) {
      if (!e.program) continue
      if (seen.has(e.program.id)) continue
      seen.add(e.program.id)
      const cls = e.class
      const classFee = cls && typeof cls.fee === 'number' && cls.fee > 0 ? cls.fee : 0
      out.push({
        id: e.program.id,
        code: e.program.code,
        name: e.program.name,
        color: e.program.color,
        amount: classFee, // per-student fee (from class if > 0, else 0 — server recomputes)
        className: cls?.name ?? null,
      })
    }
    return out
  }, [student])

  // Auto-select all enrolled programmes when a student is picked
  useEffect(() => {
    if (student) setSelectedProgramIds(enrolledProgrammes.map((p) => p.id))
  }, [student, enrolledProgrammes])

  const totalAmount = useMemo(
    () => enrolledProgrammes
      .filter((p) => selectedProgramIds.includes(p.id))
      .reduce((sum, p) => sum + p.amount, 0),
    [enrolledProgrammes, selectedProgramIds],
  )

  const paidNum = parseFloat(paidAmount) || 0
  const balance = Math.max(0, totalAmount - paidNum)

  // "Pay full" default whenever total is computed
  useEffect(() => {
    if (totalAmount > 0) setPaidAmount(String(totalAmount))
  }, [totalAmount])

  const reset = useCallback(() => {
    setStudent(null)
    setQuery('')
    setResults([])
    setSelectedProgramIds([])
    setPaidAmount('0')
    setNote('')
    setLastSaved(null)
    // month + method stay so the operator doesn't have to reselect them
  }, [])

  const toggleProgramme = (id: string) => {
    setSelectedProgramIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleSave = async () => {
    if (!student) {
      toast.error('Pick a student first')
      return
    }
    if (selectedProgramIds.length === 0) {
      toast.error('Select at least one programme')
      return
    }
    if (paidNum <= 0) {
      toast.error('Paid amount must be greater than 0')
      return
    }

    setSaving(true)
    try {
      const res = await api<PaymentRow>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          studentId: student.id,
          month,
          programIds: selectedProgramIds,
          paidAmount: paidNum,
          method,
          note: note.trim() || null,
        }),
      })
      toast.success(`Payment recorded · Receipt ${res.receiptNo ?? ''}`)
      setLastSaved(res)
      setSessionLog((prev) => [res, ...prev].slice(0, 20))
      // Ask to print immediately
      setTimeout(() => {
        try {
          printReceiptDocument(res, school)
        } catch {
          /* ignore print errors */
        }
      }, 200)
      // Auto-clear the form for the next student
      setStudent(null)
      setQuery('')
      setResults([])
      setSelectedProgramIds([])
      setPaidAmount('0')
      setNote('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wallet className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">{school.shortName} · Payment Entry</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {monthLabel(month)} · {method}
                </p>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex">
            {sessionLog.length} recorded this session
          </Badge>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 sm:p-6">
        {/* STEP 1 — Find student */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-semibold">1 · Find the student</Label>
            {student && (
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Change
              </button>
            )}
          </div>

          {!student ? (
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  autoFocus
                  placeholder="Type name, ID, index no, or scan barcode…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && results[0]) {
                      setStudent(results[0])
                    }
                  }}
                  className="h-12 pl-10 pr-10 text-base"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>

              {results.length > 0 && (
                <div className="overflow-hidden rounded-lg border bg-card">
                  {results.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStudent(s)}
                      className="flex w-full items-center gap-3 border-b border-border/50 px-3 py-3 text-left transition-colors last:border-0 hover:bg-muted/50"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className={avatarColor(s.fullName)}>
                          {initials(s.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{s.fullName}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {s.studentId} · {s.ageGroup ?? '—'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-muted-foreground">
                          {s.enrollments?.length ?? 0} programme
                          {(s.enrollments?.length ?? 0) === 1 ? '' : 's'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {debouncedQuery.length >= 2 && !searching && results.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  No students match "{debouncedQuery}".
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-lg border bg-card p-3">
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarFallback className={avatarColor(student.fullName)}>
                  {initials(student.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{student.fullName}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {student.studentId} · {student.ageGroup ?? '—'} · {student.gender}
                </p>
                {(student.guardians?.length ?? 0) > 0 && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <UserRound className="h-3 w-3 shrink-0" />
                    {student.guardians[0].name}
                    {student.guardians[0].phone ? ` · ${student.guardians[0].phone}` : ''}
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* STEP 2 — Programmes */}
        {student && (
          <Card className="p-4 sm:p-5">
            <Label className="text-sm font-semibold">
              2 · Programmes to bill this month
            </Label>
            {enrolledProgrammes.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                This student is not enrolled in any programmes. Add them in the
                Students section first.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {enrolledProgrammes.map((p) => {
                  const checked = selectedProgramIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProgramme(p.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                        checked
                          ? 'border-primary/40 bg-primary/5'
                          : 'bg-card hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Checkbox checked={checked} className="pointer-events-none" />
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {p.name}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">
                            {p.code}
                            {p.className ? ` · ${p.className}` : ''}
                          </span>
                        </span>
                      </div>
                      <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                        {currency(p.amount)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* STEP 3 — Payment details */}
        {student && enrolledProgrammes.length > 0 && (
          <Card className="p-4 sm:p-5">
            <Label className="text-sm font-semibold">3 · Payment details</Label>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Month</Label>
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Paid now (LKR)</Label>
                  {totalAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaidAmount(String(totalAmount))}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      Pay full
                    </button>
                  )}
                </div>
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="h-11 text-base font-semibold tabular-nums"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Note (optional)</Label>
              <Textarea
                rows={2}
                placeholder="Anything to remember about this payment…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="mt-4 flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total billed</span>
                <span className="font-semibold tabular-nums">{currency(totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Paying now</span>
                <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {currency(paidNum)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-sm font-semibold">
                  {balance > 0 ? 'Balance remaining' : 'Settled in full'}
                </span>
                <span
                  className={`text-xl font-bold tabular-nums ${
                    balance > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {currency(balance)}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={reset} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || paidNum <= 0 || selectedProgramIds.length === 0}
                className="h-11 gap-2 text-base"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Record & print receipt'}
              </Button>
            </div>
          </Card>
        )}

        {/* Confirmation of last saved */}
        {lastSaved && (
          <Card className="flex items-center gap-3 border-emerald-500/40 bg-emerald-500/5 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                Saved · Receipt {lastSaved.receiptNo ?? '—'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {lastSaved.student.fullName} · {currency(lastSaved.paidAmount)} via{' '}
                {lastSaved.method}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => printReceiptDocument(lastSaved, school)}
            >
              <Printer className="h-3.5 w-3.5" /> Print again
            </Button>
          </Card>
        )}

        {/* Session log */}
        {sessionLog.length > 0 && (
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Recorded this session</Label>
              <button
                type="button"
                onClick={() => setSessionLog([])}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Clear log
              </button>
            </div>
            <div className="mt-3 divide-y divide-border rounded-lg border">
              {sessionLog.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className={`${avatarColor(p.student.fullName)} text-[10px] font-semibold`}>
                      {initials(p.student.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.student.fullName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {p.receiptNo ?? '—'} · {p.method}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {currency(p.paidAmount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(p.createdAt).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => printReceiptDocument(p, school)}
                    title="Print receipt"
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>

      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 text-[11px] text-muted-foreground">
          <span>{school.name}</span>
          <span>Anyone with access can record payments · No login required</span>
        </div>
      </footer>
    </div>
  )
}
