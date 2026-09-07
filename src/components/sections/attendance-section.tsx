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
  BookOpen,
  Printer,
  Download,
  Trophy,
  AlertTriangle,
  Star,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  AttendanceRow,
  ATTENDANCE_METHODS,
  ATTENDANCE_STATUS,
  StudentRow,
  TeacherRow,
  ClassRow,
} from '@/lib/types'
import { initials, avatarColor, fmtDate, fmtTime, fmtDateTime, timeAgo } from '@/lib/format'
import { useSchoolInfo } from '@/lib/school'
import { cn } from '@/lib/utils'

import { SectionHeader } from '@/components/shared/section-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Sparkline } from '@/components/shared/sparkline'

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
import { Checkbox } from '@/components/ui/checkbox'
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

// ─── Bulk attendance sheet helpers ───────────────────────────────────────
const SHEET_STATUSES = ['Present', 'Absent', 'Late', 'Leave'] as const
const UNSET_STATUS = '__UNSET__' // Radix Select sentinel for "not marked yet"

// ISO datetime → "HH:MM" in local time ('' when null/invalid)
function isoToHHMM(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface SheetRow {
  personType: 'Student' | 'Teacher'
  personId: string
  ref: string
  name: string
  sub: string
  status: string // '' = unmarked
  checkIn: string // 'HH:MM' or ''
  checkOut: string // 'HH:MM' or ''
  note: string
  selected: boolean
}

interface BulkResult {
  ok: boolean
  created: number
  updated: number
  failed: number
  errors: string[]
  message: string
}

// Fetch ALL active students — server caps limit at 100, so paginate.
async function fetchAllActiveStudents(programCode: string): Promise<StudentRow[]> {
  const out: StudentRow[] = []
  for (let page = 1; page <= 10; page++) {
    const q = new URLSearchParams({ status: 'Active', limit: '100', page: String(page) })
    if (programCode) q.set('program', programCode)
    const res = await api<{ data: StudentRow[]; total: number }>(`/api/students?${q.toString()}`)
    const batch = res.data || []
    out.push(...batch)
    if (batch.length < 100) break
    if (res.total && out.length >= res.total) break
  }
  return out
}

// Fetch active teachers (limit 100 = server cap).
async function fetchActiveTeachers(): Promise<TeacherRow[]> {
  const res = await api<{ data: TeacherRow[] }>('/api/teachers?status=Active&limit=100')
  return res.data || []
}

// Fetch every attendance record for one date — server caps limit at 200, paginate.
async function fetchAttendanceForDate(date: string): Promise<AttendanceRow[]> {
  const out: AttendanceRow[] = []
  for (let page = 1; page <= 5; page++) {
    const res = await api<ListResponse>(
      `/api/attendance?date=${encodeURIComponent(date)}&limit=200&page=${page}`,
    )
    const batch = res.data || []
    out.push(...batch)
    if (batch.length < 200) break
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════════
// Scanner Panel
// ════════════════════════════════════════════════════════════════════════════
interface ScannerPanelProps {
  onScanSuccess: () => void
  onOpenManual: () => void
  onOpenSheet: () => void
}

function ScannerPanel({ onScanSuccess, onOpenManual, onOpenSheet }: ScannerPanelProps) {
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
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" onClick={onOpenSheet} className="gap-2">
              <Users2 className="h-4 w-4" />
              Attendance sheet
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpenManual} className="gap-2">
              <Hand className="h-4 w-4" />
              Manual entry
            </Button>
          </div>
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
      <div className="relative flex h-full min-h-[14rem] flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed bg-gradient-to-br from-muted/40 to-muted/10 p-6 text-center">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-background text-primary shadow-sm ring-1 ring-border">
          <ScanLine className="h-7 w-7" />
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
        </div>
        <p className="relative text-sm font-semibold">Waiting for scan</p>
        <p className="relative max-w-sm text-xs text-muted-foreground">
          The result of the next check-in or check-out will appear here with a confirmation flash.
        </p>
        <div className="relative mt-1 flex items-center gap-1.5 rounded-full bg-background/60 px-2.5 py-1 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Scanner ready
        </div>
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
// Attendance Sheet Dialog — bulk manual marking with per-row check-in/out
// ════════════════════════════════════════════════════════════════════════════
interface AttendanceSheetDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}

const STATUS_TEXT: Record<string, string> = {
  Present: 'text-emerald-700 dark:text-emerald-300',
  Late: 'text-amber-700 dark:text-amber-300',
  Absent: 'text-red-700 dark:text-red-300',
  Leave: 'text-purple-700 dark:text-purple-300',
}

function AttendanceSheetDialog({ open, onOpenChange, onSuccess }: AttendanceSheetDialogProps) {
  const [date, setDate] = useState<string>(todayStr())
  const [personType, setPersonType] = useState<'Student' | 'Teacher'>('Student')
  const [classId, setClassId] = useState<string>('ALL')
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [reloadNonce, setReloadNonce] = useState(0)

  const [rows, setRows] = useState<SheetRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [defCheckIn, setDefCheckIn] = useState('08:30')
  const [defCheckOut, setDefCheckOut] = useState('16:00')

  const [saving, setSaving] = useState(false)
  const [saveErrors, setSaveErrors] = useState<string[] | null>(null)

  // Roster effect reads the latest class list without re-triggering on its load.
  const classesRef = useRef<ClassRow[]>([])
  classesRef.current = classes

  // Class list for the student class/program filter (loaded once per session).
  useEffect(() => {
    if (!open || classes.length > 0) return
    let alive = true
    api<{ data: ClassRow[] }>('/api/classes?active=true&limit=200')
      .then((res) => {
        if (alive) setClasses(res.data || [])
      })
      .catch(() => {
        /* non-fatal — filter just shows "All students" */
      })
    return () => {
      alive = false
    }
  }, [open, classes.length])

  // Load the roster + existing attendance whenever the dialog opens or the
  // controls change. setState happens inside setTimeout + .then callbacks only
  // (lint-safe — no synchronous setState in the effect body).
  useEffect(() => {
    if (!open) return
    let alive = true
    const t = setTimeout(() => {
      if (!alive) return
      setLoading(true)
      setLoadError(null)
      setSaveErrors(null)
      const type = personType
      const cls = classesRef.current.find((c) => c.id === classId)
      const programCode = type === 'Student' && cls?.program?.code ? cls.program.code : ''
      Promise.all([
        type === 'Student' ? fetchAllActiveStudents(programCode) : fetchActiveTeachers(),
        fetchAttendanceForDate(date),
      ])
        .then(([people, attendance]) => {
          if (!alive) return
          const byKey = new Map<string, AttendanceRow>()
          for (const a of attendance) byKey.set(`${a.personType}:${a.personId}`, a)
          const sheet: SheetRow[] = people.map((p) => {
            const isStudent = type === 'Student'
            const rec = byKey.get(`${type}:${p.id}`)
            const validStatus =
              rec && SHEET_STATUSES.includes(rec.status as (typeof SHEET_STATUSES)[number])
                ? rec.status
                : ''
            return {
              personType: type,
              personId: p.id,
              ref: isStudent ? (p as StudentRow).studentId : (p as TeacherRow).teacherId,
              name: p.fullName,
              sub: isStudent
                ? [(p as StudentRow).gender, (p as StudentRow).ageGroup ? `${(p as StudentRow).ageGroup} yrs` : '']
                    .filter(Boolean)
                    .join(' · ')
                : (p as TeacherRow).type || '',
              status: validStatus,
              checkIn: isoToHHMM(rec?.checkIn),
              checkOut: isoToHHMM(rec?.checkOut),
              note: rec?.note || '',
              selected: true,
            }
          })
          setRows(sheet)
        })
        .catch((err) => {
          if (!alive) return
          setRows([])
          setLoadError(err instanceof Error ? err.message : 'Failed to load roster')
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [open, date, personType, classId, reloadNonce])

  // ── Row mutation helpers ──
  const updateRow = (personId: string, patch: Partial<SheetRow>) =>
    setRows((rs) => rs.map((r) => (r.personId === personId ? { ...r, ...patch } : r)))

  // Status change semantics: Absent/Leave drop their times; Present/Late pick
  // up the defaults when no time is set yet.
  const withStatus = (r: SheetRow, status: string): SheetRow => {
    if (status === 'Absent' || status === 'Leave') {
      return { ...r, status, checkIn: '', checkOut: '' }
    }
    return {
      ...r,
      status,
      checkIn: r.checkIn || defCheckIn,
      checkOut: r.checkOut || defCheckOut,
    }
  }

  const handleStatusChange = (personId: string, status: string) =>
    setRows((rs) => rs.map((r) => (r.personId === personId ? withStatus(r, status) : r)))

  const markSelectedPresent = () =>
    setRows((rs) => rs.map((r) => (r.selected ? withStatus(r, 'Present') : r)))

  const clearSelectedTimes = () =>
    setRows((rs) => rs.map((r) => (r.selected ? { ...r, checkIn: '', checkOut: '' } : r)))

  const applyDefaultTimes = () => {
    if (!defCheckIn && !defCheckOut) {
      toast.error('Set a default check-in or check-out time first')
      return
    }
    setRows((rs) =>
      rs.map((r) =>
        r.selected && r.status !== 'Absent' && r.status !== 'Leave'
          ? { ...r, checkIn: defCheckIn || r.checkIn, checkOut: defCheckOut || r.checkOut }
          : r,
      ),
    )
    toast.success('Default times applied to selected rows')
  }

  const toggleAll = (checked: boolean | 'indeterminate') =>
    setRows((rs) => rs.map((r) => ({ ...r, selected: checked === true })))

  // ── Derived counts + payload ──
  const counts = useMemo(() => {
    let selected = 0
    let present = 0
    let late = 0
    let absent = 0
    let leave = 0
    for (const r of rows) {
      if (r.selected) selected++
      if (r.status === 'Present') present++
      else if (r.status === 'Late') late++
      else if (r.status === 'Absent') absent++
      else if (r.status === 'Leave') leave++
    }
    return { selected, present, late, absent, leave }
  }, [rows])

  const allSelected = rows.length > 0 && rows.every((r) => r.selected)
  const someSelected = rows.some((r) => r.selected) && !allSelected

  const entriesToSend = useMemo(
    () =>
      rows
        .filter((r) => r.status || r.checkIn || r.checkOut)
        .map((r) => ({
          personType: r.personType,
          personId: r.personId,
          status: r.status || 'Present',
          checkIn: r.checkIn || null,
          checkOut: r.checkOut || null,
          note: r.note.trim() || null,
        })),
    [rows],
  )

  const handleSave = async () => {
    if (entriesToSend.length === 0) {
      toast.error('Nothing to save — mark at least one person or set a time')
      return
    }
    setSaving(true)
    setSaveErrors(null)
    try {
      // API accepts max 500 entries per request → chunk when needed.
      const chunks: Array<typeof entriesToSend> = []
      for (let i = 0; i < entriesToSend.length; i += 500) {
        chunks.push(entriesToSend.slice(i, i + 500))
      }
      let created = 0
      let updated = 0
      let failed = 0
      const errs: string[] = []
      let message = ''
      for (const chunk of chunks) {
        const res = await api<BulkResult>('/api/attendance/bulk', {
          method: 'POST',
          body: JSON.stringify({ date, entries: chunk }),
        })
        created += res.created || 0
        updated += res.updated || 0
        failed += res.failed || 0
        if (res.errors?.length) errs.push(...res.errors)
        message = res.message
      }
      const saved = created + updated
      onSuccess()
      if (failed > 0) {
        setSaveErrors(errs.slice(0, 20))
        toast.warning(`Saved ${saved} record${saved === 1 ? '' : 's'}, ${failed} failed`, {
          description: 'See the failed rows listed in the dialog.',
        })
      } else {
        toast.success(message || `Saved ${saved} attendance record${saved === 1 ? '' : 's'}`)
        onOpenChange(false)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bulk save failed'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto scroll-thin sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-primary" />
            Attendance sheet — mark multiple
          </DialogTitle>
          <DialogDescription>
            The whole roster at once, no searching — set status, check-in and check-out per row.
            Existing records for the day are prefilled and updated on save.
          </DialogDescription>
        </DialogHeader>

        {/* Top controls: date · person type · class filter */}
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sheet-date" className="text-xs">
                Date
              </Label>
              <Input
                id="sheet-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value || todayStr())}
                className="h-8 w-[150px]"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">People</Label>
              <Tabs
                value={personType}
                onValueChange={(v) => setPersonType(v as 'Student' | 'Teacher')}
              >
                <TabsList className="grid h-8 w-[210px] grid-cols-2">
                  <TabsTrigger value="Student" className="gap-1.5 text-xs">
                    <GraduationCap className="h-3.5 w-3.5" />
                    Students
                  </TabsTrigger>
                  <TabsTrigger value="Teacher" className="gap-1.5 text-xs">
                    <Briefcase className="h-3.5 w-3.5" />
                    Teachers
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {personType === 'Student' && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Class / Program</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger className="h-8 w-[220px]">
                    <SelectValue placeholder="All students" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All students</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.program ? ` · ${c.program.name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Default times row */}
          <div className="flex flex-wrap items-end gap-3 border-t pt-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sheet-def-in" className="text-xs">
                Default check-in
              </Label>
              <Input
                id="sheet-def-in"
                type="time"
                value={defCheckIn}
                onChange={(e) => setDefCheckIn(e.target.value)}
                className="h-8 w-[120px]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sheet-def-out" className="text-xs">
                Default check-out
              </Label>
              <Input
                id="sheet-def-out"
                type="time"
                value={defCheckOut}
                onChange={(e) => setDefCheckOut(e.target.value)}
                className="h-8 w-[120px]"
              />
            </div>
            <Button variant="outline" size="sm" onClick={applyDefaultTimes} className="h-8 gap-2">
              <TimerReset className="h-4 w-4" />
              Apply to all rows
            </Button>
            <p className="self-center text-xs text-muted-foreground">
              Stamps checked rows that are still missing times
            </p>
          </div>
        </div>

        {/* Bulk actions + live counts */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={markSelectedPresent}
            disabled={loading || rows.length === 0}
            className="gap-2 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark all Present
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearSelectedTimes}
            disabled={loading || rows.length === 0}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Clear times
          </Button>

          <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline" className="gap-1">
              <Users2 className="h-3 w-3" />
              {counts.selected}/{rows.length} selected
            </Badge>
            {counts.present > 0 && (
              <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                {counts.present} Present
              </Badge>
            )}
            {counts.late > 0 && (
              <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                {counts.late} Late
              </Badge>
            )}
            {counts.absent > 0 && (
              <Badge className="border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300">
                {counts.absent} Absent
              </Badge>
            )}
            {counts.leave > 0 && (
              <Badge className="border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300">
                {counts.leave} Leave
              </Badge>
            )}
          </div>
        </div>

        {/* Roster table — everyone at once, no searching */}
        <div className="max-h-[65vh] overflow-y-auto overflow-x-auto rounded-lg border scroll-thin">
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400">
                <AlertCircle className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">Couldn&apos;t load the roster</p>
              <p className="max-w-sm text-xs text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => setReloadNonce((n) => n + 1)} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="No people found"
              description={
                personType === 'Student'
                  ? 'No active students match the current class/program filter.'
                  : 'No active teachers found.'
              }
              className="border-0 bg-transparent py-8"
            />
          ) : (
            <Table className="table-zebra">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all rows"
                    />
                  </TableHead>
                  <TableHead className="min-w-[210px]">Person</TableHead>
                  <TableHead className="w-[124px]">Status</TableHead>
                  <TableHead className="w-[112px]">Check-in</TableHead>
                  <TableHead className="w-[112px]">Check-out</TableHead>
                  <TableHead className="min-w-[150px]">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const timeDisabled = r.status === 'Absent' || r.status === 'Leave'
                  return (
                    <TableRow key={r.personId} className={timeDisabled ? 'opacity-70' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={r.selected}
                          onCheckedChange={(v) => updateRow(r.personId, { selected: v === true })}
                          aria-label={`Select ${r.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback
                              className={`text-[10px] font-bold ${avatarColor(r.name + r.ref)}`}
                            >
                              {initials(r.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium leading-tight">{r.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              <span className="font-mono">{r.ref}</span>
                              {r.sub ? ` · ${r.sub}` : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={r.status || UNSET_STATUS}
                          onValueChange={(v) =>
                            handleStatusChange(r.personId, v === UNSET_STATUS ? '' : v)
                          }
                        >
                          <SelectTrigger
                            className={`h-8 w-[112px] text-xs ${STATUS_TEXT[r.status] || 'text-muted-foreground'}`}
                          >
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNSET_STATUS} className="text-muted-foreground">
                              — Unmarked
                            </SelectItem>
                            {SHEET_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="time"
                          value={r.checkIn}
                          disabled={timeDisabled}
                          onChange={(e) => updateRow(r.personId, { checkIn: e.target.value })}
                          className="h-8 text-xs"
                          aria-label={`Check-in time for ${r.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="time"
                          value={r.checkOut}
                          disabled={timeDisabled}
                          onChange={(e) => updateRow(r.personId, { checkOut: e.target.value })}
                          className="h-8 text-xs"
                          aria-label={`Check-out time for ${r.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.note}
                          onChange={(e) => updateRow(r.personId, { note: e.target.value })}
                          placeholder="Optional…"
                          className="h-8 text-xs"
                          aria-label={`Note for ${r.name}`}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Row-level errors from the last save */}
        {saveErrors && saveErrors.length > 0 && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4" />
              {saveErrors.length} row{saveErrors.length === 1 ? '' : 's'} failed to save
            </p>
            <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-xs text-red-600 dark:text-red-400 scroll-thin">
              {saveErrors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:items-center">
          <p className="mr-auto text-xs text-muted-foreground">
            Saving {entriesToSend.length} record{entriesToSend.length === 1 ? '' : 's'} as{' '}
            <Badge variant="outline" className="ml-0.5 font-mono text-[10px]">
              Manual
            </Badge>
            {entriesToSend.length > 500 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                · sent in batches of 500
              </span>
            )}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || entriesToSend.length === 0}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save attendance
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
      <Table className="table-zebra">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead className="min-w-[180px]">Person</TableHead>
            <TableHead className="min-w-[110px]">Type</TableHead>
            <TableHead className="min-w-[100px]">Ref ID</TableHead>
            <TableHead className="min-w-[110px]">Method</TableHead>
            <TableHead className="min-w-[80px]">Check-in</TableHead>
            <TableHead className="min-w-[110px]">Check-out</TableHead>
            <TableHead className="min-w-[90px]">Status</TableHead>
            <TableHead className="min-w-[90px]">Updated</TableHead>
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
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(r.checkOut || r.checkIn || r.date)}
                  </span>
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
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'register'>('today')
  const [manualOpen, setManualOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Today's log state
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [summary, setSummary] = useState({ present: 0, late: 0, absent: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<AttendanceRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRow | null>(null)
  const [trend, setTrend] = useState<{ students: number[]; teachers: number[]; late: number[] }>({
    students: [], teachers: [], late: [],
  })

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

  // Fetch 7-day trend once for sparklines
  useEffect(() => {
    let alive = true
    api<{ trend: { students: number; teachers: number; late: number }[] }>(`/api/attendance/trend`)
      .then((res) => {
        if (!alive) return
        setTrend({
          students: res.trend.map((d) => d.students),
          teachers: res.trend.map((d) => d.teachers),
          late: res.trend.map((d) => d.late),
        })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

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
      <ScannerPanel
        onScanSuccess={reloadToday}
        onOpenManual={() => setManualOpen(true)}
        onOpenSheet={() => setSheetOpen(true)}
      />

      {/* Today summary strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Students present"
          value={studentsPresent}
          icon={GraduationCap}
          accent="blue"
          hint="Checked in today"
          footer={
            trend.students.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <Sparkline values={trend.students} color="#1e40af" width={64} height={20} />
                <span className="text-[10px] text-muted-foreground">7d</span>
              </div>
            ) : undefined
          }
        />
        <StatCard
          label="Teachers present"
          value={teachersPresent}
          icon={UserCheck}
          accent="purple"
          hint="Fingerprint check-in"
          footer={
            trend.teachers.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <Sparkline values={trend.teachers} color="#7c3aed" width={64} height={20} />
                <span className="text-[10px] text-muted-foreground">7d</span>
              </div>
            ) : undefined
          }
        />
        <StatCard
          label="Late arrivals"
          value={lateArrivals}
          icon={Clock}
          accent="amber"
          hint="After 08:30 grace"
          footer={
            trend.late.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <Sparkline values={trend.late} color="#d97706" width={64} height={20} />
                <span className="text-[10px] text-muted-foreground">7d</span>
              </div>
            ) : undefined
          }
        />
        <StatCard
          label="Still checked-in"
          value={stillIn}
          icon={TimerReset}
          accent="green"
          hint="No checkout yet"
        />
      </div>

      {/* Tabs: Today's Log | History | Register */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'today' | 'history' | 'register')}>
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="today" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Today&apos;s Log
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="register" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Register
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

        <TabsContent value="register" className="mt-4">
          <RegisterView />
        </TabsContent>
      </Tabs>

      {/* Manual entry dialog */}
      <ManualEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSuccess={reloadToday}
      />

      {/* Attendance sheet (bulk) dialog */}
      <AttendanceSheetDialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
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

// ─── Class attendance register (monthly grid, printable) ───────────────────
interface RegisterDay {
  day: number
  dow: string
  isWeekend: boolean
  isFuture: boolean
}
interface RegisterStudent {
  id: string
  studentId: string
  fullName: string
  cells: (string | null)[]
  present: number
  late: number
  absent: number
  leave: number
  rate: number | null
}
interface RegisterSummary {
  rate: number | null
  present: number
  late: number
  absent: number
  leave: number
  marked: number
  daysWithRecords: number
  bestDay: { day: number; present: number; rate: number } | null
  worstDay: { day: number; present: number; rate: number } | null
  perfect: number
  atRiskCount: number
  atRisk: { studentId: string; fullName: string; rate: number }[]
}
interface RegisterResponse {
  class: {
    id: string
    name: string
    teacher: string | null
    program: string | null
    programColor: string | null
    schedule: string
    room: string | null
  }
  month: string
  monthLabel: string
  days: RegisterDay[]
  students: RegisterStudent[]
  dayTotals: { day: number; present: number; late: number; absent: number; marked: number }[]
  summary?: RegisterSummary
  totalStudents: number
}

const REGISTER_MONTHS = 6

function registerMonthOptions(n = REGISTER_MONTHS): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function registerMonthLabel(m: string): string {
  const [y, mm] = m.split('-').map((x) => parseInt(x, 10))
  return new Date(y, mm - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function registerCellDisplay(status: string | null, day: RegisterDay): { text: string; cls: string } {
  if (status === 'Present') return { text: 'P', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
  if (status === 'Late') return { text: 'L', cls: 'bg-amber-500/20 text-amber-700 dark:text-amber-300' }
  if (status === 'Absent') return { text: 'A', cls: 'bg-red-500/15 text-red-700 dark:text-red-300' }
  if (status === 'Leave') return { text: 'V', cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' }
  if (day.isFuture) return { text: '', cls: 'bg-muted/20' }
  return { text: '·', cls: 'text-muted-foreground/40' }
}

function RegisterView() {
  const school = useSchoolInfo()
  const monthOptions = useMemo(() => registerMonthOptions(), [])
  const [classId, setClassId] = useState('')
  const [month, setMonth] = useState(monthOptions[0])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [classesLoaded, setClassesLoaded] = useState(false)
  const [data, setData] = useState<RegisterResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [refetchTick, setRefetchTick] = useState(0)

  useEffect(() => {
    let alive = true
    if (classesLoaded) return
    api<{ data: ClassRow[] }>('/api/classes?active=true&limit=200')
      .then((res) => {
        if (!alive) return
        setClasses(res.data || [])
        setClassesLoaded(true)
      })
      .catch(() => {
        if (alive) setClassesLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [classesLoaded])

  useEffect(() => {
    if (!classId) return
    let alive = true
    const run = () => {
      if (!alive) return
      setLoading(true)
      setError(false)
      api<RegisterResponse>(`/api/attendance/register?classId=${classId}&month=${month}`)
        .then((d) => {
          if (alive) setData(d)
        })
        .catch(() => {
          if (alive) {
            setData(null)
            setError(true)
          }
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }
    const t = setTimeout(run, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [classId, month, refetchTick])

  const selectedClass = classes.find((c) => c.id === classId)

  const exportCsv = useCallback(() => {
    if (!data) return
    const rows: (string | number)[][] = [
      [`Class Attendance Register — ${data.class.name} — ${data.monthLabel}`],
      [`Teacher: ${data.class.teacher ?? '—'} · Program: ${data.class.program ?? '—'} · Schedule: ${data.class.schedule || '—'}`],
      [],
      ['Student ID', 'Name', ...data.days.map((d) => `${d.day} ${d.dow}`), 'Present', 'Late', 'Absent', 'Leave', 'Rate %'],
      ...data.students.map((s) => [
        s.studentId,
        s.fullName,
        ...s.cells.map((c) => c ?? ''),
        s.present,
        s.late,
        s.absent,
        s.leave,
        s.rate ?? '',
      ]),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `register-${data.class.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${month}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported register for ${data.students.length} students`)
  }, [data, month])

  const handlePrint = useCallback(() => {
    // Landscape gives the 31-day grid room to breathe on paper
    const style = document.createElement('style')
    style.id = 'register-print-page'
    style.textContent = '@page { size: A4 landscape; margin: 8mm; }'
    document.head.appendChild(style)
    window.print()
    window.addEventListener(
      'afterprint',
      () => document.getElementById('register-print-page')?.remove(),
      { once: true },
    )
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Class</Label>
              <Select value={classId} onValueChange={(v) => {
                setClassId(v)
                setData(null)
                setError(false)
              }}>
                <SelectTrigger className="w-[230px]">
                  <SelectValue placeholder="Select a class…" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {registerMonthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data} className="gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!data} className="gap-2">
              <Printer className="h-4 w-4" /> Print register
            </Button>
          </div>
        </CardContent>
      </Card>

      {!classId ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={BookOpen}
              title="Select a class"
              description="Choose a class above to view its monthly attendance register — every enrolled student across each day of the month."
              className="border-dashed"
            />
          </CardContent>
        </Card>
      ) : loading && !data ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : error || !data ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={AlertCircle}
              title="Failed to load register"
              description="Something went wrong. Try again."
              action={
                <Button size="sm" onClick={() => setRefetchTick((n) => n + 1)}>
                  Retry
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : data.students.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Users2}
              title="No students enrolled"
              description={`${data.class.name} has no active students for ${data.monthLabel}. Enroll students in the Classes section first.`}
              className="border-dashed"
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="register-print min-w-0">
            {/* Sheet header (prints too) */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
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
                  Attendance Register
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.class.name} · {data.monthLabel}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {[data.class.program, data.class.teacher, data.class.schedule, data.class.room]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>

            {/* Class insights summary (prints too) */}
            {data.summary && data.summary.marked > 0 && (
              <div className="grid grid-cols-2 gap-2 border-b bg-gradient-to-r from-muted/40 to-transparent p-3 sm:grid-cols-4 lg:grid-cols-[auto_1fr_1fr_1fr]">
                {/* Overall rate */}
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-extrabold tabular-nums',
                      data.summary.rate === null
                        ? 'border-border text-muted-foreground'
                        : data.summary.rate >= 90
                          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : data.summary.rate >= 75
                            ? 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400',
                    )}
                  >
                    {data.summary.rate === null ? '—' : `${data.summary.rate}%`}
                  </div>
                  <div className="leading-tight">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Class rate
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {data.summary.daysWithRecords} day{data.summary.daysWithRecords === 1 ? '' : 's'} with records
                    </p>
                  </div>
                </div>
                {/* P/L/A/V totals */}
                <div className="flex items-center justify-center gap-1.5">
                  {(
                    [
                      ['P', data.summary.present, 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'],
                      ['L', data.summary.late, 'bg-amber-500/20 text-amber-700 dark:text-amber-300'],
                      ['A', data.summary.absent, 'bg-red-500/15 text-red-700 dark:text-red-300'],
                      ['V', data.summary.leave, 'bg-teal-500/15 text-teal-700 dark:text-teal-300'],
                    ] as const
                  ).map(([label, count, cls]) => (
                    <span
                      key={label}
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold tabular-nums ${cls}`}
                      title={`${label} — ${count} marked cell${count === 1 ? '' : 's'} this month`}
                    >
                      {label}
                      <span className="font-bold">{count}</span>
                    </span>
                  ))}
                </div>
                {/* Best day */}
                {data.summary.bestDay && (
                  <div className="flex items-center justify-center gap-1.5 text-[11px]">
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-muted-foreground">
                      Best day{' '}
                      <span className="font-semibold text-foreground tabular-nums">
                        {data.summary.bestDay.day} {data.monthLabel.split(' ')[0]}
                      </span>{' '}
                      <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {data.summary.bestDay.rate}%
                      </span>
                    </span>
                  </div>
                )}
                {/* Perfect + at-risk */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
                  {data.summary.perfect > 0 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-1 font-semibold text-primary"
                      title="Students present/late on every marked day"
                    >
                      <Star className="h-3 w-3" /> {data.summary.perfect} perfect
                    </span>
                  )}
                  {data.summary.atRiskCount > 0 && (
                    <span
                      className="inline-flex cursor-help items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-1 font-semibold text-red-600 dark:text-red-400"
                      title={`Below 75%: ${data.summary.atRisk.map((s) => `${s.fullName} (${s.rate}%)`).join(', ')}`}
                    >
                      <AlertTriangle className="h-3 w-3" /> {data.summary.atRiskCount} at risk
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="scroll-thin max-h-[62vh] overflow-auto p-0">
              <Table className="table-zebra min-w-[900px]">
                <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                  <TableRow>
                    <TableHead className="sticky left-0 z-20 bg-muted/95 min-w-[150px]">
                      Student
                    </TableHead>
                    {data.days.map((d) => (
                      <TableHead
                        key={d.day}
                        className={`px-0 text-center text-[10px] ${d.isWeekend ? 'text-muted-foreground/50' : ''}`}
                        title={`${d.day} ${data.monthLabel} (${d.dow})`}
                      >
                        {d.day}
                      </TableHead>
                    ))}
                    <TableHead className="text-center text-[10px]">P</TableHead>
                    <TableHead className="text-center text-[10px]">L</TableHead>
                    <TableHead className="text-center text-[10px]">A</TableHead>
                    <TableHead className="text-center text-[10px]">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.students.map((s) => {
                    const rateCls =
                      s.rate === null
                        ? 'text-muted-foreground'
                        : s.rate >= 90
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : s.rate >= 75
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-red-600 dark:text-red-400'
                    const isAtRisk = s.rate !== null && s.rate < 75
                    return (
                      <TableRow
                        key={s.id}
                        className={cn('animate-row-in', isAtRisk && 'bg-red-500/[0.04] hover:bg-red-500/10')}
                      >
                        <TableCell className="sticky left-0 z-10 bg-card/95" title={isAtRisk ? `At risk — attendance ${s.rate}% (below 75%)` : undefined}>
                          <p className="flex items-center gap-1 truncate text-xs font-medium">
                            {s.fullName}
                            {isAtRisk && <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">{s.studentId}</p>
                        </TableCell>
                      {s.cells.map((c, i) => {
                        const disp = registerCellDisplay(c, data.days[i])
                        return (
                          <TableCell key={i} className="px-0 text-center">
                            <span
                              className={`reg-cell inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold ${disp.cls}`}
                            >
                              {disp.text}
                            </span>
                          </TableCell>
                        )
                      })}
                      <TableCell className="text-center text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                        {s.present}
                      </TableCell>
                      <TableCell className="text-center text-xs font-medium tabular-nums text-amber-600 dark:text-amber-400">
                        {s.late}
                      </TableCell>
                      <TableCell className="text-center text-xs font-medium tabular-nums text-red-600 dark:text-red-400">
                        {s.absent}
                      </TableCell>
                      <TableCell className="text-center text-xs font-semibold tabular-nums">
                        <span className={rateCls}>{s.rate === null ? '—' : `${s.rate}%`}</span>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
                <tfoot>
                  <TableRow className="border-t-2 bg-muted/50 font-semibold">
                    <TableCell className="sticky left-0 z-10 bg-muted/95 text-xs">
                      Present that day
                    </TableCell>
                    {data.dayTotals.map((t) => (
                      <TableCell key={t.day} className="px-0 text-center text-[10px] tabular-nums">
                        {t.marked > 0 ? t.present : ''}
                      </TableCell>
                    ))}
                    <TableCell colSpan={4} />
                  </TableRow>
                </tfoot>
              </Table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="reg-cell inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500/15 text-[9px] font-bold text-emerald-700">P</span>
                Present
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="reg-cell inline-flex h-4 w-4 items-center justify-center rounded bg-amber-500/20 text-[9px] font-bold text-amber-700">L</span>
                Late
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="reg-cell inline-flex h-4 w-4 items-center justify-center rounded bg-red-500/15 text-[9px] font-bold text-red-700">A</span>
                Absent
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="reg-cell inline-flex h-4 w-4 items-center justify-center rounded bg-teal-500/15 text-[9px] font-bold text-teal-700">V</span>
                Leave
              </span>
              <span>· unmarked / not yet due</span>
              {data.summary && data.summary.atRiskCount > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" /> {data.summary.atRiskCount} below 75%
                </span>
              )}
              <span className="ml-auto">
                {data.totalStudents} student{data.totalStudents === 1 ? '' : 's'} ·{' '}
                {data.students.filter((s) => s.rate !== null).length} with records
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
