'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  MoreVertical,
  Loader2,
  AlertCircle,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  Download,
  Phone,
  UserCog,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  StaffRow,
  StaffWorkLogRow,
  StaffWorkLogResponse,
  StaffPayrollResponse,
  StaffPayrollRow,
  STAFF_ROLES,
  STAFF_WORK_STATUSES,
  StaffWorkStatus,
} from '@/lib/types'
import { currency, currencyCompact, fmtDate, initials, avatarColor } from '@/lib/format'
import { useSchoolInfo } from '@/lib/school'

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
  TableFooter,
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
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const count = new Date(y, m, 0).getDate()
  const out: string[] = []
  for (let d = 1; d <= count; d++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return out
}

function dayNum(iso: string): number {
  return parseInt(iso.slice(8, 10), 10)
}

function shortDow(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short' })
}

function isWeekend(iso: string): boolean {
  const d = new Date(iso + 'T00:00:00')
  const w = d.getDay()
  return w === 0 || w === 6
}

// ─── Status badge styling ─────────────────────────────────────────────────
function statusBadge(status: string): string {
  switch (status) {
    case 'Present':  return 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'Half Day': return 'border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300'
    case 'Absent':   return 'border-transparent bg-red-500/15 text-red-700 dark:text-red-300'
    case 'Leave':    return 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300'
    default:         return 'border-transparent bg-muted text-muted-foreground'
  }
}

function roleBadge(): string {
  return 'border-transparent bg-primary/10 text-primary'
}

// ─── Print helper ─────────────────────────────────────────────────────────
type SchoolInfoShape = ReturnType<typeof useSchoolInfo>

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

