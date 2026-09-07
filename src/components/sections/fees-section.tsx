'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Wallet,
  Plus,
  Pencil,
  Trash2,
  Download,
  Receipt as ReceiptIcon,
  Printer,
  CheckCircle2,
  Clock,
  AlertCircle,
  IndianRupee,
  Search,
  X,
  MoreVertical,
  Loader2,
  Users,
  Filter,
  CircleDollarSign,
  Zap,
  BellRing,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  PaymentRow,
  PaymentSummary,
  ProgramRow,
  StudentRow,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
} from '@/lib/types'
import { currency, currencyCompact, fmtDate, initials, avatarColor } from '@/lib/format'

import { SectionHeader } from '@/components/shared/section-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ─── Helpers ──────────────────────────────────────────────────────────────
function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function lastNMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map((n) => parseInt(n, 10))
  const d = new Date(y, mm - 1, 1)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'Paid':
      return 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'Partial':
      return 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'Overdue':
      return 'border-transparent bg-red-500/15 text-red-700 dark:text-red-300'
    case 'Pending':
    default:
      return 'border-transparent bg-slate-500/15 text-slate-700 dark:text-slate-300'
  }
}

function methodBadgeClasses(method: string): string {
  switch (method) {
    case 'Cash':
      return 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'Card':
      return 'border-transparent bg-purple-500/10 text-purple-700 dark:text-purple-300'
    case 'Bank':
      return 'border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300'
    case 'Online':
      return 'border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300'
    default:
      return 'border-transparent bg-muted text-muted-foreground'
  }
}

// ─── Bill line-item helpers ────────────────────────────────────────────────
type BillProgram = { id: string; code: string; name: string; color: string }

// Distinct programmes on a bill, from its line items (falls back to the
// legacy single-programme column when items are missing).
function billPrograms(p: PaymentRow): BillProgram[] {
  const out: BillProgram[] = []
  for (const it of p.items ?? []) {
    const prog = it.program
    if (prog && !out.some((x) => x.id === prog.id)) out.push(prog)
  }
  if (out.length === 0 && p.program) out.push(p.program)
  return out
}

interface BillLine {
  key: string
  description: string
  amount: number
  color: string | null
}

// One row per bill line item for receipts (falls back to the legacy
// single-programme amount when items are missing).
function billLines(p: PaymentRow): BillLine[] {
  if (p.items && p.items.length > 0) {
    return p.items.map((it, i) => ({
      key: it.programId ?? `item-${i}`,
      description: it.description ?? it.program?.name ?? 'Fee item',
      amount: it.amount,
      color: it.program?.color ?? null,
    }))
  }
  return [
    {
      key: p.programId ?? 'amount',
      description: p.program?.name ?? 'Fee',
      amount: p.amount,
      color: p.program?.color ?? null,
    },
  ]
}

// ─── Response shapes ──────────────────────────────────────────────────────
interface PaymentListResponse {
  data: PaymentRow[]
  total: number
  summary: PaymentSummary
}

// ─── Form state ────────────────────────────────────────────────────────────
interface FormState {
  studentId: string
  programIds: string[]
  month: string
  paidAmount: string
  method: string
  dueDate: string
  paidDate: string
  note: string
}

function emptyForm(month: string): FormState {
  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  const d = new Date(y, m - 1, 10)
  return {
    studentId: '',
    programIds: [],
    month,
    paidAmount: '0',
    method: 'Cash',
    dueDate: toIsoDate(d),
    paidDate: toIsoDate(new Date()),
    note: '',
  }
}

