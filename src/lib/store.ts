'use client'

import { create } from 'zustand'
import type { SectionKey } from '@/lib/types'

interface AppState {
  section: SectionKey
  setSection: (s: SectionKey) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  commandOpen: boolean
  setCommandOpen: (v: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  section: 'dashboard',
  setSection: (section) => set({ section }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}))
