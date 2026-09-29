'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Users,
  UserCheck,
  UserPlus,
  Filter,
  Search,
  Plus,
  Download,
  MoreHorizontal,
  Eye,
  Pencil,
  Printer,
  Trash2,
  X,
  Phone,
  MapPin,
  CalendarDays,
  ShieldCheck,
  GraduationCap,
  HeartPulse,
  IdCard,
  Loader2,
  Users2,
  ScanLine,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useSchoolInfo } from '@/lib/school'
import {
  StudentRow,
  ProgramRow,
  ClassRow,
  GENDERS,
  AGE_GROUPS,
  RELIGIONS,
  STUDENT_STATUS,
  StudentCategoryTab,
} from '@/lib/types'
import {
  initials,
  avatarColor,
  fmtDate,
  fmtDateTime,
  ageFromDob,
} from '@/lib/format'

import { SectionHeader } from '@/components/shared/section-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Barcode } from '@/components/shared/barcode'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Helpers ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

function toDateInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function ageLabelOf(value: string | null | undefined): string {
  if (!value) return ''
  const found = AGE_GROUPS.find((a) => a.value === value)
  return found ? found.label : value
}

function exportStudentsCsv(rows: StudentRow[]): void {
  const headers = [
    'Student ID',
    'Barcode',
    'Index No',
    'Full Name',
    'Gender',
    'DOB',
    'Age Group',
    'Grade',
    'Religion',
    'Nationality',
    'Programmes',
    'Guardian',
    'Guardian Phone',
    'Status',
  ]
  const lines = rows.map((r) => {
    const g = r.guardians[0]
    return [
      r.studentId,
      r.barcode,
      r.indexNo || '',
      r.fullName,
      r.gender,
      r.dob ? toDateInput(r.dob) : '',
      r.ageGroup || '',
      r.grade || '',
      r.religion || '',
      r.nationality || '',
      r.enrollments
        .map((e) => {
          if (!e.program) return null
          const cls = e.class ? ` @ ${e.class.name}` : ''
          return `${e.program.code}${cls}`
        })
        .filter(Boolean)
        .join('|'),
      g?.name || '',
      g?.phone || '',
      r.status,
    ]
      .map(csvEscape)
      .join(',')
  })
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sanomin-students-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  Active: 'default',
  Inactive: 'secondary',
  Graduated: 'outline',
}

// ─── List response shape ───────────────────────────────────────────────────
interface ListResponse {
  data: StudentRow[]
  total: number
  page: number
  limit: number
  stats: {
    totalStudents: number
    activeStudents: number
    newThisMonth: number
    filteredCount: number
    byCategory?: {
      all: number
      preschool: number
      daycare: number
      tuition: number
    }
  }
}

