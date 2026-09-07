'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Megaphone,
  Plus,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Search,
  Calendar,
  Users,
  AlertTriangle,
  Bell,
  Clock,
  PartyPopper,
  CalendarOff,
  Wallet,
  Users2,
  MessageSquare,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  AnnouncementRow,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_STATUSES,
} from '@/lib/types'
import { fmtDate, fmtDateTime } from '@/lib/format'

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
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { cn } from '@/lib/utils'

interface ListResponse {
  data: AnnouncementRow[]
  total: number
  summary: {
    total: number
    byCategory: Record<string, number>
    byPriority: { High: number; Normal: number; Low: number }
    byAudience: { All: number; Staff: number; Parents: number; Teachers: number }
    pinnedCount: number
  }
}

const CATEGORY_META: Record<
  string,
  { icon: typeof Megaphone; color: string; bg: string; text: string }
> = {
  General: { icon: MessageSquare, color: '#475569', bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400' },
  Event: { icon: PartyPopper, color: '#7c3aed', bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400' },
  Holiday: { icon: CalendarOff, color: '#0d9488', bg: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400' },
  Urgent: { icon: AlertTriangle, color: '#dc2626', bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400' },
  Payment: { icon: Wallet, color: '#d97706', bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
  Meeting: { icon: Users2, color: '#1e40af', bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400' },
}

const PRIORITY_BADGE: Record<string, string> = {
  High: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  Normal: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  Low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
}

const AUDIENCE_BADGE: Record<string, string> = {
  All: 'bg-primary/10 text-primary border-primary/20',
  Staff: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
  Parents: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
  Teachers: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20',
}

export function AnnouncementsSection() {
  const [data, setData] = useState<AnnouncementRow[]>([])
  const [summary, setSummary] = useState<ListResponse['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterAudience, setFilterAudience] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('Published')

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<AnnouncementRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(null)

  const reload = useMemo(
    () => () => {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== 'Published') params.set('status', statusFilter)
      if (filterCategory !== 'all') params.set('category', filterCategory)
      if (filterAudience !== 'all') params.set('audience', filterAudience)
      if (filterPriority !== 'all') params.set('priority', filterPriority)
      if (search.trim()) params.set('q', search.trim())
      api<ListResponse>(`/api/announcements?${params.toString()}`)
        .then((r) => {
          setData(r.data)
          setSummary(r.summary)
          setError('')
        })
        .catch((e) => setError(e.message || 'Failed to load'))
        .finally(() => setLoading(false))
    },
    [statusFilter, filterCategory, filterAudience, filterPriority, search],
  )

  useEffect(() => {
    let alive = true
    const params = new URLSearchParams()
    if (statusFilter !== 'Published') params.set('status', statusFilter)
    if (filterCategory !== 'all') params.set('category', filterCategory)
    if (filterAudience !== 'all') params.set('audience', filterAudience)
    if (filterPriority !== 'all') params.set('priority', filterPriority)
    if (search.trim()) params.set('q', search.trim())
    // Defer setLoading to avoid synchronous setState in effect body
    Promise.resolve().then(() => alive && setLoading(true))
    api<ListResponse>(`/api/announcements?${params.toString()}`)
      .then((r) => {
        if (!alive) return
        setData(r.data)
        setSummary(r.summary)
        setError('')
      })
      .catch((e) => alive && setError(e.message || 'Failed to load'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [statusFilter, filterCategory, filterAudience, filterPriority, search])

  const togglePin = async (a: AnnouncementRow) => {
    try {
      await api(`/api/announcements/${a.id}`, {
        method: 'PUT',
        body: JSON.stringify({ pinned: !a.pinned }),
      })
      toast.success(a.pinned ? 'Unpinned' : 'Pinned to top')
      reload()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api(`/api/announcements/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success('Announcement deleted')
      setDeleteTarget(null)
      reload()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setFilterCategory('all')
    setFilterAudience('all')
    setFilterPriority('all')
    setStatusFilter('Published')
  }

  const hasFilters =
    search || filterCategory !== 'all' || filterAudience !== 'all' || filterPriority !== 'all' || statusFilter !== 'Published'

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Announcements & Notices"
        description="Broadcast notices to staff, parents and teachers"
        icon={<Megaphone className="h-5 w-5" />}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setEditOpen(true)
            }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New Announcement
          </Button>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Published"
          value={summary?.total ?? 0}
          icon={Bell}
          accent="blue"
          hint="Active notices"
        />
        <StatCard
          label="High Priority"
          value={summary?.byPriority.High ?? 0}
          icon={AlertTriangle}
          accent="red"
          hint="Requires attention"
        />
        <StatCard
          label="Events"
          value={summary?.byCategory.Event ?? 0}
          icon={PartyPopper}
          accent="purple"
          hint="Upcoming activities"
        />
        <StatCard
          label="For Parents"
          value={summary?.byAudience.Parents ?? 0}
          icon={Users}
          accent="amber"
          hint="Parent-targeted"
        />
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search title or content…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Published">Published</SelectItem>
                <SelectItem value="Draft">Drafts</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
                <SelectItem value="All">All</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {ANNOUNCEMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterAudience} onValueChange={setFilterAudience}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Audience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All audiences</SelectItem>
                {ANNOUNCEMENT_AUDIENCES.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {ANNOUNCEMENT_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="Failed to load announcements"
          description={error}
          icon={AlertTriangle}
          action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}
        />
      ) : data.length === 0 ? (
        <EmptyState
          title="No announcements found"
          description="Create your first announcement to broadcast notices to staff and parents."
          icon={Megaphone}
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setEditOpen(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> New Announcement
            </Button>
          }
        />
      ) : (
        <div className="scroll-thin grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          {data.map((a) => {
            const meta = CATEGORY_META[a.category] || CATEGORY_META.General
            const Icon = meta.icon
            const expired = a.expiryDate && new Date(a.expiryDate) < new Date()
            return (
              <Card
                key={a.id}
                className={cn(
                  'relative overflow-hidden transition-all hover:shadow-md',
                  a.pinned && 'ring-2 ring-primary/30',
                  expired && 'opacity-60',
                )}
              >
                {/* Left accent stripe by category color */}
                <div
                  className="absolute left-0 top-0 h-full w-1.5"
                  style={{ background: meta.color }}
                />
                <CardContent className="p-5 pl-7">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {/* Title row */}
                      <div className="flex flex-wrap items-center gap-2">
                        {a.pinned && (
                          <Badge className="gap-1 bg-primary/10 text-primary border-primary/20">
                            <Pin className="h-3 w-3" /> Pinned
                          </Badge>
                        )}
                        <Badge variant="outline" className={cn('gap-1 border', meta.bg, meta.text)}>
                          <Icon className="h-3 w-3" /> {a.category}
                        </Badge>
                        <h3 className="text-base font-semibold leading-tight">{a.title}</h3>
                      </div>
                      {/* Body */}
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                        {a.body}
                      </p>
                      {/* Meta row */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {fmtDate(a.publishDate)}
                        </span>
                        <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5', AUDIENCE_BADGE[a.audience] || AUDIENCE_BADGE.All)}>
                          <Users className="h-3 w-3" /> {a.audience}
                        </span>
                        <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5', PRIORITY_BADGE[a.priority] || PRIORITY_BADGE.Normal)}>
                          {a.priority}
                        </span>
                        {a.expiryDate && (
                          <span className={cn('flex items-center gap-1', expired && 'text-red-500')}>
                            <Clock className="h-3.5 w-3.5" />
                            {expired ? 'Expired' : 'Expires'} {fmtDate(a.expiryDate)}
                          </span>
                        )}
                        {a.status !== 'Published' && (
                          <Badge variant="secondary" className="text-[10px]">{a.status}</Badge>
                        )}
                        {a.authorName && (
                          <span className="text-muted-foreground/70">— {a.authorName}</span>
                        )}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => togglePin(a)}
                        title={a.pinned ? 'Unpin' : 'Pin to top'}
                      >
                        {a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(a)
                              setEditOpen(true)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => togglePin(a)}>
                            {a.pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                            {a.pinned ? 'Unpin' : 'Pin to top'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(a)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AnnouncementDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={editing}
        onSaved={() => {
          setEditOpen(false)
          reload()
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete announcement?"
        description={`"${deleteTarget?.title}" will be permanently removed. This cannot be undone.`}
        confirmText="Delete"
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ─── Add / Edit dialog ────────────────────────────────────────────────────
interface DialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: AnnouncementRow | null
  onSaved: () => void
}

const emptyForm = {
  title: '',
  body: '',
  category: 'General',
  audience: 'All',
  priority: 'Normal',
  pinned: false,
  status: 'Published',
  publishDate: '',
  expiryDate: '',
}

function AnnouncementDialog({ open, onOpenChange, editing, onSaved }: DialogProps) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          title: editing.title,
          body: editing.body,
          category: editing.category,
          audience: editing.audience,
          priority: editing.priority,
          pinned: editing.pinned,
          status: editing.status,
          publishDate: editing.publishDate ? editing.publishDate.slice(0, 10) : '',
          expiryDate: editing.expiryDate ? editing.expiryDate.slice(0, 10) : '',
        })
      } else {
        setForm({ ...emptyForm, publishDate: new Date().toISOString().slice(0, 10) })
      }
    }
  }, [open, editing])

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required')
      return
    }
    setSaving(true)
    const payload: any = {
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category,
      audience: form.audience,
      priority: form.priority,
      pinned: form.pinned,
      status: form.status,
      publishDate: form.publishDate || new Date().toISOString(),
      expiryDate: form.expiryDate || null,
    }
    try {
      if (editing) {
        await api(`/api/announcements/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        toast.success('Announcement updated')
      } else {
        await api('/api/announcements', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        toast.success('Announcement published')
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Announcement' : 'New Announcement'}</DialogTitle>
          <DialogDescription>
            Broadcast a notice to staff, parents or teachers. Pinned items appear at the top.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ann-title">Title *</Label>
            <Input
              id="ann-title"
              placeholder="e.g. Annual Concert — Save the Date!"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ann-body">Message *</Label>
            <Textarea
              id="ann-body"
              placeholder="Write the announcement details…"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={5}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANNOUNCEMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Audience</Label>
              <Select value={form.audience} onValueChange={(v) => setForm((f) => ({ ...f, audience: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANNOUNCEMENT_AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANNOUNCEMENT_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ann-publish">Publish date</Label>
              <Input
                id="ann-publish"
                type="date"
                value={form.publishDate}
                onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ann-expiry">Expiry date (optional)</Label>
              <Input
                id="ann-expiry"
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANNOUNCEMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="ann-pin" className="cursor-pointer">Pin to top</Label>
                <p className="text-xs text-muted-foreground">Pinned items appear first</p>
              </div>
              <Switch
                id="ann-pin"
                checked={form.pinned}
                onCheckedChange={(v) => setForm((f) => ({ ...f, pinned: v }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
