'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'

import { api } from '@/lib/api'
import { PaymentRow, StudentRow, PAYMENT_METHODS } from '@/lib/types'
import { currency, initials, avatarColor } from '@/lib/format'
import { useSchoolInfo, toWaPhone } from '@/lib/school'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types ──────────────────────────────────────────────────────────────────
interface ExtraRow {
  id: string
  name: string
  defaultAmount: number
  category: string
  description: string | null
  active: boolean
  order: number
}

interface CustomItem {
  id: string          // client-side uid
  name: string
  amount: string      // string for the input
}

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

function monthShortLabel(m: string): string {
  const [y, mm] = m.split('-').map((n) => parseInt(n, 10))
  return new Date(y, mm - 1, 1).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
  })
}

const SCHOOL_PHONE = '0117221077'
const SCHOOL_NAME = 'SANOMIN Learning Center'

// ─── WhatsApp message builder ───────────────────────────────────────────────
function buildReceiptMessage(payment: PaymentRow): string {
  const lines: string[] = []
  lines.push('Dear Parent,')
  lines.push('')
  lines.push(
    `Thank you for settling the fees for *${payment.student.fullName}* (${payment.student.studentId}) — ${monthShortLabel(payment.month)}.`,
  )
  lines.push('')
  lines.push(`*Receipt ${payment.receiptNo ?? ''}*`)

  const items =
    (payment.items ?? []).length > 0
      ? payment.items
      : [
          {
            id: 'amount',
            programId: null,
            description: payment.program?.name ?? 'Fee',
            amount: payment.amount,
            program: null,
          },
        ]

  for (const it of items) {
    const label = it.description || it.program?.name || 'Fee'
    lines.push(`• ${label}: LKR ${it.amount.toLocaleString()}`)
  }

  lines.push(`Total paid: LKR ${payment.paidAmount.toLocaleString()} (${payment.method})`)
  lines.push('')
  lines.push('We appreciate your prompt payment!')
  lines.push(`— ${SCHOOL_NAME} (${SCHOOL_PHONE})`)
  return lines.join('\n')
}

