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
} from 'lucide-react'
import { api } from '@/lib/api'
import { SectionHeader } from '@/components/shared/section-header'
import { StatCard } from '@/components/shared/stat-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/lib/store'
import { initials, avatarColor, fmtTime } from '@/lib/format'

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
}

export function DashboardSection() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const { setSection } = useAppStore()

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
                    <stop offset="5%" stopColor="#1e40af" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#1e40af" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gTea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
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
                  strokeWidth={2}
                  fill="url(#gStu)"
                />
                <Area
                  type="monotone"
                  dataKey="teachers"
                  name="Teachers"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  fill="url(#gTea)"
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
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="code" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
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
              <p className="py-6 text-center text-xs text-muted-foreground">
                No tuition classes scheduled for today.
              </p>
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
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={40} />
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
    </div>
  )
}
