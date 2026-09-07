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
  PieChart,
  Calculator,
  CreditCard,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  ExpenseRow,
  ExpenseSummary,
  ExpenseMethod,
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
  }
}

// ─── Main component ────────────────────────────────────────────────────────
export function ExpensesSection() {
  const [month, setMonth] = useState<string>(currentMonth())
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
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
  }, [month, debouncedSearch, categoryFilter])

  const fetchExpenses = useCallback(() => reloadRef.current(), [])

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
    const headers = ['Date', 'Category', 'Description', 'Vendor', 'Method', 'Amount', 'Note']
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
    setSearch('')
  }, [])

  const hasFilters = categoryFilter !== 'all' || debouncedSearch !== ''

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
      </Card>

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
            <Table className="table-zebra min-w-[860px]">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="w-[180px]">Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[170px]">Note</TableHead>
                  <TableHead className="w-[90px]">Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[60px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="animate-row-in hover:bg-muted/40">
                    <TableCell>
                      <span className="text-sm tabular-nums">{fmtDate(r.date)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`max-w-[170px] truncate font-medium ${categoryBadgeClasses(r.category)}`}
                        title={r.category}
                      >
                        {r.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.description}</p>
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
                        <DropdownMenuContent align="end" className="w-40">
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
        toast.success('Expense added')
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
                value={form.category || undefined}
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
