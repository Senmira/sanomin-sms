'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import type { SectionKey } from '@/lib/types'
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ScanLine,
  CalendarDays,
  BookOpen,
  Wallet,
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
  { key: 'fees', label: 'Fees & Payments', icon: Wallet, group: 'Operations', description: 'Monthly tuition fee tracking & receipts' },
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Quick navigation</DialogTitle>
        </DialogHeader>
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          <CommandInput placeholder="Search modules & jump to..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Modules">
              {NAV.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.key}
                    onSelect={() => {
                      setSection(item.key)
                      onOpenChange(false)
                    }}
                    className="gap-3"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
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
