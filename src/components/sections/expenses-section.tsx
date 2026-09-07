'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ReceiptText,
  Plus,
  Pencil,
  Trash2,
  Download,
  Search,
  X,
  MoreVertical,
  Loader2,
  AlertCircle,
  CheckCircle2,
  CheckCheck,
  Clock,
  PieChart,
  Calculator,
  CreditCard,
  Target,
  Repeat,
  RotateCcw,
  XCircle,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  ExpenseRow,
  ExpenseSummary,
  ExpenseMethod,
  ExpenseStatus,
  EXPENSE_METHODS,
  EXPENSE_CATEGORIES,
} from '@/lib/types'
import { currency, currencyCompact, fmtDate } from '@/lib/format'

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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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

// Deterministic soft badge color per expense category (fixed palette — one
// color per known category, hash fallback keeps unknown categories stable).
const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  'Rent & Utilities':
    'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'Salaries & Wages':
    'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'Teaching Materials':
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'Equipment & Maintenance':
    'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  Transport:
    'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  Marketing:
    'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  'Events & Activities':
    'bg-lime-500/15 text-lime-700 dark:text-lime-300',
  'Licenses & Fees':
    'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  Miscellaneous:
    'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
}

const FALLBACK_BADGE_CLASSES = [
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  'bg-lime-500/15 text-lime-700 dark:text-lime-300',
  'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
]

function categoryBadgeClasses(category: string): string {
  const known = CATEGORY_BADGE_CLASSES[category]
  if (known) return known
  let h = 0
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0
  return FALLBACK_BADGE_CLASSES[h % FALLBACK_BADGE_CLASSES.length]
}

function methodBadgeClasses(method: string): string {
  switch (method) {
    case 'Cash':
      return 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'Card':
      return 'border-transparent bg-purple-500/10 text-purple-700 dark:text-purple-300'
    case 'Bank':
      return 'border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300'
    default:
      return 'border-transparent bg-muted text-muted-foreground'
  }
}

function statusBadgeClasses(status: ExpenseStatus): string {
  switch (status) {
    case 'Pending':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'Approved':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'Rejected':
      return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
    default:
      return 'border-transparent bg-muted text-muted-foreground'
  }
}

// ─── Response shapes ──────────────────────────────────────────────────────
interface ExpenseListResponse {
  data: ExpenseRow[]
  summary: ExpenseSummary
  page: number
  totalPages: number
  total: number
}

// ─── Form state ────────────────────────────────────────────────────────────
interface ExpenseFormState {
  date: string
  category: string
  description: string
  vendor: string
  amount: string
  method: ExpenseMethod
  note: string
  needsApproval: boolean
}

function emptyForm(): ExpenseFormState {
  return {
    date: toIsoDate(new Date()),
    category: '',
    description: '',
    vendor: '',
    amount: '',
    method: 'Cash',
    note: '',
    needsApproval: false,
  }
}