function printStaffPayslip(
  staff: StaffRow,
  logs: StaffWorkLogRow[],
  month: string,
  school: SchoolInfoShape,
): void {
  const win = window.open('', '_blank', 'width=860,height=1000')
  if (!win) {
    toast.error('Pop-up blocked — allow pop-ups to print payslips.')
    return
  }

  const present = logs.filter((l) => l.status === 'Present').length
  const half = logs.filter((l) => l.status === 'Half Day').length
  const absent = logs.filter((l) => l.status === 'Absent').length
  const leave = logs.filter((l) => l.status === 'Leave').length
  const total = logs.reduce((s, l) => s + (l.dayRate || 0), 0)
  const generated = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Payslip — ${escapeHtml(staff.fullName)} — ${escapeHtml(monthLabel(month))}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; background: #f1f5f9; color: #0f172a; padding: 24px; }
  .sheet { max-width: 620px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
  .head { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid #e2e8f0; gap: 12px; }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand img { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; border: 1px solid #e2e8f0; flex-shrink: 0; }
  .brand-name { font-size: 14px; font-weight: 700; line-height: 1.2; }
  .brand-sub { font-size: 10px; text-transform: uppercase; letter-spacing: 1.4px; color: #64748b; margin-top: 2px; }
  .brand-meta { font-size: 10px; color: #94a3b8; margin-top: 3px; }
  .slip-block { text-align: right; flex-shrink: 0; }
  .slip-block h2 { font-size: 15px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; }
  .slip-block p { font-size: 10px; color: #64748b; margin-top: 3px; }
  .body { padding: 20px 24px; }
  .employee-box { background: #f8fafc; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
  .employee-name { font-size: 14px; font-weight: 700; }
  .employee-meta { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #64748b; margin-top: 2px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .summary-cell { background: #f8fafc; border-radius: 8px; padding: 10px; text-align: center; }
  .summary-cell .k { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  .summary-cell .v { font-size: 16px; font-weight: 700; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  thead { background: #f1f5f9; }
  th { text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
  th.num { text-align: right; }
  td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .total-row { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #e2e8f0; padding-top: 12px; margin-top: 8px; }
  .total-row .k { font-size: 14px; font-weight: 700; }
  .total-row .v { font-size: 18px; font-weight: 800; color: #059669; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
  .sig { border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; color: #64748b; text-align: center; }
  .footer { text-align: center; font-size: 10px; color: #94a3b8; padding-top: 12px; }
  @media print { body { background: #fff; padding: 0; } .sheet { border: none; border-radius: 0; max-width: none; } }
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
      <div class="slip-block">
        <h2>Daily Wage Payslip</h2>
        <p>${escapeHtml(monthLabel(month))}</p>
      </div>
    </div>

    <div class="body">
      <div class="employee-box">
        <div class="employee-name">${escapeHtml(staff.fullName)}</div>
        <div class="employee-meta">${escapeHtml(staff.staffId)} · ${escapeHtml(staff.role)}${staff.phone ? ` · ${escapeHtml(staff.phone)}` : ''}</div>
      </div>

      <div class="summary-grid">
        <div class="summary-cell">
          <div class="k">Present</div>
          <div class="v">${present}</div>
        </div>
        <div class="summary-cell">
          <div class="k">Half day</div>
          <div class="v">${half}</div>
        </div>
        <div class="summary-cell">
          <div class="k">Absent</div>
          <div class="v">${absent}</div>
        </div>
        <div class="summary-cell">
          <div class="k">Leave</div>
          <div class="v">${leave}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Day</th>
            <th>Status</th>
            <th class="num">Rate</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          ${logs
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(
              (l) => `
            <tr>
              <td class="mono">${escapeHtml(l.date)}</td>
              <td>${escapeHtml(shortDow(l.date))}</td>
              <td>${escapeHtml(l.status)}</td>
              <td class="num">${lkr(l.dayRate)}</td>
              <td>${escapeHtml(l.note ?? '')}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>

      <div class="total-row">
        <span class="k">Total pay for ${escapeHtml(monthLabel(month))}</span>
        <span class="v">${lkr(total)}</span>
      </div>

      <div class="signatures">
        <div class="sig">Staff</div>
        <div class="sig">Authorised</div>
      </div>

      <div class="footer">This is a computer-generated payslip. Generated ${escapeHtml(generated)}</div>
    </div>
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body></html>`)
  win.document.close()
}

// ─── Main component ────────────────────────────────────────────────────────
export function StaffSection() {
  const [tab, setTab] = useState<'directory' | 'payroll'>('directory')
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState<string>(currentMonth())

  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StaffRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null)
  const [workLogTarget, setWorkLogTarget] = useState<StaffRow | null>(null)

  const [payroll, setPayroll] = useState<StaffPayrollResponse | null>(null)
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [payrollError, setPayrollError] = useState<string | null>(null)

  const reloadRef = useRef<() => void>(() => {})

  // ─── Load staff list ──────────────────────────────────────────────────
  const loadStaff = useCallback(() => {
    setLoading(true)
    setError(null)
    api<{ data: StaffRow[] }>('/api/staff')
      .then((r) => setStaff(r.data || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load staff'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    reloadRef.current = loadStaff
    loadStaff()
  }, [loadStaff])

  // ─── Load payroll for a month ─────────────────────────────────────────
  const loadPayroll = useCallback((m: string) => {
    setPayrollLoading(true)
    setPayrollError(null)
    api<StaffPayrollResponse>(`/api/staff/payroll?month=${m}`)
      .then((r) => setPayroll(r))
      .catch((e) => setPayrollError(e instanceof Error ? e.message : 'Failed to load payroll'))
      .finally(() => setPayrollLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'payroll') loadPayroll(month)
  }, [tab, month, loadPayroll])

  // ─── Filter ───────────────────────────────────────────────────────────
  const visibleStaff = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return staff
    return staff.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.staffId.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q),
    )
  }, [staff, search])

  // ─── Stats ────────────────────────────────────────────────────────────
  const activeCount = staff.filter((s) => s.active).length
  const totalStaff = staff.length
  const roleCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of staff) m.set(s.role, (m.get(s.role) || 0) + 1)
    return m
  }, [staff])

  const hasFilters = search.trim() !== ''

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Staff"
        description="Minor staff · daily-wage register & payslips"
        icon={<Users className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add staff
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total staff"
          value={String(totalStaff)}
          icon={Users}
          hint="All records"
          accent="blue"
        />
        <StatCard
          label="Active"
          value={String(activeCount)}
          icon={CheckCircle2}
          hint="Currently working"
          accent="green"
        />
        <StatCard
          label="Roles"
          value={String(roleCount.size)}
          icon={UserCog}
          hint={Array.from(roleCount.keys()).slice(0, 2).join(', ') || '—'}
          accent="purple"
        />
        <StatCard
          label="Payroll month"
          value={monthLabel(month)}
          icon={Calendar}
          hint={
            payroll
              ? `${payroll.totals.staff} staff · ${currencyCompact(payroll.totals.grandTotal)}`
              : 'Switch to payroll tab'
          }
          accent="amber"
        />
      </div>

      {/* Tabs + filters */}
      <Card className="min-w-0 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="directory">Directory</TabsTrigger>
              <TabsTrigger value="payroll">Payroll</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-end gap-3">
            {tab === 'payroll' && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Month</Label>
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
            )}
            {tab === 'directory' && (
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1 lg:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search name / ID / role…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="gap-1.5 shrink-0">
                    <X className="h-4 w-4" /> Clear
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Body */}
      {tab === 'directory' ? (
        <Card className="min-w-0 p-0">
          {error ? (
            <div className="p-6">
              <EmptyState
                icon={AlertCircle}
                title="Failed to load staff"
                description={error}
                action={
                  <Button size="sm" onClick={loadStaff}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : visibleStaff.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title={hasFilters ? 'No matches' : 'No staff yet'}
                description={
                  hasFilters
                    ? 'No staff match your search. Try a different name or ID.'
                    : 'Add cleaners, cooks, drivers, or other minor staff to start recording daily wages.'
                }
                action={
                  !hasFilters ? (
                    <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                      <Plus className="h-4 w-4" /> Add first staff member
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="scroll-thin max-h-[62vh] overflow-auto">
              <Table className="table-zebra min-w-[800px]">
                <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead className="w-[140px]">Role</TableHead>
                    <TableHead className="w-[140px]">Phone</TableHead>
                    <TableHead className="text-right w-[140px]">Default daily rate</TableHead>
                    <TableHead className="w-[110px]">Joined</TableHead>
                    <TableHead className="w-[90px]">Status</TableHead>
                    <TableHead className="w-[60px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStaff.map((s) => (
                    <TableRow key={s.id} className="animate-row-in hover:bg-muted/40">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={avatarColor(s.fullName)}>
                              {initials(s.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{s.fullName}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {s.staffId}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-medium ${roleBadge()}`}
                        >
                          {s.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.phone ? (
                          <span className="font-mono text-xs">{s.phone}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {currency(s.defaultDailyRate)}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {s.joinDate ? fmtDate(s.joinDate) : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            s.active
                              ? 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'border-transparent bg-slate-500/15 text-slate-700 dark:text-slate-300'
                          }
                        >
                          {s.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setWorkLogTarget(s)}>
                              <Calendar className="mr-2 h-4 w-4" /> Work log
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditTarget(s)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(s)}
                              className="text-red-600 focus:text-red-700 dark:text-red-400"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="min-w-0 p-0">
          {payrollError ? (
            <div className="p-6">
              <EmptyState
                icon={AlertCircle}
                title="Failed to load payroll"
                description={payrollError}
                action={
                  <Button size="sm" onClick={() => loadPayroll(month)}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : payrollLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !payroll || payroll.data.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Calendar}
                title="No payroll data"
                description={`No staff payroll records for ${monthLabel(month)}. Log work days for each staff member to build the register.`}
              />
            </div>
          ) : (
            <div className="scroll-thin max-h-[62vh] overflow-auto">
              <Table className="table-zebra min-w-[800px]">
                <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead className="w-[140px]">Role</TableHead>
                    <TableHead className="text-right w-[110px]">Days worked</TableHead>
                    <TableHead className="text-right w-[140px]">Default rate</TableHead>
                    <TableHead className="text-right w-[160px]">Total pay</TableHead>
                    <TableHead className="w-[60px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payroll.data.map((row) => {
                    const original = staff.find((s) => s.id === row.staffId)
                    return (
                      <TableRow key={row.staffId} className="animate-row-in hover:bg-muted/40">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={avatarColor(row.fullName)}>
                                {initials(row.fullName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{row.fullName}</p>
                              <p className="font-mono text-[10px] text-muted-foreground">
                                {row.staffCode}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`font-medium ${roleBadge()}`}>
                            {row.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {row.daysWorked}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {currency(row.defaultDailyRate)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                          {currency(row.totalPay)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => {
                                  if (original) setWorkLogTarget(original)
                                }}
                              >
                                <Calendar className="mr-2 h-4 w-4" /> Open work log
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter className="sticky bottom-0 z-10 bg-muted">
                  <TableRow>
                    <TableCell colSpan={4} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {currency(payroll.totals.grandTotal)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </Card>
      )}

      {/* Create / Edit dialogs */}
      {createOpen && (
        <StaffDialog
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false)
            loadStaff()
          }}
        />
      )}
      {editTarget && (
        <StaffDialog
          staff={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            loadStaff()
          }}
        />
      )}

      {/* Delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete staff member?"
        description={
          deleteTarget
            ? `${deleteTarget.fullName} (${deleteTarget.staffId}) and all their work-log entries will be permanently removed. This cannot be undone.`
            : ''
        }
        confirmText="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return
          try {
            await api(`/api/staff/${deleteTarget.id}`, { method: 'DELETE' })
            toast.success('Staff member deleted')
            loadStaff()
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to delete')
          }
        }}
      />

      {/* Work log dialog */}
      {workLogTarget && (
        <WorkLogDialog
          staff={workLogTarget}
          initialMonth={month}
          onClose={() => {
            setWorkLogTarget(null)
            if (tab === 'payroll') loadPayroll(month)
          }}
        />
      )}
    </div>
  )
}

// ─── Add / Edit staff dialog ───────────────────────────────────────────────
interface StaffDialogProps {
  staff?: StaffRow
  onClose: () => void
  onSaved: () => void
}

function StaffDialog({ staff, onClose, onSaved }: StaffDialogProps) {
  const isEdit = !!staff
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fullName: staff?.fullName ?? '',
    role: staff?.role ?? 'Cleaner',
    phone: staff?.phone ?? '',
    defaultDailyRate: staff ? String(staff.defaultDailyRate) : '',
    joinDate: staff?.joinDate ? staff.joinDate.slice(0, 10) : '',
    active: staff?.active ?? true,
    notes: staff?.notes ?? '',
  })
  const [customRole, setCustomRole] = useState('')
  const isCustomRole = !STAFF_ROLES.includes(form.role as any)

  const handleSubmit = async () => {
    if (!form.fullName.trim()) {
      toast.error('Full name is required')
      return
    }
    const role = isCustomRole ? customRole.trim() : form.role
    if (!role) {
      toast.error('Role is required')
      return
    }

    setSaving(true)
    try {
      const payload = {
        fullName: form.fullName.trim(),
        role,
        phone: form.phone.trim() || null,
        defaultDailyRate: Math.max(0, Number(form.defaultDailyRate) || 0),
        joinDate: form.joinDate || null,
        active: form.active,
        notes: form.notes.trim() || null,
      }
      if (isEdit && staff) {
        await api(`/api/staff/${staff.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        toast.success('Staff updated')
      } else {
        await api('/api/staff', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Staff added')
      }
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {isEdit ? 'Edit staff' : 'Add staff'}
          </DialogTitle>
          <DialogDescription>
            Minor staff earn a daily rate. Their monthly pay is the sum of their daily work-log
            entries — no fixed monthly salary and no EPF/ETF.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Full name *</Label>
            <Input
              placeholder="e.g. Sunil Perera"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Role *</Label>
              <Select
                value={isCustomRole ? '__custom__' : form.role}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, role: v === '__custom__' ? 'Other' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">Custom…</SelectItem>
                </SelectContent>
              </Select>
              {isCustomRole && (
                <Input
                  placeholder="Enter custom role"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                />
              )}
            </div>

            <div className="grid gap-1.5">
              <Label>Default daily rate (LKR)</Label>
              <Input
                type="number"
                min={0}
                step={50}
                placeholder="0"
                value={form.defaultDailyRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, defaultDailyRate: e.target.value }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Only a suggestion — each day's rate can be overridden in the work log.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input
                placeholder="Optional"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Join date</Label>
              <Input
                type="date"
                value={form.joinDate}
                onChange={(e) => setForm((f) => ({ ...f, joinDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              placeholder="Optional notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-3 transition-colors hover:bg-muted/40">
            <Checkbox
              checked={form.active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v === true }))}
            />
            <span>
              <span className="block text-sm font-medium">Active</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Inactive staff are hidden from the monthly payroll register.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Add staff'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Work log dialog (calendar) ────────────────────────────────────────────
interface WorkLogDialogProps {
  staff: StaffRow
  initialMonth: string
  onClose: () => void
}

function WorkLogDialog({ staff, initialMonth, onClose }: WorkLogDialogProps) {
  const school = useSchoolInfo()
  const [month, setMonth] = useState(initialMonth)
  const [logs, setLogs] = useState<StaffWorkLogRow[]>([])
  const [totalDays, setTotalDays] = useState(0)
  const [totalPay, setTotalPay] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editDay, setEditDay] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api<StaffWorkLogResponse>(`/api/staff/${staff.id}/worklog?month=${month}`)
      .then((r) => {
        setLogs(r.logs || [])
        setTotalDays(r.totalDays || 0)
        setTotalPay(r.totalPay || 0)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load work log'))
      .finally(() => setLoading(false))
  }, [staff.id, month])

  useEffect(() => {
    load()
  }, [load])

  const byDate = useMemo(() => {
    const m = new Map<string, StaffWorkLogRow>()
    for (const l of logs) m.set(l.date, l)
    return m
  }, [logs])

  const days = useMemo(() => daysInMonth(month), [month])

  const saveDay = useCallback(
    async (
      date: string,
      status: StaffWorkStatus,
      rate: number,
      note: string | null,
    ) => {
      setSaving(true)
      try {
        await api(`/api/staff/${staff.id}/worklog`, {
          method: 'POST',
          body: JSON.stringify({ date, status, dayRate: rate, note }),
        })
        await load()
        setEditDay(null)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to save entry')
      } finally {
        setSaving(false)
      }
    },
    [staff.id, load],
  )

  const deleteDay = useCallback(
    async (date: string) => {
      setSaving(true)
      try {
        await api(`/api/staff/${staff.id}/worklog/${date}`, { method: 'DELETE' })
        await load()
        setEditDay(null)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to delete entry')
      } finally {
        setSaving(false)
      }
    },
    [staff.id, load],
  )

  const markAllWeekdaysPresent = useCallback(async () => {
    if (!confirm(`Mark all Mon–Fri days as Present at the default rate (${currency(staff.defaultDailyRate)})?`)) return
    setSaving(true)
    try {
      for (const d of days) {
        if (isWeekend(d)) continue
        await api(`/api/staff/${staff.id}/worklog`, {
          method: 'POST',
          body: JSON.stringify({
            date: d,
            status: 'Present',
            dayRate: staff.defaultDailyRate,
          }),
        })
      }
      await load()
      toast.success('Logged weekdays as Present')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to bulk-log')
    } finally {
      setSaving(false)
    }
  }, [days, staff.id, staff.defaultDailyRate, load])

  const handlePrint = useCallback(() => {
    printStaffPayslip(staff, logs, month, school)
  }, [staff, logs, month, school])

  const nowMonth = currentMonth()
  const canPrev = month > '2020-01'
  const canNext = month < nowMonth

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[92vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className={`text-xs ${avatarColor(staff.fullName)}`}>
                  {initials(staff.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-base">{staff.fullName}</p>
                <p className="truncate font-mono text-[11px] font-normal text-muted-foreground">
                  {staff.staffId} · {staff.role}
                </p>
              </div>
            </DialogTitle>
            <DialogDescription>
              Tap any day to log the status and rate. Default rate: {currency(staff.defaultDailyRate)}.
            </DialogDescription>
          </DialogHeader>

          {/* Month nav + summary */}
          <div className="flex flex-col gap-3 border-y py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={!canPrev}
                onClick={prevMonth}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[140px] text-center text-sm font-semibold">
                {monthLabel(month)}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={!canNext}
                onClick={nextMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5 border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                {totalDays} day{totalDays === 1 ? '' : 's'}
              </Badge>
              <Badge variant="outline" className="gap-1.5 border-transparent bg-primary/10 text-primary">
                <Clock className="h-3 w-3" />
                {currency(totalPay)}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={markAllWeekdaysPresent}
                disabled={saving || loading}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Fill weekdays
              </Button>
            </div>
          </div>

          {/* Calendar grid */}
          {error ? (
            <div className="p-6 text-center">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={load}>
                Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div
                  key={d}
                  className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {/* Leading blanks for first weekday alignment */}
              {(() => {
                const first = new Date(days[0] + 'T00:00:00')
                const w = (first.getDay() + 6) % 7 // Monday = 0
                return Array.from({ length: w }).map((_, i) => <div key={`blank-${i}`} />)
              })()}
              {days.map((d) => {
                const entry = byDate.get(d)
                const status = entry?.status
                const bg =
                  status === 'Present'
                    ? 'bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25'
                    : status === 'Half Day'
                      ? 'bg-sky-500/15 border-sky-500/30 hover:bg-sky-500/25'
                      : status === 'Absent'
                        ? 'bg-red-500/10 border-red-500/25 hover:bg-red-500/20'
                        : status === 'Leave'
                          ? 'bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25'
                          : isWeekend(d)
                            ? 'bg-muted/30 border-transparent hover:bg-muted/50'
                            : 'bg-background border-border hover:bg-muted/50'
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEditDay(d)}
                    className={`flex aspect-square flex-col items-center justify-center rounded-lg border p-1 text-center transition-colors ${bg}`}
                  >
                    <span className="text-xs font-semibold tabular-nums">{dayNum(d)}</span>
                    {entry && (
                      <span className="mt-0.5 text-[9px] font-medium leading-tight">
                        {entry.dayRate > 0 ? currencyCompact(entry.dayRate) : status}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Monthly total:{' '}
              <span className="font-semibold text-foreground">{currency(totalPay)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={handlePrint} className="gap-2" disabled={logs.length === 0}>
                <Printer className="h-4 w-4" /> Print payslip
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day entry sub-dialog */}
      {editDay && (
        <DayEntryDialog
          date={editDay}
          staff={staff}
          existing={byDate.get(editDay) ?? null}
          saving={saving}
          onSave={saveDay}
          onDelete={deleteDay}
          onClose={() => setEditDay(null)}
        />
      )}
    </>
  )
}

// ─── Day entry dialog ──────────────────────────────────────────────────────
interface DayEntryDialogProps {
  date: string
  staff: StaffRow
  existing: StaffWorkLogRow | null
  saving: boolean
  onSave: (
    date: string,
    status: StaffWorkStatus,
    rate: number,
    note: string | null,
  ) => void | Promise<void>
  onDelete: (date: string) => void | Promise<void>
  onClose: () => void
}

function DayEntryDialog({
  date,
  staff,
  existing,
  saving,
  onSave,
  onDelete,
  onClose,
}: DayEntryDialogProps) {
  const [status, setStatus] = useState<StaffWorkStatus>(
    (existing?.status as StaffWorkStatus) ?? 'Present',
  )
  const [rate, setRate] = useState<string>(() => {
    if (!existing) return String(staff.defaultDailyRate)
    if (existing.status === 'Half Day') return String(existing.dayRate * 2)
    return String(existing.dayRate || staff.defaultDailyRate)
  })
  const [note, setNote] = useState(existing?.note ?? '')

  const effectiveRate =
    status === 'Absent' || status === 'Leave'
      ? 0
      : status === 'Half Day'
        ? Math.round((Number(rate) || 0) / 2)
        : Number(rate) || 0

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {dateLabel}
          </DialogTitle>
          <DialogDescription>
            {staff.fullName} · {staff.role}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STAFF_WORK_STATUSES.map((s) => {
                const active = status === s
                const cls =
                  s === 'Present'
                    ? active
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'hover:bg-emerald-500/10'
                    : s === 'Half Day'
                      ? active
                        ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        : 'hover:bg-sky-500/10'
                      : s === 'Absent'
                        ? active
                          ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300'
                          : 'hover:bg-red-500/10'
                        : active
                          ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'hover:bg-amber-500/10'
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s as StaffWorkStatus)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${cls}`}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {status !== 'Absent' && status !== 'Leave' && (
            <div className="grid gap-1.5">
              <Label>
                {status === 'Half Day' ? 'Full-day rate (LKR)' : 'Daily rate (LKR)'}
              </Label>
              <Input
                type="number"
                min={0}
                step={50}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              {status === 'Half Day' && (
                <p className="text-[11px] text-muted-foreground">
                  Half day → will be logged as{' '}
                  <span className="font-medium text-foreground">{currency(effectiveRate)}</span>
                </p>
              )}
            </div>
          )}

          {status !== 'Absent' && status !== 'Leave' && status !== 'Half Day' && (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
              Will be logged:{' '}
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                {currency(effectiveRate)}
              </span>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Note</Label>
            <Input
              placeholder="Optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {existing ? (
            <Button
              variant="ghost"
              onClick={() => onDelete(date)}
              disabled={saving}
              className="gap-2 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4" /> Clear entry
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={() => onSave(date, status, Number(rate) || 0, note.trim() || null)}
              disabled={saving}
              className="gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