// ─── Main component ────────────────────────────────────────────────────────
export function FeesSection() {
  const [month, setMonth] = useState<string>(currentMonth())
  const [tab, setTab] = useState<'all' | 'outstanding' | 'paid'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [programFilter, setProgramFilter] = useState<string>('all')
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  const [rows, setRows] = useState<PaymentRow[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [programs, setPrograms] = useState<ProgramRow[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PaymentRow | null>(null)
  const [receiptTarget, setReceiptTarget] = useState<PaymentRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PaymentRow | null>(null)
  const [generating, setGenerating] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)

  // ─── Debounce search input ──────────────────────────────────────────────
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(h)
  }, [search])

  // ─── Load programs once ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    api<{ data: ProgramRow[] }>('/api/programs?active=true')
      .then((r) => alive && setPrograms(r.data || []))
      .catch(() => {
        /* silently ignore — programs select stays empty */
      })
    return () => {
      alive = false
    }
  }, [])

  // ─── Build query from filters + tab ────────────────────────────────────
  const reloadRef = useRef<() => void>(() => {})

  useEffect(() => {
    let alive = true
    const params = new URLSearchParams()
    params.set('month', month)
    params.set('limit', '200')
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (programFilter !== 'all') params.set('program', programFilter)
    if (methodFilter !== 'all') params.set('method', methodFilter)
    const url = `/api/payments?${params.toString()}`

    const run = () => {
      if (!alive) return
      setLoading(true)
      setError(null)
      api<PaymentListResponse>(url)
        .then((r) => {
          if (!alive) return
          let data = r.data
          if (tab === 'outstanding') {
            data = data.filter(
              (p) => p.status === 'Partial' || p.status === 'Pending' || p.status === 'Overdue',
            )
          } else if (tab === 'paid') {
            data = data.filter((p) => p.status === 'Paid')
          }
          setRows(data)
          setTotal(r.total)
          setSummary(r.summary)
        })
        .catch((e) => {
          if (!alive) return
          setError(e instanceof Error ? e.message : 'Failed to load payments')
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }

    // Expose for action handlers (delete/save) so they can re-fetch on demand
    reloadRef.current = run
    // Defer the first invocation so we don't call setState synchronously in the
    // effect body (satisfies react-hooks/set-state-in-effect lint rule).
    const t = setTimeout(run, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [month, debouncedSearch, statusFilter, programFilter, methodFilter, tab])

  const fetchPayments = useCallback(() => reloadRef.current(), [])

  // ─── Bulk-generate payments for the selected month ─────────────────────
  const handleBulkGenerate = useCallback(
    async (targetMonth: string, dueDate?: string) => {
      setGenerating(true)
      try {
        const res = await api<{ created: number; skipped: number; total: number; message: string }>(
          '/api/payments/bulk-generate',
          {
            method: 'POST',
            body: JSON.stringify({ month: targetMonth, dueDate }),
          },
        )
        if (res.created > 0) {
          toast.success(res.message)
        } else {
          toast.info(res.message)
        }
        setBulkOpen(false)
        fetchPayments()
      } catch (e: any) {
        toast.error(e.message || 'Bulk generation failed')
      } finally {
        setGenerating(false)
      }
    },
    [fetchPayments],
  )

  // ─── Send fee reminder (auto-create announcement for outstanding fees) ──
  const handleSendReminder = useCallback(async () => {
    setSendingReminder(true)
    try {
      const res = await api<{
        announcement: { id: string; title: string } | null
        outstandingCount: number
        outstandingAmount: number
        message: string
      }>('/api/payments/send-reminder', {
        method: 'POST',
        body: JSON.stringify({ month }),
      })
      if (res.announcement) {
        toast.success(res.message, { duration: 6000 })
      } else {
        toast.info(res.message)
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to send reminder')
    } finally {
      setSendingReminder(false)
    }
  }, [month])

  // ─── CSV export ────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const headers = [
      'Receipt No',
      'Student ID',
      'Student Name',
      'Program',
      'Programmes',
      'Month',
      'Amount',
      'Paid',
      'Balance',
      'Method',
      'Status',
      'Due Date',
      'Paid Date',
      'Note',
    ]
    const escape = (v: string | number | null | undefined): string => {
      const s = v === null || v === undefined ? '' : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    const lines = [headers.join(',')]
    for (const r of rows) {
      const progs = billPrograms(r)
      lines.push(
        [
          escape(r.receiptNo),
          escape(r.student.studentId),
          escape(r.student.fullName),
          escape(progs.map((x) => x.code).join(' + ')),
          escape(progs.length),
          escape(r.month),
          escape(r.amount),
          escape(r.paidAmount),
          escape(Math.max(0, r.amount - r.paidAmount)),
          escape(r.method),
          escape(r.status),
          escape(r.dueDate ? fmtDate(r.dueDate) : ''),
          escape(r.paidDate ? fmtDate(r.paidDate) : ''),
          escape(r.note ?? ''),
        ].join(','),
      )
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sanomin-payments-${month}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} payments to CSV`)
  }, [rows, month])

  const clearFilters = useCallback(() => {
    setStatusFilter('all')
    setProgramFilter('all')
    setMethodFilter('all')
    setSearch('')
  }, [])

  const hasFilters =
    statusFilter !== 'all' ||
    programFilter !== 'all' ||
    methodFilter !== 'all' ||
    debouncedSearch !== ''

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Fees & Payments"
        description="Monthly tuition fee tracking & receipts"
        icon={<Wallet className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkOpen(true)}
              className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
            >
              <Zap className="h-4 w-4" /> Generate Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendReminder}
              disabled={sendingReminder}
              className="gap-2 border-amber-500/40 text-amber-600 hover:bg-amber-500/5 dark:text-amber-400"
            >
              {sendingReminder ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              Send Reminder
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Record Payment
            </Button>
          </>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary ? (
          <>
            <StatCard
              label="Total Billed"
              value={currencyCompact(summary.totalBilled)}
              icon={CircleDollarSign}
              hint={`${monthLabel(month)}`}
              accent="blue"
            />
            <StatCard
              label="Total Collected"
              value={currencyCompact(summary.totalCollected)}
              icon={CheckCircle2}
              hint={
                summary.totalBilled > 0
                  ? `${Math.round((summary.totalCollected / summary.totalBilled) * 100)}% collected`
                  : '—'
              }
              accent="green"
            />
            <StatCard
              label="Outstanding"
              value={currencyCompact(summary.totalOutstanding)}
              icon={Clock}
              hint={`${summary.pendingCount} pending`}
              accent="amber"
            />
            <StatCard
              label="Overdue"
              value={summary.overdueCount}
              icon={AlertCircle}
              hint={`of ${total} payments`}
              accent="red"
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      {/* Month selector + Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Billing month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {lastNMonths(6).map((m) => (
                    <SelectItem key={m} value={m}>
                      {monthLabel(m)} ({m})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Program</Label>
              <Select value={programFilter} onValueChange={setProgramFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All programs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programs</SelectItem>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={p.code}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Method</Label>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="All methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search student / receipt no…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs + Table */}
      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="all">All Payments</TabsTrigger>
              <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{rows.length}</span> of {total}{' '}
            payments
          </p>
        </div>

        {error ? (
          <div className="p-6">
            <EmptyState
              icon={AlertCircle}
              title="Failed to load payments"
              description={error}
              action={
                <Button size="sm" onClick={fetchPayments}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Wallet}
              title="No payments found"
              description={
                hasFilters
                  ? `No payments match the current filters for ${monthLabel(month)}.`
                  : `No payment records for ${monthLabel(month)} yet. Record the first payment to get started.`
              }
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> Record Payment
                </Button>
              }
            />
          </div>
        ) : (
          <div className="scroll-thin max-h-[60vh] overflow-y-auto">
            <Table className="table-zebra">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <TableRow>
                  <TableHead className="w-[120px]">Receipt No</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Programmes</TableHead>
                  <TableHead className="w-[90px]">Month</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-[100px]">Method</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[60px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const balance = Math.max(0, p.amount - p.paidAmount)
                  const progs = billPrograms(p)
                  const shownProgs = progs.slice(0, 3)
                  const extraProgs = progs.length - shownProgs.length
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/40">
                      <TableCell>
                        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold tracking-tight">
                          {p.receiptNo ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={avatarColor(p.student.fullName)}>
                              {initials(p.student.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{p.student.fullName}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {p.student.studentId}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {progs.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {shownProgs.map((prog) => (
                              <Badge
                                key={prog.id}
                                variant="outline"
                                className="gap-1.5 border-transparent font-medium"
                                style={{
                                  backgroundColor: `${prog.color}1A`,
                                  color: prog.color,
                                }}
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: prog.color }}
                                />
                                {prog.code}
                              </Badge>
                            ))}
                            {extraProgs > 0 && (
                              <Badge
                                variant="outline"
                                className="border-transparent bg-muted text-muted-foreground"
                              >
                                +{extraProgs}
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {p.month}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {currency(p.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {currency(p.paidAmount)}
                      </TableCell>
                      <TableCell
                        className={
                          balance > 0
                            ? 'text-right text-sm font-semibold tabular-nums text-red-600 dark:text-red-400'
                            : 'text-right text-sm tabular-nums text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {currency(balance)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-medium ${methodBadgeClasses(p.method)}`}
                        >
                          {p.method}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-medium ${statusBadgeClasses(p.status)}`}
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Open actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditTarget(p)
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" /> Record / Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setReceiptTarget(p)}>
                              <ReceiptIcon className="mr-2 h-4 w-4" /> Print Receipt
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(p)}
                              className="text-red-600 focus:text-red-700 dark:text-red-400"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Create / Edit dialogs */}
      {createOpen && (
        <PaymentDialog
          mode="create"
          month={month}
          programs={programs}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false)
            fetchPayments()
          }}
        />
      )}
      {editTarget && (
        <PaymentDialog
          mode="edit"
          month={month}
          programs={programs}
          payment={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            fetchPayments()
          }}
        />
      )}

      {/* Receipt print dialog */}
      {receiptTarget && (
        <ReceiptDialog
          payment={receiptTarget}
          onClose={() => setReceiptTarget(null)}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete payment record?"
        description={
          deleteTarget
            ? `Receipt ${deleteTarget.receiptNo ?? '—'} for ${deleteTarget.student.fullName} (${monthLabel(
                deleteTarget.month,
              )}) will be permanently removed. This cannot be undone.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={async () => {
          if (!deleteTarget) return
          await api(`/api/payments/${deleteTarget.id}`, { method: 'DELETE' })
          toast.success('Payment deleted')
          fetchPayments()
        }}
      />

      {/* Bulk generate dialog */}
      <BulkGenerateDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        defaultMonth={month}
        generating={generating}
        onConfirm={handleBulkGenerate}
      />
    </div>
  )
}

// ─── Payment create/edit dialog ────────────────────────────────────────────
interface PaymentDialogProps {
  mode: 'create' | 'edit'
  month: string
  programs: ProgramRow[]
  payment?: PaymentRow | null
  onClose: () => void
  onSaved: () => void
}

function PaymentDialog({
  mode,
  month,
  programs,
  payment,
  onClose,
  onSaved,
}: PaymentDialogProps) {
  const [students, setStudents] = useState<StudentRow[]>([])
  const [studentQuery, setStudentQuery] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null)
  const [studentOpen, setStudentOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(() =>
    payment
      ? {
          studentId: payment.studentId,
          programIds: Array.from(
            new Set(
              [
                ...(payment.items ?? []).map((it) => it.programId),
                payment.programId,
              ].filter((id): id is string => !!id),
            ),
          ),
          month: payment.month,
          paidAmount: String(payment.paidAmount),
          method: payment.method,
          dueDate: payment.dueDate ? toIsoDate(new Date(payment.dueDate)) : '',
          paidDate: payment.paidDate ? toIsoDate(new Date(payment.paidDate)) : '',
          note: payment.note ?? '',
        }
      : emptyForm(month),
  )

  const isEdit = mode === 'edit' && !!payment

  // ─── Billable programmes (active list + legacy programmes on the bill) ─
  const allPrograms = useMemo<ProgramRow[]>(() => {
    const map = new Map<string, ProgramRow>()
    for (const p of programs) map.set(p.id, p)
    if (isEdit && payment) {
      for (const it of payment.items ?? []) {
        const prog = it.program
        if (prog && !map.has(prog.id)) {
          map.set(prog.id, {
            id: prog.id,
            code: prog.code,
            name: prog.name,
            description: null,
            color: prog.color,
            monthlyFee: prog.monthlyFee ?? it.amount,
            active: true,
          })
        }
      }
      if (payment.program && !map.has(payment.program.id)) {
        map.set(payment.program.id, {
          id: payment.program.id,
          code: payment.program.code,
          name: payment.program.name,
          description: null,
          color: payment.program.color,
          monthlyFee: 0,
          active: true,
        })
      }
    }
    return Array.from(map.values())
  }, [programs, isEdit, payment])

  const selectedPrograms = useMemo(
    () => allPrograms.filter((p) => form.programIds.includes(p.id)),
    [allPrograms, form.programIds],
  )

  // Bill total = Σ selected programme monthly fees (server recomputes the same)
  const totalAmount = useMemo(
    () => selectedPrograms.reduce((sum, p) => sum + (p.monthlyFee || 0), 0),
    [selectedPrograms],
  )

  // ─── Programme checkbox toggles / quick actions ──────────────────
  const toggleProgram = useCallback((id: string) => {
    setForm((f) => ({
      ...f,
      programIds: f.programIds.includes(id)
        ? f.programIds.filter((x) => x !== id)
        : [...f.programIds, id],
    }))
  }, [])

  const selectAllPrograms = useCallback(() => {
    setForm((f) => ({ ...f, programIds: allPrograms.map((p) => p.id) }))
  }, [allPrograms])

  const clearPrograms = useCallback(() => {
    setForm((f) => ({ ...f, programIds: [] }))
  }, [])

  // ─── Resolve selected student for edit mode ───────────────────────────
  useEffect(() => {
    if (!isEdit || !payment) return
    let alive = true
    api<{ data: StudentRow[] }>(
      `/api/students?q=${encodeURIComponent(payment.student.studentId)}&limit=5`,
    )
      .then((r) => {
        if (!alive) return
        const match = (r.data || []).find((s) => s.id === payment.studentId)
        if (match) setSelectedStudent(match)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      alive = false
    }
  }, [isEdit, payment])

  // ─── Debounced student search ────────────────────────────────────────
  useEffect(() => {
    if (studentQuery.trim().length < 2) {
      setStudents([])
      return
    }
    let alive = true
    const h = setTimeout(() => {
      api<{ data: StudentRow[] }>(
        `/api/students?q=${encodeURIComponent(studentQuery)}&limit=10`,
      )
        .then((r) => alive && setStudents(r.data || []))
        .catch(() => alive && setStudents([]))
    }, 250)
    return () => {
      alive = false
      clearTimeout(h)
    }
  }, [studentQuery])

  // ─── When student changes, auto-check their enrolled programmes ───────
  const handleSelectStudent = useCallback(
    (s: StudentRow) => {
      setSelectedStudent(s)
      setStudentOpen(false)
      setStudentQuery('')
      setForm((f) => {
        const enrolled = (s.enrollments ?? [])
          .map((e) => e.program?.id)
          .filter((id): id is string => !!id)
          .filter((id) => programs.some((p) => p.id === id))
        return {
          ...f,
          studentId: s.id,
          programIds:
            enrolled.length > 0 ? Array.from(new Set(enrolled)) : f.programIds,
        }
      })
    },
    [programs],
  )

  // ─── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.studentId) {
      toast.error('Please select a student')
      return
    }
    if (!/^\d{4}-\d{2}$/.test(form.month)) {
      toast.error('Month must be in YYYY-MM format')
      return
    }
    const programIds = Array.from(new Set(form.programIds))
    if (programIds.length === 0) {
      toast.error('Select at least one programme for this bill')
      return
    }
    const paidAmount = parseFloat(form.paidAmount) || 0
    setSaving(true)
    try {
      const payload = {
        studentId: form.studentId,
        month: form.month,
        programIds,
        paidAmount,
        method: form.method,
        dueDate: form.dueDate || null,
        paidDate: paidAmount > 0 ? form.paidDate || null : null,
        note: form.note.trim() || null,
      }
      if (isEdit && payment) {
        await api(`/api/payments/${payment.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        toast.success('Payment updated')
      } else {
        await api('/api/payments', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Payment recorded')
      }
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save payment')
    } finally {
      setSaving(false)
    }
  }

  const balance = Math.max(0, totalAmount - (parseFloat(form.paidAmount) || 0))

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            {isEdit ? 'Edit Payment' : 'Record Payment'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update receipt ${payment?.receiptNo ?? '—'} for ${payment?.student.fullName ?? ''}. Changing the selected programmes recalculates the bill total.`
              : 'One bill per student — tick one or more programmes and the total is computed automatically. Receipt number is auto-generated.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Student picker */}
          <div className="flex flex-col gap-1.5">
            <Label>Student *</Label>
            {selectedStudent ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className={avatarColor(selectedStudent.fullName)}>
                      {initials(selectedStudent.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{selectedStudent.fullName}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {selectedStudent.studentId}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!isEdit) {
                      setSelectedStudent(null)
                      setForm((f) => ({ ...f, studentId: '', programIds: [] }))
                    }
                  }}
                  disabled={isEdit}
                >
                  {isEdit ? 'Locked' : 'Change'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Type at least 2 chars to search students…"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    onFocus={() => setStudentOpen(true)}
                    className="pl-9"
                  />
                </div>
                {studentOpen && students.length > 0 && (
                  <div className="scroll-thin max-h-56 overflow-y-auto rounded-lg border bg-popover">
                    {students.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectStudent(s)}
                        className="flex w-full items-center gap-2.5 border-b border-border/50 p-2.5 text-left transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className={avatarColor(s.fullName)}>
                            {initials(s.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{s.fullName}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {s.studentId} · {s.ageGroup ?? '—'}
                          </p>
                        </div>
                        {s.enrollments?.[0]?.program && (
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px]"
                            style={{
                              backgroundColor: `${s.enrollments[0].program.color}1A`,
                              color: s.enrollments[0].program.color,
                            }}
                          >
                            {s.enrollments[0].program.code}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Month + Method */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Month (YYYY-MM) *</Label>
              <Input
                type="month"
                value={form.month}
                onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Method</Label>
              <Select
                value={form.method}
                onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
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
          </div>

          {/* Programmes multi-select (one bill, several programmes) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Programmes *</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={selectAllPrograms}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={clearPrograms}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="scroll-thin max-h-44 overflow-y-auto rounded-lg border p-1.5">
              {allPrograms.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  No active programmes available.
                </p>
              ) : (
                allPrograms.map((p) => {
                  const checked = form.programIds.includes(p.id)
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Checkbox
                          id={`bill-prog-${p.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleProgram(p.id)}
                        />
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        <Label
                          htmlFor={`bill-prog-${p.id}`}
                          className="min-w-0 cursor-pointer font-normal"
                        >
                          <span className="block truncate text-sm font-medium leading-tight">
                            {p.name}
                          </span>
                          <span className="block font-mono text-[10px] leading-tight text-muted-foreground">
                            {p.code}
                          </span>
                        </Label>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {currency(p.monthlyFee)}/mo
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Bill summary */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bill summary
            </p>
            {selectedPrograms.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No programmes selected yet — tick one or more above.
              </p>
            ) : (
              <div className="space-y-1.5">
                {selectedPrograms.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {currency(p.monthlyFee)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 border-t pt-2">
                  <span className="text-sm font-semibold">Total billed</span>
                  <span className="text-base font-bold tabular-nums text-primary">
                    {currency(totalAmount)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Paid amount + dates */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Paid amount (LKR)</Label>
                {totalAmount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, paidAmount: String(totalAmount) }))
                    }
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Pay full
                  </button>
                )}
              </div>
              <Input
                type="number"
                min={0}
                value={form.paidAmount}
                onChange={(e) => setForm((f) => ({ ...f, paidAmount: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Due date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Paid date</Label>
              <Input
                type="date"
                value={form.paidDate}
                disabled={parseFloat(form.paidAmount) <= 0}
                onChange={(e) => setForm((f) => ({ ...f, paidDate: e.target.value }))}
              />
            </div>
          </div>

          {/* Balance hint */}
          {balance > 0 ? (
            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Outstanding balance: <span className="font-semibold">{currency(balance)}</span>{' '}
              {parseFloat(form.paidAmount) > 0
                ? '· status will be set to Partial'
                : '· status will be set to Pending'}
            </div>
          ) : totalAmount > 0 ? (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              Fully paid · status will be set to <span className="font-semibold">Paid</span>
            </div>
          ) : null}

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <Label>Note</Label>
            <Textarea
              placeholder="Optional note / remarks"
              value={form.note}
              rows={2}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Receipt print dialog ──────────────────────────────────────────────────
interface ReceiptDialogProps {
  payment: PaymentRow
  onClose: () => void
}

function ReceiptDialog({ payment, onClose }: ReceiptDialogProps) {
  const receiptRef = useRef<HTMLDivElement>(null)
  const balance = Math.max(0, payment.amount - payment.paidAmount)
  const isPaid = payment.status === 'Paid'

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }, [])

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Receipt {payment.receiptNo}</DialogTitle>
          <DialogDescription>Printable receipt for the selected payment.</DialogDescription>
        </DialogHeader>

        <div ref={receiptRef} className="receipt-print">
          <div className="flex items-center justify-between gap-3 border-b p-4">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-lg ring-1 ring-border">
                <img
                  src="/sanomin-logo.jpg"
                  alt="SANOMIN"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold">SANOMIN</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  International Preschool
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">
              Payment Receipt
            </Badge>
          </div>

          <div className="space-y-4 p-4">
            {/* Receipt meta */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Receipt No
                </p>
                <p className="font-mono text-sm font-bold">{payment.receiptNo ?? '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Billed month
                </p>
                <p className="text-sm font-semibold">{monthLabel(payment.month)}</p>
              </div>
            </div>

            {/* Student */}
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Student
              </p>
              <div className="mt-1 flex items-center gap-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={avatarColor(payment.student.fullName)}>
                    {initials(payment.student.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold">{payment.student.fullName}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {payment.student.studentId}
                  </p>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-1.5 border-y py-3 text-sm">
              {billLines(payment).map((item, i) => (
                <div key={`${item.key}-${i}`} className="flex justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    {item.color && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                    )}
                    <span className="truncate">{item.description}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {currency(item.amount)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1.5">
                <span className="text-muted-foreground">Total billed</span>
                <span className="font-semibold tabular-nums">{currency(payment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount paid</span>
                <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {currency(payment.paidAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance</span>
                <span
                  className={`font-semibold tabular-nums ${
                    balance > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {currency(balance)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="font-medium">{payment.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid date</span>
                <span className="font-medium tabular-nums">
                  {payment.paidDate ? fmtDate(payment.paidDate) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due date</span>
                <span className="font-medium tabular-nums">
                  {payment.dueDate ? fmtDate(payment.dueDate) : '—'}
                </span>
              </div>
            </div>

            {/* Status + PAID stamp */}
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={`px-3 py-1 text-xs font-semibold ${statusBadgeClasses(payment.status)}`}
              >
                {payment.status}
              </Badge>
              {isPaid && (
                <div className="rotate-[-12deg] rounded-md border-2 border-emerald-500 px-3 py-1 text-lg font-extrabold uppercase tracking-widest text-emerald-500">
                  Paid
                </div>
              )}
            </div>

            {payment.note && (
              <div className="rounded-lg bg-muted/40 p-2 text-xs">
                <span className="text-muted-foreground">Note:</span> {payment.note}
              </div>
            )}

            <p className="text-center text-[10px] text-muted-foreground">
              This is a computer-generated receipt. Generated{' '}
              {new Date().toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>

        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden;
            }
            .receipt-print,
            .receipt-print * {
              visibility: visible;
            }
            .receipt-print {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              max-width: 100%;
              padding: 0;
              margin: 0;
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  )
}

// ─── Bulk Generate Dialog ──────────────────────────────────────────────────
interface BulkGenerateDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  defaultMonth: string
  generating: boolean
  onConfirm: (month: string, dueDate?: string) => void
}

function BulkGenerateDialog({
  open,
  onOpenChange,
  defaultMonth,
  generating,
  onConfirm,
}: BulkGenerateDialogProps) {
  const [targetMonth, setTargetMonth] = useState(defaultMonth)
  const [dueDate, setDueDate] = useState('')

  useEffect(() => {
    if (!open) return
    const [y, m] = defaultMonth.split('-').map(Number)
    const dd = `${y}-${String(m).padStart(2, '0')}-10`
    // Defer to avoid synchronous setState in effect body
    Promise.resolve().then(() => {
      setTargetMonth(defaultMonth)
      setDueDate(dd)
    })
  }, [open, defaultMonth])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
            </div>
            Generate Monthly Fees
          </DialogTitle>
          <DialogDescription>
            Creates <span className="font-medium">one bill per student</span> for the selected
            month. Every programme the student is enrolled in becomes a line item on that single
            bill — the student&rsquo;s name appears once, no matter how many programmes they take.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-month">Target month *</Label>
            <Input
              id="bulk-month"
              type="month"
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Bills will be created with status &ldquo;Pending&rdquo; and one line item per
              enrolled programme.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="bulk-due">Due date (optional)</Label>
            <Input
              id="bulk-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              When payment is due. Defaults to the 10th of the month.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-amber-700 dark:text-amber-300">
              <p className="font-medium">Students already billed are skipped</p>
              <p className="mt-0.5 text-amber-600/80 dark:text-amber-400/80">
                If a student already has a bill for this month, no duplicate will be created.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(targetMonth, dueDate || undefined)}
            disabled={generating || !targetMonth}
            className="gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Generate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
