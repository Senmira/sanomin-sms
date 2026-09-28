'use client'
import { useEffect, useRef, useState } from 'react'

interface ScanResult {
  status: 'ok' | 'not_found' | 'inactive'
  action?: 'check-in' | 'check-out' | 'already-complete'
  personType?: 'Student' | 'Teacher'
  person?: {
    id: string
    ref: string
    name: string
    photoUrl: string | null
    programs: { code: string; name: string; color: string }[]
    type: string | null
  }
  record?: {
    checkIn: string | null
    checkOut: string | null
    status: string
  }
  payment?: {
    status: string
    billed: number
    paid: number
    balance: number
  } | null
  message?: string
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default function KioskPage() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [time, setTime] = useState(new Date())
  const inputRef = useRef<HTMLInputElement>(null)

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-clear the result screen after 5 seconds
  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => setResult(null), 5000)
    return () => clearTimeout(t)
  }, [result])

  // Keep the hidden input focused so a USB barcode reader types into it
  useEffect(() => {
    const t = setInterval(() => {
      if (!busy) inputRef.current?.focus()
    }, 500)
    return () => clearInterval(t)
  }, [busy])

  async function handleScan(barcode: string) {
    const trimmed = barcode.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/kiosk/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kiosk-key': process.env.NEXT_PUBLIC_KIOSK_KEY || '',
        },
        body: JSON.stringify({ barcode: trimmed }),
      })
      const data = (await res.json()) as ScanResult
      setResult(data)
    } catch {
      setResult({ status: 'not_found', message: 'Network error — please try again' })
    } finally {
      setInput('')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8 relative overflow-hidden">
      {/* Hidden capture input — the barcode reader types into this and presses Enter */}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleScan(input)
          }
        }}
        className="absolute -left-[9999px] opacity-0"
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />

      {!result ? (
        // ─── Idle screen ───────────────────────────────────────────────────
        <div className="text-center space-y-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sanomin-logo.jpg"
            alt="Logo"
            className="h-40 mx-auto rounded-xl"
          />
          <h1 className="text-6xl md:text-7xl font-bold tracking-tight">
            Scan your ID card
          </h1>
          <p className="text-4xl md:text-5xl text-muted-foreground tabular-nums">
            {time.toLocaleTimeString('en-GB', { hour12: false })}
          </p>
          <p className="text-lg text-muted-foreground">
            {time.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      ) : result.status !== 'ok' ? (
        // ─── Error screen ──────────────────────────────────────────────────
        <div className="text-center space-y-8 max-w-2xl">
          <div className="text-9xl">❌</div>
          <h1 className="text-5xl font-bold text-red-500 leading-tight">
            {result.message || 'Scan failed'}
          </h1>
          <p className="text-2xl text-muted-foreground">
            Please see the school office
          </p>
        </div>
      ) : (
        // ─── Success screen ────────────────────────────────────────────────
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full max-w-6xl">
          {/* Photo panel */}
          <div className="flex items-center justify-center">
            {result.person?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.person.photoUrl}
                alt={result.person.name}
                className="w-80 h-80 md:w-[26rem] md:h-[26rem] rounded-3xl object-cover shadow-2xl"
              />
            ) : (
              <div className="w-80 h-80 md:w-[26rem] md:h-[26rem] rounded-3xl bg-primary/15 flex items-center justify-center text-[10rem] font-bold text-primary shadow-2xl">
                {initials(result.person?.name || '?')}
              </div>
            )}
          </div>

          {/* Info panel */}
          <div className="space-y-6 flex flex-col justify-center">
            <div>
              <h1 className="text-5xl md:text-6xl font-bold leading-tight">
                {result.person?.name}
              </h1>
              <p className="text-2xl md:text-3xl text-muted-foreground mt-2 font-mono">
                {result.person?.ref}
                {result.personType === 'Teacher' && result.person?.type
                  ? ` · ${result.person.type}`
                  : ''}
              </p>
            </div>

            {result.person?.programs && result.person.programs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {result.person.programs.map((p) => (
                  <span
                    key={p.code}
                    className="px-4 py-2 rounded-full text-lg font-medium"
                    style={{
                      backgroundColor: `${p.color}22`,
                      color: p.color,
                      border: `1px solid ${p.color}55`,
                    }}
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            )}

            <div
              className={`text-4xl md:text-5xl font-bold ${
                result.action === 'check-out' ? 'text-blue-500' : 'text-emerald-500'
              }`}
            >
              {result.action === 'check-in' && '✅ Checked in'}
              {result.action === 'check-out' && '👋 Checked out'}
              {result.action === 'already-complete' && '✔️ Already recorded'}
            </div>

            <div className="text-2xl md:text-3xl tabular-nums text-muted-foreground">
              {result.record?.checkIn && (
                <span>In: {fmtTime(result.record.checkIn)}</span>
              )}
              {result.record?.checkOut && (
                <span> · Out: {fmtTime(result.record.checkOut)}</span>
              )}
            </div>

            {result.payment && (
              <div>
                <span
                  className={`inline-block px-6 py-3 rounded-2xl text-2xl md:text-3xl font-bold ${
                    result.payment.status === 'Paid'
                      ? 'bg-emerald-500/20 text-emerald-500'
                      : result.payment.status === 'Partial'
                      ? 'bg-amber-500/20 text-amber-500'
                      : result.payment.status === 'NoBill'
                      ? 'bg-slate-500/20 text-slate-400'
                      : 'bg-red-500/20 text-red-500'
                  }`}
                >
                  {result.payment.status === 'Paid' && '🟢 Fees Paid'}
                  {result.payment.status === 'Partial' &&
                    `🟡 Partial · LKR ${result.payment.balance.toLocaleString()}`}
                  {result.payment.status === 'Pending' &&
                    `🔴 Pending · LKR ${result.payment.balance.toLocaleString()}`}
                  {result.payment.status === 'Overdue' &&
                    `🔴 Overdue · LKR ${result.payment.balance.toLocaleString()}`}
                  {result.payment.status === 'NoBill' && '⚪ No bill this month'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scan hint at bottom */}
      <div className="absolute bottom-6 left-0 right-0 text-center text-sm text-muted-foreground">
        Ready · {busy ? 'Processing…' : 'Waiting for scan'}
      </div>
    </div>
  )
}
