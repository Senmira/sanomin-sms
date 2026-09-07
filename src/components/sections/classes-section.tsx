'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  Users,
  GraduationCap,
  Clock,
  MapPin,
  Filter,
  MoreVertical,
  BookOpen,
  Layers,
  CheckCircle2,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  X,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  ClassRow,
  TeacherRow,
  ProgramRow,
  DAYS,
} from '@/lib/types'
import { currency, fmtTime } from '@/lib/format'

import { SectionHeader } from '@/components/shared/section-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// ─── List response shapes ──────────────────────────────────────────────────
interface ClassListResponse {
  data: ClassRow[]
  total: number
}
interface ProgramListResponse {
  data: ProgramRow[]
}
interface TeacherListResponse {
  data: TeacherRow[]
  total: number
}

// Time slots for timetable grid (hourly)
const TIME_SLOTS = Array.from({ length: 11 }, (_, i) => 8 + i) // 8..18

// ─── Form state ─────────────────────────────────────────────────────────────
interface FormState {
  name: string
  programId: string
  teacherId: string
  dayOfWeek: string
  startTime: string
  endTime: string
  room: string
  capacity: string
  fee: string
  active: boolean
  notes: string
}

const EMPTY_FORM: FormState = {
  name: '',
  programId: '',
  teacherId: '',
  dayOfWeek: 'Mon',
  startTime: '09:00',
  endTime: '10:00',
  room: '',
  capacity: '20',
  fee: '0',
  active: true,
  notes: '',
}

