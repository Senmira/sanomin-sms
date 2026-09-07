'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import type { SectionKey } from '@/lib/types'
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Banknote,
  ScanLine,
  CalendarDays,
  BookOpen,
  Wallet,
  ReceiptText,
  Megaphone,
  FileBarChart,
  Settings,
  Menu,
  Search,
  Bell,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface NavItem {
  key: SectionKey
  label: string
  icon: typeof LayoutDashboard
  group: string
  description: string
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview', description: 'Key metrics & recent activity' },
  { key: 'students', label: 'Students', icon: Users, group: 'Records', description: 'Manage student records & barcodes' },
  { key: 'teachers', label: 'Teachers', icon: GraduationCap, group: 'Records', description: 'Internal & external tuition staff' },
  { key: 'attendance', label: 'Attendance', icon: ScanLine, group: 'Operations', description: 'Barcode & fingerprint check-in/out' },
  { key: 'classes', label: 'Classes', icon: CalendarDays, group: 'Operations', description: 'Tuition class scheduling' },
  { key: 'programs', label: 'Programs', icon: BookOpen, group: 'Operations', description: 'Preschool, Daycare, IT, Elocution, Dancing' },
  { key: 'payroll', label: 'Payroll', icon: Banknote, group: 'Operations', description: 'Teacher salaries, EPF/ETF & payslips' },
  { key: 'fees', label: 'Fees & Payments', icon: Wallet, group: 'Operations', description: 'Monthly tuition fee tracking & receipts' },
  { key: 'expenses', label: 'Expenses', icon: ReceiptText, group: 'Operations', description: 'Institute operating expenses & outgoings' },
  { key: 'announcements', label: 'Announcements', icon: Megaphone, group: 'Operations', description: 'Broadcast notices to staff & parents' },
  { key: 'reports', label: 'Reports', icon: FileBarChart, group: 'Insights', description: 'Attendance & enrollment analytics' },
  { key: 'settings', label: 'Settings', icon: Settings, group: 'Insights', description: 'School & device configuration' },
]

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/20 shadow-md">
        <img src="/sanomin-logo.jpg" alt="SANOMIN logo" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-bold text-sidebar-foreground">SANOMIN</p>
        <p className="truncate text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
          International Preschool
        </p>
      </div>
    </div>
  )
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { section, setSection } = useAppStore()
  const groups = Array.from(new Set(NAV.map((n) => n.group)))
  return (
    <nav className="flex flex-col gap-5 px-3 py-4">
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            {g}
          </p>
          {NAV.filter((n) => n.group === g).map((item) => {
            const Icon = item.icon
            const active = section === item.key
            return (
              <button
                key={item.key}
                onClick={() => {
                  setSection(item.key)
                  onNavigate?.()
                }}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
                title={item.description}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 w-1 rounded-r-full bg-sidebar-primary-foreground" />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { setSection } = useAppStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{
    students: any[]
    teachers: any[]
    payments: any[]
    announcements: any[]
  } | null>(null)

  // Debounced unified search
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      // Defer to avoid synchronous setState in effect body
      const t = setTimeout(() => setResults(null), 0)
      return () => clearTimeout(t)
    }
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setResults(d))
        .catch(() => setResults(null))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const hasResults =
    results &&
    (results.students.length > 0 ||
      results.teachers.length > 0 ||
      results.payments.length > 0 ||
      results.announcements.length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Quick navigation & search</DialogTitle>
        </DialogHeader>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
        >
          <CommandInput
            placeholder="Search students, teachers, payments, announcements… or jump to a module"
            onValueChange={(v) => setQuery(v)}
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>
              {query.trim().length >= 2 ? 'No matches found.' : 'Type to search across records…'}
            </CommandEmpty>

            {/* Module navigation (always shown, but lower when searching) */}
            <CommandGroup heading={query.trim().length >= 2 ? 'Modules' : 'Jump to module'}>
              {NAV.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.key}
                    value={`nav-${item.label}`}
                    onSelect={() => {
                      setSection(item.key)
                      onOpenChange(false)
                      setQuery('')
                    }}
                    className="gap-3"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span className="text-sm">{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>

            {/* Unified search results */}
            {results && results.students.length > 0 && (
              <CommandGroup heading="Students">
                {results.students.map((s) => (
                  <CommandItem
                    key={`stu-${s.id}`}
                    value={`student ${s.fullName} ${s.studentId}`}
                    onSelect={() => {
                      setSection('students')
                      onOpenChange(false)
                      setQuery('')
                    }}
                    className="gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-xs font-bold text-blue-600 dark:text-blue-400">
                      {s.fullName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{s.fullName}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.studentId} · {s.gender} · {s.ageGroup ?? '—'} · {s.status}
                      </span>
                    </div>
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results && results.teachers.length > 0 && (
              <CommandGroup heading="Teachers">
                {results.teachers.map((t) => (
                  <CommandItem
                    key={`tea-${t.id}`}
                    value={`teacher ${t.fullName} ${t.teacherId}`}
                    onSelect={() => {
                      setSection('teachers')
                      onOpenChange(false)
                      setQuery('')
                    }}
                    className="gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-xs font-bold text-purple-600 dark:text-purple-400">
                      {t.fullName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{t.fullName}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.teacherId} · {t.type} · {t.specialization ?? '—'}
                      </span>
                    </div>
                    <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results && results.payments.length > 0 && (
              <CommandGroup heading="Payments">
                {results.payments.map((p) => (
                  <CommandItem
                    key={`pay-${p.id}`}
                    value={`payment ${p.receiptNo} ${p.studentName}`}
                    onSelect={() => {
                      setSection('fees')
                      onOpenChange(false)
                      setQuery('')
                    }}
                    className="gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      <Wallet className="h-4 w-4" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {p.receiptNo} · {p.studentName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.month} · LKR {p.paidAmount.toLocaleString()}/{p.amount.toLocaleString()} · {p.status}
                      </span>
                    </div>
                    {p.programColor && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: p.programColor }}
                        title={p.programCode ?? ''}
                      />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results && results.announcements.length > 0 && (
              <CommandGroup heading="Announcements">
                {results.announcements.map((a) => (
                  <CommandItem
                    key={`ann-${a.id}`}
                    value={`announcement ${a.title}`}
                    onSelect={() => {
                      setSection('announcements')
                      onOpenChange(false)
                      setQuery('')
                    }}
                    className="gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-400">
                      <Megaphone className="h-4 w-4" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {a.pinned && '📌 '}{a.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {a.category} · {a.audience} · {a.priority}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {query.trim().length >= 2 && !hasResults && results !== null && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                No records matched &ldquo;{query}&rdquo;. Try a different name, ID, or receipt number.
              </div>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { section, commandOpen, setCommandOpen } = useAppStore()
  const current = NAV.find((n) => n.key === section)

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          <Logo />
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 p-3">
            <Avatar className="h-9 w-9 ring-1 ring-sidebar-border">
              <AvatarFallback className="bg-brand-gradient text-white">AD</AvatarFallback>
            </Avatar>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-semibold text-sidebar-foreground">Administrator</p>
              <p className="truncate text-[10px] text-sidebar-foreground/50">admin@sanomin.lk</p>
            </div>
            <ShieldCheck className="ml-auto h-4 w-4 text-emerald-400" />
          </div>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <div className="flex h-16 items-center border-b border-sidebar-border px-4">
            <Logo />
          </div>
          <div className="scroll-thin h-[calc(100vh-4rem)] overflow-y-auto">
            <NavLinks onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </Sheet>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">SANOMIN SMS</span>
            <ChevronRight className="hidden h-4 w-4 text-muted-foreground/50 sm:inline" />
            <span className="truncate font-semibold">{current?.label}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden h-9 gap-2 md:flex"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="text-muted-foreground">Search...</span>
              <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setCommandOpen(true)}>
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
            </Button>
            <ThemeToggle />
            <Avatar className="h-9 w-9 ring-1 ring-border">
              <AvatarFallback className="bg-brand-gradient text-xs font-semibold text-white">
                AD
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>

        {/* Sticky footer */}
        <footer className="mt-auto border-t bg-muted/40 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-2 text-xs text-foreground/70 sm:flex-row">
            <p className="flex items-center gap-2">
              <span className="hidden font-semibold text-foreground/80 sm:inline">SANOMIN SMS</span>
              <span className="hidden text-muted-foreground/60 sm:inline">·</span>
              <span>© {new Date().getFullYear()} SANOMIN International Preschool — Administrator Portal</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                All systems operational
              </span>
              <span className="text-muted-foreground/60">v1.1</span>
            </p>
          </div>
        </footer>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  )
}
