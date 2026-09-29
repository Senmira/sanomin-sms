// ─── Kiosk attendance routes ────────────────────────────────────────────────
// Public-facing attendance kiosk. Deliberately isolated from the admin API:
//   • separate route namespace (/api/kiosk/*)
//   • requires x-kiosk-key header (shared secret via KIOSK_API_KEY env)
//   • returns only the fields needed to render the scan screen
//   • cannot enumerate students/teachers, cannot edit anything
//
// Attendance status is derived from the person's actual timetable for the day
// (via getExpectedTimesForPerson). A student is "Late" if they arrive after
// their earliest class start + a configurable grace period (Setting key
// late_grace_minutes, default 10). Late pickup / early pickup are computed on
// check-out the same way.
import { Router } from 'express'
import { Student, Teacher, Enrollment, Payment, Attendance } from '../models'
import {
  ah,
  dayRange,
  todayStr,
  getExpectedTimesForPerson,
  computeAttendanceFlags,
} from '../helpers'

const r = Router()

// ─── Auth: shared secret header ─────────────────────────────────────────────
function requireKioskKey(req: any, res: any, next: any) {
  const expected = process.env.KIOSK_API_KEY
  if (!expected) {
    return res.status(500).json({ error: 'Kiosk not configured (KIOSK_API_KEY missing on server)' })
  }
  const provided = req.headers['x-kiosk-key']
  if (provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized kiosk' })
  }
  next()
}
r.use(requireKioskKey)

