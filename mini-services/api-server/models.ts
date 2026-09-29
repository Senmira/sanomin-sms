// ─── Mongoose models — mirror of prisma/schema.prisma ──────────────────────
// MongoDB design notes (coursework):
//  * Payment EMBEDS its bill line items (`items[]`) — the classic NoSQL
//    embedding choice for data read together with the parent bill.
//  * All other references are stored as string ids (referencing), resolved
//    in the API layer exactly like Prisma `include` did on SQLite.
import mongoose, { Schema } from 'mongoose'

const { model, models } = mongoose

// Global JSON output rules: strip _id/__v, keep the `id` virtual, never omit
// null fields (Prisma returned explicit nulls — the React frontend relies on
// stable shapes).
mongoose.set('toJSON', {
  virtuals: true,
  versionKey: false,
  minimize: false,
  transform: (_doc: unknown, ret: Record<string, unknown>) => {
    delete ret._id
    return ret
  },
})

const nullStr = { type: String, default: null }
const nullDate = { type: Date, default: null }

// ─── Program ────────────────────────────────────────────────────────────────
// Fully admin-managed. No magic codes. Two extra concepts:
//   • category   — 'Preschool' | 'Daycare' | 'Tuition'. Drives the Student
//                  section tabs (All / Preschool / Daycare / Tuition).
//   • hasGrades + grades — a programme may have a fixed set of grade labels
//                  (e.g. "Grade 1" … "Grade 11" for Maths). Students pick a
//                  grade when enrolling. If hasGrades is false, grades is
//                  ignored and enrollment.grade stays null.
const ProgramSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: nullStr,
    color: { type: String, default: '#7c3aed' },
    monthlyFee: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    // ── new ──
    category: { type: String, default: 'Tuition' },
    hasGrades: { type: Boolean, default: false },
    grades: { type: [String], default: [] },
  },
  { timestamps: true },
)

// ─── Student ────────────────────────────────────────────────────────────────
// grade — single optional grade for the student (e.g. "Grade 6"). Not
//   per-programme. Auto-filled from the chosen class's pinned grade in the
//   UI, but stored on the student so it survives class reassignment.
const StudentSchema = new Schema(
  {
    studentId: { type: String, required: true, unique: true },
    indexNo: nullStr,
    barcode: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    gender: { type: String, required: true },
    dob: nullDate,
    ageGroup: nullStr,
    // ── new ──
    grade: nullStr,
    admissionDate: nullDate,
    religion: nullStr,
    nationality: nullStr,
    previousSchool: nullStr,
    photoUrl: nullStr,
    status: { type: String, default: 'Active' },
    medicalNotes: nullStr,
  },
  { timestamps: true },
)

// ─── Guardian ───────────────────────────────────────────────────────────────
const GuardianSchema = new Schema(
  {
    studentId: { type: String, required: true, ref: 'Student' },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: nullStr,
    email: nullStr,
    relationship: { type: String, default: 'Guardian' },
    occupation: nullStr,
    isPrimary: { type: Boolean, default: true },
  },
  { timestamps: true },
)
GuardianSchema.index({ studentId: 1 })

// ─── Teacher ────────────────────────────────────────────────────────────────
const TeacherSchema = new Schema(
  {
    teacherId: { type: String, required: true, unique: true },
    fingerprintId: { type: String, default: null, unique: true, sparse: true },
    fullName: { type: String, required: true },
    type: { type: String, default: 'Internal' },
    gender: nullStr,
    phone: nullStr,
    email: nullStr,
    address: nullStr,
    nic: nullStr,
    qualification: nullStr,
    specialization: nullStr,
    photoUrl: nullStr,
    status: { type: String, default: 'Active' },
    hireDate: nullDate,
    monthlyRate: { type: Number, default: 0 },
    basicSalary: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    epfNo: nullStr,
    salaryNote: nullStr,
  },
  { timestamps: true },
)

// ─── PayrollRecord ──────────────────────────────────────────────────────────
const PayrollRecordSchema = new Schema(
  {
    teacherId: { type: String, required: true, ref: 'Teacher' },
    month: { type: String, required: true },
    basicSalary: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    gross: { type: Number, default: 0 },
    epfEmployee: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    epfEmployer: { type: Number, default: 0 },
    etfEmployer: { type: Number, default: 0 },
    employerCost: { type: Number, default: 0 },
    status: { type: String, default: 'Pending' },
    method: { type: String, default: 'Cash' },
    paidDate: nullDate,
    note: nullStr,
  },
  { timestamps: true },
)
PayrollRecordSchema.index({ teacherId: 1, month: 1 }, { unique: true })

// ─── Class ──────────────────────────────────────────────────────────────────
// grade — optional pinned grade for this class (e.g. "Grade 6"). Shown as a
//   badge. Students enrolled in this class inherit the grade, and the student
//   form auto-fills the grade field when a class is picked.
const ClassSchema = new Schema(
  {
    name: { type: String, required: true },
    programId: { type: String, default: null, ref: 'Program' },
    teacherId: { type: String, default: null, ref: 'Teacher' },
    dayOfWeek: nullStr,
    startTime: nullStr,
    endTime: nullStr,
    room: nullStr,
    capacity: { type: Number, default: 20 },
    fee: { type: Number, default: 0 },
    instituteSharePct: { type: Number, default: 25 },
    // ── new ──
    grade: nullStr,
    active: { type: Boolean, default: true },
    notes: nullStr,
  },
  { timestamps: true },
)

