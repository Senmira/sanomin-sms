'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Users,
  UserCheck,
  GraduationCap,
  Fingerprint,
  Filter,
  Search,
  Plus,
  Download,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  X,
  Phone,
  Mail,
  MapPin,
  CalendarDays,
  ShieldCheck,
  IdCard,
  Loader2,
  Users2,
  Building2,
  Briefcase,
  Wallet,
  CheckCircle2,
  ScanLine,
  Scan,
  KeyRound,
  Landmark,
  AlertCircle,
  Clock,
  History,
  Printer,
} from 'lucide-react'

import { api } from '@/lib/api'
import { getSchoolInfo } from '@/lib/school'
import {
  TeacherRow,
  GENDERS,
  TEACHER_TYPES,
  TEACHER_STATUS,
  DAYS,
  salaryBreakdown,
  PayrollHistoryResponse,
} from '@/lib/types'
import {
  initials,
  avatarColor,
  fmtDate,
  fmtTime,
  fmtDateTime,
  timeAgo,
  currency,
  currencyCompact,
} from '@/lib/format'

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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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

function exportTeachersCsv(rows: TeacherRow[]): void {
  const headers = [
    'Teacher ID',
    'Fingerprint ID',
    'Full Name',
    'Type',
    'Gender',
    'Phone',
    'Email',
    'NIC',
    'Qualification',
    'Specialization',
    'Status',
    'Hire Date',
    'Monthly Rate (LKR)',
    'Classes',
  ]
  const lines = rows.map((r) =>
    [
      r.teacherId,
      r.fingerprintId || '',
      r.fullName,
      r.type,
      r.gender || '',
      r.phone || '',
      r.email || '',
      r.nic || '',
      r.qualification || '',
      r.specialization || '',
      r.status,
      r.hireDate ? toDateInput(r.hireDate) : '',
      String(r.monthlyRate ?? 0),
      String(r._count?.classes ?? 0),
    ]
      .map(csvEscape)
      .join(','),
  )
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sanomin-teachers-${new Date().toISOString().slice(0, 10)}.csv`
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
  'On Leave': 'outline',
}

// ─── List response shape ───────────────────────────────────────────────────
interface ListResponse {
  data: TeacherRow[]
  total: number
  page: number
  limit: number
  stats: {
    totalTeachers: number
    internalCount: number
    externalCount: number
    onLeaveCount: number
    filteredCount: number
  }
}

// ─── Type filter tabs (All / Internal / External) ──────────────────────────
type TypeFilter = 'All' | 'Internal' | 'External'

// ─── Main section component ────────────────────────────────────────────────
export function TeachersSection() {
  const [rows, setRows] = useState<TeacherRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({
    totalTeachers: 0,
    internalCount: 0,
    externalCount: 0,
    onLeaveCount: 0,
    filteredCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // filters
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  // dialog state
  const [addEditOpen, setAddEditOpen] = useState(false)
  const [editing, setEditing] = useState<TeacherRow | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileTeacher, setProfileTeacher] = useState<TeacherRow | null>(null)
  const [fpOpen, setFpOpen] = useState(false)
  const [fpTarget, setFpTarget] = useState<TeacherRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeacherRow | null>(null)

  const hasFilters = Boolean(q || status || typeFilter !== 'All')

  const setFilter = useCallback(
    <K extends 'q' | 'status'>(key: K, value: string) => {
      setPage(1)
      if (key === 'q') setQ(value)
      else setStatus(value)
    },
    [],
  )

  const setTypeTab = useCallback((v: TypeFilter) => {
    setTypeFilter(v)
    setPage(1)
  }, [])

  const clearFilters = useCallback(() => {
    setQ('')
    setStatus('')
    setTypeFilter('All')
    setPage(1)
  }, [])

  const queryParams = useMemo(() => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (typeFilter !== 'All') p.set('type', typeFilter)
    if (status) p.set('status', status)
    p.set('page', String(page))
    p.set('limit', String(PAGE_SIZE))
    return p.toString()
  }, [q, typeFilter, status, page])

  // Fetch list — debounced via setTimeout; setState only inside async callback
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      if (!alive) return
      setLoading(true)
      api<ListResponse>(`/api/teachers?${queryParams}`)
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
    api<ListResponse>(`/api/teachers?${queryParams}`)
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

  // Action handlers
  const openAdd = useCallback(() => {
    setEditing(null)
    setAddEditOpen(true)
  }, [])

  const openEdit = useCallback((t: TeacherRow) => {
    setEditing(t)
    setAddEditOpen(true)
  }, [])

  const openProfile = useCallback((t: TeacherRow) => {
    setProfileTeacher(t)
    setProfileOpen(true)
  }, [])

  const openFingerprint = useCallback((t: TeacherRow) => {
    setFpTarget(t)
    setFpOpen(true)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await api(`/api/teachers/${deleteTarget.id}`, { method: 'DELETE' })
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

  // Σ net take-home over all loaded teachers. Rate-only external teachers
  // (no basic salary / allowances) fall back to their monthly tuition rate,
  // since statutory EPF/ETF does not apply to them.
  const monthlyPayroll = useMemo(
    () =>
      rows.reduce((sum, t) => {
        if (t.type === 'External' && !t.basicSalary && !t.allowances) {
          return sum + (t.monthlyRate || 0)
        }
        return sum + salaryBreakdown(t.basicSalary, t.allowances).netSalary
      }, 0),
    [rows],
  )

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Teachers"
        description="Manage internal staff and external tuition teachers. Track fingerprints, classes, and contact details."
        icon={<Users className="h-5 w-5" />}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportTeachersCsv(rows)}
              disabled={rows.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add Teacher
            </Button>
          </>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Total teachers"
          value={stats.totalTeachers}
          icon={Users2}
          accent="blue"
          hint="Internal + External"
        />
        <StatCard
          label="Internal staff"
          value={stats.internalCount}
          icon={Building2}
          accent="green"
          hint="On-roll employees"
        />
        <StatCard
          label="External tuition"
          value={stats.externalCount}
          icon={Briefcase}
          accent="purple"
          hint="Visiting teachers"
        />
        <StatCard
          label="On leave"
          value={stats.onLeaveCount}
          icon={Fingerprint}
          accent="amber"
          hint="Currently inactive"
        />
        <StatCard
          label="Monthly payroll"
          value={currencyCompact(monthlyPayroll)}
          icon={Wallet}
          accent="green"
          hint="Net take-home · incl. EPF"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Type tabs (segmented control) */}
      <Tabs
        value={typeFilter}
        onValueChange={(v) => setTypeTab(v as TypeFilter)}
      >
        <TabsList>
          <TabsTrigger value="All">All</TabsTrigger>
          <TabsTrigger value="Internal">Internal</TabsTrigger>
          <TabsTrigger value="External">External</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:gap-2 sm:p-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, teacher ID, fingerprint or phone…"
            value={q}
            onChange={(e) => setFilter('q', e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select
            value={status || 'ALL'}
            onValueChange={(v) => setFilter('status', v === 'ALL' ? '' : v)}
          >
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All status</SelectItem>
              {TEACHER_STATUS.map((s) => (
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
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="max-h-[60vh] overflow-y-auto scroll-thin">
          <Table className="table-zebra">
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <TableRow>
                <TableHead className="min-w-[220px]">Teacher</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Specialization</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-center">Classes</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3 w-36" />
                          <Skeleton className="h-2.5 w-20" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-2.5 w-32" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="mx-auto h-5 w-8" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-7 w-7 rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={Users}
                      title={hasFilters ? 'No matching teachers' : 'No teachers yet'}
                      description={
                        hasFilters
                          ? 'Try adjusting your search or filters.'
                          : 'Add your first teacher — internal staff or external tuition teacher.'
                      }
                      action={
                        <Button size="sm" onClick={openAdd}>
                          <Plus className="h-4 w-4" />
                          Add Teacher
                        </Button>
                      }
                      className="m-4"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((t) => (
                  <TeacherTableRow
                    key={t.id}
                    teacher={t}
                    onView={() => openProfile(t)}
                    onEdit={() => openEdit(t)}
                    onManageFingerprint={() => openFingerprint(t)}
                    onDelete={() => setDeleteTarget(t)}
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
        <AddEditTeacherDialog
          teacher={editing}
          onClose={() => setAddEditOpen(false)}
          onSaved={(msg) => {
            toast.success(msg)
            setAddEditOpen(false)
            reload()
          }}
        />
      )}

      {profileOpen && profileTeacher && (
        <ProfileDialog
          teacher={profileTeacher}
          onClose={() => setProfileOpen(false)}
          onEdit={() => {
            setProfileOpen(false)
            openEdit(profileTeacher)
          }}
          onManageFingerprint={() => {
            setProfileOpen(false)
            openFingerprint(profileTeacher)
          }}
        />
      )}

      {fpOpen && fpTarget && (
        <ManageFingerprintDialog
          teacher={fpTarget}
          onClose={() => setFpOpen(false)}
          onSaved={(msg) => {
            toast.success(msg)
            setFpOpen(false)
            reload()
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete teacher?"
        description={
          deleteTarget
            ? `This permanently removes ${deleteTarget.fullName} (${deleteTarget.teacherId}) and all related attendance records. Assigned classes will be unassigned but not deleted.`
            : ''
        }
        confirmText="Delete"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ─── Teacher table row ─────────────────────────────────────────────────────
function TeacherTableRow({
  teacher,
  onView,
  onEdit,
  onManageFingerprint,
  onDelete,
}: {
  teacher: TeacherRow
  onView: () => void
  onEdit: () => void
  onManageFingerprint: () => void
  onDelete: () => void
}) {
  const classesCount = teacher._count?.classes ?? teacher.classes.length
  const specs = (teacher.specialization || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const rateOnlyExternal =
    teacher.type === 'External' && !teacher.basicSalary && !teacher.allowances
  const sb = salaryBreakdown(teacher.basicSalary, teacher.allowances)
  const netPay = rateOnlyExternal ? teacher.monthlyRate : sb.netSalary
  const grossPay = rateOnlyExternal ? teacher.monthlyRate : sb.gross

  return (
    <TableRow className="cursor-pointer" onClick={onView}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-9 ring-1 ring-border">
            <AvatarFallback className={avatarColor(teacher.fullName)}>
              {initials(teacher.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">
              {teacher.fullName}
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {teacher.teacherId}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Wallet className="h-3 w-3 shrink-0" />
              <span
                className="truncate tabular-nums"
                title={`Gross ${currency(grossPay)} / month`}
              >
                Net {currency(netPay)}/mo
              </span>
              {teacher.epfNo && (
                <Badge
                  variant="outline"
                  className="h-4 shrink-0 px-1 text-[9px] leading-none"
                >
                  EPF #{teacher.epfNo}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {teacher.type === 'Internal' ? (
          <Badge
            variant="outline"
            className="border-blue-500/30 bg-blue-500/15 font-medium text-blue-700 dark:text-blue-300"
          >
            <Building2 className="h-3 w-3" />
            Internal
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-purple-500/30 bg-purple-500/15 font-medium text-purple-700 dark:text-purple-300"
          >
            <Briefcase className="h-3 w-3" />
            External
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {specs.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {specs.slice(0, 3).map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="flex items-center gap-1.5 font-mono text-xs text-foreground">
            <Phone className="h-3 w-3 text-muted-foreground" />
            {teacher.phone || '—'}
          </div>
          <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{teacher.email || '—'}</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md bg-muted px-1.5 text-xs font-semibold text-foreground">
          {classesCount}
        </span>
      </TableCell>
      <TableCell>
        {teacher.hireDate ? (
          <span className="text-xs text-muted-foreground" title={fmtDate(teacher.hireDate)}>
            {fmtDate(teacher.hireDate)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {teacher.lastActive ? (
          <div className="flex flex-col">
            <span className="text-xs font-medium text-foreground" title={fmtDateTime(teacher.lastActive)}>
              {timeAgo(teacher.lastActive)}
            </span>
            <span className="text-[10px] text-muted-foreground">{fmtDate(teacher.lastActive)}</span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Never
          </span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[teacher.status] || 'secondary'}>
          {teacher.status}
        </Badge>
      </TableCell>
      <TableCell>
        {teacher.fingerprintId ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-foreground">
            <Fingerprint className="h-3.5 w-3.5 text-primary" />
            {teacher.fingerprintId}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" />
            Not enrolled
          </span>
        )}
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
              <DropdownMenuItem onClick={onManageFingerprint}>
                <Fingerprint className="mr-2 h-4 w-4" />
                Manage fingerprint
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
interface FormState {
  fullName: string
  type: string
  gender: string
  phone: string
  email: string
  address: string
  nic: string
  qualification: string
  specialization: string
  status: string
  hireDate: string
  monthlyRate: string
  basicSalary: string
  allowances: string
  epfNo: string
  salaryNote: string
  fingerprintId: string
  photoUrl: string
}

function emptyForm(): FormState {
  return {
    fullName: '',
    type: 'Internal',
    gender: 'Male',
    phone: '',
    email: '',
    address: '',
    nic: '',
    qualification: '',
    specialization: '',
    status: 'Active',
    hireDate: toDateInput(new Date().toISOString()),
    monthlyRate: '0',
    basicSalary: '0',
    allowances: '0',
    epfNo: '',
    salaryNote: '',
    fingerprintId: '',
    photoUrl: '',
  }
}

function formFromTeacher(t: TeacherRow): FormState {
  return {
    fullName: t.fullName,
    type: t.type,
    gender: t.gender || 'Male',
    phone: t.phone || '',
    email: t.email || '',
    address: t.address || '',
    nic: t.nic || '',
    qualification: t.qualification || '',
    specialization: t.specialization || '',
    status: t.status,
    hireDate: toDateInput(t.hireDate),
    monthlyRate: String(t.monthlyRate ?? 0),
    basicSalary: String(t.basicSalary ?? 0),
    allowances: String(t.allowances ?? 0),
    epfNo: t.epfNo || '',
    salaryNote: t.salaryNote || '',
    fingerprintId: t.fingerprintId || '',
    photoUrl: t.photoUrl || '',
  }
}

// Generate a random FP-{4-digit} fingerprint id (demo only)
function randomFingerprintId(): string {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `FP-${n}`
}

function AddEditTeacherDialog({
  teacher,
  onClose,
  onSaved,
}: {
  teacher: TeacherRow | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  // Lazy initial state — runs once when dialog mounts
  const [form, setForm] = useState<FormState>(() =>
    teacher ? formFromTeacher(teacher) : emptyForm(),
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isEdit = teacher !== null
  const isExternal = form.type === 'External'

  // Live salary breakdown — recomputed on every keystroke
  const sb = salaryBreakdown(
    Number(form.basicSalary || 0),
    Number(form.allowances || 0),
  )

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const handleSubmit = async () => {
    setErr(null)
    if (!form.fullName.trim()) {
      setErr('Full name is required')
      return
    }

    const monthlyRateNum = Number(form.monthlyRate || 0)
    if (isNaN(monthlyRateNum) || monthlyRateNum < 0) {
      setErr('Monthly rate must be a non-negative number')
      return
    }

    const basicSalaryNum = Number(form.basicSalary || 0)
    if (isNaN(basicSalaryNum) || basicSalaryNum < 0) {
      setErr('Basic salary must be a non-negative number')
      return
    }

    const allowancesNum = Number(form.allowances || 0)
    if (isNaN(allowancesNum) || allowancesNum < 0) {
      setErr('Allowances must be a non-negative number')
      return
    }

    const payload = {
      fullName: form.fullName.trim(),
      type: form.type,
      gender: form.gender || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      nic: form.nic || null,
      qualification: form.qualification || null,
      specialization: form.specialization || null,
      status: form.status,
      hireDate: form.hireDate || null,
      monthlyRate: monthlyRateNum,
      basicSalary: basicSalaryNum,
      allowances: allowancesNum,
      epfNo: form.epfNo.trim() || null,
      salaryNote: form.salaryNote.trim() || null,
      fingerprintId: form.fingerprintId || null,
      photoUrl: form.photoUrl || null,
    }

    setSaving(true)
    try {
      if (isEdit && teacher) {
        const updated = await api<TeacherRow>(
          `/api/teachers/${teacher.id}`,
          { method: 'PUT', body: JSON.stringify(payload) },
        )
        onSaved(`Updated ${updated.fullName}`)
      } else {
        const created = await api<TeacherRow>('/api/teachers', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        onSaved(`Added ${created.fullName} (${created.teacherId})`)
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
      <DialogContent className="max-h-[90vh] overflow-y-auto scroll-thin sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit teacher' : 'Add new teacher'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update profile for ${teacher?.fullName} (${teacher?.teacherId}).`
              : 'Add an internal staff member or external tuition teacher. Teacher ID is generated automatically.'}
          </DialogDescription>
        </DialogHeader>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}

        <div className="grid gap-4 py-1">
          {/* Identity */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name *" className="sm:col-span-2">
              <Input
                value={form.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                placeholder="e.g. Mrs. Kumari Jayawardena"
              />
            </Field>
            <Field label="Teacher type *">
              <RadioGroup
                value={form.type}
                onValueChange={(v) => updateField('type', v)}
                className="flex gap-4"
              >
                {TEACHER_TYPES.map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <RadioGroupItem id={`type-${t}`} value={t} />
                    <Label htmlFor={`type-${t}`} className="font-normal">
                      {t}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </Field>
            <Field label="Gender">
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
          </div>

          {/* Contact */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="077 123 4567"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="name@sanomin.lk"
              />
            </Field>
            <Field label="NIC">
              <Input
                value={form.nic}
                onChange={(e) => updateField('nic', e.target.value)}
                placeholder="e.g. 851234567V"
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="No. 12, Temple Road, Colombo"
              />
            </Field>
          </div>

          {/* Professional */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Qualification">
              <Input
                value={form.qualification}
                onChange={(e) => updateField('qualification', e.target.value)}
                placeholder="e.g. Dip. in Early Childhood"
              />
            </Field>
            <Field label="Specialization (comma separated)">
              <Input
                value={form.specialization}
                onChange={(e) => updateField('specialization', e.target.value)}
                placeholder="e.g. Preschool, Daycare"
              />
            </Field>
          </div>

          {/* Employment + fingerprint */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(v) => updateField('status', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEACHER_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Hire date">
              <Input
                type="date"
                value={form.hireDate}
                onChange={(e) => updateField('hireDate', e.target.value)}
              />
            </Field>
            <Field
              label={
                isExternal
                  ? 'Monthly rate (LKR) — tuition fee'
                  : 'Monthly rate (LKR)'
              }
              hint={isExternal ? 'Per-class rate paid to external teacher' : undefined}
            >
              <Input
                type="number"
                min={0}
                step={500}
                value={form.monthlyRate}
                onChange={(e) => updateField('monthlyRate', e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Photo URL (optional)">
              <Input
                value={form.photoUrl}
                onChange={(e) => updateField('photoUrl', e.target.value)}
                placeholder="https://…/photo.jpg"
              />
            </Field>
            <Field label="Fingerprint ID" className="sm:col-span-2">
              <div className="flex gap-2">
                <Input
                  value={form.fingerprintId}
                  onChange={(e) => updateField('fingerprintId', e.target.value)}
                  placeholder="FP-1008 — leave blank to skip"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    updateField('fingerprintId', randomFingerprintId())
                  }
                >
                  <Fingerprint className="h-4 w-4" />
                  Generate
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Generate a demo ID or use the dedicated fingerprint enrollment
                scanner under <span className="font-medium">Manage fingerprint</span>.
              </p>
            </Field>
          </div>

          {/* Salary & EPF */}
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-border">
                <Landmark className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">
                  {isExternal ? 'Salary / Rate & EPF' : 'Salary & EPF'}
                </p>
                <p className="text-xs text-muted-foreground">
                  EPF/ETF are computed on basic salary only — allowances are
                  fully take-home
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Basic salary (LKR)">
                <Input
                  type="number"
                  min={0}
                  step={500}
                  value={form.basicSalary}
                  onChange={(e) => updateField('basicSalary', e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Allowances (LKR)">
                <Input
                  type="number"
                  min={0}
                  step={500}
                  value={form.allowances}
                  onChange={(e) => updateField('allowances', e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="EPF No">
                <Input
                  value={form.epfNo}
                  onChange={(e) => updateField('epfNo', e.target.value)}
                  placeholder="e.g. EPF/CS/2/1458"
                  className="font-mono"
                />
              </Field>
              <Field label="Salary note" className="sm:col-span-2">
                <Textarea
                  value={form.salaryNote}
                  onChange={(e) => updateField('salaryNote', e.target.value)}
                  placeholder="Optional — e.g. includes Rs. 5,000 transport allowance"
                  className="min-h-16"
                  rows={2}
                />
              </Field>
            </div>

            {/* Live breakdown */}
            <div className="mt-3 rounded-md border bg-background p-3">
              <div className="grid gap-1.5 text-sm">
                <BreakdownRow
                  label="Gross salary (basic + allowances)"
                  value={currency(sb.gross)}
                />
                <BreakdownRow
                  label="EPF employee (−8% of basic)"
                  value={`−${currency(sb.epfEmployee)}`}
                />
                <div className="flex items-center justify-between gap-4 border-t border-dashed pt-1.5">
                  <span className="font-medium text-muted-foreground">
                    Net take-home
                  </span>
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {currency(sb.netSalary)}
                  </span>
                </div>
                <BreakdownRow
                  label="EPF employer (12% of basic)"
                  value={currency(sb.epfEmployer)}
                  muted
                />
                <BreakdownRow
                  label="ETF employer (3% of basic)"
                  value={currency(sb.etfEmployer)}
                  muted
                />
                <div className="flex items-center justify-between gap-4 border-t pt-1.5">
                  <span className="font-medium text-muted-foreground">
                    Total institute cost
                  </span>
                  <span className="font-semibold tabular-nums text-primary">
                    {currency(sb.employerCost)}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                EPF 8% employee · 12% + 3% employer (calculated on basic salary
                — Sri Lanka statutory rates)
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create teacher'}
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
  hint,
}: {
  label: string
  children: React.ReactNode
  className?: string
  hint?: string
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// One label/value line inside the salary breakdown panel
function BreakdownRow({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={muted ? 'text-muted-foreground' : 'text-foreground/80'}>
        {label}
      </span>
      <span
        className={`font-medium tabular-nums ${
          muted ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Manage Fingerprint dialog (simulated scanner) ─────────────────────────
function ManageFingerprintDialog({
  teacher,
  onClose,
  onSaved,
}: {
  teacher: TeacherRow
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [scanning, setScanning] = useState(false)
  const [stage, setStage] = useState<'idle' | 'scanning' | 'enrolled'>('idle')
  const [newFp, setNewFp] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const currentFp = teacher.fingerprintId

  const runScan = () => {
    if (scanning) return
    setScanning(true)
    setStage('scanning')
    setErr(null)
    // Simulate the fingerprint reader taking ~1.8s to capture the template
    setTimeout(() => {
      const generated = randomFingerprintId()
      setNewFp(generated)
      setStage('enrolled')
      setScanning(false)
    }, 1800)
  }

  const commit = async (fpToSet: string | null) => {
    setSaving(true)
    setErr(null)
    try {
      await api<TeacherRow>(`/api/teachers/${teacher.id}`, {
        method: 'PUT',
        body: JSON.stringify({ fingerprintId: fpToSet }),
      })
      onSaved(
        fpToSet
          ? `Fingerprint ${fpToSet} enrolled for ${teacher.fullName}`
          : `Fingerprint removed from ${teacher.fullName}`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save fingerprint'
      setErr(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleEnroll = () => {
    if (newFp) commit(newFp)
  }

  const handleRemove = () => {
    commit(null)
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage fingerprint</DialogTitle>
          <DialogDescription>
            Enroll or remove the fingerprint template used for teacher attendance
            via the USB fingerprint scanner.
          </DialogDescription>
        </DialogHeader>

        {/* Identity strip */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <Avatar className="size-10 ring-1 ring-border">
            <AvatarFallback className={avatarColor(teacher.fullName)}>
              {initials(teacher.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{teacher.fullName}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {teacher.teacherId}
            </p>
          </div>
        </div>

        {/* Simulated scanner panel */}
        <div className="flex flex-col items-center gap-4 rounded-xl border bg-gradient-to-br from-muted/40 to-background p-6">
          <div className="relative flex size-28 items-center justify-center">
            {/* Pulse rings while scanning */}
            {scanning && (
              <>
                <span className="absolute inset-0 rounded-full animate-pulse-ring" />
                <span className="absolute inset-0 rounded-full animate-pulse-ring [animation-delay:600ms]" />
              </>
            )}
            <div
              className={`flex size-28 items-center justify-center rounded-full border-2 ${
                scanning
                  ? 'border-primary bg-primary/10'
                  : stage === 'enrolled'
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-border bg-muted'
              }`}
            >
              {stage === 'enrolled' ? (
                <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Fingerprint
                  className={`h-12 w-12 ${
                    scanning
                      ? 'text-primary'
                      : 'text-muted-foreground'
                  }`}
                />
              )}
            </div>
          </div>

          {/* Status text */}
          <div className="text-center">
            {stage === 'idle' && (
              <>
                <p className="text-sm font-medium">
                  {currentFp ? 'Re-enroll fingerprint' : 'Enroll fingerprint'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {currentFp ? (
                    <>
                      Currently enrolled:{' '}
                      <span className="font-mono text-foreground">
                        {currentFp}
                      </span>
                    </>
                  ) : (
                    'No fingerprint enrolled yet.'
                  )}
                </p>
              </>
            )}
            {stage === 'scanning' && (
              <>
                <p className="text-sm font-medium text-primary">
                  Scanning… place finger on the reader
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Capturing fingerprint template
                </p>
              </>
            )}
            {stage === 'enrolled' && newFp && (
              <>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  Template captured
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  New ID:{' '}
                  <span className="font-mono text-foreground">{newFp}</span>
                </p>
              </>
            )}
          </div>

          {err && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
              {err}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex w-full flex-col gap-2">
            {stage !== 'enrolled' ? (
              <Button
                onClick={runScan}
                disabled={scanning || saving}
                className="w-full"
              >
                {scanning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scanning…
                  </>
                ) : currentFp ? (
                  <>
                    <Scan className="h-4 w-4" />
                    Re-enroll / Scan
                  </>
                ) : (
                  <>
                    <ScanLine className="h-4 w-4" />
                    Start scan
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleEnroll}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Save enrollment
              </Button>
            )}

            {currentFp && stage !== 'enrolled' && (
              <Button
                variant="outline"
                onClick={handleRemove}
                disabled={scanning || saving}
                className="w-full text-destructive hover:text-destructive"
              >
                <KeyRound className="h-4 w-4" />
                Remove fingerprint
              </Button>
            )}

            {stage === 'enrolled' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStage('idle')
                  setNewFp(null)
                }}
                disabled={saving}
                className="w-full"
              >
                Rescan
              </Button>
            )}
          </div>
        </div>

        {/* Simulation disclaimer */}
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">Demo scanner</span> — in production
            this reads from the USB fingerprint device and stores the encrypted
            template; here it generates a placeholder FP-{`{4-digit}`} ID.
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Profile dialog (View) ─────────────────────────────────────────────────
interface ClassDetail {
  id: string
  name: string
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  room: string | null
  program: {
    id: string
    code: string
    name: string
    color: string
  } | null
}

interface TeacherDetail extends TeacherRow {
  classes: ClassDetail[]
}

/** "2026-09" → "Sep 2026" */
function payrollMonthLabel(m: string): string {
  const [y, mm] = m.split('-').map((n) => parseInt(n, 10))
  if (isNaN(y) || isNaN(mm)) return m
  return new Date(y, mm - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

// ─── Payslip print / save-as-PDF ───────────────────────────────────────────
// Opens a print-ready payslip window for one payroll month entry. Users can
// print it or save it as PDF via the browser print dialog.
async function printPayslip(
  teacher: { fullName: string; teacherId: string; type: string; epfNo?: string | null },
  entry: {
    month: string
    gross: number
    netSalary: number
    epfEmployee: number
    epfEmployer: number
    etfEmployer: number
    status: string
    method: string | null
    paidDate: string | null
    note: string | null
  },
) {
  const win = window.open('', '_blank', 'width=860,height=1000')
  if (!win) {
    toast.error('Pop-up blocked — allow pop-ups to print payslips.')
    return
  }
  // Institute branding from Settings (single cached fetch per session)
  const school = await getSchoolInfo()
  const lkr = (n: number) =>
    `LKR ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const epfNo = teacher.epfNo ? String(teacher.epfNo) : '—'
  const paid = entry.status === 'Paid'
  // EPF employee is 8% of basic → recover basic; when absent (external
  // rate-only teachers) the whole gross is shown as the rate.
  const basic = entry.epfEmployee > 0 ? entry.epfEmployee / 0.08 : 0
  const basicRow = basic > 0 ? basic : entry.gross
  const allowRow = Math.max(0, entry.gross - basicRow)
  const generated = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Payslip — ${teacher.fullName} — ${payrollMonthLabel(entry.month)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; background: #f1f5f9; color: #0f172a; padding: 24px; }
  .sheet { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
  .head { display: flex; justify-content: space-between; align-items: center; padding: 22px 28px; background: #0f172a; color: #fff; }
  .brand { font-size: 19px; font-weight: 700; letter-spacing: .4px; }
  .brand small { display: block; font-size: 10.5px; font-weight: 400; opacity: .75; margin-top: 2px; letter-spacing: 2.2px; text-transform: uppercase; }
  .slip { text-align: right; }
  .slip h2 { font-size: 18px; letter-spacing: 3px; }
  .slip p { font-size: 12px; opacity: .8; margin-top: 2px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 20px 28px; border-bottom: 1px solid #e2e8f0; }
  .meta .cell .k { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  .meta .cell .v { font-size: 13.5px; font-weight: 600; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; padding: 12px 28px 8px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 10px 28px; border-bottom: 1px solid #f1f5f9; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 700; background: #f8fafc; }
  .net { display: flex; justify-content: space-between; align-items: center; margin: 20px 28px; padding: 16px 20px; border-radius: 10px; background: #ecfdf5; border: 1px solid #a7f3d0; }
  .net .k { font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #065f46; font-weight: 700; }
  .net .v { font-size: 22px; font-weight: 800; color: #047857; font-variant-numeric: tabular-nums; }
  .note { margin: 0 28px 18px; font-size: 12.5px; color: #475569; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px 14px; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; padding: 18px 28px 24px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  .sig { text-align: center; font-size: 11px; color: #475569; }
  .sig .line { width: 180px; border-top: 1px solid #94a3b8; margin-top: 34px; padding-top: 4px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .badge.paid { background: #d1fae5; color: #065f46; }
  .badge.pending { background: #fef3c7; color: #92400e; }
  @media print { body { background: #fff; padding: 0; } .sheet { border: none; border-radius: 0; } }
</style></head>
<body>
  <div class="sheet">
    <div class="head">
      <div style="display:flex;align-items:center;gap:12px;">
        <img src="/sanomin-logo.jpg" alt="${school.shortName}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,.25);" />
        <div class="brand">${school.shortName}<small>${school.subtitle}</small></div>
      </div>
      <div class="slip"><h2>PAYSLIP</h2><p>${payrollMonthLabel(entry.month)}</p><p style="font-size:10px;opacity:.65;text-transform:none;letter-spacing:.2px;">${[school.address, school.phone].filter(Boolean).join(' · ')}</p></div>
    </div>
    <div class="meta">
      <div class="cell"><div class="k">Employee</div><div class="v">${teacher.fullName}</div></div>
      <div class="cell"><div class="k">Employee ID</div><div class="v">${teacher.teacherId}</div></div>
      <div class="cell"><div class="k">Employment</div><div class="v">${teacher.type} teacher</div></div>
      <div class="cell"><div class="k">EPF Number</div><div class="v">${epfNo}</div></div>
      <div class="cell"><div class="k">Payment method</div><div class="v">${entry.method || '—'}</div></div>
      <div class="cell"><div class="k">Status</div><div class="v"><span class="badge ${paid ? 'paid' : 'pending'}">${entry.status}</span>${entry.paidDate ? ` &nbsp;${new Date(entry.paidDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</div></div>
    </div>
    <table>
      <tr><th>Earnings</th><th class="num">Amount</th></tr>
      <tr><td>Basic salary</td><td class="num">${lkr(basicRow)}</td></tr>
      <tr><td>Allowances</td><td class="num">${lkr(allowRow)}</td></tr>
      <tr class="total"><td>Gross salary</td><td class="num">${lkr(entry.gross)}</td></tr>
      <tr><th>Deductions</th><th class="num">Amount</th></tr>
      <tr><td>EPF — employee (8% of basic)</td><td class="num">− ${lkr(entry.epfEmployee)}</td></tr>
      <tr class="total"><td>Total deductions</td><td class="num">− ${lkr(entry.epfEmployee)}</td></tr>
    </table>
    <div class="net"><span class="k">Net salary payable</span><span class="v">${lkr(entry.netSalary)}</span></div>
    <table>
      <tr><th>Employer contributions (paid by institute)</th><th class="num">Amount</th></tr>
      <tr><td>EPF — employer (12% of basic)</td><td class="num">${lkr(entry.epfEmployer)}</td></tr>
      <tr><td>ETF — employer (3% of basic)</td><td class="num">${lkr(entry.etfEmployer)}</td></tr>
    </table>
    ${entry.note ? `<div class="note"><strong>Note:</strong> ${entry.note}</div>` : ''}
    <div class="foot">
      <span>Generated by ${school.name} SMS · ${generated}<br/>Computer-generated payslip — no signature required.</span>
      <div class="sig"><div class="line">Authorized signature</div></div>
    </div>
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body></html>`)
  win.document.close()
}

function ProfileDialog({
  teacher,
  onClose,
  onEdit,
  onManageFingerprint,
}: {
  teacher: TeacherRow
  onClose: () => void
  onEdit: () => void
  onManageFingerprint: () => void
}) {
  // Fetch the full profile (with class details: endTime, room, program) on mount
  const [detail, setDetail] = useState<TeacherDetail | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  // Salary history (paid/pending payroll records across months)
  const [history, setHistory] = useState<PayrollHistoryResponse | null>(null)
  const [historyErr, setHistoryErr] = useState(false)

  useEffect(() => {
    let alive = true
    api<TeacherDetail>(`/api/teachers/${teacher.id}`)
      .then((d) => {
        if (!alive) return
        setDetail(d)
      })
      .catch(() => {
        if (!alive) return
        setLoadErr(true)
      })
    api<PayrollHistoryResponse>(`/api/payroll?teacher=${teacher.id}`)
      .then((d) => {
        if (!alive) return
        setHistory(d)
      })
      .catch(() => {
        if (!alive) return
        setHistoryErr(true)
      })
    return () => {
      alive = false
    }
  }, [teacher.id])

  const specs = (teacher.specialization || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // Cast: the list endpoint's classes lack program/room/endTime; the detail
  // endpoint (preferred) returns full ClassDetail rows.
  const classesList = (detail?.classes ?? teacher.classes ??
    []) as ClassDetail[]

  const sb = salaryBreakdown(teacher.basicSalary, teacher.allowances)

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto scroll-thin sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Teacher profile</DialogTitle>
          <DialogDescription>
            Full details for {teacher.fullName} ({teacher.teacherId}).
          </DialogDescription>
        </DialogHeader>

        {/* Identity header */}
        <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center">
          <Avatar className="size-16 ring-2 ring-border">
            <AvatarFallback
              className={`text-lg font-semibold ${avatarColor(teacher.fullName)}`}
            >
              {initials(teacher.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">{teacher.fullName}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{teacher.teacherId}</span>
              <span>·</span>
              <span>{teacher.gender || '—'}</span>
              <span>·</span>
              <span>{teacher.type}</span>
              {teacher.fingerprintId && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Fingerprint className="h-3 w-3 text-primary" />
                    {teacher.fingerprintId}
                  </span>
                </>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant={STATUS_VARIANT[teacher.status] || 'secondary'}>
                {teacher.status}
              </Badge>
              {teacher.type === 'Internal' ? (
                <Badge
                  variant="outline"
                  className="border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300"
                >
                  <Building2 className="h-3 w-3" />
                  Internal staff
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300"
                >
                  <Briefcase className="h-3 w-3" />
                  External tuition
                </Badge>
              )}
              {teacher.epfNo && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-700 dark:text-emerald-300"
                >
                  <Landmark className="h-3 w-3" />
                  EPF #{teacher.epfNo}
                </Badge>
              )}
              {specs.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-row gap-2 sm:flex-col">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={onManageFingerprint}>
              <Fingerprint className="h-4 w-4" />
              Fingerprint
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="classes">
              Classes
              {teacher._count && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({teacher._count.classes})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="attendance">
              Attendance
              {teacher._count && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({teacher._count.attendance})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="salary">
              <History className="h-3.5 w-3.5" />
              Salary
              {history && history.history.length > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({history.history.length})
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem
                icon={<IdCard className="h-4 w-4" />}
                label="Teacher ID"
                value={teacher.teacherId}
                mono
              />
              <DetailItem
                icon={<Fingerprint className="h-4 w-4" />}
                label="Fingerprint ID"
                value={teacher.fingerprintId || 'Not enrolled'}
                mono
              />
              <DetailItem
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={teacher.phone || '—'}
                mono
              />
              <DetailItem
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={teacher.email || '—'}
                mono
              />
              <DetailItem
                icon={<ShieldCheck className="h-4 w-4" />}
                label="NIC"
                value={teacher.nic || '—'}
                mono
              />
              <DetailItem
                icon={<GraduationCap className="h-4 w-4" />}
                label="Qualification"
                value={teacher.qualification || '—'}
              />
              <DetailItem
                icon={<CalendarDays className="h-4 w-4" />}
                label="Hire date"
                value={fmtDate(teacher.hireDate)}
              />
              {teacher.type === 'External' && (
                <DetailItem
                  icon={<Wallet className="h-4 w-4" />}
                  label="Monthly rate (tuition)"
                  value={currency(teacher.monthlyRate)}
                />
              )}
              {(teacher.type === 'Internal' ||
                teacher.basicSalary > 0 ||
                teacher.allowances > 0) && (
                <>
                  <DetailItem
                    icon={<Wallet className="h-4 w-4" />}
                    label="Net salary (incl. EPF)"
                    value={currency(sb.netSalary)}
                    sub={`Gross ${currency(sb.gross)} = basic ${currency(teacher.basicSalary)} + allowances ${currency(teacher.allowances)}`}
                  />
                  <DetailItem
                    icon={<Landmark className="h-4 w-4" />}
                    label="Employer EPF + ETF"
                    value={currency(sb.employerCost)}
                    sub="EPF 12% + ETF 3% on basic salary"
                  />
                </>
              )}
              {teacher.salaryNote && (
                <DetailItem
                  icon={<Landmark className="h-4 w-4" />}
                  label="Salary note"
                  value={teacher.salaryNote}
                  fullSpan
                />
              )}
              <DetailItem
                icon={<MapPin className="h-4 w-4" />}
                label="Address"
                value={teacher.address || '—'}
                fullSpan
              />
            </div>

            {/* Specializations callout */}
            {specs.length > 0 && (
              <div className="mt-4 rounded-md border bg-muted/20 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                  <GraduationCap className="h-4 w-4" />
                  Specializations
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {specs.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs font-medium ring-1 ring-border"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="classes" className="mt-3">
            {loadErr ? (
              <EmptyState
                icon={AlertCircle}
                title="Couldn't load class details"
                description="Try reopening the profile."
                className="border-dashed"
              />
            ) : !detail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : classesList.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No classes assigned"
                description="This teacher hasn't been assigned to any classes yet."
                className="border-dashed"
              />
            ) : (
              <div className="space-y-2">
                {classesList.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {c.program ? (
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: c.program.color }}
                        />
                      ) : (
                        <span className="size-3 shrink-0 rounded-full bg-muted-foreground/30" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.program ? `${c.program.name} · ` : ''}
                          {c.dayOfWeek || '—'}
                          {c.startTime ? ` · ${fmtTime(c.startTime)}` : ''}
                          {c.endTime ? `–${fmtTime(c.endTime)}` : ''}
                        </p>
                      </div>
                    </div>
                    {c.room && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {c.room}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="attendance" className="mt-3">
            <EmptyState
              icon={CalendarDays}
              title="Attendance summary coming soon"
              description="The teacher attendance dashboard will be available once the attendance module is finalized."
              className="border-dashed"
            />
          </TabsContent>

          <TabsContent value="salary" className="mt-3">
            {historyErr ? (
              <EmptyState
                icon={AlertCircle}
                title="Couldn't load salary history"
                description="Try reopening the profile."
                className="border-dashed"
              />
            ) : !history ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : history.history.length === 0 ? (
              <EmptyState
                icon={Landmark}
                title="No payroll records yet"
                description="This teacher has no payroll history. Mark salaries as paid in the Payroll section to build their history."
                className="border-dashed"
              />
            ) : (
              <div className="space-y-3">
                {/* Summary strip */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Paid to date</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {currency(history.totalPaid)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      across {history.paidCount} paid month
                      {history.paidCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Current net salary</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums">
                      {currency(
                        teacher.type === 'External' &&
                          !teacher.basicSalary &&
                          !teacher.allowances
                          ? teacher.monthlyRate
                          : sb.netSalary,
                      )}
                      <span className="text-xs font-normal text-muted-foreground"> /mo</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {teacher.epfNo ? `EPF #${teacher.epfNo}` : 'No EPF number set'}
                    </p>
                  </div>
                </div>

                {/* History rows */}
                <div className="scroll-thin max-h-64 space-y-2 overflow-y-auto pr-1">
                  {history.history.map((h) => {
                    const paid = h.status === 'Paid'
                    return (
                      <div
                        key={h.month}
                        className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">
                              {payrollMonthLabel(h.month)}
                            </p>
                            <Badge
                              variant="outline"
                              className={
                                paid
                                  ? 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              }
                            >
                              {h.status}
                            </Badge>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            Gross {currency(h.gross)} · EPF −{currency(h.epfEmployee)}
                            {h.method
                              ? ` · ${h.method}${h.paidDate ? ` · ${fmtDate(h.paidDate)}` : ''}`
                              : ''}
                          </p>
                          {h.note && (
                            <p className="truncate text-[11px] italic text-muted-foreground">
                              “{h.note}”
                            </p>
                          )}
                        </div>
                        <p
                          className={`shrink-0 text-sm font-semibold tabular-nums ${
                            paid ? 'text-emerald-600 dark:text-emerald-400' : ''
                          }`}
                        >
                          {currency(h.netSalary)}
                        </p>
                        <Button
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          title={`Print / save payslip for ${payrollMonthLabel(h.month)}`}
                          aria-label={`Print payslip for ${payrollMonthLabel(h.month)}`}
                          onClick={() => printPayslip(teacher, h)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
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
  sub,
  mono,
  fullSpan,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  mono?: boolean
  fullSpan?: boolean
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-md border bg-muted/20 p-2.5 ${
        fullSpan ? 'sm:col-span-2' : ''
      }`}
    >
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-border">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-sm font-medium ${
            mono ? 'font-mono' : ''
          } truncate`}
        >
          {value}
        </p>
        {sub && (
          <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
        )}
      </div>
    </div>
  )
}
