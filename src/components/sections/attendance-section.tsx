'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ScanLine,
  Fingerprint,
  LogIn,
  LogOut,
  Clock,
  CalendarDays,
  Users2,
  GraduationCap,
  UserCheck,
  TimerReset,
  Hand,
  Pencil,
  Trash2,
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  History,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Building2,
  Briefcase,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  AttendanceRow,
  ATTENDANCE_METHODS,
  ATTENDANCE_STATUS,
} from '@/lib/types'
import { initials, avatarColor, fmtDate, fmtTime, fmtDateTime } from '@/lib/format'

import { SectionHeader } from '@/components/shared/section-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

// ─── Helpers ───────────────────────────────────────────────────────────────
const REFRESH_MS = 15000

function toDateInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toDateTimeInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function todayStr(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// ─── Visual maps ───────────────────────────────────────────────────────────
const STATUS_BADGE: Record<
  string,
  { variant: 'default' | 'secondary' | 'destructive' | 'outline'; cls: string }
> = {
  Present: {
    variant: 'default',
    cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  Late: {
    variant: 'default',
    cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  Absent: {
    variant: 'default',
    cls: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  },
  Leave: {
    variant: 'default',
    cls: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  },
}

const METHOD_BADGE: Record<string, string> = {
  Barcode: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Fingerprint: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  Manual: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
}

// ─── Response shapes ───────────────────────────────────────────────────────
interface ListResponse {
  data: AttendanceRow[]
  total: number
  page: number
  limit: number
  summary: { present: number; late: number; absent: number; total: number }
}

interface ScanResponse {
  action: 'check-in' | 'check-out'
  record: AttendanceRow
  person: { name: string; ref: string; type: string }
  error?: string
}

interface PersonPick {
  id: string
  ref: string // studentId or teacherId
  name: string
  type: 'Student' | 'Teacher'
  photoUrl: string | null
  sub: string // gender + ageGroup OR type
}

// ════════════════════════════════════════════════════════════════════════════
// Scanner Panel
// ════════════════════════════════════════════════════════════════════════════
interface ScannerPanelProps {
  onScanSuccess: () => void
  onOpenManual: () => void
}

function ScannerPanel({ onScanSuccess, onOpenManual }: ScannerPanelProps) {
  const [tab, setTab] = useState<'barcode' | 'fingerprint'>('barcode')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [fpValue, setFpValue] = useState('')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flashTick, setFlashTick] = useState(0)
  const [teachers, setTeachers] = useState<
    Array<{ id: string; teacherId: string; fingerprintId: string | null; fullName: string }>
  >([])
  const [teachersLoading, setTeachersLoading] = useState(false)
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const fpInputRef = useRef<HTMLInputElement>(null)

  // Lazy-load teachers when the fingerprint tab opens (for the random demo button).
  useEffect(() => {
    if (tab !== 'fingerprint' || teachers.length > 0) return
    let alive = true
    setTeachersLoading(true)
    api<{ data: Array<{ id: string; teacherId: string; fingerprintId: string | null; fullName: string }> }>(
      '/api/teachers?limit=100',
    )
      .then((res) => {
        if (!alive) return
        const list = (res.data || []).filter((t) => !!t.fingerprintId)
        setTeachers(list)
      })
      .catch(() => {
        /* non-fatal — demo button will just disable itself */
      })
      .finally(() => {
        if (alive) setTeachersLoading(false)
      })
    return () => {
      alive = false
    }
  }, [tab, teachers.length])

  // Refocus the active input whenever the tab changes.
  useEffect(() => {
    if (tab === 'barcode') barcodeInputRef.current?.focus()
    else fpInputRef.current?.focus()
  }, [tab])

  const runScan = useCallback(
    async (method: 'barcode' | 'fingerprint' | 'manual', value: string) => {
      if (!value.trim()) return
      setScanning(true)
      setError(null)
      try {
        const res = await api<ScanResponse>('/api/attendance/scan', {
          method: 'POST',
          body: JSON.stringify({ method, value: value.trim() }),
        })
        setResult(res)
        setFlashTick((t) => t + 1)
        onScanSuccess()
        const verb = res.action === 'check-in' ? 'Checked in' : 'Checked out'
        toast.success(`${verb}: ${res.person.name}`, {
          description: `${res.person.type} · ${res.person.ref}`,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Scan failed'
        setError(msg)
        toast.error(msg)
      } finally {
        setScanning(false)
      }
    },
    [onScanSuccess],
  )

  const handleBarcodeKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = barcodeValue
      setBarcodeValue('')
      runScan('barcode', v)
    }
  }

  const handleFingerprintKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const v = fpValue
      setFpValue('')
      runScan('fingerprint', v)
    }
  }

  const handleRandomFingerprint = () => {
    const enrolled = teachers.filter((t) => !!t.fingerprintId)
    if (enrolled.length === 0) {
      toast.error('No teachers with enrolled fingerprints')
      return
    }
    const pick = enrolled[Math.floor(Math.random() * enrolled.length)]
    setFpValue('')
    runScan('fingerprint', pick.fingerprintId as string)
  }

  const reset = () => {
    setResult(null)
    setError(null)
    setBarcodeValue('')
    setFpValue('')
    if (tab === 'barcode') barcodeInputRef.current?.focus()
    else fpInputRef.current?.focus()
  }

  return (
    <Card className="overflow-hidden">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'barcode' | 'fingerprint')}>
        <div className="flex flex-col gap-3 border-b bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="barcode" className="gap-2">
              <ScanLine className="h-4 w-4" />
              Student (Barcode)
            </TabsTrigger>
            <TabsTrigger value="fingerprint" className="gap-2">
              <Fingerprint className="h-4 w-4" />
              Teacher (Fingerprint)
            </TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="sm" onClick={onOpenManual} className="gap-2 self-start sm:self-auto">
            <Hand className="h-4 w-4" />
            Manual entry
          </Button>
        </div>

        <TabsContent value="barcode" className="mt-0 p-4 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            {/* Scanner viewport */}
            <div>
              <div className="relative h-56 w-full overflow-hidden rounded-xl border-2 border-primary/30 bg-slate-950 sm:h-64">
                {/* simulated barcode bars background */}
                <div className="absolute inset-0 flex items-center justify-center opacity-40">
                  <div className="flex h-32 w-56 items-center gap-[3px]">
                    {Array.from({ length: 36 }).map((_, i) => (
                      <div
                        key={i}
                        className="bg-slate-100"
                        style={{
                          width: `${((i * 7) % 4) + 1}px`,
                          height: '100%',
                          opacity: i % 2 === 0 ? 1 : 0.2,
                        }}
                      />
                    ))}
                  </div>
                </div>
                {/* scanline laser */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-emerald-400/80 shadow-[0_0_20px_4px_rgba(52,211,153,0.6)] animate-scanline" />
                {/* corner markers */}
                <div className="pointer-events-none absolute top-3 left-3 h-6 w-6 border-t-2 border-l-2 border-emerald-400/70" />
                <div className="pointer-events-none absolute top-3 right-3 h-6 w-6 border-t-2 border-r-2 border-emerald-400/70" />
                <div className="pointer-events-none absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-emerald-400/70" />
                <div className="pointer-events-none absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-emerald-400/70" />
                {/* flash overlay */}
                {flashTick > 0 && (
                  <div
                    key={`flash-${flashTick}`}
                    className="pointer-events-none absolute inset-0 bg-emerald-300/30 animate-in fade-in-0 fade-out-0 duration-500"
                  />
                )}
                {/* idle hint */}
                <div className="absolute inset-x-0 bottom-3 text-center">
                  <span className="rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-emerald-300">
                    {scanning ? 'Scanning…' : 'Ready · scan a student barcode'}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={barcodeInputRef}
                    autoFocus
                    placeholder="Scan or type barcode (e.g. SANP24001) — press Enter"
                    value={barcodeValue}
                    onChange={(e) => setBarcodeValue(e.target.value)}
                    onKeyDown={handleBarcodeKey}
                    className="pl-9 font-mono"
                    disabled={scanning}
                    aria-label="Barcode input"
                  />
                </div>
                <Button
                  onClick={() => {
                    const v = barcodeValue
                    setBarcodeValue('')
                    runScan('barcode', v)
                  }}
                  disabled={scanning || !barcodeValue.trim()}
                  className="gap-2"
                >
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  Check in
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Tip: real USB barcode readers act as keyboards — they type the code then send Enter.
                This input is the actual integration point.
              </p>
            </div>

            {/* Result panel */}
            <ScanResultPanel
              result={result}
              error={error}
              scanning={scanning}
              flashTick={flashTick}
              onReset={reset}
            />
          </div>
        </TabsContent>

        <TabsContent value="fingerprint" className="mt-0 p-4 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            {/* Scanner viewport */}
            <div>
              <div className="relative flex h-56 w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border-2 border-purple-500/30 bg-slate-950 sm:h-64">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-purple-500/10" />
                  <div className="absolute inset-0 rounded-full bg-purple-500/10 animate-pulse-ring" />
                  <Fingerprint
                    className={`h-16 w-16 text-purple-300 ${scanning ? 'animate-pulse' : ''}`}
                  />
                </div>
                <span className="rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-purple-300">
                  {scanning ? 'Reading fingerprint…' : 'Place finger on the reader'}
                </span>
                {flashTick > 0 && (
                  <div
                    key={`fp-flash-${flashTick}`}
                    className="pointer-events-none absolute inset-0 bg-purple-300/20 animate-in fade-in-0 fade-out-0 duration-500"
                  />
                )}
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={handleRandomFingerprint}
                  disabled={scanning || teachersLoading || teachers.length === 0}
                  className="gap-2"
                >
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                  {teachersLoading
                    ? 'Loading teachers…'
                    : teachers.length === 0
                      ? 'No enrolled teachers'
                      : 'Scan random fingerprint (demo)'}
                </Button>
                <div className="relative flex-1">
                  <Fingerprint className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={fpInputRef}
                    placeholder="Type FP id (e.g. FP-1001) — Enter"
                    value={fpValue}
                    onChange={(e) => setFpValue(e.target.value)}
                    onKeyDown={handleFingerprintKey}
                    className="pl-9 font-mono"
                    disabled={scanning}
                    aria-label="Fingerprint ID input"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Demo mode: the random button picks an enrolled teacher's fingerprint. In production this
                reads from the USB fingerprint device and submits the template id.
              </p>
            </div>

            <ScanResultPanel
              result={result}
              error={error}
              scanning={scanning}
              flashTick={flashTick}
              onReset={reset}
            />
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  )
}

