// ─── Shared helpers (ports of the Prisma API utility functions) ────────────
import type { Request, Response, NextFunction, RequestHandler } from 'express'

export const round2 = (n: number): number => Math.round(n * 100) / 100

export const currentMonth = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const isValidMonth = (s?: string | null): boolean =>
  !!s && /^\d{4}-\d{2}$/.test(s)

export const parseDate = (v?: string | null): Date | null => {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

export const parseAmount = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v as string) : (v as number)
  if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return null
  return n
}

// Escape user input for substring regex (case-insensitive = SQLite LIKE parity)
export const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const containsRe = (s: string): RegExp => new RegExp(escapeRe(s), 'i')

export const qs = (req: Request): URLSearchParams =>
  new URL(req.url, 'http://localhost').searchParams

// async handler wrapper → forwards thrown errors to the error middleware
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }

// ─── Payroll breakdown (EPF 8% employee / 12% employer, ETF 3% employer) ───
export interface SalaryBreakdown {
  basicSalary: number
  allowances: number
  gross: number
  epfEmployee: number
  netSalary: number
  epfEmployer: number
  etfEmployer: number
  employerCost: number
}
export function breakdown(basic: number, allowances: number): SalaryBreakdown {
  const b = Math.max(0, basic || 0)
  const a = Math.max(0, allowances || 0)
  const gross = b + a
  const epfEmployee = b * 0.08
  const netSalary = gross - epfEmployee
  const epfEmployer = b * 0.12
  const etfEmployer = b * 0.03
  const employerCost = gross + epfEmployer + etfEmployer
  return { basicSalary: b, allowances: a, gross, epfEmployee, netSalary, epfEmployer, etfEmployer, employerCost }
}

// ─── Payment status computation ─────────────────────────────────────────────
export function computeStatus(
  amount: number,
  paidAmount: number,
  prevStatus?: string,
): { status: string; paidDate: Date | null; updatedPaidAmount: number } {
  if (paidAmount <= 0) {
    return { status: prevStatus === 'Overdue' ? 'Overdue' : 'Pending', paidDate: null, updatedPaidAmount: 0 }
  }
  if (paidAmount >= amount) {
    return { status: 'Paid', paidDate: new Date(), updatedPaidAmount: paidAmount }
  }
  return { status: 'Partial', paidDate: new Date(), updatedPaidAmount: paidAmount }
}

// ─── WhatsApp phone normalisation (mirrors lib/school.ts toWaPhone) ─────────
export function toWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = '94' + digits.slice(1)
  if (!digits.startsWith('94') && digits.length === 9) digits = '94' + digits
  return digits.length >= 9 && digits.length <= 13 ? digits : null
}

// ─── Attendance day helpers ─────────────────────────────────────────────────
export function dayRange(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10))
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0)
  const end = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999)
  return { start, end }
}

export function todayStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// "HH:MM" (or "HH:MM:SS") → Date on the given date; null if invalid/empty
export function timeToDate(dateStr: string, time?: string | null): Date | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim())
  if (!m) return null
  const [y, mo, d] = dateStr.split('-').map((n) => parseInt(n, 10))
  const hh = Math.min(23, parseInt(m[1], 10))
  const mm = Math.min(59, parseInt(m[2], 10))
  const ss = m[3] ? Math.min(59, parseInt(m[3], 10)) : 0
  return new Date(y, (mo || 1) - 1, d || 1, hh, mm, ss, 0)
}

// Calendar-month range for a "YYYY-MM" string (UTC-safe convention)
export function monthRangeUTC(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) }
}

// Local calendar-month range (attendance/heatmap convention)
export function monthRangeLocal(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) }
}

export const monthKeyOf = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

export const lkr = (n: number): string => 'LKR ' + Math.round(n).toLocaleString('en-US')

export const dayLabel = (d: Date): string =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function todayUtc(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export function nextOccurrence(month: number, day: number, from: Date): Date {
  const y = from.getUTCFullYear()
  let d = new Date(Date.UTC(y, month - 1, day))
  if (d.getTime() < from.getTime()) d = new Date(Date.UTC(y + 1, month - 1, day))
  return d
}

export function yearsBetween(from: Date, to: Date): number {
  let age = to.getUTCFullYear() - from.getUTCFullYear()
  const beforeBirthday =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate())
  if (beforeBirthday) age -= 1
  return age
}

export const isReachablePhone = (phone?: string | null): boolean => {
  if (!phone) return false
  return phone.replace(/\D/g, '').length >= 9
}
