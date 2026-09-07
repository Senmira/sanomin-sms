'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { SectionHeader } from '@/components/shared/section-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  School,
  ScanLine,
  Fingerprint,
  Save,
  RotateCcw,
  Clock,
  CalendarDays,
  Building2,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
} from 'lucide-react'

interface Settings {
  school_name: string
  school_address: string
  school_phone: string
  school_email: string
  academic_year: string
  barcode_prefix: string
  barcode_enabled: string
  fingerprint_enabled: string
  checkin_grace_minutes: string
  [k: string]: string
}

const DEFAULTS: Settings = {
  school_name: 'SANOMIN International Preschool',
  school_address: 'Angoda, Colombo, Sri Lanka',
  school_phone: '+94 11 234 5678',
  school_email: 'info@sanomin.lk',
  academic_year: '2025',
  barcode_prefix: 'SAN',
  barcode_enabled: 'true',
  fingerprint_enabled: 'true',
  checkin_grace_minutes: '15',
}

export function SettingsSection() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [original, setOriginal] = useState<Settings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    api<Record<string, string>>('/api/settings')
      .then((s) => {
        if (!alive) return
        const merged = { ...DEFAULTS, ...s }
        setSettings(merged)
        setOriginal(merged)
      })
      .catch(() => {
        if (alive) toast.error('Failed to load settings')
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const set = (k: keyof Settings, v: string) =>
    setSettings((s) => ({ ...s, [k]: v }))

  const dirty = JSON.stringify(settings) !== JSON.stringify(original)

  const save = async () => {
    setSaving(true)
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify(settings) })
      setOriginal(settings)
      toast.success('Settings saved')
    } catch (e: any) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Settings"
        description="School profile & attendance device configuration"
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => setSettings(original)}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Reset
            </Button>
            <Button size="sm" disabled={!dirty || saving} onClick={save}>
              <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      />

      {/* Admin notice */}
      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-brand-gradient-soft p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="text-sm">
          <p className="font-semibold">Administrator access</p>
          <p className="text-muted-foreground">
            This panel is restricted to school administrators. Device settings control how the
            barcode & fingerprint scanners process attendance.
          </p>
        </div>
        {dirty && <Badge className="ml-auto">Unsaved changes</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* School profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <School className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">School Profile</CardTitle>
                <CardDescription>
                  Identity & contact details shown across the system — receipts, fee statements,
                  payslips, attendance registers and reminder messages all use these values
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="School name" icon={<School className="h-4 w-4" />}>
              <Input value={settings.school_name} onChange={(e) => set('school_name', e.target.value)} />
            </Field>
            <Field label="Address" icon={<MapPin className="h-4 w-4" />}>
              <Input value={settings.school_address} onChange={(e) => set('school_address', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" icon={<Phone className="h-4 w-4" />}>
                <Input value={settings.school_phone} onChange={(e) => set('school_phone', e.target.value)} />
              </Field>
              <Field label="Email" icon={<Mail className="h-4 w-4" />}>
                <Input value={settings.school_email} onChange={(e) => set('school_email', e.target.value)} />
              </Field>
            </div>
            <Field label="Academic year" icon={<CalendarDays className="h-4 w-4" />}>
              <Input
                value={settings.academic_year}
                onChange={(e) => set('academic_year', e.target.value)}
                placeholder="2025"
              />
            </Field>
          </CardContent>
        </Card>

        {/* Attendance devices */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-accent-foreground" />
              <div>
                <CardTitle className="text-base">Attendance Devices</CardTitle>
                <CardDescription>
                  Barcode readers (students) & fingerprint readers (teachers)
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ScanLine className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Barcode scanner</p>
                  <p className="text-xs text-muted-foreground">
                    Students scan their ID barcode to check in/out
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.barcode_enabled === 'true'}
                onCheckedChange={(v) => set('barcode_enabled', v ? 'true' : 'false')}
              />
            </div>

            <Field label="Barcode prefix" hint="Auto-prepended to student IDs (e.g. SAN + P24001)">
              <Input
                value={settings.barcode_prefix}
                onChange={(e) => set('barcode_prefix', e.target.value.toUpperCase())}
                className="font-mono"
              />
            </Field>

            <Separator />

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent-foreground">
                  <Fingerprint className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Fingerprint reader</p>
                  <p className="text-xs text-muted-foreground">
                    Teachers scan their fingerprint to check in/out
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.fingerprint_enabled === 'true'}
                onCheckedChange={(v) => set('fingerprint_enabled', v ? 'true' : 'false')}
              />
            </div>

            <Field label="Check-in grace period (minutes)" icon={<Clock className="h-4 w-4" />} hint="Arrivals after this many minutes are marked Late">
              <Input
                type="number"
                min={0}
                max={120}
                value={settings.checkin_grace_minutes}
                onChange={(e) => set('checkin_grace_minutes', e.target.value)}
                className="w-28"
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About SANOMIN SMS</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <Info label="Version" value="v1.0.0" />
          <Info label="Database" value="SQLite (local)" />
          <Info label="Framework" value="Next.js 16 · TypeScript" />
          <Info label="Students on record" value="48 (seeded)" />
          <Info label="Programs" value="5 active" />
          <Info label="License" value="SANOMIN International Preschool" />
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  hint,
  icon,
  children,
}: {
  label: string
  hint?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  )
}
