'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Banknote,
  Landmark,
  TrendingUp,
  CheckCircle2,
  Download,
  Printer,
  MoreVertical,
  Search,
  AlertCircle,
  Loader2,
  Users,
  StickyNote,
  Undo2,
  X,
} from 'lucide-react'

import { api } from '@/lib/api'
import { PayrollRow, PayrollSummary, PAYROLL_METHODS } from '@/lib/types'
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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

function payrollStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'Paid':
      return 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'Pending':
    default:
      return 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300'
  }
}

function typeBadgeClasses(type: string): string {
  return type === 'External'
    ? 'border-transparent bg-purple-500/10 text-purple-700 dark:text-purple-300'
    : 'border-transparent bg-primary/10 text-primary'
}

// ─── Response shape ────────────────────────────────────────────────────────
interface PayrollListResponse {
  month: string
  data: PayrollRow[]
  summary: PayrollSummary
}

interface PayrollPostResponse {
  ok: boolean
  marked: number
  failed: number
  errors: string[]
  message: string
}

// ─── Main component ────────────────────────────────────────────────────────
export function PayrollSection() {
  const [month, setMonth] = useState<string>(currentMonth())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')

  const [rows, setRows] = useState<PayrollRow[]>([])
  const [summary, setSummary] = useState<PayrollSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [payTargets, setPayTargets] = useState<PayrollRow[] | null>(null)
  const [pendingTarget, setPendingTarget] = useState<PayrollRow | null>(null)
  const [payslipTarget, setPayslipTarget] = useState<PayrollRow | null>(null)

  // ─── Load payroll register for the selected month + status ─────────────
  const reloadRef = useRef<() => void>(() => {})

  useEffect(() => {
    let alive = true
    const params = new URLSearchParams()
    params.set('month', month)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const url = `/api/payroll?${params.toString()}`

    const run = () => {
      if (!alive) return
      setLoading(true)
      setError(null)
      api<PayrollListResponse>(url)
        .then((r) => {
          if (!alive) return
          setRows(r.data || [])
          setSummary(r.summary ?? null)
          setSelected(new Set())
        })
        .catch((e) => {
          if (!alive) return
          setError(e instanceof Error ? e.message : 'Failed to load payroll')
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }

    // Expose for action handlers (pay / mark pending) to re-fetch on demand.
    reloadRef.current = run
    // Defer the first invocation so we don't call setState synchronously in
    // the effect body (satisfies react-hooks/set-state-in-effect lint rule).
    const t = setTimeout(run, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [month, statusFilter])

  const fetchRegister = useCallback(() => reloadRef.current(), [])

  // ─── Client-side search filter (name / teacher ID) ──────────────────────
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.teacher.fullName.toLowerCase().includes(q) ||
        r.teacher.teacherId.toLowerCase().includes(q),
    )
  }, [rows, search])

  // ─── Selection (only Pending rows are selectable) ───────────────────────
  const pendingIds = useMemo(
    () => visibleRows.filter((r) => r.status === 'Pending').map((r) => r.teacher.id),
    [visibleRows],
  )

  const selectedPendingRows = useMemo(
    () => rows.filter((r) => r.status === 'Pending' && selected.has(r.teacher.id)),
    [rows, selected],
  )

  const allPendingSelected =
    pendingIds.length > 0 && pendingIds.every((id) => selected.has(id))
  const somePendingSelected = pendingIds.some((id) => selected.has(id))

  const toggleRow = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const allSelected = pendingIds.length > 0 && pendingIds.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSelected) {
        pendingIds.forEach((id) => next.delete(id))
      } else {
        pendingIds.forEach((id) => next.add(id))
      }
      return next
    })
  }, [pendingIds])

  // ─── Totals for the register footer ─────────────────────────────────────
  const sumBasic = useMemo(
    () => visibleRows.reduce((s, r) => s + r.basicSalary, 0),
    [visibleRows],
  )
  const sumAllowances = useMemo(
    () => visibleRows.reduce((s, r) => s + r.allowances, 0),
    [visibleRows],
  )

  // ─── CSV export ─────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const headers = [
      'Teacher ID',
      'Name',
      'Type',
      'EPF No',
      'Month',
      'Basic',
      'Allowances',
      'Gross',
      'EPF Employee (8%)',
      'Net Salary',
      'Employer EPF (12%)',
      'ETF (3%)',
      'Total Employer Cost',
      'Status',
      'Method',
      'Paid Date',
      'Note',
    ]
    const escape = (v: string | number | null | undefined): string => {
      const s = v === null || v === undefined ? '' : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    const lines = [headers.join(',')]
    for (const r of visibleRows) {
      lines.push(
        [
          escape(r.teacher.teacherId),
          escape(r.teacher.fullName),
          escape(r.teacher.type),
          escape(r.teacher.epfNo ?? ''),
          escape(r.month),
          escape(r.basicSalary),
          escape(r.allowances),
          escape(r.gross),
          escape(r.epfEmployee),
          escape(r.netSalary),
          escape(r.epfEmployer),
          escape(r.etfEmployer),
          escape(r.employerCost),
          escape(r.status),
          escape(r.method ?? ''),
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
    a.download = `sanomin-payroll-${month}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${visibleRows.length} payroll rows to CSV`)
  }, [visibleRows, month])

  const hasFilters = search.trim() !== '' || statusFilter !== 'all'

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Payroll"
        description="Monthly teacher salaries · EPF/ETF & payslips"
        icon={<Banknote className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button
              size="sm"
              onClick={() => setPayTargets(selectedPendingRows)}
              disabled={selectedPendingRows.length === 0}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Pay selected
              {selectedPendingRows.length > 0 && ` (${selectedPendingRows.length})`}
            </Button>
          </>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary ? (
          <>
            <StatCard
              label="Net payable"
              value={currencyCompact(summary.totalNet)}
              icon={Banknote}
              hint={`${summary.paidCount}/${summary.teachers} paid`}
              accent="blue"
            />
            <StatCard
              label="EPF + ETF (employer)"
              value={currencyCompact(summary.totalEpfEmployer + summary.totalEtfEmployer)}
              icon={Landmark}
              hint="12% + 3% of basic"
              accent="amber"
            />
            <StatCard
              label="Total institute cost"
              value={currencyCompact(summary.totalEmployerCost)}
              icon={TrendingUp}
              hint="gross + employer shares"
              accent="purple"
            />
            <StatCard
              label="Paid this month"
              value={currencyCompact(summary.totalPaid)}
              icon={CheckCircle2}
              hint={`${currencyCompact(summary.totalPending)} outstanding`}
              accent="green"
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      {/* Month selector + search + status filter */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Billing month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[180px]">
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
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search teacher / ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {search.trim() !== '' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearch('')}
                className="gap-1.5"
              >
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Salary register as of{' '}
          <span className="font-medium text-foreground">{monthLabel(month)}</span> · pending rows
          show live salary figures; paid rows show the snapshot taken at payment time.
        </p>
      </Card>

      {/* Register table */}
      <Card className="p-0">
        {error ? (
          <div className="p-6">
            <EmptyState
              icon={AlertCircle}
              title="Failed to load payroll"
              description={error}
              action={
                <Button size="sm" onClick={fetchRegister}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : loading && rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Users}
              title="No teachers on payroll"
              description={
                hasFilters
                  ? `No teachers match the current filters for ${monthLabel(month)}.`
                  : `No active teachers found for ${monthLabel(month)}. Add teachers in the Teachers section to build the payroll register.`
              }
            />
          </div>
        ) : (
          <div className="scroll-thin max-h-[62vh] overflow-y-auto">
            <Table className="table-zebra min-w-[900px]">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <TableRow>
                  <TableHead className="w-[40px] pr-0">
                    <Checkbox
                      checked={
                        allPendingSelected
                          ? true
                          : somePendingSelected
                            ? 'indeterminate'
                            : false
                      }
                      disabled={pendingIds.length === 0}
                      onCheckedChange={() => toggleSelectAll()}
                      aria-label="Select all pending teachers"
                    />
                  </TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Allowances</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">EPF −8%</TableHead>
                  <TableHead className="text-right">Net salary</TableHead>
                  <TableHead
                    className="text-right"
                    title="Employer EPF 12% + ETF 3% of basic"
                  >
                    Emp. EPF+ETF
                  </TableHead>
                  <TableHead className="w-[90px]">Status</TableHead>
                  <TableHead className="w-[130px]">Paid via</TableHead>
                  <TableHead className="w-[50px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((r) => {
                  const isPaid = r.status === 'Paid'
                  const isSelected = selected.has(r.teacher.id)
                  return (
                    <TableRow
                      key={r.teacher.id}
                      className={`animate-row-in ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <TableCell className="pr-0">
                        <Checkbox
                          disabled={isPaid}
                          checked={isSelected}
                          onCheckedChange={(v) => toggleRow(r.teacher.id, v === true)}
                          aria-label={`Select ${r.teacher.fullName} for payment`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={avatarColor(r.teacher.fullName)}>
                              {initials(r.teacher.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1">
                              <p className="truncate text-sm font-medium">
                                {r.teacher.fullName}
                              </p>
                              {r.note && (
                                <span title={r.note} className="shrink-0">
                                  <StickyNote
                                    className="h-3 w-3 text-amber-500"
                                    aria-label="Has note"
                                  />
                                </span>
                              )}
                            </div>
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {r.teacher.teacherId}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              <Badge
                                variant="outline"
                                className={`border-transparent px-1.5 py-0 text-[9px] font-medium ${typeBadgeClasses(r.teacher.type)}`}
                              >
                                {r.teacher.type}
                              </Badge>
                              {r.teacher.epfNo && (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/30 px-1.5 py-0 text-[9px] font-medium text-emerald-700 dark:text-emerald-300"
                                >
                                  EPF #{r.teacher.epfNo}
                                </Badge>
                              )}
                              {r.teacher.classes > 0 && (
                                <span className="text-[9px] text-muted-foreground">
                                  {r.teacher.classes} class
                                  {r.teacher.classes === 1 ? '' : 'es'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-foreground/80">
                        {currency(r.basicSalary)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-foreground/80">
                        {currency(r.allowances)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {currency(r.gross)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {r.epfEmployee > 0 ? `−${currency(r.epfEmployee)}` : '—'}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm font-semibold tabular-nums ${
                          isPaid ? 'text-emerald-600 dark:text-emerald-400' : ''
                        }`}
                      >
                        {currency(r.netSalary)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {currency(r.epfEmployer + r.etfEmployer)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-medium ${payrollStatusBadgeClasses(r.status)}`}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isPaid ? (
                          <div className="text-xs leading-tight">
                            <p className="font-medium">{r.method ?? '—'}</p>
                            <p className="tabular-nums text-muted-foreground">
                              {r.paidDate ? fmtDate(r.paidDate) : '—'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
                            <DropdownMenuItem onClick={() => setPayslipTarget(r)}>
                              <Printer className="mr-2 h-4 w-4" /> Print payslip
                            </DropdownMenuItem>
                            {isPaid ? (
                              <DropdownMenuItem onClick={() => setPendingTarget(r)}>
                                <Undo2 className="mr-2 h-4 w-4" /> Mark pending
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setPayTargets([r])}>
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Mark paid
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              {summary && (
                <TableFooter className="sticky bottom-0 z-10 bg-muted">
                  <TableRow>
                    <TableCell />
                    <TableCell className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Totals
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {currency(sumBasic)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {currency(sumAllowances)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {currency(summary.totalGross)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {currency(summary.totalEpfEmployee)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {currency(summary.totalNet)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold tabular-nums text-muted-foreground">
                      {currency(summary.totalEpfEmployer + summary.totalEtfEmployer)}
                    </TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        )}
      </Card>

      {/* Mark paid flow (bulk via "Pay selected" or single via row action) */}
      {payTargets && payTargets.length > 0 && (
        <PayDialog
          month={month}
          targets={payTargets}
          onClose={() => setPayTargets(null)}
          onDone={() => {
            setPayTargets(null)
            fetchRegister()
          }}
        />
      )}

      {/* Revert to pending confirm */}
      <ConfirmDialog
        open={!!pendingTarget}
        onOpenChange={(v) => !v && setPendingTarget(null)}
        title="Mark salary as pending?"
        description={
          pendingTarget
            ? `${pendingTarget.teacher.fullName}'s ${monthLabel(month)} salary will be reverted to Pending. The payment snapshot (method, paid date, note) will be cleared.`
            : ''
        }
        confirmText="Mark pending"
        destructive={false}
        onConfirm={async () => {
          if (!pendingTarget) return
          try {
            const res = await api<PayrollPostResponse>('/api/payroll', {
              method: 'POST',
              body: JSON.stringify({
                month,
                entries: [{ teacherId: pendingTarget.teacher.id, status: 'Pending' }],
              }),
            })
            toast.success(res.message)
            fetchRegister()
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to update payroll')
          }
        }}
      />

      {/* Printable payslip */}
      {payslipTarget && (
        <PayslipDialog row={payslipTarget} onClose={() => setPayslipTarget(null)} />
      )}
    </div>
  )
}

// ─── Pay dialog (confirm salaries as paid) ─────────────────────────────────
interface PayDialogProps {
  month: string
  targets: PayrollRow[]
  onClose: () => void
  onDone: () => void
}

function PayDialog({ month, targets, onClose, onDone }: PayDialogProps) {
  const [method, setMethod] = useState<string>('Cash')
  const [note, setNote] = useState('')
  const [paidDate, setPaidDate] = useState<string>(toIsoDate(new Date()))
  const [saving, setSaving] = useState(false)

  const totalNet = useMemo(
    () => targets.reduce((s, t) => s + t.netSalary, 0),
    [targets],
  )

  const handleSubmit = useCallback(async () => {
    setSaving(true)
    try {
      const res = await api<PayrollPostResponse>('/api/payroll', {
        method: 'POST',
        body: JSON.stringify({
          month,
          entries: targets.map((t) => ({
            teacherId: t.teacher.id,
            status: 'Paid',
            method,
            note: note.trim() || undefined,
            paidDate: paidDate || undefined,
          })),
        }),
      })
      if (res.failed > 0) {
        toast.warning(res.message)
        res.errors.slice(0, 3).forEach((e) => toast.error(e))
      } else {
        toast.success(res.message)
      }
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark salaries as paid')
    } finally {
      setSaving(false)
    }
  }, [month, targets, method, note, paidDate, onDone])

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Banknote className="h-4 w-4" />
            </div>
            Pay salaries — {monthLabel(month)}
          </DialogTitle>
          <DialogDescription>
            Marking salaries as paid snapshots each teacher&rsquo;s current salary figures for
            this month. This can be reverted per teacher later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Teachers + total */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="scroll-thin max-h-36 space-y-1.5 overflow-y-auto">
              {targets.map((t) => (
                <div
                  key={t.teacher.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback
                        className={`text-[9px] ${avatarColor(t.teacher.fullName)}`}
                      >
                        {initials(t.teacher.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{t.teacher.fullName}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {t.teacher.teacherId}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                    {currency(t.netSalary)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2">
              <span className="text-xs text-muted-foreground">
                {targets.length} teacher{targets.length === 1 ? '' : 's'} · total net payable
              </span>
              <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {currency(totalNet)}
              </span>
            </div>
          </div>

          {/* Method + paid date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYROLL_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pay-date">Paid date</Label>
              <Input
                id="pay-date"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>
          </div>

          {/* Note */}
          <div className="grid gap-1.5">
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Textarea
              id="pay-note"
              rows={2}
              placeholder="e.g. Paid via bank transfer ref #12345"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Confirm payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Payslip print dialog ──────────────────────────────────────────────────
interface PayslipDialogProps {
  row: PayrollRow
  onClose: () => void
}

function PayslipDialog({ row, onClose }: PayslipDialogProps) {
  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }, [])

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Payslip — {row.teacher.fullName}</DialogTitle>
          <DialogDescription>
            Printable salary payslip for {monthLabel(row.month)}.
          </DialogDescription>
        </DialogHeader>

        <div className="payslip-print">
          {/* Institute header */}
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
            <div className="text-right">
              <p className="text-sm font-extrabold uppercase tracking-widest">Payslip</p>
              <p className="text-[10px] text-muted-foreground">{monthLabel(row.month)}</p>
            </div>
          </div>

          <div className="space-y-4 p-4">
            {/* Teacher */}
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Employee
                </p>
                <Badge
                  variant="outline"
                  className={`px-2 py-0.5 text-[10px] font-semibold ${payrollStatusBadgeClasses(row.status)}`}
                >
                  {row.status}
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={avatarColor(row.teacher.fullName)}>
                    {initials(row.teacher.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{row.teacher.fullName}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {row.teacher.teacherId} · {row.teacher.type}
                    {row.teacher.epfNo ? ` · EPF #${row.teacher.epfNo}` : ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Earnings & deductions */}
            <div className="space-y-1.5 border-y py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Basic salary</span>
                <span className="font-medium tabular-nums">{currency(row.basicSalary)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Allowances</span>
                <span className="font-medium tabular-nums">{currency(row.allowances)}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5">
                <span className="text-muted-foreground">Gross earnings</span>
                <span className="font-semibold tabular-nums">{currency(row.gross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">EPF employee (−8% of basic)</span>
                <span className="font-medium tabular-nums text-red-600 dark:text-red-400">
                  {row.epfEmployee > 0 ? `−${currency(row.epfEmployee)}` : currency(0)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-sm font-bold">NET PAY</span>
                <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {currency(row.netSalary)}
                </span>
              </div>
            </div>

            {/* Employer contributions */}
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Employer contributions
                </p>
                <Badge
                  variant="outline"
                  className="border-transparent bg-purple-500/10 text-[10px] text-purple-700 dark:text-purple-300"
                >
                  paid by institute
                </Badge>
              </div>
              <div className="mt-2 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">EPF employer (12%)</span>
                  <span className="font-medium tabular-nums">{currency(row.epfEmployer)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ETF employer (3%)</span>
                  <span className="font-medium tabular-nums">{currency(row.etfEmployer)}</span>
                </div>
                <div className="flex justify-between border-t pt-1.5">
                  <span className="text-muted-foreground">Total institute cost</span>
                  <span className="font-semibold tabular-nums">
                    {currency(row.employerCost)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Payment method
                </p>
                <p className="font-medium">{row.method ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Paid date
                </p>
                <p className="font-medium tabular-nums">
                  {row.paidDate ? fmtDate(row.paidDate) : '—'}
                </p>
              </div>
            </div>

            {row.note && (
              <div className="rounded-lg bg-muted/40 p-2 text-xs">
                <span className="text-muted-foreground">Note:</span> {row.note}
              </div>
            )}

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 pt-8">
              <div className="border-t pt-1.5 text-center text-[10px] text-muted-foreground">
                ____ Teacher
              </div>
              <div className="border-t pt-1.5 text-center text-[10px] text-muted-foreground">
                ____ Authorised
              </div>
            </div>

            <p className="text-center text-[10px] text-muted-foreground">
              This is a computer-generated payslip. Generated{' '}
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
      </DialogContent>
    </Dialog>
  )
}