// ─── Main section ───────────────────────────────────────────────────────────
export function ClassesSection() {
  const [rows, setRows] = useState<ClassRow[]>([])
  const [programs, setPrograms] = useState<ProgramRow[]>([])
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [dayFilter, setDayFilter] = useState<string>('all')
  const [programFilter, setProgramFilter] = useState<string>('all')
  const [teacherFilter, setTeacherFilter] = useState<string>('all')
  const [activeFilter, setActiveFilter] = useState<'all' | 'true' | 'false'>('all')

  // View toggle
  const [view, setView] = useState<'timetable' | 'list'>('timetable')

  // Dialog state
  const [addEditOpen, setAddEditOpen] = useState(false)
  const [editing, setEditing] = useState<ClassRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ClassRow | null>(null)

  // ─── Initial load: programs + teachers (caches for selects) ──────────────
  useEffect(() => {
    let alive = true
    Promise.all([
      api<ProgramListResponse>('/api/programs'),
      api<TeacherListResponse>('/api/teachers?limit=100'),
    ])
      .then(([p, t]) => {
        if (!alive) return
        setPrograms(p.data)
        setTeachers(t.data)
      })
      .catch(() => {
        // Non-fatal — selects will just be empty
      })
    return () => {
      alive = false
    }
  }, [])

  // ─── Build query string ──────────────────────────────────────────────────
  const queryParams = useMemo(() => {
    const p = new URLSearchParams()
    p.set('limit', '200')
    if (dayFilter !== 'all') p.set('day', dayFilter)
    if (programFilter !== 'all') p.set('program', programFilter)
    if (teacherFilter !== 'all') p.set('teacherId', teacherFilter)
    if (activeFilter !== 'all') p.set('active', activeFilter)
    return p.toString()
  }, [dayFilter, programFilter, teacherFilter, activeFilter])

  // ─── Fetch classes (with filters) ────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoading(true)
    api<ClassListResponse>(`/api/classes?${queryParams}`)
      .then((res) => {
        if (!alive) return
        setRows(res.data)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!alive) return
        const msg = err instanceof Error ? err.message : 'Failed to load classes'
        setError(msg)
        setLoading(false)
        toast.error(msg)
      })
    return () => {
      alive = false
    }
  }, [queryParams])

  const reload = useCallback(() => {
    api<ClassListResponse>(`/api/classes?${queryParams}`)
      .then((res) => {
        setRows(res.data)
        setError(null)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load classes'
        toast.error(msg)
      })
  }, [queryParams])

  // ─── Stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let active = 0
    let externalTeacherClasses = 0
    let totalEnrolled = 0
    for (const c of rows) {
      if (c.active) active++
      if (c.teacher?.type === 'External') externalTeacherClasses++
      totalEnrolled += c._count?.enrollments ?? 0
    }
    return {
      total: rows.length,
      active,
      externalTeacherClasses,
      totalEnrolled,
    }
  }, [rows])

  const hasFilters =
    dayFilter !== 'all' ||
    programFilter !== 'all' ||
    teacherFilter !== 'all' ||
    activeFilter !== 'all'

  const clearFilters = useCallback(() => {
    setDayFilter('all')
    setProgramFilter('all')
    setTeacherFilter('all')
    setActiveFilter('all')
  }, [])

  // ─── Dialog handlers ─────────────────────────────────────────────────────
  const openAdd = useCallback(() => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setAddEditOpen(true)
  }, [])

  const openEdit = useCallback((c: ClassRow) => {
    setEditing(c)
    setForm({
      name: c.name,
      programId: c.program?.id || '',
      teacherId: c.teacher?.id || '',
      dayOfWeek: c.dayOfWeek || 'Mon',
      startTime: c.startTime || '09:00',
      endTime: c.endTime || '10:00',
      room: c.room || '',
      capacity: String(c.capacity ?? 20),
      fee: String(c.fee ?? 0),
      active: c.active,
      notes: c.notes || '',
    })
    setAddEditOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setAddEditOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }, [])

  // ─── Save (create/update) ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error('Class name is required')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      programId: form.programId || null,
      teacherId: form.teacherId || null,
      dayOfWeek: form.dayOfWeek,
      startTime: form.startTime,
      endTime: form.endTime,
      room: form.room.trim() || null,
      capacity: Number(form.capacity) || 0,
      fee: Number(form.fee) || 0,
      active: form.active,
      notes: form.notes.trim() || null,
    }
    try {
      if (editing) {
        const updated = await api<ClassRow>(`/api/classes/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        setRows((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
        toast.success(`${updated.name} updated`)
      } else {
        const created = await api<ClassRow>('/api/classes', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setRows((prev) => [...prev, created])
        toast.success(`${created.name} created`)
      }
      closeDialog()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }, [form, editing, closeDialog])

  // ─── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await api(`/api/classes/${deleteTarget.id}`, { method: 'DELETE' })
      setRows((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      toast.success(`${deleteTarget.name} deleted`)
      setDeleteTarget(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      toast.error(msg)
    }
  }, [deleteTarget])

  // ─── Filter bar ──────────────────────────────────────────────────────────
  const FilterBar = (
    <Card className="flex flex-wrap items-end gap-3 p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Filter className="h-4 w-4" />
        Filters
      </div>

      <div className="grid gap-1">
        <Label htmlFor="filter-day" className="text-xs">
          Day
        </Label>
        <Select value={dayFilter} onValueChange={setDayFilter}>
          <SelectTrigger id="filter-day" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All days</SelectItem>
            {DAYS.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1">
        <Label htmlFor="filter-program" className="text-xs">
          Program
        </Label>
        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger id="filter-program" className="w-40">
            <SelectValue />
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

      <div className="grid gap-1">
        <Label htmlFor="filter-teacher" className="text-xs">
          Teacher
        </Label>
        <Select value={teacherFilter} onValueChange={setTeacherFilter}>
          <SelectTrigger id="filter-teacher" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teachers</SelectItem>
            {teachers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.fullName} · {t.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1">
        <Label htmlFor="filter-active" className="text-xs">
          Status
        </Label>
        <Select
          value={activeFilter}
          onValueChange={(v) => setActiveFilter(v as 'all' | 'true' | 'false')}
        >
          <SelectTrigger id="filter-active" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5">
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </Card>
  )

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Classes"
        description="Tuition class schedule for external & internal teachers"
        icon={<CalendarDays className="h-5 w-5" />}
        actions={
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Class
          </Button>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Classes"
          value={stats.total}
          icon={Layers}
          accent="blue"
          hint="All scheduled classes"
        />
        <StatCard
          label="Active Classes"
          value={stats.active}
          icon={CheckCircle2}
          accent="green"
          hint={`${stats.total - stats.active} inactive`}
        />
        <StatCard
          label="External-Teacher Classes"
          value={stats.externalTeacherClasses}
          icon={GraduationCap}
          accent="purple"
          hint="Tuition classes run by external teachers"
        />
        <StatCard
          label="Total Enrolled"
          value={stats.totalEnrolled}
          icon={Users}
          accent="amber"
          hint="Students across all classes"
        />
      </div>

      {/* Filter bar */}
      {FilterBar}

      {/* View toggle */}
      <Tabs value={view} onValueChange={(v) => setView(v as 'timetable' | 'list')}>
        <div className="flex w-full items-center justify-between">
          <TabsList>
            <TabsTrigger value="timetable" className="gap-1.5">
              <LayoutGrid className="h-4 w-4" />
              Timetable
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5">
              <ListIcon className="h-4 w-4" />
              List
            </TabsTrigger>
          </TabsList>
          <span className="text-xs text-muted-foreground">
            {rows.length} class{rows.length === 1 ? '' : 'es'}
          </span>
        </div>

        <TabsContent value="timetable" className="mt-4">
          {loading ? (
            <Skeleton className="h-[60vh] w-full rounded-xl" />
          ) : error ? (
            <EmptyState
              title="Failed to load classes"
              description={error}
              icon={Layers}
              action={
                <Button onClick={reload} size="sm" variant="outline">
                  Retry
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No classes scheduled"
              description="Add your first tuition class to start building the weekly timetable."
              icon={BookOpen}
              action={
                <Button onClick={openAdd} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add Class
                </Button>
              }
            />
          ) : (
            <TimetableView rows={rows} />
          )}
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          {loading ? (
            <Skeleton className="h-[60vh] w-full rounded-xl" />
          ) : error ? (
            <EmptyState
              title="Failed to load classes"
              description={error}
              icon={Layers}
              action={
                <Button onClick={reload} size="sm" variant="outline">
                  Retry
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No classes found"
              description="Try adjusting filters or add a new class."
              icon={BookOpen}
              action={
                <Button onClick={openAdd} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add Class
                </Button>
              }
            />
          ) : (
            <ClassListTable
              rows={rows}
              onEdit={openEdit}
              onDelete={(c) => setDeleteTarget(c)}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit dialog */}
      <Dialog open={addEditOpen} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Class' : 'Add Class'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update class schedule and details.'
                : 'Schedule a new tuition class for an external or internal teacher.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="class-name">Class Name</Label>
              <Input
                id="class-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. IT Foundations — Grade 1"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="class-program">Program</Label>
                <Select
                  value={form.programId || 'none'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, programId: v === 'none' ? '' : v }))
                  }
                >
                  <SelectTrigger id="class-program">
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— No program —</SelectItem>
                    {programs.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span
                          className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                          style={{ backgroundColor: p.color }}
                        />
                        {p.name} ({p.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="class-teacher">Teacher</Label>
                <Select
                  value={form.teacherId || 'none'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, teacherId: v === 'none' ? '' : v }))
                  }
                >
                  <SelectTrigger id="class-teacher">
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.fullName}
                        <Badge
                          variant={t.type === 'External' ? 'secondary' : 'outline'}
                          className="ml-1.5"
                        >
                          {t.type}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="class-day">Day</Label>
                <Select
                  value={form.dayOfWeek}
                  onValueChange={(v) => setForm((f) => ({ ...f, dayOfWeek: v }))}
                >
                  <SelectTrigger id="class-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="class-start">Start Time</Label>
                <Input
                  id="class-start"
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startTime: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="class-end">End Time</Label>
                <Input
                  id="class-end"
                  type="time"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endTime: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="class-room">Room</Label>
                <Input
                  id="class-room"
                  value={form.room}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, room: e.target.value }))
                  }
                  placeholder="Room 1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="class-capacity">Capacity</Label>
                <Input
                  id="class-capacity"
                  type="number"
                  min={0}
                  value={form.capacity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, capacity: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="class-fee">Fee (LKR)</Label>
                <Input
                  id="class-fee"
                  type="number"
                  min={0}
                  value={form.fee}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fee: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="class-notes">Notes</Label>
              <Textarea
                id="class-notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Optional notes about this class"
                className="min-h-16"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="class-active" className="cursor-pointer">
                  Active
                </Label>
                <p className="text-xs text-muted-foreground">
                  Inactive classes are hidden from the timetable
                </p>
              </div>
              <Switch
                id="class-active"
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Class'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description={
          deleteTarget && (deleteTarget._count?.enrollments ?? 0) > 0
            ? `${deleteTarget._count?.enrollments} student(s) are enrolled in this class. Withdraw them before deleting.`
            : 'This action cannot be undone. The class will be permanently removed from the timetable.'
        }
        confirmText="Delete"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ─── Timetable View (weekly grid: Mon..Sun columns × hourly rows) ──────────
interface TimetableViewProps {
  rows: ClassRow[]
}

function parseHour(time: string | null): number | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!m) return null
  const h = parseInt(m[1], 10)
  return isNaN(h) ? null : h
}

function TimetableView({ rows }: TimetableViewProps) {
  // Group by day, sort by startTime within each day
  const byDay = useMemo(() => {
    const map: Record<string, ClassRow[]> = {}
    for (const d of DAYS) map[d] = []
    for (const c of rows) {
      if (c.dayOfWeek && map[c.dayOfWeek]) {
        map[c.dayOfWeek].push(c)
      }
    }
    for (const d of DAYS) {
      map[d].sort((a, b) =>
        (a.startTime || '').localeCompare(b.startTime || ''),
      )
    }
    return map
  }, [rows])

  return (
    <Card className="overflow-hidden p-0">
      <div className="scroll-thin overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Header row: time column + 7 day columns */}
          <div
            className="grid border-b"
            style={{
              gridTemplateColumns: `64px repeat(${DAYS.length}, minmax(0, 1fr))`,
            }}
          >
            <div className="border-r bg-muted/40 p-2 text-xs font-medium text-muted-foreground">
              Time
            </div>
            {DAYS.map((d) => (
              <div
                key={d}
                className="border-r bg-muted/40 p-2 text-center text-xs font-semibold last:border-r-0"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Body: hour rows with day cells */}
          {TIME_SLOTS.map((hour) => (
            <div
              key={hour}
              className="grid border-b last:border-b-0"
              style={{
                gridTemplateColumns: `64px repeat(${DAYS.length}, minmax(0, 1fr))`,
              }}
            >
              <div className="border-r bg-muted/20 p-2 text-xs font-mono text-muted-foreground">
                {String(hour).padStart(2, '0')}:00
              </div>
              {DAYS.map((d) => {
                // Classes that start at this hour in this day
                const cellClasses = byDay[d].filter((c) => {
                  const startH = parseHour(c.startTime)
                  return startH === hour
                })
                return (
                  <div
                    key={d}
                    className="min-h-[68px] border-r p-1 last:border-r-0"
                  >
                    <div className="flex flex-col gap-1">
                      {cellClasses.map((c) => (
                        <TimetableCard key={c.id} cls={c} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

interface TimetableCardProps {
  cls: ClassRow
}

function TimetableCard({ cls }: TimetableCardProps) {
  const color = cls.program?.color || '#475569'
  const enrolled = cls._count?.enrollments ?? 0
  return (
    <div
      className="rounded-md border p-1.5 text-xs shadow-sm transition-shadow hover:shadow-md"
      style={{
        backgroundColor: `${color}14`, // 8% tint
        borderColor: `${color}55`,
        borderLeftWidth: '3px',
        borderLeftColor: color,
      }}
      title={cls.notes || undefined}
    >
      <p className="truncate font-semibold text-foreground">{cls.name}</p>
      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Clock className="h-2.5 w-2.5" />
        <span>
          {fmtTime(cls.startTime)} – {fmtTime(cls.endTime)}
        </span>
      </div>
      {cls.teacher && (
        <div className="mt-0.5 flex items-center gap-1">
          <GraduationCap className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="truncate text-[10px] text-muted-foreground">
            {cls.teacher.fullName}
          </span>
          {cls.teacher.type === 'External' && (
            <Badge
              variant="secondary"
              className="ml-auto h-3 px-1 text-[9px] leading-none"
            >
              Ext
            </Badge>
          )}
        </div>
      )}
      {(cls.room || enrolled > 0) && (
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          {cls.room && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-2.5 w-2.5" />
              {cls.room}
            </span>
          )}
          {enrolled > 0 && (
            <span className="flex items-center gap-0.5">
              <Users className="h-2.5 w-2.5" />
              {enrolled}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── List View (table) ─────────────────────────────────────────────────────
interface ClassListTableProps {
  rows: ClassRow[]
  onEdit: (c: ClassRow) => void
  onDelete: (c: ClassRow) => void
}

function ClassListTable({ rows, onEdit, onDelete }: ClassListTableProps) {
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const dayA = DAYS.indexOf((a.dayOfWeek || '') as (typeof DAYS)[number])
      const dayB = DAYS.indexOf((b.dayOfWeek || '') as (typeof DAYS)[number])
      const da = dayA < 0 ? 99 : dayA
      const db = dayB < 0 ? 99 : dayB
      if (da !== db) return da - db
      return (a.startTime || '').localeCompare(b.startTime || '')
    })
  }, [rows])

  return (
    <Card className="overflow-hidden p-0">
      <div className="scroll-thin max-h-[60vh] overflow-y-auto">
        <Table className="table-zebra">
          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Room</TableHead>
              <TableHead className="w-32">Capacity</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((c) => {
              const enrolled = c._count?.enrollments ?? 0
              const pct =
                c.capacity > 0 ? Math.min(100, (enrolled / c.capacity) * 100) : 0
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    {c.notes && (
                      <div className="line-clamp-1 text-xs text-muted-foreground">
                        {c.notes}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.program ? (
                      <Badge
                        variant="outline"
                        className="gap-1.5"
                        style={{
                          borderColor: `${c.program.color}88`,
                          color: c.program.color,
                        }}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: c.program.color }}
                        />
                        {c.program.code}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.teacher ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{c.teacher.fullName}</span>
                        <Badge
                          variant={
                            c.teacher.type === 'External' ? 'secondary' : 'outline'
                          }
                          className="text-[10px]"
                        >
                          {c.teacher.type === 'External' ? 'Ext' : 'Int'}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Unassigned
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.dayOfWeek ? (
                      <Badge variant="secondary">{c.dayOfWeek}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {fmtTime(c.startTime)} – {fmtTime(c.endTime)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.room ? (
                      <span className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {c.room}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{enrolled}</span>
                        <span className="text-muted-foreground">/ {c.capacity}</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {currency(c.fee)}
                  </TableCell>
                  <TableCell>
                    {c.active ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(c)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(c)}
                          className="text-destructive focus:text-destructive"
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
    </Card>
  )
}