// ─── Scan result panel (shared between barcode + fingerprint tabs) ─────────
interface ScanResultPanelProps {
  result: ScanResponse | null
  error: string | null
  scanning: boolean
  flashTick: number
  onReset: () => void
}

function ScanResultPanel({
  result,
  error,
  scanning,
  flashTick,
  onReset,
}: ScanResultPanelProps) {
  if (scanning) {
    return (
      <div className="flex h-full min-h-[14rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-6 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Processing scan…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[14rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-red-500/40 bg-red-500/5 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold">Scan failed</p>
        <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={onReset} className="mt-2 gap-2">
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex h-full min-h-[14rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/20 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ScanLine className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold">Waiting for scan</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          The result of the next check-in or check-out will appear here with a confirmation flash.
        </p>
      </div>
    )
  }

  const isCheckIn = result.action === 'check-in'
  const r = result.record
  const personType = result.person.type
  const accent = avatarColor(result.person.name + result.person.ref)

  return (
    <div
      key={`result-${flashTick}`}
      className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex h-full min-h-[14rem] flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <Badge
          className={
            isCheckIn
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
          }
        >
          {isCheckIn ? <LogIn className="mr-1 h-3 w-3" /> : <LogOut className="mr-1 h-3 w-3" />}
          {isCheckIn ? 'CHECK-IN' : 'CHECK-OUT'}
        </Badge>
        <Badge variant="outline" className="gap-1">
          {r.method === 'Barcode' ? (
            <ScanLine className="h-3 w-3" />
          ) : r.method === 'Fingerprint' ? (
            <Fingerprint className="h-3 w-3" />
          ) : (
            <Hand className="h-3 w-3" />
          )}
          {r.method}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <Avatar className="h-14 w-14 ring-2 ring-background">
          <AvatarFallback className={`text-lg font-bold ${accent}`}>
            {initials(result.person.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{result.person.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono">
              {result.person.ref}
            </Badge>
            <Badge
              className={
                personType === 'Student'
                  ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                  : 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
              }
            >
              {personType === 'Student' ? (
                <GraduationCap className="mr-1 h-3 w-3" />
              ) : (
                <Briefcase className="mr-1 h-3 w-3" />
              )}
              {personType}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LogIn className="h-3 w-3" /> Check-in
          </p>
          <p className="mt-1 font-semibold">{fmtTime(r.checkIn)}</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LogOut className="h-3 w-3" /> Check-out
          </p>
          <p className="mt-1 font-semibold">
            {r.checkOut ? fmtTime(r.checkOut) : <span className="text-emerald-600 dark:text-emerald-400">● Active</span>}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <Badge className={STATUS_BADGE[r.status]?.cls || ''}>{r.status}</Badge>
        <span className="text-muted-foreground">{fmtDateTime(r.date)}</span>
      </div>

      <Button variant="outline" size="sm" onClick={onReset} className="mt-auto gap-2 self-start">
        <RotateCcw className="h-4 w-4" />
        Scan next
      </Button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Manual Entry Dialog
// ════════════════════════════════════════════════════════════════════════════
interface ManualEntryDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}

function ManualEntryDialog({ open, onOpenChange, onSuccess }: ManualEntryDialogProps) {
  const [personType, setPersonType] = useState<'Student' | 'Teacher'>('Student')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PersonPick[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search
  useEffect(() => {
    if (!open) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const query = q.trim()
    if (!query) {
      setResults([])
      return
    }
    let alive = true
    setLoading(true)
    searchTimer.current = setTimeout(() => {
      const endpoint =
        personType === 'Student'
          ? `/api/students?q=${encodeURIComponent(query)}&limit=15`
          : `/api/teachers?q=${encodeURIComponent(query)}&limit=15`
      api<{ data: Array<Record<string, unknown>> }>(endpoint)
        .then((res) => {
          if (!alive) return
          const rows = (res.data || []).map((raw) => {
            if (personType === 'Student') {
              const s = raw as {
                id: string
                studentId: string
                fullName: string
                gender: string
                ageGroup: string | null
                photoUrl: string | null
              }
              return {
                id: s.id,
                ref: s.studentId,
                name: s.fullName,
                type: 'Student' as const,
                photoUrl: s.photoUrl,
                sub: [s.gender, s.ageGroup ? `${s.ageGroup} yrs` : ''].filter(Boolean).join(' · '),
              }
            }
            const t = raw as {
              id: string
              teacherId: string
              fullName: string
              type: string
              photoUrl: string | null
            }
            return {
              id: t.id,
              ref: t.teacherId,
              name: t.fullName,
              type: 'Teacher' as const,
              photoUrl: t.photoUrl,
              sub: t.type,
            }
          })
          setResults(rows)
        })
        .catch(() => {
          if (alive) setResults([])
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }, 250)
    return () => {
      alive = false
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [q, personType, open])

  const handlePick = async (p: PersonPick) => {
    setSubmitting(true)
    try {
      const res = await api<ScanResponse>('/api/attendance/scan', {
        method: 'POST',
        body: JSON.stringify({
          method: 'manual',
          value: p.id,
          personType: p.type,
        }),
      })
      const verb = res.action === 'check-in' ? 'Checked in' : 'Checked out'
      toast.success(`${verb}: ${p.name}`, {
        description: `${p.type} · ${p.ref} · Manual entry`,
      })
      onSuccess()
      onOpenChange(false)
      setQ('')
      setResults([])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Manual entry failed'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manual attendance entry</DialogTitle>
          <DialogDescription>
            Search a student or teacher and mark them present. Use this when the scanner is unavailable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Tabs
            value={personType}
            onValueChange={(v) => {
              setPersonType(v as 'Student' | 'Teacher')
              setQ('')
              setResults([])
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="Student" className="gap-2">
                <GraduationCap className="h-4 w-4" />
                Student
              </TabsTrigger>
              <TabsTrigger value="Teacher" className="gap-2">
                <Briefcase className="h-4 w-4" />
                Teacher
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${personType.toLowerCase()} by name, ID or ${personType === 'Student' ? 'barcode' : 'fingerprint'}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {loading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <EmptyState
                title={q ? 'No matches' : 'Start typing to search'}
                description={
                  q
                    ? `No ${personType.toLowerCase()}s match "${q}"`
                    : 'Enter at least 2 characters to search'
                }
                className="border-0 bg-transparent py-8"
              />
            ) : (
              <ul className="divide-y">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(p)}
                      disabled={submitting}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 disabled:opacity-50"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className={`text-xs font-bold ${avatarColor(p.name + p.ref)}`}>
                          {initials(p.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{p.ref}</span> · {p.sub}
                        </p>
                      </div>
                      <LogIn className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Edit Attendance Dialog
// ════════════════════════════════════════════════════════════════════════════
interface EditDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  record: AttendanceRow | null
  onSaved: () => void
}

function EditAttendanceDialog({ open, onOpenChange, record, onSaved }: EditDialogProps) {
  // Lazy initializer keyed off `record` so the form state resets cleanly when the
  // target changes (or when the dialog re-opens). Avoids setState-in-effect.
  const [form, setForm] = useState(() => ({
    status: record?.status ?? 'Present',
    note: record?.note ?? '',
    checkIn: record?.checkIn ? toDateTimeInput(record.checkIn) : '',
    checkOut: record?.checkOut ? toDateTimeInput(record.checkOut) : '',
  }))
  const [saving, setSaving] = useState(false)
  const [formKey, setFormKey] = useState(0)

  // Reset the form whenever the dialog opens with a (possibly different) record.
  useEffect(() => {
    if (!open) return
    setForm({
      status: record?.status ?? 'Present',
      note: record?.note ?? '',
      checkIn: record?.checkIn ? toDateTimeInput(record.checkIn) : '',
      checkOut: record?.checkOut ? toDateTimeInput(record.checkOut) : '',
    })
    setFormKey((k) => k + 1)
  }, [open, record])

  const handleSave = async () => {
    if (!record) return
    setSaving(true)
    try {
      await api(`/api/attendance/${record.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: form.status,
          note: form.note || null,
          checkIn: form.checkIn ? new Date(form.checkIn).toISOString() : null,
          checkOut: form.checkOut ? new Date(form.checkOut).toISOString() : null,
        }),
      })
      toast.success('Attendance record updated')
      onSaved()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!record) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit attendance record</DialogTitle>
          <DialogDescription>
            {record.personName} · <span className="font-mono">{record.personRef}</span> · {record.personType}
          </DialogDescription>
        </DialogHeader>

        <div key={formKey} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="att-status">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger id="att-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTENDANCE_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="att-checkin">Check-in time</Label>
              <Input
                id="att-checkin"
                type="datetime-local"
                value={form.checkIn}
                onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="att-checkout">Check-out time</Label>
              <Input
                id="att-checkout"
                type="datetime-local"
                value={form.checkOut}
                onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="att-note">Note</Label>
            <Textarea
              id="att-note"
              rows={3}
              placeholder="Optional note (e.g. early pickup, late arrival reason)…"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">Method:</span> {record.method} ·{' '}
              <span className="font-semibold text-foreground">Date:</span> {fmtDate(record.date)}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Attendance Table (shared by Today's Log and History)
// ════════════════════════════════════════════════════════════════════════════
interface AttendanceTableProps {
  rows: AttendanceRow[]
  loading: boolean
  onEdit: (r: AttendanceRow) => void
  onDelete: (r: AttendanceRow) => void
}

function AttendanceTable({ rows, loading, onEdit, onDelete }: AttendanceTableProps) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-lg border">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="m-2 h-12 w-[calc(100%-1rem)]" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No attendance records"
        description="No check-ins or check-outs match the current filters for this day."
      />
    )
  }

  return (
    <div className="max-h-[50vh] overflow-y-auto overflow-x-auto rounded-lg border scroll-thin">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead className="min-w-[180px]">Person</TableHead>
            <TableHead className="min-w-[110px]">Type</TableHead>
            <TableHead className="min-w-[100px]">Ref ID</TableHead>
            <TableHead className="min-w-[110px]">Method</TableHead>
            <TableHead className="min-w-[80px]">Check-in</TableHead>
            <TableHead className="min-w-[110px]">Check-out</TableHead>
            <TableHead className="min-w-[90px]">Status</TableHead>
            <TableHead className="w-[60px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const isStudent = r.personType === 'Student'
            const isActive = !!r.checkIn && !r.checkOut
            return (
              <TableRow key={r.id} className="hover:bg-muted/40">
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className={`text-[10px] font-bold ${avatarColor(r.personName + r.personRef)}`}>
                        {initials(r.personName || '?')}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">{r.personName || '—'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      isStudent
                        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                        : 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30'
                    }
                  >
                    {isStudent ? <GraduationCap className="mr-1 h-3 w-3" /> : <Briefcase className="mr-1 h-3 w-3" />}
                    {r.personType}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs">{r.personRef}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`gap-1 ${METHOD_BADGE[r.method] || ''}`}>
                    {r.method === 'Barcode' ? (
                      <ScanLine className="h-3 w-3" />
                    ) : r.method === 'Fingerprint' ? (
                      <Fingerprint className="h-3 w-3" />
                    ) : (
                      <Hand className="h-3 w-3" />
                    )}
                    {r.method}
                  </Badge>
                </TableCell>
                <TableCell>
                  {r.checkIn ? (
                    <span className="text-sm">{fmtTime(r.checkIn)}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.checkOut ? (
                    <span className="text-sm">{fmtTime(r.checkOut)}</span>
                  ) : isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      Active
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_BADGE[r.status]?.cls || ''}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 5v.01M12 12v.01M12 19v.01"
                          />
                        </svg>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => onEdit(r)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit record
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(r)}
                        className="text-red-600 focus:text-red-700 dark:text-red-400 dark:focus:text-red-300"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
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
  )
}

// ════════════════════════════════════════════════════════════════════════════
// History View
// ════════════════════════════════════════════════════════════════════════════
function HistoryView() {
  const [date, setDate] = useState<Date>(new Date())
  const [personType, setPersonType] = useState('')
  const [method, setMethod] = useState('')
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [summary, setSummary] = useState({ present: 0, late: 0, absent: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<AttendanceRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRow | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const dateStr = useMemo(() => toDateInput(date.toISOString()), [date])

  const queryParams = useMemo(() => {
    const p = new URLSearchParams()
    p.set('date', dateStr)
    if (personType) p.set('personType', personType)
    if (method) p.set('method', method)
    p.set('limit', '200')
    return p.toString()
  }, [dateStr, personType, method])

  // Initial + filter-change fetch. setState happens inside setTimeout + .then
  // callbacks only (lint-safe — no synchronous setState in effect body).
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      if (!alive) return
      setLoading(true)
      api<ListResponse>(`/api/attendance?${queryParams}`)
        .then((res) => {
          if (!alive) return
          setRows(res.data)
          setSummary(res.summary)
        })
        .catch((err) => {
          if (!alive) return
          const msg = err instanceof Error ? err.message : 'Failed to load history'
          toast.error(msg)
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [queryParams])

  const reload = useCallback(() => {
    api<ListResponse>(`/api/attendance?${queryParams}`)
      .then((res) => {
        setRows(res.data)
        setSummary(res.summary)
      })
      .catch(() => {
        /* non-fatal */
      })
  }, [queryParams])

  const handleEdit = (r: AttendanceRow) => {
    setEditTarget(r)
    setEditOpen(true)
  }
  const handleDelete = (r: AttendanceRow) => setDeleteTarget(r)

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await api(`/api/attendance/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success('Record deleted')
      setDeleteTarget(null)
      reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      toast.error(msg)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:gap-2 sm:p-4">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start gap-2 sm:w-[200px]">
              <CalendarDays className="h-4 w-4" />
              {fmtDate(date.toISOString())}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => {
                if (d) {
                  setDate(d)
                  setCalendarOpen(false)
                }
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Select value={personType || 'ALL'} onValueChange={(v) => setPersonType(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Person type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All persons</SelectItem>
            <SelectItem value="Student">Students</SelectItem>
            <SelectItem value="Teacher">Teachers</SelectItem>
          </SelectContent>
        </Select>

        <Select value={method || 'ALL'} onValueChange={(v) => setMethod(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All methods</SelectItem>
            {ATTENDANCE_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setPersonType('')
            setMethod('')
            setDate(new Date())
          }}
          className="gap-2 self-start sm:ml-auto sm:self-auto"
        >
          <X className="h-4 w-4" />
          Reset
        </Button>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryChip label="Present" value={summary.present} tone="emerald" icon={CheckCircle2} />
        <SummaryChip label="Late" value={summary.late} tone="amber" icon={Clock} />
        <SummaryChip label="Absent" value={summary.absent} tone="red" icon={X} />
        <SummaryChip label="Total records" value={summary.total} tone="slate" icon={ClipboardList} />
      </div>

      <AttendanceTable rows={rows} loading={loading} onEdit={handleEdit} onDelete={handleDelete} />

      <EditAttendanceDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        record={editTarget}
        onSaved={reload}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete attendance record?"
        description={
          deleteTarget
            ? `This will permanently remove the ${deleteTarget.personType.toLowerCase()} record for ${deleteTarget.personName} (${deleteTarget.personRef}) on ${fmtDate(deleteTarget.date)}.`
            : ''
        }
        confirmText="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  )
}

// ─── Summary chip ───────────────────────────────────────────────────────────
const TONE_MAP: Record<string, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  red: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
  slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30',
}

function SummaryChip({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: number
  tone: string
  icon: typeof Clock
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${TONE_MAP[tone] || TONE_MAP.slate}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-background/70">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-0.5 text-xs font-medium opacity-90">{label}</p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Main Section
// ════════════════════════════════════════════════════════════════════════════
export function AttendanceSection() {
  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today')
  const [manualOpen, setManualOpen] = useState(false)

  // Today's log state
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [summary, setSummary] = useState({ present: 0, late: 0, absent: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<AttendanceRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRow | null>(null)

  const todayQuery = useMemo(() => {
    const p = new URLSearchParams()
    p.set('date', todayStr())
    p.set('limit', '200')
    return p.toString()
  }, [])

  // Fetch today's log — initial load + auto-refresh every 15s.
  // setState happens only inside .then callbacks and the interval callback (lint-safe).
  useEffect(() => {
    let alive = true
    const tick = () => {
      api<ListResponse>(`/api/attendance?${todayQuery}`)
        .then((res) => {
          if (!alive) return
          setRows(res.data)
          setSummary(res.summary)
        })
        .catch(() => {
          /* non-fatal — keep previous data */
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }
    tick()
    const id = setInterval(tick, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [todayQuery])

  const reloadToday = useCallback(() => {
    api<ListResponse>(`/api/attendance?${todayQuery}`)
      .then((res) => {
        setRows(res.data)
        setSummary(res.summary)
      })
      .catch(() => {
        /* non-fatal */
      })
      .finally(() => setLoading(false))
  }, [todayQuery])

  // Derived "today summary strip" stats:
  //   Students present today, Teachers present today, Late arrivals, Still checked-in.
  const studentsPresent = useMemo(
    () => rows.filter((r) => r.personType === 'Student' && (r.status === 'Present' || r.status === 'Late')).length,
    [rows],
  )
  const teachersPresent = useMemo(
    () => rows.filter((r) => r.personType === 'Teacher' && (r.status === 'Present' || r.status === 'Late')).length,
    [rows],
  )
  const lateArrivals = useMemo(
    () => rows.filter((r) => r.status === 'Late').length,
    [rows],
  )
  const stillIn = useMemo(
    () => rows.filter((r) => r.checkIn && !r.checkOut).length,
    [rows],
  )

  const handleEdit = (r: AttendanceRow) => {
    setEditTarget(r)
    setEditOpen(true)
  }
  const handleDelete = (r: AttendanceRow) => setDeleteTarget(r)

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await api(`/api/attendance/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success('Record deleted')
      setDeleteTarget(null)
      reloadToday()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      toast.error(msg)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Attendance"
        description="Barcode check-in for students · Fingerprint check-in for teachers"
        icon={<Clock className="h-5 w-5" />}
      />

      {/* Live Scanner panel */}
      <ScannerPanel onScanSuccess={reloadToday} onOpenManual={() => setManualOpen(true)} />

      {/* Today summary strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Students present"
          value={studentsPresent}
          icon={GraduationCap}
          accent="blue"
          hint="Checked in today"
        />
        <StatCard
          label="Teachers present"
          value={teachersPresent}
          icon={UserCheck}
          accent="purple"
          hint="Fingerprint check-in"
        />
        <StatCard
          label="Late arrivals"
          value={lateArrivals}
          icon={Clock}
          accent="amber"
          hint="After 08:30 grace"
        />
        <StatCard
          label="Still checked-in"
          value={stillIn}
          icon={TimerReset}
          accent="green"
          hint="No checkout yet"
        />
      </div>

      {/* Tabs: Today's Log | History */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'today' | 'history')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="today" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Today&apos;s Log
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Live · auto-refreshes every 15s
              <Badge variant="outline" className="ml-2 gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {rows.length} record{rows.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <Button variant="outline" size="sm" onClick={reloadToday} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          <AttendanceTable
            rows={rows}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryView />
        </TabsContent>
      </Tabs>

      {/* Manual entry dialog */}
      <ManualEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSuccess={reloadToday}
      />

      {/* Edit dialog (today's log) */}
      <EditAttendanceDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        record={editTarget}
        onSaved={reloadToday}
      />

      {/* Delete confirm (today's log) */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete attendance record?"
        description={
          deleteTarget
            ? `This will permanently remove the ${deleteTarget.personType.toLowerCase()} record for ${deleteTarget.personName} (${deleteTarget.personRef}) on ${fmtDate(deleteTarget.date)}.`
            : ''
        }
        confirmText="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
