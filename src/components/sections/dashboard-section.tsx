'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import {
  Users,
  GraduationCap,
  ScanLine,
  BookOpen,
  CalendarDays,
  Clock,
  Fingerprint,
  ArrowRight,
  TrendingUp,
  Activity,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Megaphone,
  Pin,
  AlertTriangle,
  TrendingDown,
  Clock3,
  Phone,
  X,
  Loader2,
  ShieldCheck,
  Database,
  Cake,
  PartyPopper,
  Gift,
  Send,
  Sparkles,
  MessageCircle,
  Newspaper,
  Copy,
  CalendarClock,
} from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useSchoolInfo } from '@/lib/school'
import { SectionHeader } from '@/components/shared/section-header'
import { StatCard } from '@/components/shared/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useAppStore } from '@/lib/store'
import { initials, avatarColor, fmtTime, currency, currencyCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DashboardData {
  totals: {
    students: number
    teachers: number
    internalTeachers: number
    externalTeachers: number
    programs: number
    classes: number
    studentsPresentToday: number
    teachersPresentToday: number
    todayAttendanceRecords: number
  }
  byProgram: { code: string; name: string; color: string; count: number }[]
  byAgeGroup: Record<string, number>
  byGender: { Male: number; Female: number }
  religionCount: Record<string, number>
  trend: { date: string; students: number; teachers: number }[]
  recent: Array<{
    id: string
    personType: string
    personRef: string
    personName: string
    method: string
    status: string
    checkIn: string | null
    date: string
  }>
  upcomingClasses: Array<{
    id: string
    name: string
    startTime: string | null
    endTime: string | null
    room: string | null
    program: { code: string; name: string; color: string } | null
    teacher: { teacherId: string; fullName: string; type: string } | null
  }>
  fees: {
    month: string
    totalBilled: number
    totalCollected: number
    outstanding: number
    paidRate: number
    overdueCount: number
    pendingCount: number
    expenses: number
    payroll: number
    tuitionShare: number
    net: number
  }
  announcements: Array<{
    id: string
    title: string
    body: string
    category: string
    audience: string
    priority: string
    pinned: boolean
    publishDate: string
  }>
  atRisk: {
    count: number
    declining: number
    frequentLate: number
    monitoredStudents: number
    periodDays: number
  }
}

export function DashboardSection() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const { setSection } = useAppStore()
  const [atRiskOpen, setAtRiskOpen] = useState(false)

  useEffect(() => {
    let alive = true
    api<DashboardData>('/api/dashboard')
      .then((d) => alive && setData(d))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  const t = data.totals
  const genderData = [
    { name: 'Male', value: data.byGender.Male, color: '#1e40af' },
    { name: 'Female', value: data.byGender.Female, color: '#7c3aed' },
  ]
  const ageData = Object.entries(data.byAgeGroup)
    .sort()
    .map(([name, value]) => ({ name, value }))

  return (
    <div className="flex flex-col gap-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-lg sm:p-8">
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back, Administrator
            </h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">
              SANOMIN International Preschool — overview of students, teachers, attendance and
              tuition classes for today.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="bg-white/15 text-white hover:bg-white/25"
              onClick={() => setSection('attendance')}
            >
              <ScanLine className="mr-2 h-4 w-4" /> Open Scanner
            </Button>
            <Button
              variant="secondary"
              className="bg-white text-primary hover:bg-white/90"
              onClick={() => setSection('students')}
            >
              <Users className="mr-2 h-4 w-4" /> Manage Students
            </Button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Students"
          value={t.students}
          icon={Users}
          hint={`${t.studentsPresentToday} present today`}
          accent="blue"
        />
        <StatCard
          label="Teaching Staff"
          value={t.teachers}
          icon={GraduationCap}
          hint={`${t.internalTeachers} internal · ${t.externalTeachers} external`}
          accent="purple"
        />
        <StatCard
          label="Today's Attendance"
          value={t.todayAttendanceRecords}
          icon={ScanLine}
          hint={`${t.teachersPresentToday} teachers checked in`}
          accent="green"
        />
        <StatCard
          label="Active Programs"
          value={t.programs}
          icon={BookOpen}
          hint={`${t.classes} tuition classes scheduled`}
          accent="amber"
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Attendance trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold">Attendance — Last 7 Days</CardTitle>
            <Badge variant="secondary" className="gap-1">
              <TrendingUp className="h-3 w-3" /> Trend
            </Badge>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.trend} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gStu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e40af" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#1e40af" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gTea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="students"
                  name="Students"
                  stroke="#1e40af"
                  strokeWidth={3}
                  fill="url(#gStu)"
                  dot={{ r: 3, fill: '#1e40af' }}
                  activeDot={{ r: 5 }}
                />
                <Area
                  type="monotone"
                  dataKey="teachers"
                  name="Teachers"
                  stroke="#7c3aed"
                  strokeWidth={3}
                  fill="url(#gTea)"
                  dot={{ r: 3, fill: '#7c3aed' }}
                  activeDot={{ r: 5 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gender pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Gender Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={genderData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                >
                  {genderData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
              {genderData.map((g) => (
                <div key={g.name} className="rounded-lg bg-muted/50 p-2">
                  <p className="font-semibold text-base">{g.value}</p>
                  <p className="text-muted-foreground">{g.name}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lower row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Enrollments by program */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Enrollments by Program</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.byProgram} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                <XAxis dataKey="code" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number, _n, p: any) => [v, p?.payload?.name ?? '']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {data.byProgram.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Today's classes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold">Today's Classes</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {data.upcomingClasses.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium">No tuition classes today</p>
                <p className="text-[11px] text-muted-foreground">
                  External teachers' sessions run on their scheduled weekdays.
                </p>
              </div>
            )}
            {data.upcomingClasses.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2.5"
              >
                <div
                  className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-white"
                  style={{ background: c.program?.color ?? '#7c3aed' }}
                >
                  <Clock className="h-4 w-4" />
                  <span className="text-[9px] font-semibold">{c.startTime}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.teacher?.fullName ?? '—'} · {c.room ?? '—'}
                  </p>
                </div>
                {c.teacher?.type === 'External' && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    External
                  </Badge>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setSection('classes')}
            >
              View all classes <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Fees collection summary */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Fee Collection — {data.fees.month}</CardTitle>
              <p className="text-xs text-muted-foreground">Monthly tuition fee tracking</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSection('fees')}>
            Manage fees <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Collected */}
            <div className="rounded-xl border bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-medium">Collected</span>
              </div>
              <p className="mt-1 text-2xl font-bold tracking-tight">
                {currencyCompact(data.fees.totalCollected)}
              </p>
              <p className="text-[11px] text-muted-foreground">{currency(data.fees.totalCollected)}</p>
            </div>
            {/* Outstanding */}
            <div className="rounded-xl border bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Outstanding</span>
              </div>
              <p className="mt-1 text-2xl font-bold tracking-tight">
                {currencyCompact(data.fees.outstanding)}
              </p>
              <p className="text-[11px] text-muted-foreground">{currency(data.fees.outstanding)}</p>
            </div>
            {/* Overdue */}
            <div className="rounded-xl border bg-red-500/5 p-4">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-medium">Overdue</span>
              </div>
              <p className="mt-1 text-2xl font-bold tracking-tight">{data.fees.overdueCount}</p>
              <p className="text-[11px] text-muted-foreground">{data.fees.pendingCount} pending</p>
            </div>
          </div>
          {/* Collection rate progress */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Collection rate</span>
                <span className="font-semibold text-primary">{data.fees.paidRate}%</span>
              </div>
              <Progress value={data.fees.paidRate} className="mt-2 h-2.5" />
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Billed: {currencyCompact(data.fees.totalBilled)}</span>
                <span>of {currency(data.fees.totalBilled)} total billed</span>
              </div>
            </div>
            {/* Cash position: collected − expenses − payroll */}
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Cash position this month</span>
                <button
                  className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                  onClick={() => setSection('expenses')}
                >
                  Expenses <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <p
                  className={`text-2xl font-bold tracking-tight tabular-nums ${
                    data.fees.net >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {currencyCompact(data.fees.net)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  collected − outgoings
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Collected {currencyCompact(data.fees.totalCollected)}
                </span>
                {data.fees.tuitionShare > 0 && (
                  <span
                    className="inline-flex items-center gap-1"
                    title="Institute share of tuition class revenue"
                  >
                    <span className="size-1.5 rounded-full bg-purple-500" />
                    Tuition share +{currencyCompact(data.fees.tuitionShare)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-red-400" />
                  Expenses {currencyCompact(data.fees.expenses)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Payroll {currencyCompact(data.fees.payroll)}
                </span>
              </div>
              <button
                className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                onClick={() => setSection('reports')}
              >
                Full financial report <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent activity + Age group */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold">Recent Attendance Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="scroll-thin max-h-80 space-y-2 overflow-y-auto pr-1">
              {data.recent.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No attendance recorded yet today.
                </p>
              )}
              {data.recent.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-2.5"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className={avatarColor(r.personName)}>
                      {initials(r.personName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.personName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.personType} · {r.personRef}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={r.status === 'Present' ? 'default' : 'secondary'}
                      className="gap-1 text-[10px]"
                    >
                      {r.method === 'Fingerprint' ? (
                        <Fingerprint className="h-3 w-3" />
                      ) : (
                        <ScanLine className="h-3 w-3" />
                      )}
                      {r.method}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {fmtTime(r.checkIn ?? r.date)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Students by Age Group</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ageData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={40} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" name="Students" radius={[0, 6, 6, 0]} fill="#7c3aed" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(data.religionCount).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-[10px]">
                  {k}: {v}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Announcements */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Recent Announcements</CardTitle>
              <p className="text-xs text-muted-foreground">Latest notices & broadcasts</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSection('announcements')}>
            View all <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent>
          {data.announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Megaphone className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium">No announcements yet</p>
              <p className="text-[11px] text-muted-foreground">
                Create announcements to broadcast notices to staff and parents.
              </p>
            </div>
          ) : (
            <div className="scroll-thin grid gap-2 sm:grid-cols-2">
              {data.announcements.map((a) => {
                const isHigh = a.priority === 'High'
                const isUrgent = a.category === 'Urgent'
                return (
                  <button
                    key={a.id}
                    onClick={() => setSection('announcements')}
                    className="group relative overflow-hidden rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm"
                  >
                    {a.pinned && (
                      <Pin className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />
                    )}
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          isUrgent
                            ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                            : isHigh
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400'
                        }
                      >
                        {a.category}
                      </Badge>
                      {isHigh && (
                        <span className="text-[10px] font-semibold text-red-500">● High</span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-1 text-sm font-semibold group-hover:text-primary">
                      {a.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {a.body}
                    </p>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {new Date(a.publishDate).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                      })}{' '}
                      · {a.audience}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* At-Risk Students widget */}
      <Card className="overflow-hidden border-amber-500/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Attendance Alerts</CardTitle>
              <p className="text-xs text-muted-foreground">
                Last {data.atRisk.periodDays} days · {data.atRisk.monitoredStudents} students monitored
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSection('reports')}>
            View reports <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {/* At-risk count */}
            <button
              onClick={() => data.atRisk.count > 0 && setAtRiskOpen(true)}
              disabled={data.atRisk.count === 0}
              className="group rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-left transition-all hover:border-red-500/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-medium">At-risk students</span>
              </div>
              <p className="mt-1 text-2xl font-bold tracking-tight text-red-700 dark:text-red-300">
                {data.atRisk.count}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Low rate, declining, or frequently late
              </p>
            </button>

            {/* Declining trend */}
            <button
              onClick={() => data.atRisk.count > 0 && setAtRiskOpen(true)}
              disabled={data.atRisk.count === 0}
              className="group rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-left transition-all hover:border-amber-500/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <TrendingDown className="h-4 w-4" />
                <span className="text-xs font-medium">Declining trend</span>
              </div>
              <p className="mt-1 text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-300">
                {data.atRisk.declining}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Drop &gt;15% this week vs last
              </p>
            </button>

            {/* Frequently late */}
            <button
              onClick={() => data.atRisk.count > 0 && setAtRiskOpen(true)}
              disabled={data.atRisk.count === 0}
              className="group rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 text-left transition-all hover:border-purple-500/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                <Clock3 className="h-4 w-4" />
                <span className="text-xs font-medium">Frequently late</span>
              </div>
              <p className="mt-1 text-2xl font-bold tracking-tight text-purple-700 dark:text-purple-300">
                {data.atRisk.frequentLate}
              </p>
              <p className="text-[11px] text-muted-foreground">
                3+ late days in {data.atRisk.periodDays} days
              </p>
            </button>
          </div>
          {data.atRisk.count === 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              All students have healthy attendance patterns. No concerns detected.
            </div>
          )}
        </CardContent>
      </Card>

      {/* At-risk student detail dialog */}
      <AtRiskDialog open={atRiskOpen} onOpenChange={setAtRiskOpen} onGoToStudents={() => setSection('students')} />

      {/* Data health audit (records missing phones / EPF / schedules ...) */}
      <DataHealthCard onGoTo={setSection} />

      {/* Upcoming birthdays & work anniversaries */}
      <CelebrationsCard onGoTo={setSection} />

      {/* Share-ready operations digest (attendance / fees / people) */}
      <WeeklyDigestCard />
    </div>
  )
}

// ─── Data Health (record completeness audit) ───────────────────────────────
interface DQGroup {
  key: string
  label: string
  scope: 'students' | 'teachers' | 'classes'
  severity: 'high' | 'medium' | 'low'
  hint: string
  count: number
  items: Array<{ ref: string; name: string; detail: string }>
}
interface DQData {
  checkedAt: string
  counts: { students: number; teachers: number; classes: number; totalIssues: number; highIssues: number }
  groups: DQGroup[]
}

const DQ_SEVERITY = {
  high: {
    chip: 'border-red-500/30 bg-red-500/5 hover:border-red-500/60',
    icon: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
  },
  medium: {
    chip: 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60',
    icon: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  low: {
    chip: 'border-slate-400/30 bg-slate-500/5 hover:border-slate-400/60',
    icon: 'text-slate-500 dark:text-slate-400',
    dot: 'bg-slate-400',
  },
} as const

function DataHealthCard({
  onGoTo,
}: {
  onGoTo: (s: 'students' | 'teachers' | 'classes') => void
}) {
  const [data, setData] = useState<DQData | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    let alive = true
    api<DQData>('/api/data-quality')
      .then((d) => alive && setData(d))
      .catch(() => {
        /* widget stays silent if the audit fails */
      })
    return () => {
      alive = false
    }
  }, [])

  if (!data) return null

  const issues = data.groups.filter((g) => g.count > 0)
  const clean = data.counts.totalIssues === 0

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg',
                clean
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
              )}
            >
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Data Health</CardTitle>
              <p className="text-xs text-muted-foreground">
                {data.counts.students} students · {data.counts.teachers} staff ·{' '}
                {data.counts.classes} classes audited
              </p>
            </div>
          </div>
          {!clean && (
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              Fix records <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {clean ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              All records are complete — phones, EPF numbers, NICs, schedules and capacities all
              look good.
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {issues.map((g) => {
                  const sev = DQ_SEVERITY[g.severity]
                  return (
                    <button
                      key={g.key}
                      onClick={() => setDialogOpen(true)}
                      className={cn(
                        'card-lift flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                        sev.chip,
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                          sev.icon,
                          'bg-background/60',
                        )}
                      >
                        {g.count}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{g.label}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className={cn('h-1.5 w-1.5 rounded-full', sev.dot)} />
                          {g.severity} priority · {g.scope}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Database className="h-3 w-3" />
                {data.counts.totalIssues} issues across {issues.length} check
                {issues.length > 1 ? 's' : ''}
                {data.counts.highIssues > 0 &&
                  ` · ${data.counts.highIssues} block reminders or payroll`}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <DataQualityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        data={data}
        onGoTo={onGoTo}
      />
    </>
  )
}

function DataQualityDialog({
  open,
  onOpenChange,
  data,
  onGoTo,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  data: DQData | null
  onGoTo: (s: 'students' | 'teachers' | 'classes') => void
}) {
  if (!data) return null
  const issues = data.groups.filter((g) => g.count > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <ShieldCheck className="h-4 w-4" />
            </span>
            Data health — {data.counts.totalIssues} issue
            {data.counts.totalIssues !== 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            Complete these records so reminders, payroll and registers never hit missing data.
          </DialogDescription>
        </DialogHeader>

        <div className="scroll-thin -mx-1 flex-1 space-y-4 overflow-y-auto px-1">
          {issues.map((g) => {
            const sev = DQ_SEVERITY[g.severity]
            return (
              <div key={g.key} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-semibold">
                      <span className={cn('h-2 w-2 rounded-full', sev.dot)} />
                      {g.label}
                      <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px] font-semibold uppercase tracking-wide">
                        {g.severity}
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{g.hint}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                    onClick={() => {
                      onGoTo(g.scope)
                      onOpenChange(false)
                    }}
                  >
                    Go to {g.scope} <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
                <div className="scroll-thin mt-2 max-h-36 space-y-1 overflow-y-auto pr-1">
                  {g.items.map((it, i) => (
                    <div
                      key={`${it.ref}-${i}`}
                      className="flex flex-col gap-0.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded bg-background px-1 py-px font-mono text-[10px] text-muted-foreground">
                          {it.ref}
                        </span>
                        <span className="truncate font-medium">{it.name}</span>
                      </span>
                      <span className="text-muted-foreground sm:shrink-0 sm:text-right">
                        {it.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {issues.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Everything checks out.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── At-Risk Student Detail Dialog ─────────────────────────────────────────
interface AtRiskStudent {
  id: string
  studentId: string
  fullName: string
  gender: string
  ageGroup: string | null
  guardianName: string | null
  guardianPhone: string | null
  programs: Array<{ code: string; name: string; color: string }>
  rate: number
  recentRate: number
  previousRate: number
  lateCount: number
  absentCount: number
  presentCount: number
  totalDays: number
  concerns: string[]
  severity: 'high' | 'medium' | 'low'
}

interface AtRiskDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onGoToStudents: () => void
}

function AtRiskDialog({ open, onOpenChange, onGoToStudents }: AtRiskDialogProps) {
  const [students, setStudents] = useState<AtRiskStudent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    Promise.resolve().then(() => alive && setLoading(true))
    api<{ atRisk: AtRiskStudent[] }>('/api/attendance/at-risk')
      .then((r) => alive && setStudents(r.atRisk))
      .catch(() => alive && setStudents([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open])

  const severityStyle: Record<string, { border: string; bg: string; text: string; label: string }> = {
    high: { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', label: 'High' },
    medium: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', label: 'Medium' },
    low: { border: 'border-slate-500/40', bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', label: 'Low' },
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
            At-Risk Students
          </DialogTitle>
          <DialogDescription>
            Students with attendance concerns in the last 14 days. Click a student to view their full profile.
          </DialogDescription>
        </DialogHeader>

        <div className="scroll-thin max-h-[calc(90vh-140px)] overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyzing attendance patterns…</p>
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="text-sm font-medium">No at-risk students</p>
              <p className="text-xs text-muted-foreground">All students have healthy attendance patterns.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {students.map((s) => {
                const sv = severityStyle[s.severity] || severityStyle.medium
                const rateColor = s.rate < 50 ? 'text-red-600 dark:text-red-400' : s.rate < 75 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      onOpenChange(false)
                      onGoToStudents()
                    }}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:shadow-md',
                      sv.border,
                    )}
                  >
                    {/* Avatar + severity dot */}
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10 ring-2 ring-background">
                        <AvatarFallback className={cn('text-xs font-bold', avatarColor(s.fullName))}>
                          {initials(s.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
                          s.severity === 'high' ? 'bg-red-500' : s.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400',
                        )}
                      />
                    </div>

                    {/* Name + ID + concerns */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{s.fullName}</p>
                        <span className="font-mono text-[10px] text-muted-foreground">{s.studentId}</span>
                        <Badge variant="outline" className={cn('h-4 px-1.5 text-[9px]', sv.bg, sv.text, sv.border)}>
                          {sv.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.concerns.map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Rate + trend */}
                    <div className="hidden shrink-0 flex-col items-end sm:flex">
                      <div className="flex items-baseline gap-1">
                        <span className={cn('text-lg font-bold', rateColor)}>{s.rate}%</span>
                        <span className="text-[10px] text-muted-foreground">rate</span>
                      </div>
                      {s.previousRate > 0 && s.recentRate !== s.previousRate && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <TrendingDown className="h-2.5 w-2.5 text-amber-500" />
                          {s.previousRate}% → {s.recentRate}%
                        </span>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="hidden shrink-0 gap-2 lg:flex">
                      <div className="flex flex-col items-center rounded-md bg-muted/50 px-2 py-1">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{s.presentCount}</span>
                        <span className="text-[9px] text-muted-foreground">present</span>
                      </div>
                      <div className="flex flex-col items-center rounded-md bg-muted/50 px-2 py-1">
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{s.lateCount}</span>
                        <span className="text-[9px] text-muted-foreground">late</span>
                      </div>
                      <div className="flex flex-col items-center rounded-md bg-muted/50 px-2 py-1">
                        <span className="text-xs font-bold text-red-600 dark:text-red-400">{s.absentCount}</span>
                        <span className="text-[9px] text-muted-foreground">absent</span>
                      </div>
                    </div>

                    {/* Guardian contact */}
                    {s.guardianPhone && (
                      <div className="hidden shrink-0 items-center gap-1 rounded-md bg-muted/30 px-2 py-1 text-[10px] xl:flex">
                        <Phone className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="font-mono text-muted-foreground">{s.guardianPhone}</span>
                      </div>
                    )}

                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer summary */}
        {!loading && students.length > 0 && (
          <div className="flex items-center justify-between border-t bg-muted/30 px-6 py-3 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{students.length}</span> student{students.length === 1 ? '' : 's'} flagged
              {' · '}
              <span className="text-red-600 dark:text-red-400">{students.filter((s) => s.severity === 'high').length} high</span>
              {' · '}
              <span className="text-amber-600 dark:text-amber-400">{students.filter((s) => s.severity === 'medium').length} medium</span>
            </span>
            <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onGoToStudents() }}>
              Go to Students <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Celebrations (upcoming birthdays & work anniversaries) ────────────────
interface Celebration {
  personType: 'Student' | 'Teacher'
  ref: string
  name: string
  date: string
  daysUntil: number
  milestone: number | null
  kind: 'birthday' | 'anniversary'
  contact: { name: string; phone: string } | null
}
interface CelebrationsData {
  days: number
  todayCount: number
  total: number
  celebrations: Celebration[]
}

function daysLabel(n: number): string {
  if (n === 0) return 'Today 🎉'
  if (n === 1) return 'Tomorrow'
  return `in ${n} days`
}

// Sri Lanka WhatsApp number normalisation (mirrors fees-section toWaPhone)
function toWaDigits(phone: string): string | null {
  const d = phone.replace(/\D/g, '')
  if (d.length < 9) return null
  if (d.startsWith('94')) return d
  if (d.startsWith('0')) return '94' + d.slice(1)
  return '94' + d
}

function CelebrationsCard({ onGoTo }: { onGoTo: (s: 'students' | 'teachers') => void }) {
  const school = useSchoolInfo()
  const [data, setData] = useState<CelebrationsData | null>(null)
  const [posting, setPosting] = useState<string | null>(null) // ref being posted

  useEffect(() => {
    let alive = true
    api<CelebrationsData>('/api/celebrations?days=30')
      .then((d) => {
        if (alive) setData(d)
      })
      .catch(() => {
        /* widget stays silent if the scan fails */
      })
    return () => {
      alive = false
    }
  }, [])

  if (!data || data.total === 0) return null

  const postAnnouncement = async (c: Celebration) => {
    setPosting(c.ref)
    try {
      const schoolName = c.kind === 'birthday'
        ? `Happy Birthday, ${c.name.split(' ')[0]}! 🎂`
        : `${c.milestone} years with us — thank you, ${c.name.split(' ')[0]}! 🎉`
      const body = c.kind === 'birthday'
        ? `${c.name} (${c.ref}) turns ${c.milestone} on ${new Date(c.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. Join us in wishing a very happy birthday — families are welcome to send wishes via the class teachers.`
        : `${c.name} (${c.ref}) completes ${c.milestone} year${c.milestone === 1 ? '' : 's'} with us on ${new Date(c.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. Thank you for everything you do for our children!`
      await api('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: schoolName,
          body,
          category: 'Event',
          audience: 'All',
          priority: 'Normal',
          status: 'Published',
        }),
      })
      toast.success(`Announcement posted for ${c.name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to post announcement')
    } finally {
      setPosting(null)
    }
  }

  const openWhatsApp = (c: Celebration) => {
    if (!c.contact) return
    const digits = toWaDigits(c.contact.phone)
    if (!digits) {
      toast.warning('This phone number cannot be used for WhatsApp', {
        description: `${c.contact.phone} — update it in ${c.personType === 'Student' ? 'Students' : 'Teachers'}.`,
      })
      return
    }
    const first = c.name.split(' ')[0]
    const msg =
      c.kind === 'birthday'
        ? `🎉 Happy Birthday, ${first}! Wishing you a wonderful day full of smiles and fun, from all of us at ${school.shortName}. 🎂`
        : `🎉 Congratulations on ${c.milestone} year${c.milestone === 1 ? '' : 's'} with ${school.shortName}, ${first}! Thank you for everything you do for our children. 🌟`
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  }

  return (
    <Card className="overflow-hidden border-pink-500/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500/20 to-amber-500/20 text-pink-600 dark:text-pink-400">
            <Cake className="h-5 w-5" />
            {data.todayCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-pink-500 text-[9px] font-bold text-white shadow">
                {data.todayCount}
              </span>
            )}
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Celebrations</CardTitle>
            <p className="text-xs text-muted-foreground">
              Birthdays &amp; work anniversaries in the next {data.days} days
            </p>
          </div>
        </div>
        {data.todayCount === 0 && (
          <Badge variant="outline" className="gap-1 border-pink-500/40 text-[10px] text-pink-600 dark:text-pink-400">
            <Sparkles className="h-3 w-3" /> {data.total} upcoming
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.celebrations.slice(0, 6).map((c) => {
            const isToday = c.daysUntil === 0
            const isBirthday = c.kind === 'birthday'
            const Icon = isBirthday ? Cake : Gift
            return (
              <div
                key={`${c.personType}-${c.ref}`}
                className={cn(
                  'group flex min-w-0 items-center gap-3 rounded-xl border p-3 transition-all hover:shadow-sm',
                  isToday
                    ? 'border-pink-500/50 bg-gradient-to-br from-pink-500/10 to-amber-500/10'
                    : 'border-border bg-muted/20 hover:border-pink-500/40',
                )}
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    isBirthday
                      ? 'bg-pink-500/15 text-pink-600 dark:text-pink-400'
                      : 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
                  )}
                >
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    {isBirthday
                      ? `turns ${c.milestone} · ${daysLabel(c.daysUntil)}`
                      : `${c.milestone} yr${c.milestone === 1 ? '' : 's'} · ${daysLabel(c.daysUntil)}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      'hidden text-[9px] sm:inline-flex',
                      c.personType === 'Student'
                        ? 'text-muted-foreground'
                        : 'border-violet-500/40 text-violet-600 dark:text-violet-400',
                    )}
                  >
                    {c.personType === 'Student' ? c.ref : 'Staff'}
                  </Badge>
                  {/* Touch devices have no hover — keep actions visible on mobile */}
                  <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-6 w-6',
                        c.contact
                          ? 'text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400'
                          : 'text-muted-foreground/40',
                      )}
                      title={
                        c.contact
                          ? `WhatsApp ${c.contact.name} (${c.contact.phone})`
                          : 'No WhatsApp-capable phone on file'
                      }
                      aria-label={`Send WhatsApp greeting to ${c.name}`}
                      disabled={!c.contact}
                      onClick={() => openWhatsApp(c)}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Post announcement"
                      aria-label={`Post announcement for ${c.name}`}
                      disabled={posting === c.ref}
                      onClick={() => postAnnouncement(c)}
                    >
                      {posting === c.ref ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title={c.personType === 'Student' ? 'Open students' : 'Open teachers'}
                      aria-label={`Go to ${c.personType === 'Student' ? 'students' : 'teachers'}`}
                      onClick={() =>
                        onGoTo(c.personType === 'Student' ? 'students' : 'teachers')
                      }
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {data.total > 6 && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <PartyPopper className="h-3 w-3" />
            +{data.total - 6} more celebration{data.total - 6 === 1 ? '' : 's'} this month
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Weekly Digest (share-ready operations summary) ─────────────────────────
interface DigestData {
  days: number
  period: { start: string; end: string; label: string }
  schoolName: string
  attendance: {
    records: number
    present: number
    late: number
    absent: number
    leave: number
    rate: number | null
    prevRate: number | null
    delta: number | null
    atRiskTotal: number
    atRisk: { ref: string; name: string; rate: number }[]
  }
  fees: {
    monthLabel: string
    billed: number
    collected: number
    outstanding: number
    outstandingBills: number
    overdue: number
  }
  expenses: { total: number; count: number; topCategory: { name: string; total: number } | null }
  payroll: { paidCount: number; paidTotal: number }
  people: { celebrationsCount: number; celebrations: { name: string; kind: string; when: string }[] }
  announcementsPosted: number
  generatedAt: string
  text: string
}

const DIGEST_WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
]

function WeeklyDigestCard() {
  const [windowDays, setWindowDays] = useState('7')
  const [data, setData] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [posting, setPosting] = useState(false)
  const [copied, setCopied] = useState(false)

  const generate = (d: string = windowDays) => {
    setLoading(true)
    setError(null)
    api<DigestData>(`/api/reports/digest?days=${d}`)
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to build the digest'))
      .finally(() => setLoading(false))
  }

  const copyText = async () => {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.text)
      setCopied(true)
      toast.success('Digest copied — paste it into WhatsApp or email')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — select the text manually from the dialog')
    }
  }

  const postAnnouncement = async () => {
    if (!data) return
    setPosting(true)
    try {
      await api('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: `${data.days}-Day Digest — ${data.period.label}`,
          body: data.text,
          category: 'General',
          audience: 'All',
          priority: 'Normal',
          status: 'Published',
        }),
      })
      toast.success('Digest posted as an announcement', {
        description: 'Visible to staff & parents under Announcements.',
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to post digest')
    } finally {
      setPosting(false)
    }
  }

  const a = data?.attendance
  const f = data?.fees

  return (
    <>
      <Card className="overflow-hidden border-teal-500/20">
        <CardHeader className="flex-col space-y-3 pb-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500/20 to-emerald-500/20 text-teal-600 dark:text-teal-400">
              <Newspaper className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Weekly Digest</CardTitle>
              <p className="text-xs text-muted-foreground">
                Attendance, fees &amp; people — one share-ready summary
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:shrink-0">
            <Select value={windowDays} onValueChange={(v) => setWindowDays(v)}>
              <SelectTrigger className="h-8 w-[122px] text-xs" aria-label="Digest window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIGEST_WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={loading}
              onClick={() => generate()}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CalendarClock className="h-3.5 w-3.5" />
              )}
              {data ? 'Refresh' : 'Generate'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : error && !data ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={() => generate()}>
                Retry
              </Button>
            </div>
          ) : !data || !a || !f ? (
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed p-5 text-center">
              <Newspaper className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm font-medium">No digest generated yet</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Pick a window and press <span className="font-semibold text-foreground">Generate</span> to
                build a share-ready summary — attendance vs the previous period, money, and upcoming
                celebrations. Copy it into WhatsApp or post it as an announcement.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {/* Attendance */}
                <div className="rounded-xl border bg-muted/20 p-3 transition-all hover:shadow-sm">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Attendance
                  </p>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-xl font-bold tabular-nums">
                      {a.rate === null ? '—' : `${a.rate}%`}
                    </span>
                    {a.delta !== null && a.delta !== 0 && (
                      <span
                        className={cn(
                          'flex items-center gap-0.5 text-[10px] font-semibold',
                          a.delta > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {a.delta > 0 ? (
                          <TrendingUp className="h-2.5 w-2.5" />
                        ) : (
                          <TrendingDown className="h-2.5 w-2.5" />
                        )}
                        {a.delta > 0 ? '+' : '−'}
                        {Math.abs(a.delta)}%
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {a.records} records · {a.absent} absent
                  </p>
                </div>
                {/* Collected */}
                <div className="rounded-xl border bg-muted/20 p-3 transition-all hover:shadow-sm">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Collected · {f.monthLabel.split(' ')[0]}
                  </p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums">{currency(f.collected)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    of {currency(f.billed)} billed
                  </p>
                </div>
                {/* Outstanding */}
                <div className="rounded-xl border bg-muted/20 p-3 transition-all hover:shadow-sm">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Outstanding
                  </p>
                  <p
                    className={cn(
                      'mt-0.5 text-xl font-bold tabular-nums',
                      f.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {currency(f.outstanding)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {f.outstandingBills} bill{f.outstandingBills === 1 ? '' : 's'}
                    {f.overdue > 0 ? ` · ${f.overdue} overdue` : ' · none overdue'}
                  </p>
                </div>
                {/* People */}
                <div className="rounded-xl border bg-muted/20 p-3 transition-all hover:shadow-sm">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Ahead
                  </p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums">
                    {data.people.celebrationsCount}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {data.people.celebrationsCount > 0
                      ? data.people.celebrations
                          .slice(0, 2)
                          .map((c) => `${c.name.split(' ')[0]} (${c.when})`)
                          .join(', ') + (data.people.celebrationsCount > 2 ? '…' : '')
                      : 'no celebrations'}
                  </p>
                </div>
              </div>

              {/* At-risk note + actions */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {a.atRiskTotal > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    {a.atRiskTotal} student{a.atRiskTotal === 1 ? '' : 's'} below 75% —{' '}
                    {a.atRisk
                      .slice(0, 2)
                      .map((s) => s.name.split(' ')[0])
                      .join(', ')}
                    {a.atRiskTotal > 2 ? '…' : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> No attendance concerns
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={copyText}>
                    {copied ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copy text
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
                    <Newspaper className="h-3.5 w-3.5" /> View &amp; share
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Digest text dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400">
                <Newspaper className="h-4 w-4" />
              </div>
              {data ? `${data.days}-Day Digest` : 'Digest'}
            </DialogTitle>
            <DialogDescription>
              {data?.period.label} · generated {data ? new Date(data.generatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[46vh] overflow-y-auto scroll-thin whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
            {data?.text}
          </pre>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={copyText} className="gap-2 sm:mr-auto">
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? 'Copied!' : 'Copy text'}
            </Button>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={postAnnouncement} disabled={posting} className="gap-2">
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Post as announcement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
