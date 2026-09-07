'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { AppShell } from '@/components/layout/app-shell'
import { DashboardSection } from '@/components/sections/dashboard-section'
import { StudentsSection } from '@/components/sections/students-section'
import { TeachersSection } from '@/components/sections/teachers-section'
import { PayrollSection } from '@/components/sections/payroll-section'
import { AttendanceSection } from '@/components/sections/attendance-section'
import { ClassesSection } from '@/components/sections/classes-section'
import { ProgramsSection } from '@/components/sections/programs-section'
import { FeesSection } from '@/components/sections/fees-section'
import { ExpensesSection } from '@/components/sections/expenses-section'
import { AnnouncementsSection } from '@/components/sections/announcements-section'
import { ReportsSection } from '@/components/sections/reports-section'
import { SettingsSection } from '@/components/sections/settings-section'

export default function Home() {
  const { section, setCommandOpen } = useAppStore()

  // ⌘K / Ctrl+K to open command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen])

  return (
    <AppShell>
      <div key={section} className="animate-section-in">
        {section === 'dashboard' && <DashboardSection />}
        {section === 'students' && <StudentsSection />}
        {section === 'teachers' && <TeachersSection />}
        {section === 'payroll' && <PayrollSection />}
        {section === 'attendance' && <AttendanceSection />}
        {section === 'classes' && <ClassesSection />}
        {section === 'programs' && <ProgramsSection />}
        {section === 'fees' && <FeesSection />}
        {section === 'expenses' && <ExpensesSection />}
        {section === 'announcements' && <AnnouncementsSection />}
        {section === 'reports' && <ReportsSection />}
        {section === 'settings' && <SettingsSection />}
      </div>
    </AppShell>
  )
}