// ─── Main component ────────────────────────────────────────────────────────
export function ExpensesSection() {
  const [month, setMonth] = useState<string>(currentMonth())
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | ExpenseStatus>('all')
  const [search, setSearch] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')

  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExpenseRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Monthly budgets per category (vs actual spend)
  const [budgetsOpen, setBudgetsOpen] = useState(false)
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({})
  const [savingBudgets, setSavingBudgets] = useState(false)
  const [budgetsLoaded, setBudgetsLoaded] = useState(false)

  // Recurring monthly expense templates
  const [recurringOpen, setRecurringOpen] = useState(false)

  // Approval workflow
  const [approveAllOpen, setApproveAllOpen] = useState(false)
  const [approvingAll, setApprovingAll] = useState(false)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (budgetsLoaded) return
    api<{ budgets: Record<string, number> }>('/api/expenses/budgets')
      .then((r) => {
        if (!alive) return
        setBudgets(r.budgets || {})
        setBudgetsLoaded(true)
      })
      .catch(() => {
        if (alive) setBudgetsLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [budgetsLoaded])

  // ─── Debounce search input ──────────────────────────────────────────────
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(h)
  }, [search])

  // ─── Build query from filters ──────────────────────────────────────────
  const reloadRef = useRef<() => void>(() => {})

  useEffect(() => {
    let alive = true
    const params = new URLSearchParams()
    params.set('month', month)
    params.set('limit', '200')
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (categoryFilter !== 'all') params.set('category', categoryFilter)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const url = `/api/expenses?${params.toString()}`

    const run = () => {
      if (!alive) return
      setLoading(true)
      setError(null)
      api<ExpenseListResponse>(url)
        .then((r) => {
          if (!alive) return
          setRows(r.data)
          setTotal(r.total)
          setSummary(r.summary)
        })
        .catch((e) => {
          if (!alive) return
          setError(e instanceof Error ? e.message : 'Failed to load expenses')
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
  }, [month, debouncedSearch, categoryFilter, statusFilter])

  const fetchExpenses = useCallback(() => reloadRef.current(), [])

  // ─── Budgets ──────────────────────────────────────────────────────
  const openBudgetsDialog = useCallback(() => {
    const drafts: Record<string, string> = {}
    for (const c of EXPENSE_CATEGORIES) drafts[c] = budgets[c] ? String(budgets[c]) : ''
    setBudgetDrafts(drafts)
    setBudgetsOpen(true)
  }, [budgets])

  const saveBudgets = useCallback(async () => {
    setSavingBudgets(true)
    try {
      const payload: Record<string, number> = {}
      for (const [cat, val] of Object.entries(budgetDrafts)) {
        const n = Number(val)
        if (val.trim() !== '' && Number.isFinite(n) && n > 0) payload[cat] = n
      }
      await api('/api/expenses/budgets', {
        method: 'PUT',
        body: JSON.stringify({ budgets: payload }),
      })
      setBudgets(payload)
      setBudgetsOpen(false)
      toast.success('Monthly budgets saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save budgets')
    } finally {
      setSavingBudgets(false)
    }
  }, [budgetDrafts])

  // ─── Approval status transitions ────────────────────────────────────────
  const setStatus = useCallback(
    async (row: ExpenseRow, status: ExpenseStatus) => {
      setStatusBusyId(row.id)
      try {
        await api(`/api/expenses/${row.id}`, {
          method: 'PUT',
          body: JSON.stringify({ status }),
        })
        toast.success(
          status === 'Approved'
            ? `Approved — "${row.description}"`
            : status === 'Rejected'
              ? `Rejected — "${row.description}"`
              : `Back to pending — "${row.description}"`,
        )
        fetchExpenses()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to update status')
      } finally {
        setStatusBusyId(null)
      }
    },
    [fetchExpenses],
  )

  const approveAllPending = useCallback(async () => {
    setApprovingAll(true)
    try {
      const params = new URLSearchParams({ month, limit: '200', status: 'Pending' })
      const res = await api<{ data: ExpenseRow[] }>(`/api/expenses?${params.toString()}`)
      const pending = res.data || []
      for (const row of pending) {
        await api(`/api/expenses/${row.id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'Approved' }),
        })
      }
      toast.success(`Approved ${pending.length} pending ${pending.length === 1 ? 'expense' : 'expenses'}`)
      setApproveAllOpen(false)
      fetchExpenses()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to approve all')
    } finally {
      setApprovingAll(false)
    }
  }, [month, fetchExpenses])

  // ─── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api(`/api/expenses/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success('Expense deleted')
      fetchExpenses()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete expense')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, fetchExpenses])

  // ─── CSV export ────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const headers = ['Date', 'Category', 'Description', 'Vendor', 'Method', 'Amount', 'Status', 'Note']
    const escape = (v: string | number | null | undefined): string => {
      const s = v === null || v === undefined ? '' : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    const lines = [headers.join(',')]
    for (const r of rows) {
      lines.push(
        [
          escape(fmtDate(r.date)),
          escape(r.category),
          escape(r.description),
          escape(r.vendor ?? ''),
          escape(r.method),
          escape(r.amount),
          escape(r.status),
          escape(r.note ?? ''),
        ].join(','),
      )
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sanomin-expenses-${month}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} expenses to CSV`)
  }, [rows, month])

  const clearFilters = useCallback(() => {
    setCategoryFilter('all')
    setStatusFilter('all')
    setSearch('')
  }, [])

  const hasFilters = categoryFilter !== 'all' || debouncedSearch !== '' || statusFilter !== 'all'

  // ─── Derived stats ──────────────────────────────────────────────────────
  const topCategory = summary?.byCategory?.[0] ?? null
  const bankCardTotal = summary
    ? (summary.methodTotals?.Bank ?? 0) + (summary.methodTotals?.Card ?? 0)
    : 0
  const cashTotal = summary?.methodTotals?.Cash ?? 0
  const avgPerEntry =
    summary && summary.count > 0 ? summary.total / summary.count : 0

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Expenses"
        description="Institute operating expenses & outgoings"
        icon={<ReceiptText className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setRecurringOpen(true)} className="gap-2">
              <Repeat className="h-4 w-4" /> Recurring
            </Button>
            <Button variant="outline" size="sm" onClick={openBudgetsDialog} className="gap-2">
              <Target className="h-4 w-4" /> Budgets
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
          </>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary ? (
          <>
            <StatCard
              label="Total this month"
              value={currencyCompact(summary.total)}
              icon={ReceiptText}
              hint={`${summary.count} payment${summary.count === 1 ? '' : 's'}`}
              accent="red"
            />
            <StatCard
              label="Top category"
              value={topCategory ? topCategory.category : '—'}
              icon={PieChart}
              hint={
                topCategory && summary.total > 0
                  ? `${Math.round((topCategory.total / summary.total) * 100)}% of total · ${currencyCompact(topCategory.total)}`
                  : 'No expenses yet'
              }
              accent="amber"
            />
            <StatCard
              label="Average per entry"
              value={currencyCompact(avgPerEntry)}
              icon={Calculator}
              hint={`across ${summary.count} ${summary.count === 1 ? 'entry' : 'entries'}`}
              accent="purple"
            />
            <StatCard
              label="Bank + Card"
              value={currencyCompact(bankCardTotal)}
              icon={CreditCard}
              hint={`vs Cash ${currencyCompact(cashTotal)}`}
              accent="green"
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      {/* Budget vs actual (only when at least one budget is set) */}
      {Object.keys(budgets).length > 0 && summary && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-primary" />
              Budget vs actual
              <span className="text-xs font-normal text-muted-foreground">
                {monthLabel(month)}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={openBudgetsDialog} className="h-7 gap-1 text-xs">
              <Pencil className="h-3 w-3" /> Edit budgets
            </Button>
          </div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXPENSE_CATEGORIES.filter((c) => budgets[c]).map((cat) => {
              const budget = budgets[cat]
              const spent = summary.byCategory.find((b) => b.category === cat)?.total ?? 0
              const ratio = budget > 0 ? spent / budget : 0
              const over = spent > budget
              const barColor =
                ratio >= 1
                  ? 'bg-red-500'
                  : ratio >= 0.8
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              return (
                <div key={cat} className="min-w-0">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{cat}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {currencyCompact(spent)} / {currencyCompact(budget)}
                      {over && (
                        <span className="ml-1 font-semibold text-red-600 dark:text-red-400">
                          +{currencyCompact(spent - budget)} over
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Month selector + Category filter + search */}
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
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
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
                placeholder="Search description / vendor / note…"
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

        {/* Approval status tabs (counts stay month-wide regardless of active tab) */}
        {(() => {
          const st = summary?.statusTotals
          const tabs: { key: 'all' | ExpenseStatus; label: string; count: number | null }[] = [
            { key: 'all', label: 'All', count: null },
            { key: 'Pending', label: 'Pending', count: st?.Pending?.count ?? 0 },
            { key: 'Approved', label: 'Approved', count: st?.Approved?.count ?? 0 },
            { key: 'Rejected', label: 'Rejected', count: st?.Rejected?.count ?? 0 },
          ]
          return (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
              <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Approval
              </span>
              {tabs.map((t) => {
                const active = statusFilter === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setStatusFilter(t.key)}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    {t.key === 'Pending' && (
                      <Clock className={`h-3 w-3 ${active ? '' : 'text-amber-500'}`} />
                    )}
                    {t.key === 'Approved' && (
                      <CheckCircle2 className={`h-3 w-3 ${active ? '' : 'text-emerald-500'}`} />
                    )}
                    {t.key === 'Rejected' && (
                      <XCircle className={`h-3 w-3 ${active ? '' : 'text-red-500'}`} />
                    )}
                    {t.label}
                    {t.count !== null && (
                      <span
                        className={`rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums ${
                          active
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })()}
      </Card>

      {/* Pending approval callout strip */}
      {summary?.statusTotals && summary.statusTotals.Pending.count > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {summary.statusTotals.Pending.count} expense{summary.statusTotals.Pending.count === 1 ? '' : 's'} awaiting approval
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                {currency(summary.statusTotals.Pending.total)} not yet reviewed · these still count toward this month&apos;s cash position
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2 sm:ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
              onClick={() => setStatusFilter('Pending')}
            >
              Review
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setApproveAllOpen(true)}
            >
              <CheckCheck className="h-4 w-4" /> Approve all
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="p-0">
        {error ? (
          <div className="p-6">
            <EmptyState
              icon={AlertCircle}
              title="Failed to load expenses"
              description={error}
              action={
                <Button size="sm" onClick={fetchExpenses}>
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
              icon={ReceiptText}
              title="No expenses recorded"
              description={
                hasFilters
                  ? `No expenses match the current filters for ${monthLabel(month)}.`
                  : `No expenses recorded for ${monthLabel(month)} yet. Add the first expense to get started.`
              }
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> Add Expense
                </Button>
              }
            />
          </div>
        ) : (
          <div className="scroll-thin max-h-[62vh] overflow-y-auto">
            <Table className="table-zebra min-w-[980px]">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="w-[180px]">Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[170px]">Note</TableHead>
                  <TableHead className="w-[90px]">Method</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[60px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className={`animate-row-in hover:bg-muted/40 ${
                      r.status === 'Rejected'
                        ? 'opacity-55'
                        : r.status === 'Pending'
                          ? 'bg-amber-500/[0.05]'
                          : ''
                    }`}
                  >
                    <TableCell>
                      <span className="text-sm tabular-nums">{fmtDate(r.date)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`max-w-[170px] font-medium ${categoryBadgeClasses(r.category)}`}
                        title={r.category}
                      >
                        <span className="min-w-0 truncate">{r.category}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {r.note === 'Recurring template' && (
                            <Repeat
                              className="h-3.5 w-3.5 shrink-0 text-primary"
                              aria-label="Created from a recurring template"
                            />
                          )}
                          {r.description}
                        </p>
                        {r.vendor && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {r.vendor}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.note ? (
                        <p
                          className="max-w-[160px] truncate text-xs text-muted-foreground"
                          title={r.note}
                        >
                          {r.note}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`font-medium ${methodBadgeClasses(r.method)}`}
                      >
                        {r.method}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`gap-1 font-medium ${statusBadgeClasses(r.status)}`}
                        title={
                          r.reviewedAt
                            ? `${r.status === 'Approved' ? 'Approved' : 'Rejected'} by ${r.reviewedBy ?? 'Administrator'} · ${new Date(r.reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                            : r.status === 'Pending'
                              ? 'Awaiting approval'
                              : undefined
                        }
                      >
                        {r.status === 'Pending' && <Clock className="h-3 w-3" />}
                        {r.status === 'Approved' && <CheckCircle2 className="h-3 w-3" />}
                        {r.status === 'Rejected' && <XCircle className="h-3 w-3" />}
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                      {currency(r.amount)}
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
                          {r.status === 'Pending' && (
                            <DropdownMenuItem
                              onClick={() => setStatus(r, 'Approved')}
                              className="text-emerald-600 focus:text-emerald-700 dark:text-emerald-400"
                            >
                              {statusBusyId === r.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                              )}
                              Approve
                            </DropdownMenuItem>
                          )}
                          {r.status === 'Pending' && (
                            <DropdownMenuItem
                              onClick={() => setStatus(r, 'Rejected')}
                              className="text-red-600 focus:text-red-700 dark:text-red-400"
                            >
                              <XCircle className="mr-2 h-4 w-4" /> Reject
                            </DropdownMenuItem>
                          )}
                          {r.status !== 'Pending' && (
                            <DropdownMenuItem onClick={() => setStatus(r, 'Pending')}>
                              <RotateCcw className="mr-2 h-4 w-4" /> Mark pending
                            </DropdownMenuItem>
                          )}
                          {r.status !== 'Pending' && <DropdownMenuSeparator />}
                          <DropdownMenuItem onClick={() => setEditTarget(r)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(r)}
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

        {/* Footer hint */}
        {!error && !(loading && rows.length === 0) && rows.length > 0 && (
          <div className="border-t p-4">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{rows.length}</span> of{' '}
              {total} {total === 1 ? 'expense' : 'expenses'} · {monthLabel(month)}
            </p>
          </div>
        )}
      </Card>

      {/* Create / Edit dialogs */}
      {createOpen && (
        <ExpenseDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false)
            fetchExpenses()
          }}
        />
      )}
      {editTarget && (
        <ExpenseDialog
          mode="edit"
          expense={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            fetchExpenses()
          }}
        />
      )}

      {/* Budgets dialog */}
      <Dialog open={budgetsOpen} onOpenChange={setBudgetsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto scroll-thin sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Target className="h-4 w-4" />
              </div>
              Monthly budgets
            </DialogTitle>
            <DialogDescription>
              Set a spending limit per category. Leave blank for no budget. Progress bars on the
              Expenses page compare each month&apos;s actual spend against these limits.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {EXPENSE_CATEGORIES.map((cat) => {
              const spentThisMonth =
                summary?.byCategory.find((b) => b.category === cat)?.total ?? 0
              return (
                <div
                  key={cat}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{cat}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {monthLabel(month)}: {currency(spentThisMonth)}
                    </p>
                  </div>
                  <div className="flex w-32 shrink-0 items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">LKR</span>
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      placeholder="—"
                      value={budgetDrafts[cat] ?? ''}
                      onChange={(e) =>
                        setBudgetDrafts((prev) => ({ ...prev, [cat]: e.target.value }))
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetsOpen(false)} disabled={savingBudgets}>
              Cancel
            </Button>
            <Button onClick={saveBudgets} disabled={savingBudgets} className="gap-2">
              {savingBudgets ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save budgets
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve-all confirm */}
      <ConfirmDialog
        open={approveAllOpen}
        onOpenChange={(v) => !v && !approvingAll && setApproveAllOpen(false)}
        title="Approve all pending expenses?"
        description={`Every pending expense for ${monthLabel(month)} will be marked Approved and counted as reviewed spend. This action can be undone per-row via “Mark pending”.`}
        confirmText={approvingAll ? 'Approving…' : 'Approve all'}
        cancelText="Cancel"
        onConfirm={approveAllPending}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete expense record?"
        description={
          deleteTarget
            ? `"${deleteTarget.description}" (${deleteTarget.category} · ${currency(
                deleteTarget.amount,
              )}, ${fmtDate(deleteTarget.date)}) will be permanently removed. This cannot be undone.`
            : ''
        }
        confirmText={deleting ? 'Deleting…' : 'Delete'}
        cancelText="Cancel"
        onConfirm={handleDelete}
      />

      {/* Recurring templates dialog */}
      {recurringOpen && (
        <RecurringTemplatesDialog
          month={month}
          onClose={() => setRecurringOpen(false)}
          onApplied={fetchExpenses}
        />
      )}
    </div>
  )
}

// ─── Expense create/edit dialog ────────────────────────────────────────────
interface ExpenseDialogProps {
  mode: 'create' | 'edit'
  expense?: ExpenseRow | null
  onClose: () => void
  onSaved: () => void
}

function ExpenseDialog({ mode, expense, onClose, onSaved }: ExpenseDialogProps) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ExpenseFormState>(() =>
    expense
      ? {
          date: toIsoDate(new Date(expense.date)),
          category: expense.category,
          description: expense.description,
          vendor: expense.vendor ?? '',
          amount: String(expense.amount),
          method: expense.method,
          note: expense.note ?? '',
          needsApproval: expense.status === 'Pending',
        }
      : emptyForm(),
  )

  const isEdit = mode === 'edit' && !!expense

  const setField = useCallback(
    <K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) => {
      setForm((f) => ({ ...f, [key]: value }))
    },
    [],
  )

  // ─── Live validation — submit stays disabled until the form is valid ──
  const amountNum = parseFloat(form.amount)
  const isValid =
    form.date.trim() !== '' &&
    form.category.trim() !== '' &&
    form.description.trim() !== '' &&
    !isNaN(amountNum) &&
    amountNum > 0

  // ─── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!isValid) return
    setSaving(true)
    try {
      const payload = {
        date: form.date,
        category: form.category,
        description: form.description.trim(),
        vendor: form.vendor.trim() || null,
        amount: amountNum,
        method: form.method,
        note: form.note.trim() || null,
        ...(!isEdit && form.needsApproval ? { status: 'Pending' } : {}),
      }
      if (isEdit && expense) {
        await api(`/api/expenses/${expense.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        toast.success('Expense updated')
      } else {
        await api('/api/expenses', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success(
          form.needsApproval
            ? 'Expense added — flagged for approval'
            : 'Expense added',
        )
      }
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" />
            {isEdit ? 'Edit Expense' : 'Add Expense'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this expense record. Amounts are saved in LKR.'
              : 'Record an institute operating expense — rent, utilities, supplies, transport, etc. Salaries are managed in Payroll.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Date + Category */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Date *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setField('date', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Category *</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setField('category', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label>Description *</Label>
            <Input
              placeholder="e.g. September electricity bill"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </div>

          {/* Vendor */}
          <div className="flex flex-col gap-1.5">
            <Label>Vendor</Label>
            <Input
              placeholder="e.g. CEB, Cargills, Hayleys"
              value={form.vendor}
              onChange={(e) => setField('vendor', e.target.value)}
            />
          </div>

          {/* Amount + Method */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Amount (LKR) *</Label>
              <Input
                type="number"
                min={0}
                step={10}
                placeholder="0"
                value={form.amount}
                onChange={(e) => setField('amount', e.target.value)}
              />
              {form.amount !== '' && (isNaN(amountNum) || amountNum <= 0) && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Amount must be greater than 0
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Method</Label>
              <Select
                value={form.method}
                onValueChange={(v) => setField('method', v as ExpenseMethod)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <Label>Note</Label>
            <Textarea
              rows={2}
              placeholder="Optional remarks — invoice no., payment reference…"
              value={form.note}
              onChange={(e) => setField('note', e.target.value)}
            />
          </div>

          {/* Approval flag (create mode only — review state is managed from
              the row menu afterwards) */}
          {!isEdit && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-dashed bg-muted/20 p-3 transition-colors hover:bg-muted/40">
              <Switch
                checked={form.needsApproval}
                onCheckedChange={(v) => setField('needsApproval', v)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  Submit for approval
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Entry will sit as <span className="font-medium text-amber-600 dark:text-amber-400">Pending</span> until the owner reviews it.
                </span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Add expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Recurring expense templates dialog ────────────────────────────────────
// Manage monthly standing expenses (rent, internet, cleaning…) and apply them
// to the selected month in one click. Applying is idempotent — templates that
// already produced an expense in the month are reported as skipped.

interface RecurringTemplate {
  id: string
  name: string
  category: string
  amount: number
  vendor?: string
  method: string
  day: number
  active: boolean
}

interface RecurringTemplatesDialogProps {
  month: string
  onClose: () => void
  onApplied: () => void
}

function RecurringTemplatesDialog({ month, onClose, onApplied }: RecurringTemplatesDialogProps) {
  const [templates, setTemplates] = useState<RecurringTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<RecurringTemplate | null>(null) // template being edited
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    api<{ templates: RecurringTemplate[] }>('/api/expenses/templates')
      .then((r) => {
        setTemplates(r.templates || [])
        setSelected(new Set((r.templates || []).filter((t) => t.active !== false).map((t) => t.id)))
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load templates'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  const selectedTotal = useMemo(
    () => templates.filter((t) => selected.has(t.id)).reduce((s, t) => s + (t.amount || 0), 0),
    [templates, selected],
  )

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Persist the current template list, then reload + report
  const persist = async (list: RecurringTemplate[], successMsg: string) => {
    setSaving(true)
    try {
      const r = await api<{ templates: RecurringTemplate[] }>('/api/expenses/templates', {
        method: 'PUT',
        body: JSON.stringify({ templates: list }),
      })
      setTemplates(r.templates || [])
      setSelected(new Set((r.templates || []).filter((t) => t.active !== false).map((t) => t.id)))
      toast.success(successMsg)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save templates')
      return false
    } finally {
      setSaving(false)
      setAdding(false)
      setEditing(null)
    }
  }

  const removeTemplate = (t: RecurringTemplate) => {
    const list = templates.filter((x) => x.id !== t.id)
    void persist(list, `"${t.name}" removed from recurring templates`)
  }

  // Pause = stays in the list but is excluded from Apply (and future months)
  const toggleActive = (t: RecurringTemplate) => {
    const list = templates.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x))
    void persist(
      list,
      t.active
        ? `"${t.name}" paused — won't be applied`
        : `"${t.name}" resumed — back in monthly apply`,
    )
  }

  const applySelected = async () => {
    setApplying(true)
    try {
      const r = await api<{
        created: number
        createdTotal: number
        skipped: { name: string; reason: string }[]
        message: string
      }>('/api/expenses/apply-templates', {
        method: 'POST',
        body: JSON.stringify({ month, templateIds: Array.from(selected) }),
      })
      if (r.created > 0) {
        toast.success(r.message, {
          description: `${currency(r.createdTotal)} recorded · ${monthLabel(month)}`,
        })
      } else {
        toast.info(r.message)
      }
      if (r.skipped.length > 0) {
        toast.warning(
          `${r.skipped.length} skipped (already recorded this month)`,
          { description: r.skipped.map((s) => s.name).join(', ') },
        )
      }
      onApplied()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply templates')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scroll-thin sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Repeat className="h-4 w-4" />
            </div>
            Recurring expenses
          </DialogTitle>
          <DialogDescription>
            Set up monthly standing expenses once — rent, internet, cleaning — then apply them to
            any month with one click. Applying twice never duplicates entries.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button size="sm" variant="outline" onClick={load}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* Template list */}
            {templates.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
                <Repeat className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">No recurring templates yet</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Add the expenses you pay every month and stop typing them over and over.
                </p>
              </div>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto scroll-thin pr-0.5">
                {templates.map((t) => {
                  const isSel = selected.has(t.id)
                  const isPaused = t.active === false
                  return (
                    <div
                      key={t.id}
                      className={`group flex items-center gap-3 rounded-xl border p-3 transition-all hover:shadow-sm ${
                        isPaused
                          ? 'border-dashed border-border bg-muted/20 opacity-70'
                          : isSel
                            ? 'border-primary/40 bg-primary/5'
                            : 'bg-card'
                      }`}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isSel}
                        aria-label={`Select ${t.name}`}
                        title={isPaused ? 'Paused — resume to apply this template' : `Select ${t.name}`}
                        onClick={() => !isPaused && toggle(t.id)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                          isSel
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40 hover:border-primary'
                        } ${isPaused ? 'cursor-not-allowed opacity-40 hover:border-muted-foreground/40' : ''}`}
                      >
                        {isSel && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          <span className="min-w-0 truncate">{t.name}</span>
                          {isPaused && (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-amber-500/40 bg-amber-500/10 text-[9px] uppercase tracking-wide text-amber-600 dark:text-amber-400"
                            >
                              Paused
                            </Badge>
                          )}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 overflow-hidden whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`hidden max-w-[140px] shrink-0 sm:inline-flex ${categoryBadgeClasses(t.category)}`}
                            title={t.category}
                          >
                            <span className="min-w-0 truncate">{t.category}</span>
                          </Badge>
                          <span className="truncate text-[11px] text-muted-foreground">
                            <span className="font-medium text-primary/80">day {t.day}</span>
                            {' · '}
                            {/* Mobile: category as text (badge hidden); Desktop: vendor · method */}
                            <span className="sm:hidden">{t.category}</span>
                            <span className="hidden sm:inline">
                              {[t.vendor, t.method].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </span>
                        </div>
                      </div>
                      {/* Amount above actions on mobile, side-by-side on desktop */}
                      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                        <p className={`text-sm font-semibold tabular-nums ${isPaused ? 'text-muted-foreground line-through decoration-border' : ''}`}>
                          {currency(t.amount)}
                        </p>
                        {/* Touch devices have no hover — keep actions visible on mobile */}
                        <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                          <Switch
                            checked={t.active !== false}
                            disabled={saving}
                            aria-label={`${t.active === false ? 'Resume' : 'Pause'} ${t.name}`}
                            title={`${t.active === false ? 'Resume' : 'Pause'} — exclude/include from monthly apply`}
                            onCheckedChange={() => toggleActive(t)}
                            className="mr-1 scale-[0.8]"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={`Edit ${t.name}`}
                            onClick={() => {
                              setAdding(false)
                              setEditing(t)
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            aria-label={`Delete ${t.name}`}
                            onClick={() => removeTemplate(t)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Inline add / edit form */}
            {(adding || editing) && (
              <TemplateForm
                initial={editing}
                onCancel={() => {
                  setAdding(false)
                  setEditing(null)
                }}
                onSave={(tpl) => {
                  const exists = editing ? templates.some((x) => x.id === editing.id) : false
                  const entry: RecurringTemplate = {
                    ...tpl,
                    id: exists ? editing!.id : tpl.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36),
                    // Keep paused state through edits (form doesn't manage it)
                    ...(exists ? { active: editing!.active } : {}),
                  }
                  const list = exists
                    ? templates.map((x) => (x.id === entry.id ? entry : x))
                    : [...templates, entry]
                  void persist(
                    list,
                    exists ? `"${entry.name}" updated` : `"${entry.name}" added to templates`,
                  )
                }}
              />
            )}

            {/* Selection summary */}
            {templates.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  {selected.size} of {templates.length} selected
                  {templates.some((t) => t.active === false) && (
                    <>
                      {' · '}
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {templates.filter((t) => t.active === false).length} paused
                      </span>
                    </>
                  )}
                </span>
                <span className="font-semibold tabular-nums">
                  ≈ {currency(selectedTotal)} per month
                </span>
              </div>
            )}
          </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null)
              setAdding(true)
            }}
            disabled={adding || !!editing || saving}
            className="sm:mr-auto"
          >
            <Plus className="mr-2 h-4 w-4" /> Add template
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={applySelected}
            disabled={applying || saving || loading || selected.size === 0}
            className="gap-2"
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Apply {selected.size > 0 ? selected.size : ''} to {monthLabel(month)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Inline template add/edit form ─────────────────────────────────────────
function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: RecurringTemplate | null
  onSave: (t: Omit<RecurringTemplate, 'id'>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [vendor, setVendor] = useState(initial?.vendor ?? '')
  const [method, setMethod] = useState(initial?.method ?? 'Cash')
  const [day, setDay] = useState(initial ? String(initial.day) : '1')

  const amountNum = parseFloat(amount)
  const dayNum = parseInt(day, 10)
  const valid =
    name.trim() !== '' && category !== '' && !isNaN(amountNum) && amountNum > 0 && dayNum >= 1 && dayNum <= 28

  return (
    <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Description *</Label>
          <Input
            autoFocus
            placeholder="e.g. Building rent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Category *</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Amount (LKR) *</Label>
          <Input
            type="number"
            min={0}
            step={100}
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Day of month</Label>
          <Input
            type="number"
            min={1}
            max={28}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label className="text-xs">Vendor</Label>
          <Input
            placeholder="Optional"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="h-8"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex w-40 flex-col gap-1.5">
          <Label className="text-xs">Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid}
            onClick={() =>
              onSave({
                name: name.trim(),
                category,
                amount: Math.round(amountNum * 100) / 100,
                vendor: vendor.trim() || undefined,
                method,
                day: dayNum,
                active: true,
              })
            }
          >
            {initial ? 'Save changes' : 'Add template'}
          </Button>
        </div>
      </div>
    </div>
  )
}
