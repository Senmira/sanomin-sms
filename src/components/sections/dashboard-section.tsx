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
} from 'lucide-react'
import { api } from '@/lib/api'
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
          <div className="mt-4 rounded-lg border bg-muted/20 p-4">
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
        </CardContent>
      </Card>

      {/* Recent activity + Age group */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Students by Age Group</CardTitle>
          </CardHeader>
          <CardContent>
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
    </div>
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
