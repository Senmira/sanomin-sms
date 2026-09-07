'use client'

// ─── School branding info (settings-driven) ────────────────────────────────
// All printable sheets (receipts, statements, payslips, registers) read the
// institute name / address / phone from this module instead of hardcoding
// "SANOMIN". Settings live in the Setting table (keys school_*), editable in
// the Settings section — save there and every printed sheet picks it up.
import { useEffect, useState } from 'react'
import { api } from './api'

export interface SchoolInfo {
  name: string // "SANOMIN International Preschool"
  shortName: string // "SANOMIN" (first word)
  subtitle: string // "International Preschool" (rest of the name)
  address: string
  phone: string
  email: string
}

export const SCHOOL_DEFAULTS: SchoolInfo = {
  name: 'SANOMIN International Preschool',
  shortName: 'SANOMIN',
  subtitle: 'International Preschool',
  address: 'Angoda, Colombo, Sri Lanka',
  phone: '+94 11 234 5678',
  email: 'info@sanomin.lk',
}

// Module-level cache — one fetch per browser session, shared by every print
// surface. Falls back to defaults when the settings API is unreachable.
let cache: SchoolInfo | null = null
let inflight: Promise<SchoolInfo> | null = null

function fromSettings(s: Record<string, string>): SchoolInfo {
  const name = (s.school_name || '').trim() || SCHOOL_DEFAULTS.name
  const words = name.split(/\s+/)
  return {
    name,
    shortName: words[0] || SCHOOL_DEFAULTS.shortName,
    subtitle: words.slice(1).join(' ') || SCHOOL_DEFAULTS.subtitle,
    address: (s.school_address || '').trim() || SCHOOL_DEFAULTS.address,
    phone: (s.school_phone || '').trim() || SCHOOL_DEFAULTS.phone,
    email: (s.school_email || '').trim() || SCHOOL_DEFAULTS.email,
  }
}

export function getSchoolInfo(): Promise<SchoolInfo> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = api<Record<string, string>>('/api/settings')
      .then((s) => {
        cache = fromSettings(s || {})
        return cache
      })
      .catch(() => SCHOOL_DEFAULTS)
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

// React hook: renders with defaults immediately, re-renders once the cached
// settings arrive. Safe to use in multiple components (single network fetch).
export function useSchoolInfo(): SchoolInfo {
  const [info, setInfo] = useState<SchoolInfo>(cache ?? SCHOOL_DEFAULTS)
  useEffect(() => {
    let alive = true
    // Async resolution only — never sets state synchronously in the effect body
    getSchoolInfo().then((i) => {
      if (alive) setInfo(i)
    })
    return () => {
      alive = false
    }
  }, [])
  return info
}

// ─── WhatsApp phone normalisation (Sri Lanka) ──────────────────────────────
// "077 123 4567" → "94771234567"; "+94 77 123 4567" → "94771234567".
// Returns null when no usable number remains.
export function toWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = '94' + digits.slice(1)
  if (!digits.startsWith('94') && digits.length === 9) digits = '94' + digits
  return digits.length >= 9 && digits.length <= 13 ? digits : null
}
