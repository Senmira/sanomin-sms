// Small formatting helpers used across the app

export function initials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  'bg-red-500/15 text-red-700 dark:text-red-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
]

export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function fmtDate(d?: string | Date | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function fmtDateTime(d?: string | Date | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtTime(d?: string | Date | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ageFromDob(dob?: string | Date | null): string {
  if (!dob) return '—'
  const dt = typeof dob === 'string' ? new Date(dob) : dob
  if (isNaN(dt.getTime())) return '—'
  const now = new Date()
  let years = now.getFullYear() - dt.getFullYear()
  let months = now.getMonth() - dt.getMonth()
  if (months < 0) {
    years--
    months += 12
  }
  if (now.getDate() < dt.getDate()) months = Math.max(0, months - 1)
  return `${years}y ${months}m`
}

export function currency(n: number): string {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
  }).format(n || 0)
}

// Compact currency for stat cards / tight spaces: LKR 245K, LKR 1.2M
export function currencyCompact(n: number): string {
  const v = n || 0
  if (v >= 1_000_000) return `LKR ${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`
  if (v >= 1_000) return `LKR ${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K`
  return `LKR ${v}`
}

// Relative time: "2 mins ago", "just now", "3h ago"
export function timeAgo(d?: string | Date | null): string {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return '—'
  const diff = Date.now() - dt.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min${min > 1 ? 's' : ''} ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return fmtDate(dt)
}

// Mini sparkline data: returns last N values normalized 0-100 for sparkline bars
export function sparkline(values: number[], maxBars = 12): number[] {
  if (!values.length) return []
  const slice = values.slice(-maxBars)
  const max = Math.max(...slice, 1)
  return slice.map((v) => Math.round((v / max) * 100))
}
