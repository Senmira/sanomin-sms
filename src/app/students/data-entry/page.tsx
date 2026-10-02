'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ImagePlus, Loader2, Plus, Trash2, X, CheckCircle2, Users2, RotateCcw,
} from 'lucide-react'

import { api } from '@/lib/api'
import {
  ProgramRow, ClassRow, StudentRow,
  GENDERS, AGE_GROUPS, RELIGIONS,
} from '@/lib/types'
import { fileToCompressedDataUrl } from '@/lib/image'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card } from '@/components/ui/card'

interface GuardianEntry {
  name: string
  phone: string
  address: string
  relationship: string
  isPrimary: boolean
}

interface EnrollmentDraft {
  programId: string
  classId: string | null
}

function emptyGuardian(): GuardianEntry {
  return { name: '', phone: '', address: '', relationship: 'Guardian', isPrimary: true }
}

export default function TeacherDataEntryPage() {
  // form
  const [fullName, setFullName] = useState('')
  const [gender, setGender] = useState('Male')
  const [dob, setDob] = useState('')
  const [ageGroup, setAgeGroup] = useState('')
  const [grade, setGrade] = useState('')
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().slice(0, 10))
  const [religion, setReligion] = useState('')
  const [nationality, setNationality] = useState('Sri Lankan')
  const [previousSchool, setPreviousSchool] = useState('')
  const [medicalNotes, setMedicalNotes] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoProcessing, setPhotoProcessing] = useState(false)

  const [guardians, setGuardians] = useState<GuardianEntry[]>([emptyGuardian()])
  const [enrollments, setEnrollments] = useState<EnrollmentDraft[]>([])

  // catalogues
  const [programs, setPrograms] = useState<ProgramRow[]>([])
  const [allClasses, setAllClasses] = useState<ClassRow[]>([])

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<StudentRow | null>(null)

  const photoInputRef = useRef<HTMLInputElement>(null)

  // Load programmes + classes
  useEffect(() => {
    let alive = true
    Promise.all([
      api<{ data: ProgramRow[] }>('/api/programs?active=true'),
      api<{ data: ClassRow[] }>('/api/classes?active=true&limit=200'),
    ])
      .then(([p, c]) => {
        if (!alive) return
        setPrograms(p.data || [])
        setAllClasses(c.data || [])
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const handlePhoto = useCallback(async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    setPhotoProcessing(true)
    try {
      setPhotoUrl(await fileToCompressedDataUrl(file, 400, 0.85))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to process image')
    } finally {
      setPhotoProcessing(false)
    }
  }, [])

  const addGuardian = () =>
    setGuardians((gs) => [...gs, { ...emptyGuardian(), isPrimary: gs.length === 0 }])
  const updateGuardian = (i: number, patch: Partial<GuardianEntry>) =>
    setGuardians((gs) => gs.map((g, idx) => (idx === i ? { ...g, ...patch } : g)))
  const removeGuardian = (i: number) =>
    setGuardians((gs) => {
      if (gs.length === 1) return gs
      const next = gs.filter((_, idx) => idx !== i)
      if (!next.some((g) => g.isPrimary)) next[0] = { ...next[0], isPrimary: true }
      return next
    })
  const setPrimary = (i: number) =>
    setGuardians((gs) => gs.map((g, idx) => ({ ...g, isPrimary: idx === i })))

  const toggleProgram = (id: string) =>
    setEnrollments((prev) => {
      const exists = prev.find((e) => e.programId === id)
      if (exists) return prev.filter((e) => e.programId !== id)
      return [...prev, { programId: id, classId: null }]
    })

  const setEnrolmentClass = (programId: string, classId: string | null) => {
    setEnrollments((prev) =>
      prev.map((x) => (x.programId === programId ? { ...x, classId } : x)),
    )
    const chosen = classId ? allClasses.find((c) => c.id === classId) : null
    if (chosen?.grade) setGrade(chosen.grade)
  }

  const resetForm = () => {
    setFullName(''); setGender('Male'); setDob(''); setAgeGroup(''); setGrade('')
    setAdmissionDate(new Date().toISOString().slice(0, 10))
    setReligion(''); setNationality('Sri Lankan'); setPreviousSchool('')
    setMedicalNotes(''); setPhotoUrl(''); setGuardians([emptyGuardian()])
    setEnrollments([]); setSubmitted(null); setErr(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!fullName.trim()) return setErr('Full name is required')
    if (!gender) return setErr('Gender is required')

    const payload = {
      fullName: fullName.trim(),
      gender,
      dob: dob || null,
      ageGroup: ageGroup || null,
      grade: grade.trim() || null,
      admissionDate: admissionDate || null,
      religion: religion || null,
      nationality: nationality || null,
      previousSchool: previousSchool || null,
      status: 'Active',
      medicalNotes: medicalNotes || null,
      photoUrl: photoUrl || null,
      indexNo: null,
      guardians: guardians
        .filter((g) => g.name.trim())
        .map((g) => ({
          name: g.name.trim(),
          phone: g.phone.trim() || 'N/A',
          address: g.address || null,
          relationship: g.relationship || 'Guardian',
          isPrimary: g.isPrimary,
        })),
      enrollments: enrollments.map((e) => ({
        programId: e.programId,
        classId: e.classId || null,
      })),
    }

    setSaving(true)
    try {
      const created = await api<StudentRow>('/api/students', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      toast.success(`Submitted ${created.fullName} (${created.studentId})`)
      setSubmitted(created)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Submit failed'
      setErr(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // ─── Success screen ───
  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md p-6 text-center shadow-lg">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">Student submitted</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {submitted.fullName} has been added.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Badge variant="secondary" className="font-mono">{submitted.studentId}</Badge>
            <Badge variant="outline" className="font-mono">{submitted.barcode}</Badge>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={resetForm} className="gap-2">
              <Plus className="h-4 w-4" />
              Add another student
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // ─── Form ───
  return (
    <div className="min-h-screen bg-muted/30 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl px-4">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Student data entry</h1>
              <p className="text-xs text-muted-foreground">
                Fill in the details below. The administrator will review.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={resetForm} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset form
          </Button>
        </div>

        {err && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Photo */}
          <Card className="p-4">
            <Label className="mb-2 block text-sm font-medium">Student photo</Label>
            <div className="flex items-center gap-4">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="size-24 rounded-lg object-cover ring-1 ring-border" />
              ) : (
                <div className="flex size-24 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                  <ImagePlus className="h-8 w-8" />
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={photoProcessing}
                    onClick={() => photoInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    {photoProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    {photoUrl ? 'Replace photo' : 'Choose photo'}
                  </Button>
                  {photoUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPhotoUrl('')} className="gap-1.5 text-destructive hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">JPEG or PNG, auto-compressed.</p>
              </div>
            </div>
          </Card>

          {/* Basic info */}
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Basic info</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="mb-1 block">Full name *</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Mahinda Kumar Rishalini" />
              </div>
              <div>
                <Label className="mb-1 block">Gender *</Label>
                <RadioGroup value={gender} onValueChange={setGender} className="flex gap-4 pt-1">
                  {GENDERS.map((g) => (
                    <div key={g} className="flex items-center gap-2">
                      <RadioGroupItem id={`g-${g}`} value={g} />
                      <Label htmlFor={`g-${g}`} className="font-normal">{g}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div>
                <Label className="mb-1 block">Date of birth</Label>
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block">Age group</Label>
                <Select value={ageGroup || 'NONE'} onValueChange={(v) => setAgeGroup(v === 'NONE' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select age group" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">—</SelectItem>
                    {AGE_GROUPS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Grade</Label>
                <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. Grade 6" />
              </div>
              <div>
                <Label className="mb-1 block">Admission date</Label>
                <Input type="date" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block">Religion</Label>
                <Select value={religion || 'NONE'} onValueChange={(v) => setReligion(v === 'NONE' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select religion" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">—</SelectItem>
                    {RELIGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Nationality</Label>
                <Input value={nationality} onChange={(e) => setNationality(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-1 block">Previous school</Label>
                <Input value={previousSchool} onChange={(e) => setPreviousSchool(e.target.value)} placeholder="Optional" />
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-1 block">Medical notes</Label>
                <Textarea value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)} rows={2} placeholder="Allergies, conditions, etc." />
              </div>
            </div>
          </Card>

          {/* Guardians */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Guardians / Parents</h2>
              <Button type="button" variant="ghost" size="sm" onClick={addGuardian} className="gap-1.5">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            <div className="space-y-3">
              {guardians.map((g, i) => (
                <div key={i} className="rounded-md border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <Checkbox checked={g.isPrimary} onCheckedChange={() => setPrimary(i)} />
                      Primary contact
                    </label>
                    {guardians.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => removeGuardian(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={g.name} onChange={(e) => updateGuardian(i, { name: e.target.value })} placeholder="Guardian name" />
                    <Input value={g.phone} onChange={(e) => updateGuardian(i, { phone: e.target.value })} placeholder="Phone" />
                    <Input value={g.relationship} onChange={(e) => updateGuardian(i, { relationship: e.target.value })} placeholder="Relationship" className="sm:col-span-2" />
                    <Input value={g.address} onChange={(e) => updateGuardian(i, { address: e.target.value })} placeholder="Address" className="sm:col-span-2" />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Programme enrolment */}
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Programme enrolment</h2>
            {programs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active programmes.</p>
            ) : (
              <div className="space-y-2">
                {programs.map((p) => {
                  const draft = enrollments.find((e) => e.programId === p.id)
                  const checked = !!draft
                  const classes = allClasses.filter((c) => c.program?.id === p.id)
                  return (
                    <div key={p.id} className={`rounded-md border p-2.5 ${checked ? 'border-primary/50 bg-primary/5' : ''}`}>
                      <label className="flex cursor-pointer items-center gap-2">
                        <Checkbox checked={checked} onCheckedChange={() => toggleProgram(p.id)} />
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="text-sm font-medium">{p.name}</span>
                        <Badge variant="outline" className="ml-auto text-[10px]">{p.category}</Badge>
                      </label>
                      {checked && classes.length > 0 && (
                        <div className="mt-2 pl-7">
                          <Select value={draft!.classId ?? 'none'} onValueChange={(v) => setEnrolmentClass(p.id, v === 'none' ? null : v)}>
                            <SelectTrigger className="h-8 w-full max-w-[260px] text-xs">
                              <SelectValue placeholder="No class assigned" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No class</SelectItem>
                              {classes.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}{c.dayOfWeek ? ` · ${c.dayOfWeek}` : ''}{c.grade ? ` (${c.grade})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
              Reset
            </Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit student
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