// ─── POST /api/kiosk/scan  { barcode } ──────────────────────────────────────
//
// Resolves the barcode to a Student (by barcode or studentId) or Teacher
// (by fingerprintId or teacherId). Upserts today's attendance record with the
// following state machine:
//
//   no record            → create with checkIn = now (action = 'check-in')
//   record, no checkOut  → set checkOut = now     (action = 'check-out')
//   record, both set     → no-op                  (action = 'already-complete')
//
r.post('/scan', ah(async (req, res) => {
  const barcode = String(req.body?.barcode || '').trim()
  if (!barcode) return res.status(400).json({ error: 'barcode is required' })

  const today = todayStr()
  const { start, end } = dayRange(today)
  const now = new Date()

  // ─── Resolve person ─────────────────────────────────────────────────────
  let personType: 'Student' | 'Teacher' = 'Student'
  let person: any = await Student.findOne({
    $or: [{ barcode }, { studentId: barcode }],
  }).lean()

  if (!person) {
    person = await Teacher.findOne({
      $or: [{ fingerprintId: barcode }, { teacherId: barcode }],
    }).lean()
    if (person) personType = 'Teacher'
  }

  if (!person) {
    return res.json({ status: 'not_found', message: 'Card not recognised' })
  }

  if (personType === 'Student' && person.status !== 'Active') {
    return res.json({
      status: 'inactive',
      message: `Student is ${String(person.status).toLowerCase()} — please see the office`,
    })
  }

  const personId = person._id.toString()
  const personRef =
    personType === 'Student' ? person.studentId : person.teacherId

  // ─── Resolve the expected arrival / pickup window for today ─────────────
  // Uses the classes this person is enrolled in (student) or teaches
  // (teacher) that meet on today's weekday.
  const expected = await getExpectedTimesForPerson(personType, personId, now)

  // ─── Attendance upsert ──────────────────────────────────────────────────
  let record = await Attendance.findOne({
    personType,
    personId,
    date: { $gte: start, $lte: end },
  })

  let action: 'check-in' | 'check-out' | 'already-complete'
  let lateMinutes: number | null = null
  let earlyMinutes: number | null = null
  let lateCheckoutMinutes: number | null = null

  if (!record) {
    // ─── New check-in ─────────────────────────────────────────────────────
    const flags = computeAttendanceFlags(now, null, expected)
    lateMinutes = flags.lateMinutes

    const isLate = lateMinutes != null && lateMinutes > 0
    const status: 'Present' | 'Late' = isLate ? 'Late' : 'Present'

    record = await Attendance.create({
      personType,
      personId,
      personRef,
      date: now,
      checkIn: now,
      checkOut: null,
      method: 'Barcode',
      status,
      note: isLate ? `Arrived ${lateMinutes} min after expected start` : null,
      expectedStart: expected.expectedStart,
      expectedEnd: expected.expectedEnd,
      lateMinutes,
      earlyMinutes: null,
      lateCheckoutMinutes: null,
    })
    action = 'check-in'
  } else if (record.checkIn && !record.checkOut) {
    // ─── Check-out ────────────────────────────────────────────────────────
    const flags = computeAttendanceFlags(record.checkIn as Date, now, expected)
    earlyMinutes = flags.earlyMinutes
    lateCheckoutMinutes = flags.lateCheckoutMinutes

    record.checkOut = now
    record.earlyMinutes = earlyMinutes
    record.lateCheckoutMinutes = lateCheckoutMinutes
    // Refresh the expected window — a class could have been edited between
    // the morning check-in and this afternoon scan.
    if (expected.expectedStart) record.expectedStart = expected.expectedStart
    if (expected.expectedEnd) record.expectedEnd = expected.expectedEnd

    // Append a note if either anomaly occurred (keep any existing note).
    const notes: string[] = []
    if (record.note) notes.push(record.note)
    if (earlyMinutes && earlyMinutes > 0) {
      notes.push(`Picked up ${earlyMinutes} min before expected end`)
    }
    if (lateCheckoutMinutes && lateCheckoutMinutes > 0) {
      notes.push(`Picked up ${lateCheckoutMinutes} min after expected end`)
    }
    record.note = notes.length > 0 ? notes.join(' · ') : null

    await record.save()
    action = 'check-out'
  } else {
    // ─── Already complete — echo the persisted values ─────────────────────
    action = 'already-complete'
    lateMinutes = (record as any).lateMinutes ?? null
    earlyMinutes = (record as any).earlyMinutes ?? null
    lateCheckoutMinutes = (record as any).lateCheckoutMinutes ?? null
  }

  // ─── For students: attach programmes + current-month payment status ─────
  let programs: { code: string; name: string; color: string }[] = []
  let payment: {
    status: string
    billed: number
    paid: number
    balance: number
  } | null = null

  if (personType === 'Student') {
    const enrollments = await Enrollment.find({ studentId: personId, status: 'Active' })
      .populate('programId', 'code name color')
      .lean()
    programs = (enrollments as any[])
      .filter((e) => e.programId)
      .map((e) => ({
        code: e.programId.code,
        name: e.programId.name,
        color: e.programId.color,
      }))

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const bill = await Payment.findOne(
      { studentId: personId, month: monthKey },
      'amount paidAmount status',
    ).lean()

    if (bill) {
      const billed = (bill as any).amount
      const paid = (bill as any).paidAmount
      payment = {
        status: (bill as any).status,
        billed,
        paid,
        balance: Math.max(0, Math.round((billed - paid) * 100) / 100),
      }
    } else {
      payment = { status: 'NoBill', billed: 0, paid: 0, balance: 0 }
    }
  }

  res.json({
    status: 'ok',
    action,
    personType,
    person: {
      id: personId,
      ref: personRef,
      name: person.fullName,
      photoUrl: person.photoUrl ?? null,
      programs,
      type: personType === 'Teacher' ? person.type : null,
    },
    record: {
      checkIn: record.checkIn ? new Date(record.checkIn).toISOString() : null,
      checkOut: record.checkOut ? new Date(record.checkOut).toISOString() : null,
      status: record.status,
    },
    payment,
    // ── Timetable context (drives the kiosk UI banners) ──
    schedule: expected.classNames,
    expectedStart: expected.expectedStart ? expected.expectedStart.toISOString() : null,
    expectedEnd: expected.expectedEnd ? expected.expectedEnd.toISOString() : null,
    graceMinutes: expected.graceMinutes,
    lateMinutes,
    earlyMinutes,
    lateCheckoutMinutes,
    timestamp: now.toISOString(),
  })
}))

export default r
