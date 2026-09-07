'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Avoid setState-in-effect: useSyncExternalStore gives a client-only value
// without triggering cascading renders.
const emptySubscribe = () => () => {}
function getClientSnapshot() {
  return true
}
function getServerSnapshot() {
  return false
}

export function ThemeToggle() {
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot)
  const { theme, setTheme } = useTheme()
  if (!mounted) return <div className="h-9 w-9" />
  const isDark = theme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-full"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Switch to light' : 'Switch to dark'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}