function whatsappHrefForPayment(payment: PaymentRow): string | null {
  const guardians = payment.student.guardians ?? []
  const withPhone = guardians.filter((g) => toWaPhone(g.phone) !== null)
  const chosen = withPhone.find((g) => g.isPrimary) ?? withPhone[0]
  if (!chosen) return null
  const waPhone = toWaPhone(chosen.phone)
  if (!waPhone) return null
  return `https://wa.me/${waPhone}?text=${encodeURIComponent(buildReceiptMessage(payment))}`
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function PaymentDataEntryPage() {
  const school = useSchoolInfo()
  const searchRef = useRef<HTMLInputElement>(null)

  // Student search
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<StudentRow[]>([])
  const [searching, setSearching] = useState(false)
  const [student, setStudent] = useState<StudentRow | null>(null)

  // Programmes (from student's enrolments)
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([])

  // Common fees (catalog)
  const [extras, setExtras] = useState<ExtraRow[]>([])
  const [extrasLoaded, setExtrasLoaded] = useState(false)
  const [selectedExtraIds, setSelectedExtraIds] = useState<string[]>([])
  const [extraAmounts, setExtraAmounts] = useState<Record<string, string>>({}) // id → override amount

  // Other items (freeform)
  const [customItems, setCustomItems] = useState<CustomItem[]>([])

  // Payment meta
  const [month, setMonth] = useState(currentMonth())
  const [method, setMethod] = useState('Cash')
  const [paidAmount, setPaidAmount] = useState('0')
  const [note, setNote] = useState('')

  // UX
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<PaymentRow | null>(null)
  const [lastHref, setLastHref] = useState<string | null>(null)
  const [sessionLog, setSessionLog] = useState<PaymentRow[]>([])
  const [manageOpen, setManageOpen] = useState(false)

  // ─── Load extras catalog ───────────────────────────────────────────────────
  const reloadExtras = useCallback(() => {
    api<{ data: ExtraRow[] }>('/api/extras?active=true')
      .then((r) => setExtras(r.data ?? []))
      .catch(() => setExtras([]))
      .finally(() => setExtrasLoaded(true))
  }, [])

  useEffect(() => {
    reloadExtras()
  }, [reloadExtras])

  // ─── Debounce student search ──────────────────────────────────────────────
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(h)
  }, [query])

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

  useEffect(() => {
    if (!student) searchRef.current?.focus()
  }, [student])

  // ─── Derived: enrolled programmes ─────────────────────────────────────────
  const enrolledProgrammes = useMemo(() => {
    if (!student) return []
    const seen = new Set<string>()
    const out: {
      id: string
      code: string
      name: string
      color: string
      amount: number
      className: string | null
    }[] = []
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
        amount: classFee,
        className: cls?.name ?? null,
      })
    }
    return out
  }, [student])

  // Auto-select all programmes when a student is picked
  useEffect(() => {
    if (student) setSelectedProgramIds(enrolledProgrammes.map((p) => p.id))
  }, [student, enrolledProgrammes])

  // ─── Totals ────────────────────────────────────────────────────────────────
  const programmesTotal = useMemo(
    () =>
      enrolledProgrammes
        .filter((p) => selectedProgramIds.includes(p.id))
        .reduce((sum, p) => sum + p.amount, 0),
    [enrolledProgrammes, selectedProgramIds],
  )

  const extrasTotal = useMemo(() => {
    let sum = 0
    for (const id of selectedExtraIds) {
      const override = extraAmounts[id]
      if (override !== undefined && override !== '') {
        sum += parseFloat(override) || 0
      } else {
        const e = extras.find((x) => x.id === id)
        sum += e?.defaultAmount ?? 0
      }
    }
    return sum
  }, [selectedExtraIds, extraAmounts, extras])

  const customTotal = useMemo(
    () => customItems.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0),
    [customItems],
  )

  const grandTotal = programmesTotal + extrasTotal + customTotal
  const paidNum = parseFloat(paidAmount) || 0
  const balance = Math.max(0, grandTotal - paidNum)

  // Auto-fill paid amount with the grand total
  useEffect(() => {
    if (grandTotal > 0) setPaidAmount(String(grandTotal))
  }, [grandTotal])

  // ─── Reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStudent(null)
    setQuery('')
    setResults([])
    setSelectedProgramIds([])
    setSelectedExtraIds([])
    setExtraAmounts({})
    setCustomItems([])
    setPaidAmount('0')
    setNote('')
    setLastSaved(null)
    setLastHref(null)
  }, [])

  const toggleProgramme = (id: string) => {
    setSelectedProgramIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const toggleExtra = (id: string) => {
    setSelectedExtraIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const addCustomItem = () => {
    setCustomItems((prev) => [
      ...prev,
      { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: '', amount: '' },
    ])
  }

  const updateCustomItem = (id: string, patch: Partial<CustomItem>) => {
    setCustomItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  const removeCustomItem = (id: string) => {
    setCustomItems((prev) => prev.filter((it) => it.id !== id))
  }

  // ─── Save + send WhatsApp ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!student) return toast.error('Pick a student first')
    if (selectedProgramIds.length === 0 && selectedExtraIds.length === 0 && customItems.length === 0) {
      return toast.error('Add at least one programme, common fee, or other item')
    }
    if (paidNum <= 0) return toast.error('Paid amount must be greater than 0')

    // Validate custom items
    const cleanCustom = customItems
      .map((it) => ({
        name: it.name.trim(),
        amount: parseFloat(it.amount) || 0,
      }))
      .filter((it) => it.name && it.amount > 0)

    // Build unified items payload
    const items: Array<{
      programId: string | null
      amount?: number
      description: string
    }> = []

    // 1. Programmes
    for (const pid of selectedProgramIds) {
      const p = enrolledProgrammes.find((x) => x.id === pid)
      if (!p) continue
      items.push({
        programId: pid,
        amount: p.amount,
        description: p.className ? `${p.name} — ${p.className}` : p.name,
      })
    }

    // 2. Common fees
    for (const id of selectedExtraIds) {
      const e = extras.find((x) => x.id === id)
      if (!e) continue
      const override = extraAmounts[id]
      const amount =
        override !== undefined && override !== ''
          ? parseFloat(override) || 0
          : e.defaultAmount
      if (amount <= 0) continue
      items.push({
        programId: null,
        amount,
        description: e.name,
      })
    }

    // 3. Other items
    for (const c of cleanCustom) {
      items.push({
        programId: null,
        amount: c.amount,
        description: c.name,
      })
    }

    setSaving(true)
    try {
      const res = await api<PaymentRow>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          studentId: student.id,
          month,
          items,
          paidAmount: paidNum,
          method,
          note: note.trim() || null,
        }),
      })

      const href = whatsappHrefForPayment(res)
      setLastSaved(res)
      setLastHref(href)
      setSessionLog((prev) => [res, ...prev].slice(0, 20))

      if (href) {
        // Open WhatsApp (new tab). Blocked popups show a toast.
        const win = window.open(href, '_blank', 'noopener')
        if (!win) {
          toast.message('Receipt saved', {
            description: 'Pop-up blocked. Tap "Send WhatsApp" below to open.',
          })
        } else {
          toast.success(`Receipt ${res.receiptNo ?? ''} sent`)
        }
      } else {
        toast.warning('Receipt saved — no guardian phone number for WhatsApp')
      }

      // Clear the form for the next student
      setStudent(null)
      setQuery('')
      setResults([])
      setSelectedProgramIds([])
      setSelectedExtraIds([])
      setExtraAmounts({})
      setCustomItems([])
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
        {/* ── 1 · Find the student ─────────────────────────────────────────── */}
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
                    if (e.key === 'Enter' && results[0]) setStudent(results[0])
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

        {/* ── 2 · Programmes ──────────────────────────────────────────────── */}
        {student && enrolledProgrammes.length > 0 && (
          <Card className="p-4 sm:p-5">
            <Label className="text-sm font-semibold">2 · Programmes</Label>
            <div className="mt-3 space-y-2">
              {enrolledProgrammes.map((p) => {
                const checked = selectedProgramIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProgramme(p.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
                      checked ? 'border-primary/40 bg-primary/5' : 'bg-card hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
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
          </Card>
        )}

        {/* ── 3 · Common fees ─────────────────────────────────────────────── */}
        {student && (
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold">3 · Common fees</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={() => setManageOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" /> Manage
              </Button>
            </div>

            {!extrasLoaded ? (
              <div className="mt-3 space-y-2">
                <div className="h-14 animate-pulse rounded-lg bg-muted" />
                <div className="h-14 animate-pulse rounded-lg bg-muted" />
              </div>
            ) : extras.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No common fees defined yet. Click <span className="font-medium">Manage</span> to
                add things like Annual Concert, Sports Meet, Photograph, etc.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {extras.map((e) => {
                  const checked = selectedExtraIds.includes(e.id)
                  const override = extraAmounts[e.id]
                  const shownAmount =
                    override !== undefined && override !== ''
                      ? parseFloat(override) || 0
                      : e.defaultAmount
                  return (
                    <div
                      key={e.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
                        checked ? 'border-primary/40 bg-primary/5' : 'bg-card'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleExtra(e.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <Checkbox checked={checked} className="pointer-events-none" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{e.name}</span>
                          {e.category && e.category !== 'Other' && (
                            <span className="block truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                              {e.category}
                            </span>
                          )}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          inputMode="decimal"
                          value={override ?? String(e.defaultAmount)}
                          onChange={(ev) =>
                            setExtraAmounts((prev) => ({ ...prev, [e.id]: ev.target.value }))
                          }
                          className="h-9 w-28 text-right tabular-nums"
                          aria-label={`Amount for ${e.name}`}
                        />
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                          {currency(shownAmount)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* ── 4 · Other items ─────────────────────────────────────────────── */}
        {student && (
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold">4 · Other items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={addCustomItem}
              >
                <Plus className="h-3.5 w-3.5" /> Add item
              </Button>
            </div>

            {customItems.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No items added. Use <span className="font-medium">Add item</span> for things like
                school bags, uniforms, books, stationery — anything with a one-off price.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {customItems.map((it, idx) => (
                  <div
                    key={it.id}
                    className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center"
                  >
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground sm:w-6">
                      #{idx + 1}
                    </span>
                    <Input
                      placeholder="Item name (e.g. School bag, White shirt size 8)"
                      value={it.name}
                      onChange={(e) => updateCustomItem(it.id, { name: e.target.value })}
                      className="h-10 flex-1"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        placeholder="Amount"
                        value={it.amount}
                        onChange={(e) => updateCustomItem(it.id, { amount: e.target.value })}
                        className="h-10 w-32 text-right tabular-nums"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 text-muted-foreground hover:text-red-600"
                        onClick={() => removeCustomItem(it.id)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* ── 5 · Payment details ─────────────────────────────────────────── */}
        {student && (enrolledProgrammes.length > 0 || extras.length > 0) && (
          <Card className="p-4 sm:p-5">
            <Label className="text-sm font-semibold">5 · Payment details</Label>

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
                  {grandTotal > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaidAmount(String(grandTotal))}
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

            {/* Summary */}
            <div className="mt-4 space-y-1.5 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Programmes</span>
                <span className="tabular-nums">{currency(programmesTotal)}</span>
              </div>
              {extrasTotal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Common fees</span>
                  <span className="tabular-nums">{currency(extrasTotal)}</span>
                </div>
              )}
              {customTotal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Other items</span>
                  <span className="tabular-nums">{currency(customTotal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-1.5">
                <span className="font-semibold">Total billed</span>
                <span className="font-semibold tabular-nums">{currency(grandTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
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
                disabled={saving || paidNum <= 0}
                className="h-11 gap-2 text-base"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                {saving ? 'Saving…' : 'Record payment & send WhatsApp'}
              </Button>
            </div>
          </Card>
        )}

        {/* ── Last saved ──────────────────────────────────────────────────── */}
        {lastSaved && (
          <Card className="flex flex-col gap-3 border-emerald-500/40 bg-emerald-500/5 p-4 sm:flex-row sm:items-center">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                Saved · Receipt {lastSaved.receiptNo ?? '—'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {lastSaved.student.fullName} · {currency(lastSaved.paidAmount)} via {lastSaved.method}
              </p>
            </div>
            {lastHref ? (
              <Button
                size="sm"
                className="shrink-0 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => window.open(lastHref, '_blank', 'noopener')}
              >
                <MessageCircle className="h-3.5 w-3.5" /> Send WhatsApp
              </Button>
            ) : (
              <Badge variant="outline" className="shrink-0">
                No guardian phone
              </Badge>
            )}
          </Card>
        )}

        {/* ── Session log ─────────────────────────────────────────────────── */}
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
              {sessionLog.map((p) => {
                const href = whatsappHrefForPayment(p)
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback
                        className={`${avatarColor(p.student.fullName)} text-[10px] font-semibold`}
                      >
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
                    {href ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => window.open(href, '_blank', 'noopener')}
                        title="Send WhatsApp receipt"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="h-8 w-8 shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </main>

      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 text-[11px] text-muted-foreground">
          <span>{SCHOOL_NAME}</span>
          <span>{SCHOOL_PHONE}</span>
        </div>
      </footer>

      {/* ── Manage common fees dialog ─────────────────────────────────────── */}
      <ManageExtrasDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        onChanged={reloadExtras}
      />
    </div>
  )
}

// ─── Manage extras dialog ───────────────────────────────────────────────────
function ManageExtrasDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onChanged: () => void
}) {
  const [rows, setRows] = useState<ExtraRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newCategory, setNewCategory] = useState('Event')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api<{ data: ExtraRow[] }>('/api/extras')
      setRows(r.data ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return toast.error('Name is required')
    setCreating(true)
    try {
      await api('/api/extras', {
        method: 'POST',
        body: JSON.stringify({
          name,
          defaultAmount: parseFloat(newAmount) || 0,
          category: newCategory,
          active: true,
        }),
      })
      toast.success(`Added "${name}"`)
      setNewName('')
      setNewAmount('')
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (row: ExtraRow) => {
    setBusyId(row.id)
    try {
      await api(`/api/extras/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !row.active }),
      })
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (row: ExtraRow) => {
    if (!confirm(`Delete "${row.name}"? This will not affect past payments.`)) return
    setBusyId(row.id)
    try {
      await api(`/api/extras/${row.id}`, { method: 'DELETE' })
      toast.success(`Deleted "${row.name}"`)
      await load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Common fees</DialogTitle>
          <DialogDescription>
            Recurring fees that apply to some students but not all — Annual Concert, Sports Meet,
            Photograph, Graduation, etc.
          </DialogDescription>
        </DialogHeader>

        {/* Create row */}
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input
            placeholder="Fee name (e.g. Sports Meet)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            placeholder="Amount"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            className="sm:w-28"
          />
          <Select value={newCategory} onValueChange={setNewCategory}>
            <SelectTrigger className="sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['Event', 'Uniform', 'Books', 'Other'].map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>

        {/* List */}
        <div className="scroll-thin -mx-1 flex-1 overflow-y-auto px-1">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No common fees yet — add one above.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-lg border">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{row.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {row.category} · {currency(row.defaultAmount)}
                      {!row.active && ' · inactive'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 text-xs"
                    onClick={() => handleToggleActive(row)}
                    disabled={busyId === row.id}
                  >
                    {row.active ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
                    onClick={() => handleDelete(row)}
                    disabled={busyId === row.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
