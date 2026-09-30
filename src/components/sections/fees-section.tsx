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
  Search,
  X,
  MoreVertical,
  Loader2,
  Users,
  CircleDollarSign,
  Zap,
  BellRing,
  FileText,
  MessageCircle,
  MessageCircleMore,
  Copy,
  ExternalLink,
  UserRound,
  Eye,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
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
import { useSchoolInfo, toWaPhone } from '@/lib/school'

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
  const [statementTarget, setStatementTarget] = useState<PaymentRow | null>(null)
  const [whatsappTarget, setWhatsappTarget] = useState<PaymentRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PaymentRow | null>(null)
  const [generating, setGenerating] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [blastOpen, setBlastOpen] = useState(false)
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

    reloadRef.current = run
    const t = setTimeout(run, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [month, debouncedSearch, statusFilter, programFilter, methodFilter, tab])

  const fetchPayments = useCallback(() => reloadRef.current(), [])

  // ─── Bulk-generate payments for the selected month ─────────────────────
  const handleBulkGenerate = useCallback(
    async (targetMonth: string, dueDate?: string, skipEmpty?: boolean) => {
      setGenerating(true)
      try {
        const res = await api<{ created: number; skipped: number; total: number; message: string }>(
          '/api/payments/bulk-generate',
          {
            method: 'POST',
            body: JSON.stringify({ month: targetMonth, dueDate, skipEmpty: skipEmpty === true }),
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

  // ─── Send fee reminder ─────────────────────────────────────────────────
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
          <div className="flex flex-wrap items-center justify-end gap-2">
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
              variant="outline"
              size="sm"
              onClick={() => setBlastOpen(true)}
              className="gap-2 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/5 dark:text-emerald-400"
            >
              <MessageCircleMore className="h-4 w-4" />
              WhatsApp Blast
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Record Payment
            </Button>
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
      <Card className="min-w-0 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="flex w-full flex-col gap-1.5 sm:w-auto">
              <Label className="text-xs text-muted-foreground">Billing month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-full sm:w-[200px]">
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
            <div className="flex w-full flex-col gap-1.5 sm:w-auto">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[140px]">
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
            <div className="flex w-full flex-col gap-1.5 sm:w-auto">
              <Label className="text-xs text-muted-foreground">Program</Label>
              <Select value={programFilter} onValueChange={setProgramFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
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
            <div className="flex w-full flex-col gap-1.5 sm:w-auto">
              <Label className="text-xs text-muted-foreground">Method</Label>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="w-full sm:w-[130px]">
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
          <div className="flex w-full items-center gap-2 lg:w-auto">
            <div className="relative min-w-0 flex-1 lg:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search student / receipt no…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 shrink-0">
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs + Table */}
      <Card className="min-w-0 p-0">
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
          <div className="scroll-thin max-h-[60vh] overflow-auto">
            <Table className="table-zebra min-w-[1000px]">
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
                            <DropdownMenuItem onClick={() => setEditTarget(p)}>
                              <Pencil className="mr-2 h-4 w-4" /> Record / Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setReceiptTarget(p)}>
                              <ReceiptIcon className="mr-2 h-4 w-4" /> Print Receipt
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatementTarget(p)}>
                              <FileText className="mr-2 h-4 w-4" /> Fee Statement
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setWhatsappTarget(p)}>
                              <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                              {balance > 0 ? ' reminder' : ' receipt'}
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

      {receiptTarget && (
        <ReceiptDialog payment={receiptTarget} onClose={() => setReceiptTarget(null)} />
      )}

      {statementTarget && (
        <StudentStatementDialog
          studentId={statementTarget.student.id}
          onClose={() => setStatementTarget(null)}
        />
      )}

      {whatsappTarget && (
        <WhatsAppDialog payment={whatsappTarget} onClose={() => setWhatsappTarget(null)} />
      )}

      {blastOpen && <BulkWhatsAppDialog month={month} onClose={() => setBlastOpen(false)} />}

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

  const totalAmount = useMemo(
    () => selectedPrograms.reduce((sum, p) => sum + (p.monthlyFee || 0), 0),
    [selectedPrograms],
  )

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

  useEffect(() => {
    if (studentQuery.trim().length < 2) {
      setStudents([])
      return
    }
    let alive = true
    const h = setTimeout(() => {
      api<{ data: StudentRow[] }>(`/api/students?q=${encodeURIComponent(studentQuery)}&limit=10`)
        .then((r) => alive && setStudents(r.data || []))
        .catch(() => alive && setStudents([]))
    }, 250)
    return () => {
      alive = false
      clearTimeout(h)
    }
  }, [studentQuery])

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
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
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
          <div className="flex flex-col gap-1.5">
            <Label>Student *</Label>
            {selectedStudent ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className={avatarColor(selectedStudent.fullName)}>
                      {initials(selectedStudent.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{selectedStudent.fullName}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
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
                  className="shrink-0"
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
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className={avatarColor(s.fullName)}>
                            {initials(s.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{s.fullName}</p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
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

// ─── WhatsApp reminder / receipt share dialog ─────────────────────────────
function WhatsAppDialog({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const school = useSchoolInfo()
  const balance = Math.max(0, payment.amount - payment.paidAmount)
  const hasBalance = balance > 0

  const guardians = payment.student.guardians ?? []
  const [guardianIdx, setGuardianIdx] = useState(0)
  const guardian = guardians[guardianIdx] ?? null

  const defaultMessage = useMemo(() => {
    const month = monthLabel(payment.month)
    const lines: string[] = []
    if (hasBalance) {
      lines.push(
        `Dear ${guardian?.name || 'Parent'},`,
        ``,
        `Friendly reminder from ${school.name}: the tuition fee for *${payment.student.fullName}* (${payment.student.studentId}) is due for ${month}.`,
        ``,
        `*Bill ${payment.receiptNo ?? ''}*`,
      )
      for (const l of billLines(payment)) {
        lines.push(`• ${l.description}: LKR ${l.amount.toLocaleString()}`)
      }
      lines.push(
        `Total: LKR ${payment.amount.toLocaleString()}`,
        `Paid: LKR ${payment.paidAmount.toLocaleString()}`,
        `*Balance due: LKR ${balance.toLocaleString()}*`,
        ``,
        `Kindly settle the balance at your earliest convenience. Payments accepted via Cash, Card or Bank transfer.`,
        ``,
        `Thank you!`,
        `— ${school.name}${school.phone ? ` (${school.phone})` : ''}`,
      )
    } else {
      lines.push(
        `Dear ${guardian?.name || 'Parent'},`,
        ``,
        `Thank you for settling the fees for *${payment.student.fullName}* (${payment.student.studentId}) — ${month}.`,
        ``,
        `*Receipt ${payment.receiptNo ?? ''}*`,
      )
      for (const l of billLines(payment)) {
        lines.push(`• ${l.description}: LKR ${l.amount.toLocaleString()}`)
      }
      lines.push(
        `Total paid: LKR ${payment.paidAmount.toLocaleString()} (${payment.method})`,
        ``,
        `We appreciate your prompt payment!`,
        `— ${school.name}${school.phone ? ` (${school.phone})` : ''}`,
      )
    }
    return lines.join('\n')
  }, [payment, hasBalance, balance, guardian?.name, school.name, school.phone])

  const [message, setMessage] = useState(defaultMessage)
  useEffect(() => {
    setMessage(defaultMessage)
  }, [defaultMessage])

  const waPhone = toWaPhone(guardian?.phone)
  const waHref = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
    : null

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message)
      toast.success('Message copied to clipboard')
    } catch {
      toast.error('Could not copy — please select the text manually')
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex w-[95vw] max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <MessageCircle className="h-4 w-4" />
            </span>
            {hasBalance ? 'WhatsApp reminder' : 'WhatsApp receipt'}
          </DialogTitle>
          <DialogDescription>
            {payment.student.fullName} · {monthLabel(payment.month)} ·{' '}
            {hasBalance ? (
              <span className="font-semibold text-red-600 dark:text-red-400">
                balance {currency(balance)}
              </span>
            ) : (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">fully paid</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="scroll-thin -mx-1 flex-1 space-y-4 overflow-y-auto px-1">
          {guardians.length === 0 ? (
            <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              No guardian phone numbers on file for this student. Add a guardian with a phone
              number in the Students section to send WhatsApp messages.
            </div>
          ) : guardians.length > 1 ? (
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Send to</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {guardians.map((g, i) => {
                  const active = i === guardianIdx
                  return (
                    <button
                      key={`${g.name}-${i}`}
                      type="button"
                      onClick={() => setGuardianIdx(i)}
                      className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-emerald-500/60 bg-emerald-500/10'
                          : 'bg-muted/30 hover:bg-muted/60'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          active
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {initials(g.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {g.name}
                          {g.isPrimary && (
                            <span className="ml-1 rounded bg-primary/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                              primary
                            </span>
                          )}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {g.phone}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : guardian ? (
            <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 p-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <UserRound className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">
                  {guardian.name}
                  {guardian.relationship ? ` · ${guardian.relationship}` : ''}
                </p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{guardian.phone}</p>
              </div>
              {waPhone && (
                <Badge
                  variant="outline"
                  className="ml-auto shrink-0 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                >
                  WhatsApp ready
                </Badge>
              )}
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Message</Label>
              <button
                type="button"
                onClick={copyMessage}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              className="min-h-[180px] resize-y bg-muted/30 font-medium leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              *asterisks* render as <span className="font-bold">bold</span> in WhatsApp. Edit the
              text above before sending if needed.
            </p>
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {waHref ? (
            <Button
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => window.open(waHref, '_blank', 'noopener')}
            >
              <ExternalLink className="h-4 w-4" />
              Open WhatsApp
            </Button>
          ) : (
            <Button disabled className="gap-2">
              <MessageCircle className="h-4 w-4" />
              {guardian ? 'Invalid phone number' : 'No guardian phone'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Bulk WhatsApp blast ───────────────────────────────────────────────────
interface BlastBill {
  id: string
  receiptNo: string | null
  month: string
  total: number
  paid: number
  balance: number
  dueDate: string | null
  status: string
  lines: { description: string; amount: number }[]
}
interface BlastStudent {
  studentId: string
  studentRef: string
  studentName: string
  bills: BlastBill[]
  balance: number
}
interface BlastGuardian {
  phone: string
  displayPhone: string
  guardianName: string
  isPrimary: boolean
  students: BlastStudent[]
  billCount: number
  totalBalance: number
}
interface BlastData {
  month: string
  totals: { guardians: number; bills: number; outstanding: number; unreachable: number }
  guardians: BlastGuardian[]
  unreachable: Array<{
    studentRef: string
    studentName: string
    guardianName: string | null
    balance: number
    reason: string
  }>
}

function blastMessage(
  g: BlastGuardian,
  schoolName: string,
  schoolPhone: string,
  month: string,
): string {
  const lines: string[] = [
    `Dear ${g.guardianName || 'Parent'},`,
    ``,
    `Friendly reminder from ${schoolName}: the following fees are due for ${monthLabel(month)}.`,
  ]
  for (const s of g.students) {
    lines.push(``, `*${s.studentName}* (${s.studentRef})`)
    for (const b of s.bills) {
      if (b.lines.length > 1 || (b.lines[0] && b.lines[0].description !== 'Tuition fee')) {
        for (const l of b.lines) lines.push(`• ${l.description}: LKR ${l.amount.toLocaleString()}`)
      }
      lines.push(`• Bill ${b.receiptNo ?? ''} — balance: *LKR ${b.balance.toLocaleString()}*`)
    }
  }
  lines.push(
    ``,
    `*Total balance due: LKR ${g.totalBalance.toLocaleString()}*`,
    ``,
    `Kindly settle at your earliest convenience. Payments accepted via Cash, Card or Bank transfer.`,
    ``,
    `Thank you!`,
    `— ${schoolName}${schoolPhone ? ` (${schoolPhone})` : ''}`,
  )
  return lines.join('\n')
}

function BulkWhatsAppDialog({ month, onClose }: { month: string; onClose: () => void }) {
  const school = useSchoolInfo()
  const [data, setData] = useState<BlastData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [refetchTick, setRefetchTick] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => {
      if (!alive) return
      setLoading(true)
      setError(null)
    })
    api<BlastData>(`/api/payments/outstanding-guardians?month=${month}`)
      .then((d) => {
        if (!alive) return
        setData(d)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load queue'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [month, refetchTick])

  const markSent = (phone: string) =>
    setSent((prev) => {
      const next = new Set(prev)
      next.add(phone)
      return next
    })

  const openChat = (g: BlastGuardian) => {
    const msg = blastMessage(g, school.name, school.phone, month)
    window.open(`https://wa.me/${g.phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
    markSent(g.phone)
  }

  const copyOne = async (g: BlastGuardian) => {
    try {
      await navigator.clipboard.writeText(blastMessage(g, school.name, school.phone, month))
      toast.success(`Message for ${g.guardianName || g.displayPhone} copied`)
    } catch {
      toast.error('Could not copy — please try again')
    }
  }

  const nextGuardian = data?.guardians.find((g) => !sent.has(g.phone)) ?? null
  const contacted = sent.size
  const queueTotal = data?.guardians.length ?? 0

  const openNext = () => {
    if (!nextGuardian) return
    openChat(nextGuardian)
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex w-[95vw] max-h-[88vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <MessageCircleMore className="h-4 w-4" />
            </span>
            WhatsApp blast — outstanding fees
          </DialogTitle>
          <DialogDescription>
            One message per family, combining every outstanding bill for {monthLabel(month)}.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid gap-2 py-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={() => setRefetchTick((t) => t + 1)}>
              Retry
            </Button>
          </div>
        ) : !data || data.guardians.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold">Nothing to chase 🎉</p>
            <p className="text-xs text-muted-foreground">
              Every bill for {monthLabel(month)} is fully settled — no reminders needed.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="font-semibold text-foreground">{queueTotal} families</span>
                <span className="text-muted-foreground">{data.totals.bills} bills</span>
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {currency(data.totals.outstanding)} outstanding
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${queueTotal ? (contacted / queueTotal) * 100 : 0}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {contacted}/{queueTotal} contacted
                </span>
              </div>
            </div>

            <div className="scroll-thin -mx-1 flex-1 space-y-2 overflow-y-auto px-1">
              {data.guardians.map((g) => {
                const isSent = sent.has(g.phone)
                return (
                  <div
                    key={g.phone}
                    className={`card-lift rounded-xl border p-3 transition-colors ${
                      isSent
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'bg-card hover:border-emerald-500/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isSent
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {isSent ? <CheckCircle2 className="h-4 w-4" /> : initials(g.guardianName || '?')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="truncate text-sm font-semibold">
                            {g.guardianName || 'Unknown guardian'}
                          </p>
                          <span className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400 sm:hidden">
                            {currency(g.totalBalance)}
                          </span>
                          {g.isPrimary && (
                            <Badge
                              variant="outline"
                              className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"
                            >
                              primary
                            </Badge>
                          )}
                          {isSent && (
                            <Badge className="h-4 bg-emerald-600 px-1 text-[9px] font-semibold uppercase tracking-wide">
                              contacted
                            </Badge>
                          )}
                        </div>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          +{g.phone} · {g.billCount} bill{g.billCount > 1 ? 's' : ''}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {g.students.map((s) => (
                            <span
                              key={s.studentId}
                              className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium"
                            >
                              <span className="max-w-44 truncate sm:max-w-56">{s.studentName}</span>
                              <span className="shrink-0 font-semibold text-red-600 dark:text-red-400">
                                {currency(s.balance)}
                              </span>
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-1.5 sm:hidden">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 flex-1 gap-1 text-[11px]"
                            onClick={() => copyOne(g)}
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 flex-1 gap-1 bg-emerald-600 text-[11px] hover:bg-emerald-700"
                            onClick={() => openChat(g)}
                          >
                            <ExternalLink className="h-3 w-3" />
                            {isSent ? 'Reopen chat' : 'Open chat'}
                          </Button>
                        </div>
                      </div>
                      <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
                        <span className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400">
                          {currency(g.totalBalance)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-[11px]"
                            onClick={() => copyOne(g)}
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 gap-1 bg-emerald-600 px-2.5 text-[11px] hover:bg-emerald-700"
                            onClick={() => openChat(g)}
                          >
                            <ExternalLink className="h-3 w-3" />
                            {isSent ? 'Reopen' : 'Open'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {data.unreachable.length > 0 && (
                <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {data.unreachable.length} bill{data.unreachable.length > 1 ? 's' : ''} unreachable
                    on WhatsApp
                  </p>
                  <div className="mt-2 space-y-1">
                    {data.unreachable.map((u, i) => (
                      <div
                        key={`${u.studentRef}-${i}`}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span className="truncate">
                          <span className="font-medium">{u.studentName}</span>{' '}
                          <span className="text-muted-foreground">
                            ({u.studentRef}) · {u.reason}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {currency(u.balance)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-amber-700/80 dark:text-amber-300/80">
                    Fix these guardian phone numbers in the Students section, then reopen the blast.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {nextGuardian ? (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={openNext}>
              <MessageCircle className="h-4 w-4" />
              Open next ({contacted + 1}/{queueTotal})
            </Button>
          ) : (
            <Button disabled className="gap-2 bg-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              All contacted
            </Button>
          )}
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
  const school = useSchoolInfo()
  const balance = Math.max(0, payment.amount - payment.paidAmount)
  const isPaid = payment.status === 'Paid'

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }, [])

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Receipt {payment.receiptNo}</DialogTitle>
          <DialogDescription>Printable receipt for the selected payment.</DialogDescription>
        </DialogHeader>

        <div ref={receiptRef} className="receipt-print">
          <div className="flex items-center justify-between gap-3 border-b p-4">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-lg ring-1 ring-border">
                <img
                  src={school.logoUrl}
                  alt={school.shortName}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold">{school.shortName}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {school.subtitle}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {[school.address, school.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">
              Payment Receipt
            </Badge>
          </div>

          <div className="space-y-4 p-4">
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

        <div className="no-print flex items-center justify-end gap-2 border-t p-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>

        <style jsx global>{`
          @media print {
            @page { size: A4 portrait; margin: 12mm; }

            html, body {
              background: #fff !important;
              height: auto !important;
              overflow: visible !important;
              margin: 0 !important;
              padding: 0 !important;
            }

            /* Hide every element that is NOT the receipt, NOT inside the
               receipt, and does NOT contain the receipt. This collapses the
               entire app shell + dialog chrome without leaving phantom pages. */
            body *:not(.receipt-print):not(.receipt-print *):not(:has(.receipt-print)) {
              display: none !important;
            }

            /* Neutralise every ancestor of the receipt so it sits in normal
               flow instead of being absolutely-positioned inside a modal. */
            :has(.receipt-print) {
              position: static !important;
              display: block !important;
              width: auto !important;
              max-width: none !important;
              height: auto !important;
              max-height: none !important;
              margin: 0 !important;
              padding: 0 !important;
              border: 0 !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              background: transparent !important;
              overflow: visible !important;
              transform: none !important;
              inset: auto !important;
            }

            /* The receipt itself — centred, card-like, one page */
            .receipt-print {
              width: 90mm !important;
              max-width: 100% !important;
              margin: 0 auto !important;
              padding: 0 !important;
              border: 1px solid #e5e7eb !important;
              border-radius: 4px !important;
              box-shadow: none !important;
              overflow: hidden !important;
              background: #fff !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            /* Force muted text to stay readable in print (avoids near-white
               resolved custom properties from Tailwind's color-mix) */
            .receipt-print .text-muted-foreground { color: #52525b !important; }
            .receipt-print .text-foreground       { color: #0f172a !important; }

            /* Preserve colour accents (PAID stamp, status pills, brand bar) */
            .receipt-print * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            /* Chrome-only helpers */
            .no-print { display: none !important; }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  )
}

// ─── Bulk Generate Dialog (preview → confirm) ──────────────────────────────
interface BulkPreviewLine {
  programId: string
  code: string
  name: string
  color: string | null
  amount: number
}
interface BulkPreviewStudent {
  studentId: string
  studentCode: string
  fullName: string
  lines: BulkPreviewLine[]
  total: number
}
interface BulkPreviewSkipped {
  studentId: string
  studentCode: string
  fullName: string
  billedAmount: number
}
interface BulkPreview {
  month: string
  monthLabel: string
  toBill: BulkPreviewStudent[]
  skipped: BulkPreviewSkipped[]
  noProgrammes: Array<{ studentId: string; studentCode: string; fullName: string }>
  totals: {
    billCount: number
    lineCount: number
    grandTotal: number
    skippedCount: number
    noProgrammeCount: number
    studentCount: number
  }
}

interface BulkGenerateDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  defaultMonth: string
  generating: boolean
  onConfirm: (month: string, dueDate?: string, skipEmpty?: boolean) => void
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
  const [skipEmpty, setSkipEmpty] = useState(true)
  const [step, setStep] = useState<'setup' | 'preview'>('setup')

  const [preview, setPreview] = useState<BulkPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)

  useEffect(() => {
    if (!open) return
    const [y, m] = defaultMonth.split('-').map(Number)
    const dd = `${y}-${String(m).padStart(2, '0')}-10`
    Promise.resolve().then(() => {
      setTargetMonth(defaultMonth)
      setDueDate(dd)
      setStep('setup')
      setPreview(null)
      setPreviewError(null)
      setShowSkipped(false)
    })
  }, [open, defaultMonth])

  const loadPreview = useCallback(async (m: string) => {
    setPreviewing(true)
    setPreviewError(null)
    try {
      const res = await api<BulkPreview>(
        `/api/payments/bulk-generate/preview?month=${encodeURIComponent(m)}`,
      )
      setPreview(res)
      setStep('preview')
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }, [])

  const t = preview?.totals

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {step === 'setup' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Zap className="h-4 w-4" />
                </div>
                Generate Monthly Fees
              </DialogTitle>
              <DialogDescription>
                Creates <span className="font-medium">one bill per student</span> for the selected
                month. Every programme the student is enrolled in becomes a line item on that
                single bill — the student&rsquo;s name appears once, no matter how many programmes
                they take.
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

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-dashed bg-muted/20 p-3 transition-colors hover:bg-muted/40">
                <Checkbox
                  checked={skipEmpty}
                  onCheckedChange={(v) => setSkipEmpty(v === true)}
                  className="mt-0.5"
                  aria-label="Skip students with no active programmes"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    Skip students with no active programmes
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Unchecked, they would receive a LKR&nbsp;0 bill marked as paid.
                  </span>
                </span>
              </label>

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
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={previewing}>
                Cancel
              </Button>
              <Button
                onClick={() => loadPreview(targetMonth)}
                disabled={previewing || !targetMonth}
                className="gap-2"
              >
                {previewing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparing…
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    Preview bills
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Eye className="h-4 w-4" />
                </div>
                Preview — {preview?.monthLabel ?? targetMonth}
              </DialogTitle>
              <DialogDescription>
                Review exactly what will be created, then confirm. Nothing is written until you
                press <span className="font-medium">Generate</span>.
              </DialogDescription>
            </DialogHeader>

            {previewError && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">{previewError}</p>
                <Button variant="outline" size="sm" onClick={() => setStep('setup')}>
                  Back to setup
                </Button>
              </div>
            )}

            {!previewError && preview && t && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border bg-emerald-500/5 p-2.5 text-center">
                    <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {t.billCount}
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      bill{t.billCount === 1 ? '' : 's'} to create
                    </p>
                  </div>
                  <div className="rounded-lg border bg-sky-500/5 p-2.5 text-center">
                    <p className="text-lg font-bold tabular-nums text-sky-700 dark:text-sky-400">
                      {t.lineCount}
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      programme line{t.lineCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-primary/5 p-2.5 text-center">
                    <p className="text-lg font-bold tabular-nums text-primary">
                      {currencyCompact(t.grandTotal)}
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground">total billed</p>
                  </div>
                  <div className="rounded-lg border bg-amber-500/5 p-2.5 text-center">
                    <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
                      {t.skippedCount}
                    </p>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      already billed
                    </p>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Bill drafts ({t.billCount})
                  </p>
                  {t.billCount === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Every active student already has a bill for this month — nothing to
                      generate.
                    </div>
                  ) : (
                    <div className="scroll-thin max-h-64 overflow-y-auto rounded-lg border">
                      <div className="divide-y">
                        {preview.toBill.map((s, idx) => (
                          <div
                            key={s.studentId}
                            className="flex items-start gap-2.5 p-2.5 transition-colors hover:bg-muted/40 odd:bg-muted/20"
                          >
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback
                                className={`${avatarColor(s.fullName)} text-[10px] font-semibold`}
                              >
                                {initials(s.fullName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="min-w-0 truncate text-sm font-medium">
                                  {s.fullName}
                                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                                    {s.studentCode}
                                  </span>
                                </p>
                                <p className="shrink-0 text-sm font-semibold tabular-nums">
                                  {currency(s.total)}
                                </p>
                              </div>
                              <ul className="mt-1 space-y-0.5">
                                {s.lines.map((li) => (
                                  <li
                                    key={li.programId}
                                    className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                                  >
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <span
                                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                                        style={{ background: li.color ?? '#94a3b8' }}
                                        aria-hidden
                                      />
                                      <span className="min-w-0 truncate">
                                        {li.name}
                                        <span className="ml-1 opacity-60">({li.code})</span>
                                      </span>
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                      {currency(li.amount)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              {s.lines.length > 1 && (
                                <Badge
                                  variant="outline"
                                  className="mt-1 h-auto px-1.5 py-0 text-[10px]"
                                >
                                  {s.lines.length} programmes · one bill
                                </Badge>
                              )}
                            </div>
                            <span className="mt-0.5 shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                              #{idx + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {preview.skipped.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 p-2.5 text-left"
                      onClick={() => setShowSkipped((v) => !v)}
                      aria-expanded={showSkipped}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {preview.skipped.length} student
                        {preview.skipped.length === 1 ? '' : 's'} already billed — will be skipped
                      </span>
                      {showSkipped ? (
                        <ChevronUp className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                      )}
                    </button>
                    {showSkipped && (
                      <ul className="scroll-thin max-h-36 space-y-0.5 overflow-y-auto border-t border-amber-500/20 p-2.5 pt-2">
                        {preview.skipped.map((s) => (
                          <li
                            key={s.studentId}
                            className="flex items-center justify-between gap-2 text-xs text-amber-800/90 dark:text-amber-200/90"
                          >
                            <span className="min-w-0 truncate">
                              {s.fullName}
                              <span className="ml-1.5 opacity-60">{s.studentCode}</span>
                            </span>
                            <span className="shrink-0 tabular-nums opacity-80">
                              billed {currency(s.billedAmount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {preview.noProgrammes.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                    <div className="min-w-0 text-sky-800 dark:text-sky-200">
                      <p className="font-medium">
                        {preview.noProgrammes.length} active student
                        {preview.noProgrammes.length === 1 ? ' has' : 's have'} no programme
                        enrolment
                      </p>
                      <p className="mt-0.5 text-sky-700/80 dark:text-sky-300/80">
                        {skipEmpty
                          ? 'They will be skipped (no LKR 0 bills).'
                          : 'They will receive a LKR 0 bill marked as paid.'}{' '}
                        {preview.noProgrammes
                          .slice(0, 4)
                          .map((s) => s.fullName)
                          .join(', ')}
                        {preview.noProgrammes.length > 4
                          ? ` +${preview.noProgrammes.length - 4} more`
                          : ''}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep('setup')}
                disabled={generating || previewing}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => onConfirm(targetMonth, dueDate || undefined, skipEmpty)}
                disabled={generating || !preview || preview.totals.billCount === 0}
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
                    Generate {preview ? preview.totals.billCount : ''} bill
                    {preview?.totals.billCount === 1 ? '' : 's'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Student fee statement ─────────────────────────────────────────────────
interface StatementLine {
  description: string
  amount: number
  color: string | null
}
interface StatementMonth {
  id: string
  month: string
  amount: number
  paidAmount: number
  balance: number
  status: string
  method: string
  paidDate: string | null
  receiptNo: string | null
  lines: StatementLine[]
}
interface StatementResponse {
  student: {
    id: string
    studentId: string
    fullName: string
    gender: string
    status: string
    admissionDate: string | null
    guardians: { name: string; phone: string; relationship: string; isPrimary: boolean }[]
    enrollments: { program: string | null; programColor: string | null; class: string | null }[]
  }
  months: StatementMonth[]
  totals: { billed: number; paid: number; balance: number; billCount: number }
  generatedAt: string
}

function statementStatusClasses(status: string): string {
  switch (status) {
    case 'Paid':
      return 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'Partial':
      return 'border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-300'
    case 'Overdue':
      return 'border-transparent bg-red-500/15 text-red-700 dark:text-red-300'
    default:
      return 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300'
  }
}

function StudentStatementDialog({
  studentId,
  onClose,
}: {
  studentId: string
  onClose: () => void
}) {
  const [data, setData] = useState<StatementResponse | null>(null)
  const [error, setError] = useState(false)
  const school = useSchoolInfo()

  useEffect(() => {
    let alive = true
    api<StatementResponse>(`/api/payments/statement?studentId=${studentId}`)
      .then((d) => {
        if (alive) setData(d)
      })
      .catch(() => {
        if (alive) setError(true)
      })
    return () => {
      alive = false
    }
  }, [studentId])

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') window.print()
  }, [])

  const primaryGuardian = data?.student.guardians.find((g) => g.isPrimary) ?? data?.student.guardians[0]

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto scroll-thin sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Fee statement</DialogTitle>
          <DialogDescription>
            Printable statement of all billed months, payments and outstanding balance.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="p-6 text-center">
            <EmptyState
              icon={AlertCircle}
              title="Failed to load statement"
              description="Try reopening the statement."
            />
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="statement-print rounded-lg border">
              <div className="flex items-center justify-between gap-3 border-b p-4">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-border">
                    <img src={school.logoUrl} alt={school.shortName} className="h-full w-full object-cover" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-sm font-bold">{school.shortName}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {school.subtitle}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {[school.address, school.phone].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold uppercase tracking-widest">
                    Fee Statement
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    As of {new Date(data.generatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-b p-4 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Student</p>
                  <p className="mt-0.5 text-sm font-semibold">{data.student.fullName}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Student ID</p>
                  <p className="mt-0.5 font-mono text-sm">{data.student.studentId}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Guardian
                  </p>
                  <p className="mt-0.5 truncate text-sm">
                    {primaryGuardian ? primaryGuardian.name : '—'}
                    {primaryGuardian?.phone ? (
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {primaryGuardian.phone}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Enrolled in
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {data.student.enrollments.filter((e) => e.program).slice(0, 4).map((e, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: e.programColor ?? 'var(--muted-foreground)' }}
                        />
                        {e.program}
                      </span>
                    ))}
                    {data.student.enrollments.length === 0 && <span className="text-sm">—</span>}
                  </div>
                </div>
              </div>

              <div className="max-h-[46vh] overflow-y-auto scroll-thin">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                    <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Month</th>
                      <th className="px-2 py-2 font-medium">Items</th>
                      <th className="px-2 py-2 text-right font-medium">Billed</th>
                      <th className="px-2 py-2 text-right font-medium">Paid</th>
                      <th className="px-4 py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          No bills issued for this student yet.
                        </td>
                      </tr>
                    )}
                    {data.months.map((m) => (
                      <tr key={m.id} className="border-b align-top last:border-0">
                        <td className="px-4 py-2.5">
                          <p className="whitespace-nowrap text-xs font-semibold">
                            {monthLabel(m.month)}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className={`px-1.5 py-0 text-[9px] ${statementStatusClasses(m.status)}`}>
                              {m.status}
                            </Badge>
                            {m.receiptNo && (
                              <span className="font-mono text-[9px] text-muted-foreground">{m.receiptNo}</span>
                            )}
                          </div>
                          {m.paidDate && (
                            <p className="mt-0.5 text-[9px] text-muted-foreground">
                              paid {fmtDate(m.paidDate)} · {m.method}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="space-y-0.5">
                            {m.lines.map((l, i) => (
                              <p key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span
                                  className="size-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: l.color ?? 'var(--muted-foreground)' }}
                                />
                                {l.description}
                              </p>
                            ))}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right text-xs tabular-nums">
                          {currency(m.amount)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                          {currency(m.paidAmount)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold tabular-nums ${
                            m.balance > 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {currency(m.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1 border-t bg-muted/30 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total billed ({data.totals.billCount} bills)</span>
                  <span className="font-semibold tabular-nums">{currency(data.totals.billed)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total paid</span>
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {currency(data.totals.paid)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1.5">
                  <span className="font-semibold">Outstanding balance</span>
                  <span
                    className={`text-base font-bold tabular-nums ${
                      data.totals.balance > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {currency(data.totals.balance)}
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter className="no-print">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={handlePrint} className="gap-2">
                <Printer className="h-4 w-4" /> Print statement
              </Button>
            </DialogFooter>

            <style jsx global>{`
              @media print {
                @page { size: A4 portrait; margin: 12mm; }

                html, body {
                  background: #fff !important;
                  height: auto !important;
                  overflow: visible !important;
                  margin: 0 !important;
                  padding: 0 !important;
                }

                body *:not(.statement-print):not(.statement-print *):not(:has(.statement-print)) {
                  display: none !important;
                }

                :has(.statement-print) {
                  position: static !important;
                  display: block !important;
                  width: auto !important;
                  max-width: none !important;
                  height: auto !important;
                  max-height: none !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  border: 0 !important;
                  border-radius: 0 !important;
                  box-shadow: none !important;
                  background: transparent !important;
                  overflow: visible !important;
                  transform: none !important;
                  inset: auto !important;
                }

                .statement-print {
                  width: 100% !important;
                  max-width: 190mm !important;
                  margin: 0 auto !important;
                  padding: 0 !important;
                  border: 1px solid #e5e7eb !important;
                  border-radius: 4px !important;
                  box-shadow: none !important;
                  background: #fff !important;
                }
                /* Let the statement scroll internally on screen; on paper we
                   need every row visible, so unclip the scroll wrapper. */
                .statement-print .max-h-\[46vh\] {
                  max-height: none !important;
                  overflow: visible !important;
                }
                .statement-print table { page-break-inside: auto; }
                .statement-print tr { page-break-inside: avoid; break-inside: avoid; }
                .statement-print thead { display: table-header-group; }

                .statement-print .text-muted-foreground { color: #52525b !important; }
                .statement-print .text-foreground       { color: #0f172a !important; }

                .statement-print * {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }

                .no-print { display: none !important; }
              }
            `}</style>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