// ─── Enrollment ─────────────────────────────────────────────────────────────
// An enrollment is a (programId, classId) pair. classId may be null. The same
// programme can appear multiple times with different classes (multi-class
// enrolment). Grade is NOT stored here — it lives on the Student.
const EnrollmentSchema = new Schema(
  {
    studentId: { type: String, required: true, ref: 'Student' },
    programId: { type: String, default: null, ref: 'Program' },
    classId: { type: String, default: null, ref: 'Class' },
    enrolledAt: { type: Date, default: Date.now },
    status: { type: String, default: 'Active' },
  },
  { timestamps: true },
)
EnrollmentSchema.index({ studentId: 1 })
EnrollmentSchema.index({ classId: 1 })

// ─── Attendance (polymorphic Student|Teacher via personType+personId) ───────
const AttendanceSchema = new Schema(
  {
    personType: { type: String, required: true },
    personId: { type: String, required: true },
    personRef: { type: String, required: true },
    date: { type: Date, default: Date.now },
    checkIn: nullDate,
    checkOut: nullDate,
    method: { type: String, default: 'Manual' },
    status: { type: String, default: 'Present' },
    note: nullStr,
    // ── Timetable-derived expectations (populated at scan time) ──
    expectedStart: nullDate,
    expectedEnd: nullDate,
    lateMinutes: { type: Number, default: null },
    earlyMinutes: { type: Number, default: null },
    lateCheckoutMinutes: { type: Number, default: null },
  },
  { timestamps: true },
)
AttendanceSchema.index({ personType: 1, personId: 1, date: -1 })
AttendanceSchema.index({ date: -1 })

// ─── Setting ────────────────────────────────────────────────────────────────
const SettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, default: '' },
  },
  { timestamps: true },
)

// ─── Payment (with EMBEDDED bill line items) ────────────────────────────────
const PaymentItemSchema = new Schema(
  {
    programId: nullStr,
    description: nullStr,
    amount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

const PaymentSchema = new Schema(
  {
    studentId: { type: String, required: true, ref: 'Student' },
    programId: { type: String, default: null, ref: 'Program' },
    classId: { type: String, default: null, ref: 'Class' },
    month: { type: String, required: true },
    amount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    method: { type: String, default: 'Cash' },
    status: { type: String, default: 'Pending' },
    paidDate: nullDate,
    dueDate: nullDate,
    note: nullStr,
    receiptNo: { type: String, default: null, unique: true, sparse: true },
    items: { type: [PaymentItemSchema], default: [] },
  },
  { timestamps: true },
)
PaymentSchema.index({ month: 1 })
PaymentSchema.index({ studentId: 1, month: 1 })

// ─── Expense ────────────────────────────────────────────────────────────────
const ExpenseSchema = new Schema(
  {
    date: { type: Date, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    method: { type: String, default: 'Cash' },
    vendor: nullStr,
    note: nullStr,
    status: { type: String, default: 'Approved' },
    reviewedAt: nullDate,
    reviewedBy: nullStr,
    receiptUrl: nullStr,
    receiptName: nullStr,
  },
  { timestamps: true },
)

// ─── Announcement ───────────────────────────────────────────────────────────
const AnnouncementSchema = new Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    category: { type: String, default: 'General' },
    audience: { type: String, default: 'All' },
    priority: { type: String, default: 'Normal' },
    pinned: { type: Boolean, default: false },
    status: { type: String, default: 'Published' },
    publishDate: { type: Date, default: Date.now },
    expiryDate: nullDate,
    authorName: nullStr,
  },
  { timestamps: true },
)

export const Program =
  (models.Program as mongoose.Model<any>) || model('Program', ProgramSchema)
export const Student =
  (models.Student as mongoose.Model<any>) || model('Student', StudentSchema)
export const Guardian =
  (models.Guardian as mongoose.Model<any>) || model('Guardian', GuardianSchema)
export const Teacher =
  (models.Teacher as mongoose.Model<any>) || model('Teacher', TeacherSchema)
export const PayrollRecord =
  (models.PayrollRecord as mongoose.Model<any>) || model('PayrollRecord', PayrollRecordSchema)
export const Class =
  (models.Class as mongoose.Model<any>) || model('Class', ClassSchema)
export const Enrollment =
  (models.Enrollment as mongoose.Model<any>) || model('Enrollment', EnrollmentSchema)
export const Attendance =
  (models.Attendance as mongoose.Model<any>) || model('Attendance', AttendanceSchema)
export const Setting =
  (models.Setting as mongoose.Model<any>) || model('Setting', SettingSchema)
export const Payment =
  (models.Payment as mongoose.Model<any>) || model('Payment', PaymentSchema)
export const Expense =
  (models.Expense as mongoose.Model<any>) || model('Expense', ExpenseSchema)
export const Announcement =
  (models.Announcement as mongoose.Model<any>) || model('Announcement', AnnouncementSchema)
