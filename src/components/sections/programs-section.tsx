'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  BookOpen,
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  Users,
  Wallet,
  MoreVertical,
  CheckCircle2,
  Power,
  Layers,
  Loader2,
} from 'lucide-react'

import { api } from '@/lib/api'
import { ProgramRow } from '@/lib/types'
import { currency } from '@/lib/format'

import { SectionHeader } from '@/components/shared/section-header'
import { StatCard } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── List response shape ───────────────────────────────────────────────────
interface ListResponse {
  data: ProgramRow[]
}

// ─── Preset color swatches (brand-aligned, no raw indigo/blue utilities) ───
const PRESET_COLORS = [
  '#1e40af', // royal blue (PRESCHOOL brand)
  '#7c3aed', // purple
  '#dc2626', // red
  '#0d9488', // teal
  '#d97706', // amber
  '#be185d', // pink
  '#15803d', // green
  '#475569', // slate
]

interface FormState {
  code: string
  name: string
  description: string
  color: string
  monthlyFee: string
  active: boolean
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  description: '',
  color: '#7c3aed',
  monthlyFee: '0',
  active: true,
}

// ─── Main section ───────────────────────────────────────────────────────────
export function ProgramsSection() {
  const [rows, setRows] = useState<ProgramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [addEditOpen, setAddEditOpen] = useState(false)
  const [editing, setEditing] = useState<ProgramRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProgramRow | null>(null)

  // ─── Fetch list ──────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoading(true)
    api<ListResponse>('/api/programs')
      .then((res) => {
        if (!alive) return
        setRows(res.data)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!alive) return
        const msg = err instanceof Error ? err.message : 'Failed to load programs'
        setError(msg)
        setLoading(false)
        toast.error(msg)
      })
    return () => {
      alive = false
    }
  }, [])

  const reload = useCallback(() => {
    api<ListResponse>('/api/programs')
      .then((res) => {
        setRows(res.data)
        setError(null)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load programs'
        toast.error(msg)
      })
  }, [])

  // ─── Stats (computed via useMemo so we never mutate during render) ──────
  const stats = useMemo(() => {
    let totalEnrollments = 0
    let revenue = 0
    let activeCount = 0
    for (const p of rows) {
      const enrolled = p._count?.enrollments ?? 0
      totalEnrollments += enrolled
      revenue += enrolled * (p.monthlyFee || 0)
      if (p.active) activeCount++
    }
    return {
      total: rows.length,
      active: activeCount,
      totalEnrollments,
      revenue,
    }
  }, [rows])

  // ─── Dialog handlers ─────────────────────────────────────────────────────
  const openAdd = useCallback(() => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setAddEditOpen(true)
  }, [])

  const openEdit = useCallback((p: ProgramRow) => {
    setEditing(p)
    setForm({
      code: p.code,
      name: p.name,
      description: p.description || '',
      color: p.color,
      monthlyFee: String(p.monthlyFee ?? 0),
      active: p.active,
    })
    setAddEditOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setAddEditOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }, [])

  // ─── Quick toggle active (inline) ────────────────────────────────────────
  const toggleActive = useCallback(
    async (p: ProgramRow, next: boolean) => {
      // Optimistic local update
      setRows((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, active: next } : x)),
      )
      try {
        await api(`/api/programs/${p.id}`, {
          method: 'PUT',
          body: JSON.stringify({ active: next }),
        })
        toast.success(`${p.name} ${next ? 'activated' : 'deactivated'}`)
      } catch (err) {
        // Revert on error
        setRows((prev) =>
          prev.map((x) => (x.id === p.id ? { ...x, active: p.active } : x)),
        )
        const msg = err instanceof Error ? err.message : 'Failed to update'
        toast.error(msg)
      }
    },
    [],
  )

  // ─── Save (create/update) ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Code and name are required')
      return
    }
    setSaving(true)
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      color: form.color,
      monthlyFee: Number(form.monthlyFee) || 0,
      active: form.active,
    }
    try {
      if (editing) {
        const updated = await api<ProgramRow>(`/api/programs/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
        toast.success(`${updated.name} updated`)
      } else {
        const created = await api<ProgramRow>('/api/programs', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setRows((prev) => [...prev, created])
        toast.success(`${created.name} created`)
      }
      closeDialog()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }, [form, editing, closeDialog])

  // ─── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await api(`/api/programs/${deleteTarget.id}`, { method: 'DELETE' })
      setRows((prev) => prev.filter((x) => x.id !== deleteTarget.id))
      toast.success(`${deleteTarget.name} deleted`)
      setDeleteTarget(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      toast.error(msg)
    }
  }, [deleteTarget])

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Programs"
        description="Curriculum & enrichment programs"
        icon={<BookOpen className="h-5 w-5" />}
        actions={
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Program
          </Button>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Programs"
          value={stats.total}
          icon={Layers}
          accent="blue"
          hint="All curriculum programs"
        />
        <StatCard
          label="Active Programs"
          value={stats.active}
          icon={CheckCircle2}
          accent="green"
          hint={`${stats.total - stats.active} inactive`}
        />
        <StatCard
          label="Total Enrollments"
          value={stats.totalEnrollments}
          icon={Users}
          accent="purple"
          hint="Across all programs"
        />
        <StatCard
          label="Monthly Revenue Potential"
          value={currency(stats.revenue)}
          icon={Wallet}
          accent="amber"
          hint="Enrollments × monthly fee"
        />
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="Failed to load programs"
          description={error}
          icon={Layers}
          action={
            <Button onClick={reload} size="sm" variant="outline">
              Retry
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No programs yet"
          description="Create your first program to start enrolling students."
          icon={GraduationCap}
          action={
            <Button onClick={openAdd} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Program
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <ProgramCard
              key={p.id}
              program={p}
              onEdit={() => openEdit(p)}
              onToggleActive={(next) => toggleActive(p, next)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={addEditOpen} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Program' : 'Add Program'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update program details. Code must remain unique.'
                : 'Create a new curriculum or enrichment program.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="program-code">Code</Label>
                <Input
                  id="program-code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="PRESCHOOL"
                  disabled={!!editing}
                  className="font-mono uppercase"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="program-fee">Monthly Fee (LKR)</Label>
                <Input
                  id="program-fee"
                  type="number"
                  min={0}
                  value={form.monthlyFee}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, monthlyFee: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="program-name">Name</Label>
              <Input
                id="program-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Preschool"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="program-desc">Description</Label>
              <Textarea
                id="program-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Short description of this program"
                className="min-h-20"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    aria-label={`Select color ${c}`}
                    className="h-8 w-8 rounded-full border-2 ring-offset-2 ring-offset-background transition-all hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor:
                        form.color.toLowerCase() === c.toLowerCase()
                          ? 'var(--foreground)'
                          : 'transparent',
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, color: e.target.value }))
                  }
                  aria-label="Custom color"
                  className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
                />
                <span className="ml-1 font-mono text-xs text-muted-foreground">
                  {form.color}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="program-active" className="cursor-pointer">
                  Active
                </Label>
                <p className="text-xs text-muted-foreground">
                  Inactive programs are hidden from enrollment
                </p>
              </div>
              <Switch
                id="program-active"
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Program'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description={
          deleteTarget && (deleteTarget._count?.enrollments ?? 0) > 0
            ? `This program has ${deleteTarget._count?.enrollments} enrollment(s). You must reassign or remove them before deleting.`
            : 'This action cannot be undone. The program will be permanently removed.'
        }
        confirmText="Delete"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ─── Program Card ───────────────────────────────────────────────────────────
interface ProgramCardProps {
  program: ProgramRow
  onEdit: () => void
  onToggleActive: (next: boolean) => void
  onDelete: () => void
}

function ProgramCard({
  program,
  onEdit,
  onToggleActive,
  onDelete,
}: ProgramCardProps) {
  const enrolled = program._count?.enrollments ?? 0
  const classes = program._count?.classes ?? 0
  const color = program.color || '#7c3aed'

  return (
    <Card className="group relative overflow-hidden p-0 transition-shadow hover:shadow-md">
      {/* Top color accent bar */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: color }}
              aria-hidden
            >
              {program.code.slice(0, 2)}
            </span>
            <div>
              <Badge variant="secondary" className="font-mono uppercase">
                {program.code}
              </Badge>
              {!program.active && (
                <Badge variant="outline" className="ml-1.5 text-muted-foreground">
                  Inactive
                </Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onToggleActive(!program.active)}
              >
                <Power className="mr-2 h-4 w-4" />
                {program.active ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div>
          <h3 className="text-lg font-semibold leading-tight">{program.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {program.description || 'No description provided.'}
          </p>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold tracking-tight">
            {currency(program.monthlyFee || 0)}
          </span>
          <span className="text-xs text-muted-foreground">/ month</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{enrolled}</span>
            <span className="text-xs text-muted-foreground">enrolled</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5">
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{classes}</span>
            <span className="text-xs text-muted-foreground">classes</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={program.active}
              onCheckedChange={onToggleActive}
              aria-label={`Toggle ${program.name} active`}
            />
            <span className="text-xs text-muted-foreground">
              {program.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Manage
          </Button>
        </div>
      </div>
    </Card>
  )
}
