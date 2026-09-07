'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadialBarChart,
  RadialBar,
} from 'recharts'
import { api } from '@/lib/api'
import { SectionHeader } from '@/components/shared/section-header'
import { StatCard } from '@/components/shared/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  FileBarChart,
  Users,
  ScanLine,
  Clock,
  TrendingUp,
  TrendingDown,
  Download,
  GraduationCap,
  CalendarCheck,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Banknote,
  Landmark,
  ReceiptText,
  Briefcase,
  AlertCircle,
} from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
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
import { initials, avatarColor, fmtDate, currency, currencyCompact } from '@/lib/format'

interface AttendanceReport {
  range: { from: string; to: string }
  totals: { records: number; studentRecords: number; teacherRecords: number; present: number; late: number; absent: number }
  daily: { date: string; students: number; teachers: number; late: number; present: number }[]
  methodCount: Record<string, number>
  statusCount: Record<string, number>
  programCount: { code: string; name: string; color: string; count: number }[]
  teacherTypeCount: { Internal: number; External: number }
  topAttendees: { name: string; ref: string; type: string; count: number }[]
}

interface EnrollmentReport {
  totals: { students: number; active: number; inactive: number; graduated: number; recentAdmissions: number }
  byProgram: { code: string; name: string; color: string; count: number; classes: number }[]
  byAgeGroup: Record<string, number>
  byGender: { Male: number; Female: number }
  byReligion: Record<string, number>
  byStatus: Record<string, number>
  byNationality: Record<string, number>
  recentAdmissions: { studentId: string; fullName: string; gender: string; admissionDate: string | null; programs: string[] }[]
}

interface HeatmapCell {
  day: number | null
  present: number
  late: number
  absent: number
  students: number
  teachers: number
  rate: number | null
  isFuture: boolean
  isToday: boolean
}
interface HeatmapReport {
  month: string
  monthLabel: string
  totalStudents: number
  daysInMonth: number
  activeDays: number
  cells: HeatmapCell[]
  summary: {
    present: number
    late: number
    absent: number
    avgRate: number
    bestDay: { day: number; rate: number } | null
    worstDay: { day: number; rate: number } | null
  }
}

interface FinancialReport {
  month: string
  monthLabel: string
  fees: { billed: number; collected: number; outstanding: number; billCount: number }
  programRevenue: {
    total: number
    programs: {
      code: string
      name: string
      color: string
      billed: number
      bills: number
      students: number
      sharePct: number
    }[]
  }
  expenses: {
    total: number
    count: number
    byCategory: { category: string; total: number; count: number }[]
    byMethod: Record<string, number>
  }
  payroll: {
    teacherCount: number
    paidCount: number
    pendingCount: number
    totalNet: number
    totalEmployerCost: number
  }
  revenueShare: {
    classes: {
      classId: string
      className: string
      program: string | null
      programColor: string | null
      teacherId: string
      teacherName: string
      teacherType: string
      enrolled: number
      fee: number
      sharePct: number
      gross: number
      instituteAmount: number
      teacherAmount: number
    }[]
    byTeacher: {
      teacherId: string
      teacherName: string
      teacherType: string
      classCount: number
      enrolled: number
      gross: number
      instituteAmount: number
      teacherAmount: number
    }[]
    totals: { gross: number; institute: number; teacher: number }
  }
  summary: { collected: number; instituteShare: number; expenses: number; payrollCost: number; net: number }
  trend: { month: string; label: string; collected: number; expenses: number; payroll: number }[]
}

