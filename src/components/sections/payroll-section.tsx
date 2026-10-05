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
  AlertTriangle,
  ArrowRight,
  Loader2,
  Users,
  StickyNote,
  Undo2,
  X,
  Pencil,
  BookOpen,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { PayrollRow, PayrollSummary, PAYROLL_METHODS, salaryBreakdown } from '@/lib/types'
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

// ─── Print helpers (self-contained popup windows) ─────────────────────────
type SchoolInfoShape = ReturnType<typeof useSchoolInfo>

const PRINT_STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Paid: { bg: '#d1fae5', fg: '#065f46' },
  Pending: { bg: '#fef3c7', fg: '#92400e' },
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

function lkrPrint(n: number): string {
  return `LKR ${Number(n || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function printPayslipDocument(row: PayrollRow, school: SchoolInfoShape): void {
  const win = window.open('', '_blank', 'width=860,height=1000')
  if (!win) {
    toast.error('Pop-up blocked — allow pop-ups to print payslips.')
    return
  }

  const sc = PRINT_STATUS_COLORS[row.status] ?? PRINT_STATUS_COLORS.Pending
  const generated = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const isExternal = row.teacher.type === 'External'
  const hasBreakdown = Array.isArray(row.classBreakdown) && row.classBreakdown.length > 0

  const epfEmployeeLine =
    row.epfEmployee > 0 ? `− ${lkrPrint(row.epfEmployee)}` : lkrPrint(0)

  // Class breakdown rows for external teachers (or internal with tuition)
  const breakdownRows = hasBreakdown
    ? row.classBreakdown
        .map(
          (b) => `
        <div class="line breakdown">
          <span class="line-label">
            ${escapeHtml(b.className ?? 'Class')}
            <span class="hint">${b.enrolledCount} student${b.enrolledCount === 1 ? '' : 's'} × ${lkrPrint(b.classFee)} × ${100 - (b.classFee ? Math.round((b.teacherShare / (b.enrolledCount * b.classFee || 1)) * 10000) / 100 : 0)}%</span>
          </span>
          <span class="line-value">${lkrPrint(b.teacherShare)}</span>
        </div>`,
        )
        .join('')
    : ''

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Payslip — ${escapeHtml(row.teacher.fullName)} — ${escapeHtml(monthLabel(row.month))}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; background: #f1f5f9; color: #0f172a; padding: 24px; }
  .sheet { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
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
  .employee-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
  .field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  .badge { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; background: ${sc.bg}; color: ${sc.fg}; }
  .employee-name { font-size: 14px; font-weight: 700; }
  .employee-meta { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #64748b; margin-top: 2px; }
  .lines { border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 12px 0; margin-bottom: 16px; }
  .line { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 4px 0; }
  .line-label { color: #64748b; display: flex; flex-direction: column; min-width: 0; }
  .line-label .hint { font-size: 10px; color: #94a3b8; margin-top: 1px; }
  .line-value { font-variant-numeric: tabular-nums; font-weight: 500; flex-shrink: 0; }
  .line.subtotal { border-top: 1px solid #e2e8f0; margin-top: 6px; padding-top: 8px; }
  .line.subtotal .line-value { font-weight: 700; }
  .line.epf .line-value { color: #dc2626; font-weight: 600; }
  .line.net { border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 12px; }
  .line.net .line-label { font-size: 14px; font-weight: 700; color: #0f172a; }
  .line.net .line-value { font-size: 16px; font-weight: 800; color: #059669; }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin: 12px 0 4px; }
  .breakdown { padding-left: 10px; }
  .breakdown .line-label { color: #475569; }
  .employer-box { background: #f8fafc; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
  .employer-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
  .tag-purple { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 600; background: #ede9fe; color: #6d28d9; }
  .payment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .payment-grid .val { font-size: 13px; font-weight: 600; margin-top: 3px; }
  .note-box { background: #f8fafc; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #475569; margin-bottom: 16px; }
  .note-box strong { color: #0f172a; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; padding-top: 8px; }
  .sig { border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; color: #64748b; text-align: center; }
  .footer { text-align: center; font-size: 10px; color: #94a3b8; padding-top: 12px; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: none; border-radius: 0; max-width: none; }
  }
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
        <h2>Payslip</h2>
        <p>${escapeHtml(monthLabel(row.month))}</p>
      </div>
    </div>

    <div class="body">
      <div class="employee-box">
        <div class="employee-header">
          <span class="field-label">Employee</span>
          <span class="badge">${escapeHtml(row.status)}</span>
        </div>
        <div class="employee-name">${escapeHtml(row.teacher.fullName)}</div>
        <div class="employee-meta">${escapeHtml(row.teacher.teacherId)} · ${escapeHtml(row.teacher.type)}${row.teacher.epfNo ? ` · EPF #${escapeHtml(row.teacher.epfNo)}` : ''}</div>
      </div>

      <div class="lines">
        ${
          isExternal
            ? `<div class="section-label">Tuition share from classes</div>${breakdownRows || '<div class="line"><span class="line-label">No classes assigned</span><span class="line-value">LKR 0.00</span></div>'}`
            : `<div class="line">
                <span class="line-label">Basic salary</span>
                <span class="line-value">${lkrPrint(row.basicSalary)}</span>
              </div>
              <div class="line">
                <span class="line-label">Allowances</span>
                <span class="line-value">${lkrPrint(row.allowances)}</span>
              </div>
              ${
                hasBreakdown
                  ? `<div class="section-label">Tuition share from classes</div>${breakdownRows}`
                  : ''
              }`
        }
        <div class="line subtotal">
          <span class="line-label">Gross earnings</span>
          <span class="line-value">${lkrPrint(row.gross)}</span>
        </div>
        <div class="line epf">
          <span class="line-label">EPF employee (−8% of basic)</span>
          <span class="line-value">${epfEmployeeLine}</span>
        </div>
        <div class="line net">
          <span class="line-label">NET PAY</span>
          <span class="line-value">${lkrPrint(row.netSalary)}</span>
        </div>
      </div>

      ${
        !isExternal
          ? `<div class="employer-box">
              <div class="employer-header">
                <span class="field-label">Employer contributions</span>
                <span class="tag-purple">paid by institute</span>
              </div>
              <div class="line">
                <span class="line-label">EPF employer (12%)</span>
                <span class="line-value">${lkrPrint(row.epfEmployer)}</span>
              </div>
              <div class="line">
                <span class="line-label">ETF employer (3%)</span>
                <span class="line-value">${lkrPrint(row.etfEmployer)}</span>
              </div>
              <div class="line subtotal">
                <span class="line-label">Total institute cost</span>
                <span class="line-value">${lkrPrint(row.employerCost)}</span>
              </div>
            </div>`
          : `<div class="employer-box">
              <div class="employer-header">
                <span class="field-label">Employer contributions</span>
                <span class="tag-purple">not applicable (external)</span>
              </div>
              <div class="line">
                <span class="line-label">Total institute cost</span>
                <span class="line-value">${lkrPrint(row.employerCost)}</span>
              </div>
            </div>`
      }

      <div class="payment-grid">
        <div>
          <div class="field-label">Payment method</div>
          <div class="val">${escapeHtml(row.method ?? '—')}</div>
        </div>
        <div>
          <div class="field-label">Paid date</div>
          <div class="val">${escapeHtml(row.paidDate ? fmtDate(row.paidDate) : '—')}</div>
        </div>
      </div>

      ${row.note ? `<div class="note-box"><strong>Note:</strong> ${escapeHtml(row.note)}</div>` : ''}

      <div class="signatures">
        <div class="sig">Teacher</div>
        <div class="sig">Authorised</div>
      </div>

      <div class="footer">This is a computer-generated payslip. Generated ${escapeHtml(generated)}</div>
    </div>
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body></html>`)
  win.document.close()
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
  const setSection = useAppStore((s) => s.setSection)
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

  const [salaryOpen, setSalaryOpen] = useState(false)
  const [salaryDrafts, setSalaryDrafts] = useState<
    Record<string, { basic: string; allow: string; epf: string }>
  >({})
  const [savingSalaries, setSavingSalaries] = useState(false)

  // ─── Load payroll register ─────────────────────────────────────────────
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

    reloadRef.current = run
    const t = setTimeout(run, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [month, statusFilter])

  const fetchRegister = useCallback(() => reloadRef.current(), [])

  // ─── Search filter ─────────────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.teacher.fullName.toLowerCase().includes(q) ||
        r.teacher.teacherId.toLowerCase().includes(q),
    )
  }, [rows, search])

  // ─── Selection ─────────────────────────────────────────────────────────
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

  // ─── Footer totals ─────────────────────────────────────────────────────
  const sumBasic = useMemo(
    () => visibleRows.reduce((s, r) => s + r.basicSalary, 0),
    [visibleRows],
  )
  const sumAllowances = useMemo(
    () => visibleRows.reduce((s, r) => s + r.allowances, 0),
    [visibleRows],
  )
  const sumClassEarnings = useMemo(
    () => visibleRows.reduce((s, r) => s + (r.classEarnings ?? 0), 0),
    [visibleRows],
  )

  // Rows that need attention:
  //  - Internal teachers with no basic salary and no class earnings → need salary setup
  //  - External teachers with no classes → nothing to bill, but still shown
  const noSalaryRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.teacher.type !== 'External' &&
          r.basicSalary <= 0 &&
          (r.classEarnings ?? 0) <= 0,
      ),
    [rows],
  )

  // ─── Quick salary setup ────────────────────────────────────────────────
  const openSalaryDialog = useCallback(() => {
    const drafts: Record<string, { basic: string; allow: string; epf: string }> = {}
    for (const r of noSalaryRows) {
      drafts[r.teacher.id] = { basic: '', allow: '', epf: r.teacher.epfNo ?? '' }
    }
    setSalaryDrafts(drafts)
    setSalaryOpen(true)
  }, [noSalaryRows])

  const updateSalaryDraft = useCallback(
    (id: string, field: 'basic' | 'allow' | 'epf', value: string) => {
      setSalaryDrafts((prev) => ({
        ...prev,
        [id]: { ...prev[id], [field]: value },
      }))
    },
    [],
  )

  const draftsWithValue = useMemo(
    () =>
      Object.entries(salaryDrafts).filter(
        ([, d]) => Number(d.basic || 0) > 0 || Number(d.allow || 0) > 0,
      ),
    [salaryDrafts],
  )

  const saveSalaries = useCallback(async () => {
    if (draftsWithValue.length === 0) return
    setSavingSalaries(true)
    let ok = 0
    const failures: string[] = []
    for (const [teacherId, d] of draftsWithValue) {
      const row = noSalaryRows.find((r) => r.teacher.id === teacherId)
      try {
        await api(`/api/teachers/${teacherId}`, {
          method: 'PUT',
          body: JSON.stringify({
            basicSalary: Math.max(0, Number(d.basic || 0)),
            allowances: Math.max(0, Number(d.allow || 0)),
            epfNo: d.epf.trim() ? d.epf.trim() : null,
          }),
        })
        ok++
      } catch {
        failures.push(row?.teacher.fullName ?? teacherId)
      }
    }
    setSavingSalaries(false)
    if (ok > 0) {
      toast.success(
        `Salary updated for ${ok} teacher${ok === 1 ? '' : 's'} — register refreshed`,
      )
      setSalaryOpen(false)
      fetchRegister()
    }
    if (failures.length > 0) {
      toast.error(`Failed to update: ${failures.join(', ')}`)
    }
  }, [draftsWithValue, noSalaryRows, fetchRegister])

  // ─── CSV export ────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const headers = [
      'Teacher ID',
      'Name',
      'Type',
      'EPF No',
      'Month',
      'Basic',
      'Allowances',
      'Class earnings',
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
          escape(r.classEarnings ?? 0),
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
          <div className="flex flex-wrap items-center justify-end gap-2">
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
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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

      {/* Filters */}
      <Card className="min-w-0 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="flex flex-col gap-1.5">
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
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[140px]">
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
          <div className="flex w-full items-center gap-2 lg:w-auto">
            <div className="relative min-w-0 flex-1 lg:w-64">
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
                className="shrink-0 gap-1.5"
              >
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Salary register as of{' '}
          <span className="font-medium text-foreground">{monthLabel(month)}</span> · Pending rows
          show live figures (including class earnings); Paid rows show the snapshot taken at
          payment time. <span className="text-foreground/70">External teachers earn tuition
          share only; Internal teachers get basic + allowances + tuition share.</span>
        </p>
      </Card>

      {/* Zero-salary banner */}
      {!loading && !error && noSalaryRows.length > 0 && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 animate-row-in sm:flex-row sm:items-center"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {noSalaryRows.length} internal teacher{noSalaryRows.length === 1 ? '' : 's'}{' '}
              {noSalaryRows.length === 1 ? 'has' : 'have'} no salary configured
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
              {noSalaryRows
                .slice(0, 4)
                .map((r) => r.teacher.fullName)
                .join(', ')
                .concat(noSalaryRows.length > 4 ? ` +${noSalaryRows.length - 4} more` : '')}{' '}
              — their payroll rows total LKR 0. Set a basic salary in the Teachers section.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-amber-500/40 text-amber-800 hover:bg-amber-500/20 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100 sm:flex-none"
              onClick={openSalaryDialog}
            >
              <Pencil className="h-4 w-4" />
              Set salaries now
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-amber-500/40 text-amber-800 hover:bg-amber-500/20 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100 sm:flex-none"
              onClick={() => setSection('teachers')}
            >
              Go to Teachers
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Register table */}
      <Card className="min-w-0 p-0">
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
          <div className="scroll-thin max-h-[62vh] overflow-auto">
            <Table className="table-zebra min-w-[1050px]">
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
                  <TableHead
                    className="text-right"
                    title="Auto-calculated from enrolled students × (class fee − institute share)"
                  >
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="h-3 w-3" /> Class earnings
                    </span>
                  </TableHead>
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
                  const isExternal = r.teacher.type === 'External'
                  const classEarnings = r.classEarnings ?? 0
                  const hasBreakdown =
                    Array.isArray(r.classBreakdown) && r.classBreakdown.length > 0
                  const tooltip = hasBreakdown
                    ? r.classBreakdown!
                        .map(
                          (b) =>
                            `${b.className ?? 'Class'}: ${b.enrolledCount} × LKR ${b.classFee} = LKR ${b.teacherShare}`,
                        )
                        .join('\n')
                    : 'No classes assigned'
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
                        {isExternal ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : (
                          currency(r.basicSalary)
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-foreground/80">
                        {isExternal ? (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        ) : (
                          currency(r.allowances)
                        )}
                      </TableCell>
                      <TableCell
                        className="text-right text-sm tabular-nums"
                        title={tooltip}
                      >
                        {classEarnings > 0 ? (
                          <span className="font-medium text-emerald-700 dark:text-emerald-300">
                            {currency(classEarnings)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">LKR 0</span>
                        )}
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
                        {r.epfEmployer + r.etfEmployer > 0
                          ? currency(r.epfEmployer + r.etfEmployer)
                          : '—'}
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
                    <TableCell className="text-right text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {currency(sumClassEarnings)}
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

      {/* Mark paid */}
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

      {/* Revert to pending */}
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

      {/* Quick salary setup */}
      <Dialog open={salaryOpen} onOpenChange={setSalaryOpen}>
        <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto scroll-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Pencil className="h-4 w-4" />
              </div>
              Set internal staff salaries
            </DialogTitle>
            <DialogDescription>
              Only <span className="font-medium">Internal</span> teachers receive a basic salary.
              External teachers earn purely from their class tuition share — their basic is
              locked to 0. EPF (8% of basic) is deducted automatically; employer EPF 12% + ETF 3%
              is added on top.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {noSalaryRows.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                All internal teachers have a salary configured.
              </p>
            )}
            {noSalaryRows.map((r) => {
              const d = salaryDrafts[r.teacher.id] ?? { basic: '', allow: '', epf: '' }
              const net = salaryBreakdown(Number(d.basic || 0), Number(d.allow || 0)).netSalary
              return (
                <div key={r.teacher.id} className="rounded-lg border bg-muted/20 p-3">
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className={`text-xs ${avatarColor(r.teacher.fullName)}`}>
                        {initials(r.teacher.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.teacher.fullName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.teacher.teacherId} · {r.teacher.type}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Net</p>
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          net > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                        }`}
                      >
                        {currency(net)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">Basic salary</Label>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        placeholder="0"
                        value={d.basic}
                        onChange={(e) => updateSalaryDraft(r.teacher.id, 'basic', e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">Allowances</Label>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        placeholder="0"
                        value={d.allow}
                        onChange={(e) => updateSalaryDraft(r.teacher.id, 'allow', e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">EPF no</Label>
                      <Input
                        placeholder="Optional"
                        value={d.epf}
                        onChange={(e) => updateSalaryDraft(r.teacher.id, 'epf', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSalaryOpen(false)} disabled={savingSalaries}>
              Cancel
            </Button>
            <Button
              onClick={saveSalaries}
              disabled={savingSalaries || draftsWithValue.length === 0}
              className="gap-2"
            >
              {savingSalaries ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Save {draftsWithValue.length > 0 ? draftsWithValue.length : ''} salar
              {draftsWithValue.length === 1 ? 'y' : 'ies'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {payslipTarget && (
        <PayslipDialog row={payslipTarget} onClose={() => setPayslipTarget(null)} />
      )}
    </div>
  )
}

// ─── Pay dialog ────────────────────────────────────────────────────────────
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
      <DialogContent className="w-[95vw] max-w-md">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

// ─── Payslip dialog — preview only; printing opens a self-contained popup ─
interface PayslipDialogProps {
  row: PayrollRow
  onClose: () => void
}

function PayslipDialog({ row, onClose }: PayslipDialogProps) {
  const school = useSchoolInfo()

  const handlePrint = useCallback(() => {
    printPayslipDocument(row, school)
  }, [row, school])

  const isExternal = row.teacher.type === 'External'
  const hasBreakdown = Array.isArray(row.classBreakdown) && row.classBreakdown.length > 0

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto p-0 scroll-thin">
        <DialogHeader className="sr-only">
          <DialogTitle>Payslip — {row.teacher.fullName}</DialogTitle>
          <DialogDescription>
            Printable salary payslip for {monthLabel(row.month)}.
          </DialogDescription>
        </DialogHeader>

        <div>
          {/* Institute header */}
          <div className="flex items-center justify-between gap-3 border-b p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-border">
                <img
                  src={school.logoUrl}
                  alt={school.shortName}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-bold">{school.shortName}</p>
                <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                  {school.subtitle}
                </p>
                <p className="truncate text-[9px] text-muted-foreground">
                  {[school.address, school.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-extrabold uppercase tracking-widest">Payslip</p>
              <p className="text-[10px] text-muted-foreground">{monthLabel(row.month)}</p>
            </div>
          </div>

          <div className="space-y-4 p-4">
            {/* Teacher */}
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
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
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className={avatarColor(row.teacher.fullName)}>
                    {initials(row.teacher.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{row.teacher.fullName}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {row.teacher.teacherId} · {row.teacher.type}
                    {row.teacher.epfNo ? ` · EPF #${row.teacher.epfNo}` : ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Earnings & deductions */}
            <div className="space-y-1.5 border-y py-3 text-sm">
              {!isExternal && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Basic salary</span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {currency(row.basicSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Allowances</span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {currency(row.allowances)}
                    </span>
                  </div>
                </>
              )}

              {hasBreakdown && (
                <>
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Tuition share from classes
                  </p>
                  {row.classBreakdown!.map((b, i) => (
                    <div key={i} className="flex justify-between gap-2 pl-3 text-xs">
                      <span className="min-w-0 text-muted-foreground">
                        <span className="block truncate">{b.className ?? 'Class'}</span>
                        <span className="block text-[10px] opacity-70">
                          {b.enrolledCount} student{b.enrolledCount === 1 ? '' : 's'} ×{' '}
                          {currency(b.classFee)}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {currency(b.teacherShare)}
                      </span>
                    </div>
                  ))}
                </>
              )}

              <div className="flex justify-between gap-2 border-t pt-1.5">
                <span className="text-muted-foreground">Gross earnings</span>
                <span className="shrink-0 font-semibold tabular-nums">{currency(row.gross)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">EPF employee (−8% of basic)</span>
                <span className="shrink-0 font-medium tabular-nums text-red-600 dark:text-red-400">
                  {row.epfEmployee > 0 ? `−${currency(row.epfEmployee)}` : currency(0)}
                </span>
              </div>
              <div className="flex justify-between gap-2 border-t pt-2">
                <span className="text-sm font-bold">NET PAY</span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {currency(row.netSalary)}
                </span>
              </div>
            </div>

            {/* Employer contributions */}
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Employer contributions
                </p>
                <Badge
                  variant="outline"
                  className={
                    isExternal
                      ? 'border-transparent bg-slate-500/10 text-[10px] text-slate-600 dark:text-slate-300'
                      : 'border-transparent bg-purple-500/10 text-[10px] text-purple-700 dark:text-purple-300'
                  }
                >
                  {isExternal ? 'not applicable' : 'paid by institute'}
                </Badge>
              </div>
              <div className="mt-2 space-y-1.5">
                {!isExternal && (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">EPF employer (12%)</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {currency(row.epfEmployer)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">ETF employer (3%)</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {currency(row.etfEmployer)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between gap-2 border-t pt-1.5">
                  <span className="text-muted-foreground">Total institute cost</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {currency(row.employerCost)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Payment method
                </p>
                <p className="truncate font-medium">{row.method ?? '—'}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Paid date
                </p>
                <p className="truncate font-medium tabular-nums">
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