// ─── Main section component ────────────────────────────────────────────────
export function StudentsSection() {
  const [rows, setRows] = useState<StudentRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<ListResponse['stats']>({
    totalStudents: 0,
    activeStudents: 0,
    newThisMonth: 0,
    filteredCount: 0,
    byCategory: { all: 0, preschool: 0, daycare: 0, tuition: 0 },
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dynamic lists for filters + dialogs
  const [programs, setPrograms] = useState<ProgramRow[]>([])
  const [allClasses, setAllClasses] = useState<ClassRow[]>([])

  // ── Category tab ─────────────────────────────────────────────────────
  const [category, setCategory] = useState<StudentCategoryTab>('all')

  // filters
  const [q, setQ] = useState('')
  const [program, setProgram] = useState('')
  const [ageGroup, setAgeGroup] = useState('')
  const [gender, setGender] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  // dialog state
  const [addEditOpen, setAddEditOpen] = useState(false)
  const [editing, setEditing] = useState<StudentRow | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileStudent, setProfileStudent] = useState<StudentRow | null>(null)
  const [idCardOpen, setIdCardOpen] = useState(false)
  const [idCardStudent, setIdCardStudent] = useState<StudentRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null)

  const hasFilters = Boolean(q || program || ageGroup || gender || status)

  // Load programmes + classes once
  useEffect(() => {
    let alive = true
    Promise.all([
      api<{ data: ProgramRow[] }>('/api/programs?active=true'),
      api<{ data: ClassRow[] }>('/api/classes?active=true&limit=200'),
    ])
      .then(([progs, classes]) => {
        if (!alive) return
        setPrograms(progs.data || [])
        setAllClasses(classes.data || [])
      })
      .catch(() => {
        /* silent — filter dropdowns just stay empty */
      })
    return () => {
      alive = false
    }
  }, [])

  const setFilter = useCallback(
    <K extends 'q' | 'program' | 'ageGroup' | 'gender' | 'status'>(
      key: K,
      value: string,
    ) => {
      setPage(1)
      if (key === 'q') setQ(value)
      else if (key === 'program') setProgram(value)
      else if (key === 'ageGroup') setAgeGroup(value)
      else if (key === 'gender') setGender(value)
      else setStatus(value)
    },
    [],
  )

  const clearFilters = useCallback(() => {
    setQ('')
    setProgram('')
    setAgeGroup('')
    setGender('')
    setStatus('')
    setPage(1)
  }, [])

  const handleCategoryChange = useCallback((v: string) => {
    setCategory(v as StudentCategoryTab)
    setPage(1)
  }, [])

  const queryParams = useMemo(() => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (program) p.set('program', program)
    if (category !== 'all') p.set('category', category)
    if (ageGroup) p.set('ageGroup', ageGroup)
    if (gender) p.set('gender', gender)
    if (status) p.set('status', status)
    p.set('page', String(page))
    p.set('limit', String(PAGE_SIZE))
    return p.toString()
  }, [q, program, category, ageGroup, gender, status, page])

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      if (!alive) return
      setLoading(true)
      api<ListResponse>(`/api/students?${queryParams}`)
        .then((res) => {
          if (!alive) return
          setRows(res.data)
          setTotal(res.total)
          setStats(res.stats)
          setError(null)
          setLoading(false)
        })
        .catch((err: unknown) => {
          if (!alive) return
          const msg = err instanceof Error ? err.message : 'Failed to load'
          setError(msg)
          setLoading(false)
          toast.error(msg)
        })
    }, 220)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [queryParams])

  const reload = useCallback(() => {
    setLoading(true)
    api<ListResponse>(`/api/students?${queryParams}`)
      .then((res) => {
        setRows(res.data)
        setTotal(res.total)
        setStats(res.stats)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load'
        setError(msg)
        setLoading(false)
      })
  }, [queryParams])

  const openAdd = useCallback(() => {
    setEditing(null)
    setAddEditOpen(true)
  }, [])

  const openEdit = useCallback((s: StudentRow) => {
    setEditing(s)
    setAddEditOpen(true)
  }, [])

  const openProfile = useCallback((s: StudentRow) => {
    setProfileStudent(s)
    setProfileOpen(true)
  }, [])

  const openIdCard = useCallback((s: StudentRow) => {
    setIdCardStudent(s)
    setIdCardOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await api(`/api/students/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success(`${deleteTarget.fullName} deleted`)
      setDeleteTarget(null)
      reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      toast.error(msg)
    }
  }, [deleteTarget, reload])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const showingTo = Math.min(total, page * PAGE_SIZE)

  const bc = stats.byCategory ?? { all: 0, preschool: 0, daycare: 0, tuition: 0 }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Students"
        description="Manage student profiles, guardians, programme enrolments and ID cards."
        icon={<Users className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportStudentsCsv(rows)}
              disabled={rows.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add Student
            </Button>
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total students"
          value={stats.totalStudents}
          icon={Users2}
          accent="blue"
          hint="All enrolled records"
        />
        <StatCard
          label="Active"
          value={stats.activeStudents}
          icon={UserCheck}
          accent="green"
          hint="Status = Active"
        />
        <StatCard
          label="New this month"
          value={stats.newThisMonth}
          icon={UserPlus}
          accent="purple"
          hint="Admitted / created this month"
        />
        <StatCard
          label="Showing"
          value={`${stats.filteredCount} / ${stats.totalStudents}`}
          icon={Filter}
          accent="amber"
          hint={hasFilters || category !== 'all' ? 'Filtered results' : 'No filters applied'}
        />
      </div>

      {/* Category tabs */}
      <Tabs value={category} onValueChange={handleCategoryChange}>
        <TabsList className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto">
          <TabsTrigger value="all" className="gap-1.5">
            All
            <span className="text-xs text-muted-foreground tabular-nums">
              {bc.all}
            </span>
          </TabsTrigger>
          <TabsTrigger value="preschool" className="gap-1.5">
            Preschool
            <span className="text-xs text-muted-foreground tabular-nums">
              {bc.preschool}
            </span>
          </TabsTrigger>
          <TabsTrigger value="daycare" className="gap-1.5">
            Daycare
            <span className="text-xs text-muted-foreground tabular-nums">
              {bc.daycare}
            </span>
          </TabsTrigger>
          <TabsTrigger value="tuition" className="gap-1.5">
            Tuition
            <span className="text-xs text-muted-foreground tabular-nums">
              {bc.tuition}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4 lg:flex-row lg:items-center lg:gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, index no or barcode…"
            value={q}
            onChange={(e) => setFilter('q', e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:flex-wrap">
          <Select
            value={program || 'ALL'}
            onValueChange={(v) => setFilter('program', v === 'ALL' ? '' : v)}
          >
            <SelectTrigger className="w-full lg:w-[160px]">
              <SelectValue placeholder="Programme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All programmes</SelectItem>
              {programs.map((p) => (
                <SelectItem key={p.id} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={ageGroup || 'ALL'}
            onValueChange={(v) => setFilter('ageGroup', v === 'ALL' ? '' : v)}
          >
            <SelectTrigger className="w-full lg:w-[160px]">
              <SelectValue placeholder="Age group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All ages</SelectItem>
              {AGE_GROUPS.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={gender || 'ALL'}
            onValueChange={(v) => setFilter('gender', v === 'ALL' ? '' : v)}
          >
            <SelectTrigger className="w-full lg:w-[120px]">
              <SelectValue placeholder="Gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All genders</SelectItem>
              {GENDERS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={status || 'ALL'}
            onValueChange={(v) => setFilter('status', v === 'ALL' ? '' : v)}
          >
            <SelectTrigger className="w-full lg:w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All status</SelectItem>
              {STUDENT_STATUS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="shrink-0"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Data table */}
      <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="max-h-[60vh] overflow-auto">
          <Table className="table-zebra min-w-[1000px]">
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <TableRow>
                <TableHead className="min-w-[200px]">Student</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Age / Grade</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Programmes</TableHead>
                <TableHead>Guardian</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-2.5 w-20" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-7 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-14" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-14" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-7 w-7 rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={Users}
                      title={
                        hasFilters || category !== 'all'
                          ? 'No matching students'
                          : 'No students yet'
                      }
                      description={
                        hasFilters || category !== 'all'
                          ? 'Try adjusting your search, filters or category.'
                          : 'Add your first student to get started.'
                      }
                      action={
                        <Button size="sm" onClick={openAdd}>
                          <Plus className="h-4 w-4" />
                          Add Student
                        </Button>
                      }
                      className="m-4"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((s) => (
                  <StudentTableRow
                    key={s.id}
                    student={s}
                    onView={() => openProfile(s)}
                    onEdit={() => openEdit(s)}
                    onPrintId={() => openIdCard(s)}
                    onDelete={() => setDeleteTarget(s)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {!loading && rows.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-2 border-t bg-muted/40 px-4 py-2.5 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{showingFrom}</span>
              –<span className="font-medium text-foreground">{showingTo}</span> of{' '}
              <span className="font-medium text-foreground">{total}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page <span className="font-medium text-foreground">{page}</span> of{' '}
                {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {addEditOpen && (
        <AddEditStudentDialog
          student={editing}
          programs={programs}
          allClasses={allClasses}
          onClose={() => setAddEditOpen(false)}
          onSaved={(msg) => {
            toast.success(msg)
            setAddEditOpen(false)
            reload()
          }}
        />
      )}

      {profileOpen && profileStudent && (
        <ProfileDialog
          student={profileStudent}
          onClose={() => setProfileOpen(false)}
          onEdit={() => {
            setProfileOpen(false)
            openEdit(profileStudent)
          }}
          onPrintId={() => {
            setProfileOpen(false)
            openIdCard(profileStudent)
          }}
        />
      )}

      {idCardOpen && idCardStudent && (
        <IdCardDialog
          student={idCardStudent}
          onClose={() => setIdCardOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete student?"
        description={
          deleteTarget
            ? `This permanently removes ${deleteTarget.fullName} (${deleteTarget.studentId}) and all related guardian, enrolment and attendance records.`
            : ''
        }
        confirmText="Delete"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ─── Student table row ─────────────────────────────────────────────────────
function StudentTableRow({
  student,
  onView,
  onEdit,
  onPrintId,
  onDelete,
}: {
  student: StudentRow
  onView: () => void
  onEdit: () => void
  onPrintId: () => void
  onDelete: () => void
}) {
  const primaryGuardian =
    student.guardians.find((g) => g.isPrimary) || student.guardians[0]

  return (
    <TableRow className="cursor-pointer" onClick={onView}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-9 ring-1 ring-border">
            <AvatarFallback className={avatarColor(student.fullName)}>
              {initials(student.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">
              {student.fullName}
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {student.studentId}
              {student.indexNo && ` · #${student.indexNo}`}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-foreground">
          <Barcode value={student.barcode} height={28} showText={false} />
          <span className="font-mono text-xs text-muted-foreground">
            {student.barcode}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="font-medium">{student.ageGroup || '—'}</div>
          <div className="text-xs text-muted-foreground">
            {student.grade || ageFromDob(student.dob)}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-normal">
          {student.gender}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {student.enrollments.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            student.enrollments.map((e) =>
              e.program ? (
                <span
                  key={e.id}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: e.program.color }}
                  title={
                    e.class
                      ? `${e.program.name} · ${e.class.name}${e.class.grade ? ` (${e.class.grade})` : ''}`
                      : e.program.name
                  }
                >
                  {e.program.code}
                  {e.class && (
                    <span className="rounded bg-white/20 px-1 text-[10px] font-semibold">
                      {e.class.dayOfWeek || ''}
                      {e.class.startTime ? ` ${e.class.startTime}` : ''}
                    </span>
                  )}
                </span>
              ) : null,
            )
          )}
        </div>
      </TableCell>
      <TableCell>
        {primaryGuardian ? (
          <div className="text-sm">
            <div className="truncate font-medium">{primaryGuardian.name}</div>
            <div className="font-mono text-xs text-muted-foreground">
              {primaryGuardian.phone}
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[student.status] || 'secondary'}>
          {student.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={onView}>
                <Eye className="mr-2 h-4 w-4" />
                View profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPrintId}>
                <Printer className="mr-2 h-4 w-4" />
                Print ID card
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── Add / Edit dialog ─────────────────────────────────────────────────────
interface GuardianEntry {
  name: string
  phone: string
  address: string
  relationship: string
  isPrimary: boolean
}

interface EnrollmentDraft {
  programId: string
  classId: string | null
}

interface FormState {
  fullName: string
  gender: string
  dob: string
  ageGroup: string
  grade: string
  admissionDate: string
  religion: string
  nationality: string
  previousSchool: string
  status: string
  medicalNotes: string
  photoUrl: string
  indexNo: string
}

function emptyForm(): FormState {
  return {
    fullName: '',
    gender: 'Male',
    dob: '',
    ageGroup: '',
    grade: '',
    admissionDate: toDateInput(new Date().toISOString()),
    religion: '',
    nationality: 'Sri Lankan',
    previousSchool: '',
    status: 'Active',
    medicalNotes: '',
    photoUrl: '',
    indexNo: '',
  }
}

function formFromStudent(s: StudentRow): FormState {
  return {
    fullName: s.fullName,
    gender: s.gender,
    dob: toDateInput(s.dob),
    ageGroup: s.ageGroup || '',
    grade: s.grade || '',
    admissionDate: toDateInput(s.admissionDate),
    religion: s.religion || '',
    nationality: s.nationality || 'Sri Lankan',
    previousSchool: s.previousSchool || '',
    status: s.status,
    medicalNotes: s.medicalNotes || '',
    photoUrl: s.photoUrl || '',
    indexNo: s.indexNo || '',
  }
}

function guardiansFromStudent(s: StudentRow): GuardianEntry[] {
  if (s.guardians.length === 0) {
    return [{ name: '', phone: '', address: '', relationship: 'Guardian', isPrimary: true }]
  }
  return s.guardians.map((g) => ({
    name: g.name,
    phone: g.phone,
    address: g.address || '',
    relationship: g.relationship || 'Guardian',
    isPrimary: g.isPrimary,
  }))
}

function enrollmentsFromStudent(s: StudentRow): EnrollmentDraft[] {
  return s.enrollments
    .filter((e) => e.program !== null)
    .map((e) => ({
      programId: (e.program as NonNullable<typeof e.program>).id,
      classId: e.class?.id ?? null,
    }))
}

function AddEditStudentDialog({
  student,
  programs,
  allClasses,
  onClose,
  onSaved,
}: {
  student: StudentRow | null
  programs: ProgramRow[]
  allClasses: ClassRow[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    student ? formFromStudent(student) : emptyForm(),
  )
  const [guardians, setGuardians] = useState<GuardianEntry[]>(() =>
    student
      ? guardiansFromStudent(student)
      : [{ name: '', phone: '', address: '', relationship: 'Guardian', isPrimary: true }],
  )
  const [enrollments, setEnrollments] = useState<EnrollmentDraft[]>(() =>
    student ? enrollmentsFromStudent(student) : [],
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isEdit = student !== null

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const updateGuardian = (idx: number, patch: Partial<GuardianEntry>) => {
    setGuardians((gs) => gs.map((g, i) => (i === idx ? { ...g, ...patch } : g)))
  }
  const addGuardian = () => {
    setGuardians((gs) => [
      ...gs,
      { name: '', phone: '', address: '', relationship: 'Guardian', isPrimary: false },
    ])
  }
  const removeGuardian = (idx: number) => {
    setGuardians((gs) => {
      if (gs.length === 1) return gs
      const next = gs.filter((_, i) => i !== idx)
      const hasPrimary = next.some((g) => g.isPrimary)
      if (!hasPrimary && next.length > 0) {
        next[0] = { ...next[0], isPrimary: true }
      }
      return next
    })
  }
  const setPrimaryGuardian = (idx: number) => {
    setGuardians((gs) => gs.map((g, i) => ({ ...g, isPrimary: i === idx })))
  }

  // ─── Enrolment toggling ─────────────────────────────────────────────
  const toggleProgram = useCallback((programId: string) => {
    setEnrollments((prev) => {
      const exists = prev.find((e) => e.programId === programId)
      if (exists) return prev.filter((e) => e.programId !== programId)
      return [...prev, { programId, classId: null }]
    })
  }, [])

  const setEnrolmentClass = useCallback(
    (programId: string, classId: string | null) => {
      setEnrollments((prev) =>
        prev.map((x) => (x.programId === programId ? { ...x, classId } : x)),
      )
      // Auto-fill the student grade from the chosen class's pinned grade
      const chosen = classId ? allClasses.find((c) => c.id === classId) : null
      if (chosen?.grade) {
        setForm((f) => ({ ...f, grade: chosen.grade || f.grade }))
      }
    },
    [allClasses],
  )

  const handleSubmit = async () => {
    setErr(null)
    if (!form.fullName.trim()) {
      setErr('Full name is required')
      return
    }
    if (!form.gender) {
      setErr('Gender is required')
      return
    }

    const payload = {
      fullName: form.fullName.trim(),
      gender: form.gender,
      dob: form.dob || null,
      ageGroup: form.ageGroup || null,
      grade: form.grade.trim() || null,
      admissionDate: form.admissionDate || null,
      religion: form.religion || null,
      nationality: form.nationality || null,
      previousSchool: form.previousSchool || null,
      status: form.status,
      medicalNotes: form.medicalNotes || null,
      photoUrl: form.photoUrl || null,
      indexNo: form.indexNo || null,
      guardians: guardians
        .filter((g) => g.name.trim())
        .map((g) => ({
          name: g.name.trim(),
          phone: g.phone.trim() || 'N/A',
          address: g.address || null,
          relationship: g.relationship || 'Guardian',
          isPrimary: g.isPrimary,
        })),
      enrollments: enrollments.map((e) => ({
        programId: e.programId,
        classId: e.classId || null,
      })),
    }

    setSaving(true)
    try {
      if (isEdit && student) {
        const updated = await api<StudentRow>(`/api/students/${student.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        onSaved(`Updated ${updated.fullName}`)
      } else {
        const created = await api<StudentRow>('/api/students', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        onSaved(`Added ${created.fullName} (${created.studentId})`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setErr(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit student' : 'Add new student'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update profile for ${student?.fullName} (${student?.studentId}).`
              : 'Create a new student record. Student ID and barcode are generated automatically.'}
          </DialogDescription>
        </DialogHeader>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}

        <div className="grid gap-4 py-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name *" className="sm:col-span-2">
              <Input
                value={form.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                placeholder="e.g. Mahinda Kumar Rishalini"
              />
            </Field>
            <Field label="Gender *">
              <RadioGroup
                value={form.gender}
                onValueChange={(v) => updateField('gender', v)}
                className="flex gap-4"
              >
                {GENDERS.map((g) => (
                  <div key={g} className="flex items-center gap-2">
                    <RadioGroupItem id={`gender-${g}`} value={g} />
                    <Label htmlFor={`gender-${g}`} className="font-normal">
                      {g}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </Field>
            <Field label="Index No.">
              <Input
                value={form.indexNo}
                onChange={(e) => updateField('indexNo', e.target.value)}
                placeholder="e.g. 200"
              />
            </Field>
            <Field label="Date of birth">
              <Input
                type="date"
                value={form.dob}
                onChange={(e) => updateField('dob', e.target.value)}
              />
            </Field>
            <Field label="Age group">
              <Select
                value={form.ageGroup || 'NONE'}
                onValueChange={(v) => updateField('ageGroup', v === 'NONE' ? '' : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select age group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">—</SelectItem>
                  {AGE_GROUPS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Grade (optional)" className="sm:col-span-2">
              <Input
                value={form.grade}
                onChange={(e) => updateField('grade', e.target.value)}
                placeholder="e.g. Grade 6"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Free text. Auto-filled when a class with a pinned grade is chosen below.
              </p>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Admission date">
              <Input
                type="date"
                value={form.admissionDate}
                onChange={(e) => updateField('admissionDate', e.target.value)}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(v) => updateField('status', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STUDENT_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Religion">
              <Select
                value={form.religion || 'NONE'}
                onValueChange={(v) => updateField('religion', v === 'NONE' ? '' : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select religion" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">—</SelectItem>
                  {RELIGIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Nationality">
              <Input
                value={form.nationality}
                onChange={(e) => updateField('nationality', e.target.value)}
                placeholder="e.g. Sri Lankan"
              />
            </Field>
            <Field label="Previous school" className="sm:col-span-2">
              <Input
                value={form.previousSchool}
                onChange={(e) => updateField('previousSchool', e.target.value)}
                placeholder="e.g. Little Stars Play Group"
              />
            </Field>
            <Field label="Photo URL (optional)" className="sm:col-span-2">
              <Input
                value={form.photoUrl}
                onChange={(e) => updateField('photoUrl', e.target.value)}
                placeholder="https://…/photo.jpg"
              />
            </Field>
            <Field label="Medical notes" className="sm:col-span-2">
              <Textarea
                value={form.medicalNotes}
                onChange={(e) => updateField('medicalNotes', e.target.value)}
                placeholder="Allergies, conditions, medication, etc."
                rows={2}
              />
            </Field>
          </div>

          {/* Programme + class enrolment */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Programme enrolments</p>
              <p className="text-xs text-muted-foreground">
                {enrollments.length} selected
              </p>
            </div>
            {programs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active programmes available. Create one in the Programmes section first.
              </p>
            ) : (
              <div className="space-y-2">
                {programs.map((p) => {
                  const draft = enrollments.find((e) => e.programId === p.id)
                  const checked = !!draft
                  const classesForProgram = allClasses.filter(
                    (c) => c.program?.id === p.id,
                  )
                  return (
                    <div
                      key={p.id}
                      className={`rounded-md border bg-background p-2.5 transition ${
                        checked ? 'border-primary/50 ring-1 ring-primary/20' : ''
                      }`}
                    >
                      <label className="flex cursor-pointer items-center gap-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleProgram(p.id)}
                        />
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-sm font-medium">{p.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {p.code}
                        </span>
                        <Badge
                          variant="outline"
                          className="ml-auto text-[10px] text-muted-foreground"
                        >
                          {p.category}
                        </Badge>
                      </label>

                      {checked && (
                        <div className="mt-2 flex flex-col gap-1 pl-7">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Class (optional)
                          </Label>
                          <Select
                            value={draft!.classId ?? 'none'}
                            onValueChange={(v) => {
                              const classId = v === 'none' ? null : v
                              setEnrolmentClass(p.id, classId)
                            }}
                          >
                            <SelectTrigger className="h-8 w-full max-w-[280px] text-xs">
                              <SelectValue placeholder="No class assigned" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No class</SelectItem>
                              {classesForProgram.length === 0 ? (
                                <SelectItem value="none" disabled>
                                  No classes for {p.name}
                                </SelectItem>
                              ) : (
                                classesForProgram.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                    {c.dayOfWeek ? ` · ${c.dayOfWeek}` : ''}
                                    {c.startTime ? ` ${c.startTime}` : ''}
                                    {c.grade ? ` (${c.grade})` : ''}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Guardians */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Guardians / Parents</p>
              <Button variant="ghost" size="sm" onClick={addGuardian}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            <div className="space-y-3">
              {guardians.map((g, idx) => (
                <div key={idx} className="rounded-md border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <Checkbox
                        checked={g.isPrimary}
                        onCheckedChange={() => setPrimaryGuardian(idx)}
                      />
                      Primary contact
                    </label>
                    {guardians.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => removeGuardian(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={g.name}
                      onChange={(e) => updateGuardian(idx, { name: e.target.value })}
                      placeholder="Guardian name"
                    />
                    <Input
                      value={g.phone}
                      onChange={(e) => updateGuardian(idx, { phone: e.target.value })}
                      placeholder="Phone"
                    />
                    <Input
                      value={g.relationship}
                      onChange={(e) =>
                        updateGuardian(idx, { relationship: e.target.value })
                      }
                      placeholder="Relationship (e.g. Mother, Father, Guardian)"
                      className="sm:col-span-2"
                    />
                    <Input
                      value={g.address}
                      onChange={(e) => updateGuardian(idx, { address: e.target.value })}
                      placeholder="Address"
                      className="sm:col-span-2"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create student'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  )
}

// ─── Profile dialog (View) ─────────────────────────────────────────────────
interface AttendanceLite {
  id: string
  date: string
  checkIn: string | null
  checkOut: string | null
  method: string
  status: string
  note: string | null
}

function ProfileDialog({
  student,
  onClose,
  onEdit,
  onPrintId,
}: {
  student: StudentRow
  onClose: () => void
  onEdit: () => void
  onPrintId: () => void
}) {
  const [attendance, setAttendance] = useState<AttendanceLite[] | null>(null)
  const [attErr, setAttErr] = useState(false)

  useEffect(() => {
    let alive = true
    api<{ data?: AttendanceLite[] } & AttendanceLite[]>(
      `/api/attendance?studentId=${student.id}&limit=20`,
    )
      .then((res) => {
        if (!alive) return
        const list = Array.isArray(res)
          ? res
          : Array.isArray((res as { data?: AttendanceLite[] }).data)
            ? (res as { data: AttendanceLite[] }).data
            : []
        setAttendance(list)
      })
      .catch(() => {
        if (!alive) return
        setAttErr(true)
      })
    return () => {
      alive = false
    }
  }, [student.id])

  const primaryGuardian =
    student.guardians.find((g) => g.isPrimary) || student.guardians[0]

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Student profile</DialogTitle>
          <DialogDescription>
            Full details for {student.fullName} ({student.studentId}).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center">
          <Avatar className="size-16 ring-2 ring-border">
            <AvatarFallback
              className={`text-lg font-semibold ${avatarColor(student.fullName)}`}
            >
              {initials(student.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">{student.fullName}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{student.studentId}</span>
              <span>·</span>
              <span>{student.gender}</span>
              <span>·</span>
              <span>{ageLabelOf(student.ageGroup) || '—'}</span>
              {student.grade && (
                <>
                  <span>·</span>
                  <span className="font-medium text-foreground">
                    {student.grade}
                  </span>
                </>
              )}
              <span>·</span>
              <span>Age {ageFromDob(student.dob)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant={STATUS_VARIANT[student.status] || 'secondary'}>
                {student.status}
              </Badge>
              {student.enrollments.map((e) =>
                e.program ? (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: e.program.color }}
                  >
                    {e.program.code}
                    {e.class && (
                      <span className="rounded bg-white/20 px-1 text-[10px] font-semibold">
                        {e.class.name}
                      </span>
                    )}
                  </span>
                ) : null,
              )}
            </div>
          </div>
          <div className="flex flex-row gap-2 sm:flex-col">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={onPrintId}>
              <IdCard className="h-4 w-4" />
              ID Card
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendance">
              Attendance
              {student._count && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({student._count.attendance})
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem
                icon={<IdCard className="h-4 w-4" />}
                label="Student ID"
                value={student.studentId}
              />
              <DetailItem
                icon={<ScanLine className="h-4 w-4" />}
                label="Barcode"
                value={student.barcode}
                mono
              />
              <DetailItem
                icon={<GraduationCap className="h-4 w-4" />}
                label="Index No."
                value={student.indexNo || '—'}
              />
              <DetailItem
                icon={<GraduationCap className="h-4 w-4" />}
                label="Grade"
                value={student.grade || '—'}
              />
              <DetailItem
                icon={<CalendarDays className="h-4 w-4" />}
                label="Date of birth"
                value={fmtDate(student.dob)}
              />
              <DetailItem
                icon={<CalendarDays className="h-4 w-4" />}
                label="Admission date"
                value={fmtDate(student.admissionDate)}
              />
              <DetailItem
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Religion"
                value={student.religion || '—'}
              />
              <DetailItem
                icon={<Users2 className="h-4 w-4" />}
                label="Nationality"
                value={student.nationality || '—'}
              />
            </div>

            {student.medicalNotes && (
              <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                  <HeartPulse className="h-4 w-4" />
                  Medical notes
                </div>
                <p className="text-sm text-foreground/80">{student.medicalNotes}</p>
              </div>
            )}

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold">Guardians</h4>
              {student.guardians.length === 0 ? (
                <p className="text-sm text-muted-foreground">No guardians recorded.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {student.guardians.map((g) => (
                    <div key={g.id} className="rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{g.name}</span>
                        {g.isPrimary && (
                          <Badge variant="secondary" className="text-[10px]">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />
                          <span className="font-mono">{g.phone}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="opacity-70">{g.relationship}</span>
                        </div>
                        {g.address && (
                          <div className="flex items-start gap-1.5">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>{g.address}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold">Enrolled programmes</h4>
              {student.enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not enrolled in any programme.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {student.enrollments.map((e) =>
                    e.program ? (
                      <div
                        key={e.id}
                        className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-1.5"
                      >
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: e.program.color }}
                        />
                        <span className="text-sm font-medium">
                          {e.program.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({e.program.code})
                        </span>
                        {e.class && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-semibold"
                          >
                            {e.class.name}
                          </Badge>
                        )}
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="mt-3">
            {attendance === null && !attErr ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : attErr ? (
              <EmptyState
                icon={CalendarDays}
                title="Attendance history coming soon"
                description="The attendance endpoint for this student isn't available yet."
                className="border-dashed"
              />
            ) : attendance && attendance.length > 0 ? (
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <Table className="table-zebra">
                  <TableHeader className="sticky top-0 bg-muted/80">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Check in</TableHead>
                      <TableHead>Check out</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">
                          {fmtDate(a.date)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.checkIn ? fmtDateTime(a.checkIn) : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.checkOut ? fmtDateTime(a.checkOut) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {a.method}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {a.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No attendance records"
                description="This student hasn't been checked in yet."
                className="border-dashed"
              />
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailItem({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border bg-muted/20 p-2.5">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-border">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-medium ${mono ? 'font-mono' : ''} truncate`}>
          {value}
        </p>
      </div>
    </div>
  )
}

// ─── Printable ID Card dialog ──────────────────────────────────────────────
function IdCardDialog({
  student,
  onClose,
}: {
  student: StudentRow
  onClose: () => void
}) {
  const school = useSchoolInfo()
  const primaryGuardian =
    student.guardians.find((g) => g.isPrimary) || student.guardians[0]

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print()
  }

  const printCss = `
    @media print {
      body * { visibility: hidden !important; }
      .printable-id-card, .printable-id-card * { visibility: visible !important; }
      .printable-id-card {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        margin: 0 !important;
        box-shadow: none !important;
      }
      .no-print { display: none !important; }
    }
  `

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader className="no-print">
          <DialogTitle>Student ID card</DialogTitle>
          <DialogDescription>
            Preview the printable ID card for {student.fullName}.
          </DialogDescription>
        </DialogHeader>

        <style>{printCss}</style>

        <div className="printable-id-card mx-auto w-full max-w-sm overflow-hidden rounded-xl border bg-white text-foreground shadow-md">
          <div
            className="flex items-center gap-3 px-4 py-3 text-white"
            style={{
              background:
                'linear-gradient(135deg, #1e40af 0%, #7c3aed 50%, #dc2626 100%)',
            }}
          >
            <img
              src={school.logoUrl}
              alt="School logo"
              className="size-10 rounded-full bg-white object-cover ring-2 ring-white/40"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">
                {school.shortName} {school.subtitle.split(' ')[0] || ''}
              </p>
              <p className="text-xs opacity-90 leading-tight">
                {school.subtitle.split(' ').slice(1).join(' ') || school.subtitle}
              </p>
            </div>
          </div>

          <div className="flex gap-3 p-4">
            <Avatar className="size-16 shrink-0 ring-2 ring-border">
              <AvatarFallback
                className={`text-lg font-bold ${avatarColor(student.fullName)}`}
              >
                {initials(student.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold leading-tight">
                {student.fullName}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {student.studentId}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {student.enrollments.slice(0, 3).map((e) =>
                  e.program ? (
                    <span
                      key={e.id}
                      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: e.program.color }}
                    >
                      {e.program.code}
                      {e.class && (
                        <span className="rounded bg-black/20 px-1 text-[9px]">
                          {e.class.name}
                        </span>
                      )}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 border-t bg-muted/20 px-4 py-3">
            <Barcode value={student.barcode} height={36} showText={false} />
            <span className="font-mono text-[11px] tracking-[0.18em]">
              {student.barcode}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t px-4 py-3 text-xs">
            <div>
              <p className="text-muted-foreground">Guardian</p>
              <p className="truncate font-medium">
                {primaryGuardian?.name || '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Phone</p>
              <p className="truncate font-mono font-medium">
                {primaryGuardian?.phone || '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Age group</p>
              <p className="font-medium">{student.ageGroup || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Grade</p>
              <p className="font-medium">{student.grade || '—'}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="no-print">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