// Hex palette for the expense-category donut (stable per category, hash fallback)
const EXPENSE_CAT_COLORS: Record<string, string> = {
  'Rent & Utilities': '#ef4444',
  'Salaries & Wages': '#f97316',
  'Teaching Materials': '#8b5cf6',
  'Equipment & Maintenance': '#0ea5e9',
  Transport: '#14b8a6',
  Marketing: '#ec4899',
  'Events & Activities': '#eab308',
  'Licenses & Fees': '#64748b',
  Miscellaneous: '#a8a29e',
}
const DONUT_FALLBACK = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#06b6d4', '#d946ef', '#84cc16']
function expenseCatColor(category: string, i: number): string {
  if (EXPENSE_CAT_COLORS[category]) return EXPENSE_CAT_COLORS[category]
  let h = 0
  for (let k = 0; k < category.length; k++) h = (h * 31 + category.charCodeAt(k)) >>> 0
  return DONUT_FALLBACK[(h + i) % DONUT_FALLBACK.length]
}

function financialMonthOptions(n = 6): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function financialMonthLabel(m: string): string {
  const [y, mm] = m.split('-').map((x) => parseInt(x, 10))
  return new Date(y, mm - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

const METHOD_COLORS: Record<string, string> = {
  Barcode: '#1e40af',
  Fingerprint: '#7c3aed',
  Manual: '#d97706',
}
const STATUS_COLORS: Record<string, string> = {
  Present: '#16a34a',
  Late: '#d97706',
  Absent: '#dc2626',
  Leave: '#0d9488',
}

export function ReportsSection() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Reports"
        description="Attendance, enrollment & financial analytics across the school"
        icon={<FileBarChart className="h-5 w-5" />}
      />
      <Tabs defaultValue="attendance">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="attendance" className="gap-1.5">
            <ScanLine className="h-4 w-4" /> Attendance
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="gap-1.5">
            <Calendar className="h-4 w-4" /> Heatmap
          </TabsTrigger>
          <TabsTrigger value="enrollment" className="gap-1.5">
            <Users className="h-4 w-4" /> Enrollment
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5">
            <Wallet className="h-4 w-4" /> Financial
          </TabsTrigger>
        </TabsList>
        <TabsContent value="attendance" className="mt-4">
          <AttendanceReportPanel />
        </TabsContent>
        <TabsContent value="heatmap" className="mt-4">
          <HeatmapPanel />
        </TabsContent>
        <TabsContent value="enrollment" className="mt-4">
          <EnrollmentReportPanel />
        </TabsContent>
        <TabsContent value="financial" className="mt-4">
          <FinancialReportPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AttendanceReportPanel() {
  const today = new Date().toISOString().slice(0, 10)
  const twoWeeksAgo = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10)
  const [from, setFrom] = useState(twoWeeksAgo)
  const [to, setTo] = useState(today)
  const [data, setData] = useState<AttendanceReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api<AttendanceReport>(`/api/reports?type=attendance&from=${from}&to=${to}`)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [from, to])

  if (loading || !data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  const t = data.totals
  const methodData = Object.entries(data.methodCount).map(([k, v]) => ({ name: k, value: v, color: METHOD_COLORS[k] }))
  const statusData = Object.entries(data.statusCount).map(([k, v]) => ({ name: k, value: v, color: STATUS_COLORS[k] }))
  const teacherTypeData = [
    { name: 'Internal', value: data.teacherTypeCount.Internal, color: '#1e40af' },
    { name: 'External', value: data.teacherTypeCount.External, color: '#7c3aed' },
  ]
  const lateRate = t.records ? Math.round((t.late / t.records) * 100) : 0

  const exportCsv = () => {
    const rows = [
      ['Date', 'Students', 'Teachers', 'Present', 'Late'],
      ...data.daily.map((d) => [d.date, d.students, d.teachers, d.present, d.late]),
    ]
    downloadCsv('attendance_report.csv', rows)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Date range + export */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="w-44" />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Records" value={t.records} icon={ScanLine} hint={`${t.studentRecords} student · ${t.teacherRecords} teacher`} accent="blue" />
        <StatCard label="Present" value={t.present} icon={CalendarCheck} hint={`${t.records ? Math.round((t.present / t.records) * 100) : 0}% of records`} accent="green" />
        <StatCard label="Late Arrivals" value={t.late} icon={Clock} hint={`${lateRate}% late rate`} accent="amber" />
        <StatCard label="Date Range" value={`${data.daily.length}d`} icon={TrendingUp} hint={fmtDate(data.range.from)} accent="purple" />
      </div>

      {/* Daily trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Daily Attendance Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.daily} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="students" name="Students" stroke="#1e40af" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="teachers" name="Teachers" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="late" name="Late" stroke="#d97706" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Method breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Check-in Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={methodData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {methodData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Teacher type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Teacher Attendance by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={teacherTypeData} margin={{ left: -20, right: 16, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {teacherTypeData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Attendance by program + top attendees */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Attendance by Program</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.programCount} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <YAxis dataKey="code" type="category" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={70} />
                <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="count" name="Attendance" radius={[0, 6, 6, 0]}>
                  {data.programCount.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Attendees (most present)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="scroll-thin max-h-60 space-y-2 overflow-y-auto pr-1">
              {data.topAttendees.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">No data in this range.</p>
              )}
              {data.topAttendees.map((p, i) => (
                <div key={p.ref + i} className="flex items-center gap-3 rounded-lg border p-2">
                  <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className={avatarColor(p.name)}>{initials(p.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.ref}</p>
                  </div>
                  <Badge variant={p.type === 'Teacher' ? 'secondary' : 'default'} className="text-[10px]">
                    {p.type}
                  </Badge>
                  <span className="text-sm font-bold text-primary">{p.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function EnrollmentReportPanel() {
  const [data, setData] = useState<EnrollmentReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api<EnrollmentReport>('/api/reports?type=enrollment')
      .then((d) => alive && setData(d))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  if (loading || !data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  const t = data.totals
  const ageData = Object.entries(data.byAgeGroup).sort().map(([name, value]) => ({ name, value }))
  const religionData = Object.entries(data.byReligion).map(([name, value]) => ({ name, value }))
  const statusData = Object.entries(data.byStatus).map(([name, value]) => ({ name, value, color: name === 'Active' ? '#16a34a' : name === 'Inactive' ? '#d97706' : '#7c3aed' }))
  const revenuePotential = data.byProgram.reduce((sum, p) => sum + p.count * (p.count > 0 ? 1 : 0), 0) // placeholder

  const exportCsv = () => {
    const rows = [
      ['Program', 'Name', 'Enrollments', 'Classes'],
      ...data.byProgram.map((p) => [p.code, p.name, p.count, p.classes]),
    ]
    downloadCsv('enrollment_report.csv', rows)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Students" value={t.students} icon={Users} accent="blue" />
        <StatCard label="Active" value={t.active} icon={GraduationCap} hint={`${t.students ? Math.round((t.active / t.students) * 100) : 0}% active`} accent="green" />
        <StatCard label="Graduated" value={t.graduated} icon={TrendingUp} accent="purple" />
        <StatCard label="New (30 days)" value={t.recentAdmissions} icon={CalendarCheck} accent="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Enrollments by Program</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.byProgram} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis dataKey="code" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="count" name="Students" radius={[6, 6, 0, 0]}>
                  {data.byProgram.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Students by Age Group</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ageData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={50} />
                <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="value" name="Students" radius={[0, 6, 6, 0]} fill="#7c3aed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Religion Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={religionData} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="value" name="Students" radius={[6, 6, 0, 0]} fill="#1e40af" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent admissions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Admissions (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="scroll-thin max-h-72 space-y-2 overflow-y-auto pr-1">
            {data.recentAdmissions.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No admissions in the last 30 days.</p>
            )}
            {data.recentAdmissions.map((s) => (
              <div key={s.studentId} className="flex items-center gap-3 rounded-lg border p-2.5">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className={avatarColor(s.fullName)}>{initials(s.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.fullName}</p>
                  <p className="text-xs text-muted-foreground">{s.studentId} · {s.gender}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {s.programs.map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{fmtDate(s.admissionDate)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Heatmap Panel ───────────────────────────────────────────────────────
const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function rateColor(rate: number | null, isFuture: boolean): { bg: string; text: string; border: string } {
  if (isFuture) return { bg: 'transparent', text: 'text-muted-foreground/40', border: 'border-border/40' }
  if (rate === null) return { bg: 'bg-muted/20', text: 'text-muted-foreground/50', border: 'border-border/50' }
  if (rate >= 90) return { bg: 'bg-emerald-500/25 dark:bg-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/40' }
  if (rate >= 75) return { bg: 'bg-emerald-500/15 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/30' }
  if (rate >= 50) return { bg: 'bg-amber-500/15 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/30' }
  if (rate > 0) return { bg: 'bg-red-500/15 dark:bg-red-500/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-500/30' }
  return { bg: 'bg-muted/30', text: 'text-muted-foreground', border: 'border-border' }
}

function HeatmapPanel() {
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [data, setData] = useState<HeatmapReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState<HeatmapCell | null>(null)

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => alive && setLoading(true))
    api<HeatmapReport>(`/api/reports?type=heatmap&month=${month}`)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [month])

  const goPrev = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1, 1)
    d.setMonth(d.getMonth() - 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const goNext = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1, 1)
    d.setMonth(d.getMonth() + 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const goToday = () => setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)

  if (loading || !data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  const s = data.summary
  const isCurrentMonth = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Avg Attendance Rate" value={`${s.avgRate}%`} icon={TrendingUp} accent="green" hint={`Across ${data.activeDays} active days`} />
        <StatCard label="Present" value={s.present} icon={CalendarCheck} accent="blue" hint="This month" />
        <StatCard label="Late Arrivals" value={s.late} icon={Clock} accent="amber" hint="This month" />
        <StatCard label="Best Day" value={s.bestDay ? `${s.bestDay.rate}%` : '—'} icon={TrendingUp} accent="purple" hint={s.bestDay ? `Day ${s.bestDay.day}` : 'No data'} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{data.monthLabel}</CardTitle>
              <p className="text-xs text-muted-foreground">Daily student attendance rate · {data.totalStudents} active students</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev} title="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {!isCurrentMonth && (
              <Button variant="outline" size="sm" className="h-8" onClick={goToday}>
                Today
              </Button>
            )}
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext} disabled={isCurrentMonth} title="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {WEEKDAY_HEADERS.map((d) => (
              <div key={d} className="pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                {d}
              </div>
            ))}
            {data.cells.map((c, i) => {
              if (c.day === null) {
                return <div key={i} className="aspect-square" />
              }
              const colors = rateColor(c.rate, c.isFuture)
              return (
                <div
                  key={i}
                  onMouseEnter={() => setHovered(c)}
                  onMouseLeave={() => setHovered(null)}
                  className={`group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border p-1 text-center transition-all hover:scale-105 hover:shadow-md ${colors.bg} ${colors.border} ${c.isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                  title={c.rate !== null ? `Day ${c.day}: ${c.rate}% present (${c.present}/${data.totalStudents})` : `Day ${c.day}: no data`}
                >
                  <span className={`text-xs font-bold sm:text-sm ${colors.text}`}>{c.day}</span>
                  {c.rate !== null && !c.isFuture && (
                    <span className={`text-[9px] font-medium sm:text-[10px] ${colors.text} opacity-80`}>
                      {c.rate}%
                    </span>
                  )}
                  {c.isFuture && (
                    <span className="text-[9px] text-muted-foreground/30">—</span>
                  )}
                  {c.isToday && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend + hovered detail */}
          <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span className="font-medium text-muted-foreground">Rate:</span>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-emerald-500/25" />
                <span className="text-muted-foreground">≥90%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-emerald-500/15" />
                <span className="text-muted-foreground">75-89%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-amber-500/15" />
                <span className="text-muted-foreground">50-74%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-red-500/15" />
                <span className="text-muted-foreground">&lt;50%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-muted/30 ring-1 ring-border" />
                <span className="text-muted-foreground">No data</span>
              </div>
            </div>
            {hovered && hovered.day ? (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-1.5 text-xs">
                <span className="font-semibold">Day {hovered.day}</span>
                {hovered.rate !== null ? (
                  <>
                    <Badge variant="outline" className={hovered.rate >= 75 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : hovered.rate >= 50 ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'}>
                      {hovered.rate}% present
                    </Badge>
                    <span className="text-muted-foreground">{hovered.present} present · {hovered.late} late · {hovered.absent} absent</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">No attendance recorded</span>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">Hover a day for details</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Best/Worst day insights */}
      {(s.bestDay || s.worstDay) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {s.bestDay && (
            <Card className="border-emerald-500/20">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Best attendance day</p>
                  <p className="text-sm font-semibold">Day {s.bestDay.day} — {s.bestDay.rate}% present</p>
                </div>
              </CardContent>
            </Card>
          )}
          {s.worstDay && (
            <Card className="border-red-500/20">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Lowest attendance day</p>
                  <p className="text-sm font-semibold">Day {s.worstDay.day} — {s.worstDay.rate}% present</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Financial report panel ─────────────────────────────────────────────────
// Money in vs money out for one month: fees collected, 25% institute share of
// tuition classes, operating expenses and payroll cost, plus a 6-month trend.
function FinancialReportPanel() {
  const monthOptions = useMemo(() => financialMonthOptions(6), [])
  const [month, setMonth] = useState(monthOptions[0])
  const [refetchTick, setRefetchTick] = useState(0)
  const [data, setData] = useState<FinancialReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    const run = () => {
      if (!alive) return
      setLoading(true)
      setError(false)
      api<FinancialReport>(`/api/reports?type=financial&month=${month}`)
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
    // Defer so we don't call setState synchronously in the effect body
    const t = setTimeout(run, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [month, refetchTick])

  const exportCsv = () => {
    if (!data) return
    const rows: (string | number)[][] = [
      ['Financial Report', data.monthLabel],
      [],
      ['Summary', 'Amount (LKR)'],
      ['Fees collected', data.summary.collected],
      ['Institute share (tuition classes)', data.summary.instituteShare],
      ['Operating expenses', data.summary.expenses],
      ['Payroll cost (incl. EPF/ETF)', data.summary.payrollCost],
      ['Net position', data.summary.net],
      [],
      ['Teacher', 'Type', 'Classes', 'Students', 'Gross (LKR)', 'Share %', 'Institute (LKR)', 'Teacher keeps (LKR)'],
      ...data.revenueShare.byTeacher.map((t) => [
        t.teacherName,
        t.teacherType,
        t.classCount,
        t.enrolled,
        t.gross,
        t.gross > 0 ? Math.round((t.instituteAmount / t.gross) * 100) : 0,
        t.instituteAmount,
        t.teacherAmount,
      ]),
      [],
      ['Programme', 'Bills', 'Students', 'Billed (LKR)', 'Share %'],
      ...data.programRevenue.programs.map((p) => [p.name, p.bills, p.students, p.billed, p.sharePct]),
      [],
      ['Expense category', 'Entries', 'Amount (LKR)'],
      ...data.expenses.byCategory.map((c) => [c.category, c.count, c.total]),
    ]
    downloadCsv(`sanomin-financial-${month}.csv`, rows)
  }

  if (loading || !data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={AlertCircle}
            title="Failed to load financial report"
            description="Something went wrong. Try again."
            action={
              <Button size="sm" onClick={() => setRefetchTick((n) => n + 1)}>
                Retry
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

  const s = data.summary
  const rs = data.revenueShare
  const positive = s.net >= 0
  const shareChartData = rs.byTeacher.map((t) => ({
    name: t.teacherName.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s+/, ''),
    institute: t.instituteAmount,
    teacher: t.teacherAmount,
  }))
  const expenseData = data.expenses.byCategory.map((c, i) => ({
    name: c.category,
    value: c.total,
    color: expenseCatColor(c.category, i),
  }))
  const avgSharePct = rs.totals.gross > 0 ? Math.round((rs.totals.institute / rs.totals.gross) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      {/* Month selector + export */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground">Billing month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {financialMonthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Fees collected"
          value={currencyCompact(s.collected)}
          icon={Banknote}
          hint={`of ${currencyCompact(data.fees.billed)} billed · ${data.fees.billCount} bills`}
          accent="green"
        />
        <StatCard
          label="Institute share"
          value={currencyCompact(s.instituteShare)}
          icon={Landmark}
          hint={`avg ${avgSharePct}% of ${currencyCompact(rs.totals.gross)} tuition`}
          accent="purple"
        />
        <StatCard
          label="Expenses"
          value={currencyCompact(s.expenses)}
          icon={ReceiptText}
          hint={`${data.expenses.count} entries · payroll ${currencyCompact(s.payrollCost)}`}
          accent="red"
        />
        <StatCard
          label="Net position"
          value={currencyCompact(s.net)}
          icon={positive ? TrendingUp : TrendingDown}
          hint={positive ? 'Collected + share − expenses − payroll' : 'Spending exceeds income'}
          accent={positive ? 'green' : 'red'}
        />
      </div>

      {/* Charts: expense donut + teacher share bars */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="min-w-0 pb-2">
            <CardTitle className="text-base">Expense breakdown</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            {expenseData.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                No expenses recorded this month
              </div>
            ) : (
              <>
                <div className="relative min-w-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={expenseData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={62}
                        outerRadius={95}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {expenseData.map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => currency(v)}
                        contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
                    <span className="text-lg font-bold tabular-nums">{currencyCompact(data.expenses.total)}</span>
                  </div>
                </div>
                <div className="mt-2 space-y-1.5">
                  {expenseData.map((e) => (
                    <div key={e.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: e.color }} />
                        <span className="truncate text-muted-foreground">{e.name}</span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">{currency(e.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-3">
          <CardHeader className="min-w-0 pb-2">
            <CardTitle className="text-base">Tuition revenue share by teacher</CardTitle>
            <p className="text-xs text-muted-foreground">
              Class fee × enrolled students split by each class&apos;s institute share %
            </p>
          </CardHeader>
          <CardContent className="min-w-0">
            {shareChartData.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                No tuition class revenue to split this month
              </div>
            ) : (
              <div className="min-w-0">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={shareChartData} margin={{ left: -12, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.5} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval={0} angle={-12} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}K` : v)} />
                  <Tooltip
                    formatter={(v: number) => currency(v)}
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="teacher" name="Teacher keeps" stackId="share" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="institute" name="Institute share" stackId="share" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue by programme (from bill line items) */}
      <Card className="min-w-0 p-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3 pt-4">
          <div>
            <CardTitle className="text-base">Revenue by programme</CardTitle>
            <p className="text-xs text-muted-foreground">
              Billed amounts grouped from every bill&apos;s line items
            </p>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <Banknote className="h-3 w-3" />
            {currencyCompact(data.programRevenue.total)} billed
          </Badge>
        </CardHeader>
        {data.programRevenue.programs.length === 0 ? (
          <CardContent className="pb-6 pt-0">
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No bills recorded for {data.monthLabel} yet.
            </p>
          </CardContent>
        ) : (
          <CardContent className="grid gap-2.5 pb-4 pt-0">
            {data.programRevenue.programs.map((p, i) => (
              <div key={p.code} className="group grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full ring-2 ring-background"
                      style={{ backgroundColor: p.color, boxShadow: `0 0 0 1px ${p.color}55` }}
                    />
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                      · {p.bills} bill{p.bills === 1 ? '' : 's'} · {p.students} student{p.students === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{currency(p.billed)}</span>
                    <Badge variant="outline" className="w-14 justify-center tabular-nums">
                      {Math.round(p.sharePct)}%
                    </Badge>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out animate-bar-in"
                    style={{
                      width: `${Math.max(2, Math.min(100, p.sharePct))}%`,
                      backgroundColor: p.color,
                      opacity: 1 - i * 0.08,
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {data.programRevenue.programs.length} programme{data.programRevenue.programs.length === 1 ? '' : 's'} billed
              {data.programRevenue.programs.some((p) => p.code === 'OTHER')
                ? ' · “Other charges” = custom bill lines without a programme'
                : ''}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Per-teacher share table */}
      <Card className="p-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 pt-4">
          <CardTitle className="text-base">Institute share register</CardTitle>
          <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300">
            <Briefcase className="h-3 w-3" />
            {rs.classes.length} tuition class{rs.classes.length === 1 ? '' : 'es'}
          </Badge>
        </CardHeader>
        {rs.classes.length === 0 ? (
          <CardContent className="pb-6 pt-0">
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No tuition class revenue to split for {data.monthLabel}. Classes need a teacher, a fee and
              at least one enrolled student.
            </p>
          </CardContent>
        ) : (
          <div className="scroll-thin max-h-[50vh] overflow-x-auto overflow-y-auto">
            <Table className="table-zebra min-w-[760px]">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead className="text-right">Classes</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Share %</TableHead>
                  <TableHead className="text-right">Institute gets</TableHead>
                  <TableHead className="text-right">Teacher keeps</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rs.byTeacher.map((t) => (
                  <TableRow key={t.teacherId} className="animate-row-in">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className={`text-xs ${avatarColor(t.teacherName)}`}>
                            {initials(t.teacherName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{t.teacherName}</p>
                          <p className="text-[11px] text-muted-foreground">{t.teacherType} teacher</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.classCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.enrolled}</TableCell>
                    <TableCell className="text-right tabular-nums">{currency(t.gross)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="tabular-nums">
                        {t.gross > 0 ? Math.round((t.instituteAmount / t.gross) * 100) : 0}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {currency(t.instituteAmount)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {currency(t.teacherAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{rs.classes.length}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rs.byTeacher.reduce((a, t) => a + t.enrolled, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{currency(rs.totals.gross)}</TableCell>
                  <TableCell className="text-right tabular-nums">{avgSharePct}%</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                    {currency(rs.totals.institute)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {currency(rs.totals.teacher)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </Card>

      {/* Class-level detail + 6-month trend */}
      <div className="grid gap-4 xl:grid-cols-2">
        {rs.classes.length > 0 && (
          <Card className="min-w-0 p-0">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-base">Class-level breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-4">
              <div className="scroll-thin max-h-72 space-y-2 overflow-y-auto px-4">
                {rs.classes.map((c) => (
                  <div key={c.classId} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: c.programColor || 'var(--muted-foreground)' }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.className}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {c.teacherName}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {c.enrolled} student{c.enrolled === 1 ? '' : 's'} × {currency(c.fee)} · {c.sharePct}% institute
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">{currency(c.gross)}</p>
                      <p className="text-[11px] tabular-nums text-amber-600 dark:text-amber-400">
                        → institute {currency(c.instituteAmount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className={`min-w-0 ${rs.classes.length === 0 ? 'xl:col-span-2' : ''}`}>
          <CardHeader className="min-w-0 pb-2">
            <CardTitle className="text-base">Cash flow trend (6 months)</CardTitle>
            <p className="text-xs text-muted-foreground">Fees collected vs expenses vs payroll cost</p>
          </CardHeader>
          <CardContent className="min-w-0">
            <div className="min-w-0">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.trend} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}K` : v)}
                />
                <Tooltip
                  formatter={(v: number) => currency(v)}
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="payroll" name="Payroll" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
