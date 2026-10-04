// Shared types & enums for SANOMIN SMS

export type SectionKey =
  | 'dashboard'
  | 'students'
  | 'teachers'
  | 'payroll'
  | 'attendance'
  | 'classes'
  | 'programs'
  | 'fees'
  | 'expenses'
  | 'announcements'
  | 'reports'
  | 'settings'

export const PAYMENT_STATUSES = ['Pending', 'Partial', 'Paid', 'Overdue'] as const
export const PAYMENT_METHODS = ['Cash', 'Card', 'Bank', 'Online'] as const

export const ANNOUNCEMENT_CATEGORIES = ['General', 'Event', 'Holiday', 'Urgent', 'Payment', 'Meeting'] as const
export const ANNOUNCEMENT_AUDIENCES = ['All', 'Staff', 'Parents', 'Teachers'] as const
export const ANNOUNCEMENT_PRIORITIES = ['Low', 'Normal', 'High'] as const
export const ANNOUNCEMENT_STATUSES = ['Draft', 'Published', 'Archived'] as const

// ─── Age bands (fixed set, six bands) ──────────────────────────────────────
// value is what gets stored on Student.ageGroup; label is what the UI shows.
export const AGE_GROUPS = [
  { value: '1-3',   label: '1-3 (Toddler)' },
  { value: '3-5',   label: '3-5 (Preschool)' },
  { value: '5-10',  label: '5-10 (Primary)' },
  { value: '10-15', label: '10-15 (Middle School)' },
  { value: '15-17', label: '15-17 (O/L)' },
  { value: '17-19', label: '17-19 (A/L)' },
] as const

export type AgeBand = (typeof AGE_GROUPS)[number]['value']

export const GENDERS = ['Male', 'Female'] as const
export const RELIGIONS = ['Buddhist', 'Hindu', 'Islam', 'Christian', 'Roman Catholic'] as const
export const STUDENT_STATUS = ['Active', 'Inactive', 'Graduated'] as const
export const TEACHER_TYPES = ['Internal', 'External'] as const
export const TEACHER_STATUS = ['Active', 'Inactive', 'On Leave'] as const
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const ATTENDANCE_METHODS = ['Barcode', 'Fingerprint', 'Manual'] as const
export const ATTENDANCE_STATUS = ['Present', 'Absent', 'Late', 'Leave'] as const

// ─── Programmes (dynamic — no magic codes) ─────────────────────────────────
//
// Every programme is admin-managed. Two concepts drive the UI:
//   • category   — Preschool | Daycare | Tuition. Powers the Student tabs.
//   • hasGrades + grades[] — optional per-programme grade list (e.g. Maths
//                  Grade 1..Grade 11).
//
// The programme `code` is only a human-friendly identifier; nothing in the
// app depends on specific code values any more.
export const PROGRAM_CATEGORIES = ['Preschool', 'Daycare', 'Tuition'] as const
export type ProgramCategory = (typeof PROGRAM_CATEGORIES)[number]

// Student tabs in the Students section map directly to Programme.category.
// Students enrolled in more than one category are bucketed by precedence:
//   Preschool > Daycare > Tuition
export type StudentCategoryTab = 'all' | 'preschool' | 'daycare' | 'tuition'

// API response shapes (loosely typed on the client via the API returns)

// ─── Enrolment ─────────────────────────────────────────────────────────────
// An enrolment is a (programme, optional class) pair. The same programme can
// appear multiple times with different classes (multi-class enrolment).
// Grade lives on Student, not here.
export interface EnrollmentRow {
  id: string
  program: {
    id: string
    code: string
    name: string
    color: string
    category: ProgramCategory
    hasGrades: boolean
    grades: string[]
  } | null
  class: {
    id: string
    name: string
    dayOfWeek: string | null
    daysOfWeek: string[]              // ← NEW: full list of weekdays this class runs on
    startTime: string | null
    endTime: string | null
    grade: string | null
    fee: number
  } | null
}

export interface StudentRow {
  id: string
  studentId: string
  indexNo: string | null
  barcode: string
  fullName: string
  gender: string
  dob: string | null
  ageGroup: string | null
  // ── new ── single grade per student (e.g. "Grade 6"). Auto-filled from the
  // chosen class's pinned grade, but stored on the student.
  grade: string | null
  admissionDate: string | null
  religion: string | null
  nationality: string | null
  previousSchool: string | null
  status: string
  photoUrl: string | null
  medicalNotes: string | null
  guardians: Array<{
    id: string
    name: string
    phone: string
    address: string | null
    relationship: string
    isPrimary: boolean
  }>
  enrollments: EnrollmentRow[]
  _count?: { attendance: number }
}

export interface TeacherRow {
  id: string
  teacherId: string
  fingerprintId: string | null
  fullName: string
  type: string
  gender: string | null
  phone: string | null
  email: string | null
  address: string | null
  nic: string | null
  qualification: string | null
  specialization: string | null
  status: string
  hireDate: string | null
  lastActive: string | null
  monthlyRate: number
  basicSalary: number
  allowances: number
  epfNo: string | null
  salaryNote: string | null
  photoUrl: string | null
  classes: Array<{
    id: string
    name: string
    dayOfWeek: string | null
    daysOfWeek?: string[]           // ← NEW: also returned by the teacher serializer
    startTime: string | null
    grade?: string | null
  }>
  _count?: { classes: number; attendance: number }
}

// Sri Lankan statutory contribution rates (EPF Act No. 15 of 1958 / ETF Act
// No. 46 of 1980). Employee EPF 8% deducted from salary; employer pays
// EPF 12% + ETF 3% on top.
export const EPF_EMPLOYEE_RATE = 0.08
export const EPF_EMPLOYER_RATE = 0.12
export const ETF_EMPLOYER_RATE = 0.03

export function salaryBreakdown(basicSalary: number, allowances: number) {
  const gross = (basicSalary || 0) + (allowances || 0)
  const epfEmployee = (basicSalary || 0) * EPF_EMPLOYEE_RATE
  const netSalary = gross - epfEmployee
  const epfEmployer = (basicSalary || 0) * EPF_EMPLOYER_RATE
  const etfEmployer = (basicSalary || 0) * ETF_EMPLOYER_RATE
  const employerCost = gross + epfEmployer + etfEmployer
  return { gross, epfEmployee, netSalary, epfEmployer, etfEmployer, employerCost }
}

export interface ProgramRow {
  id: string
  code: string
  name: string
  description: string | null
  color: string
  monthlyFee: number
  active: boolean
  category: ProgramCategory
  hasGrades: boolean
  grades: string[]
  _count?: { enrollments: number; classes: number }
}

export interface ClassRow {
  id: string
  name: string
  dayOfWeek: string | null
  daysOfWeek: string[]              // ← NEW: full list of weekdays (Mon–Fri / Mon–Sat / single day)
  startTime: string | null
  endTime: string | null
  room: string | null
  capacity: number
  fee: number
  instituteSharePct: number
  // ── new ── optional pinned grade for this class (e.g. "Grade 6"). Shown as
  // a badge; the student form auto-fills Student.grade from it.
  grade: string | null
  active: boolean
  notes: string | null
  program: {
    id: string
    code: string
    name: string
    color: string
    category?: ProgramCategory
  } | null
  teacher: { id: string; teacherId: string; fullName: string; type: string } | null
  _count?: { enrollments: number }
}

export interface AttendanceRow {
  id: string
  personType: string
  personId: string
  personRef: string
  date: string
  checkIn: string | null
  checkOut: string | null
  method: string
  status: string
  note: string | null
  personName?: string
  // ── Timetable-derived expectations (populated at scan time) ──
  expectedStart?: string | null
  expectedEnd?: string | null
  lateMinutes?: number | null
  earlyMinutes?: number | null
  lateCheckoutMinutes?: number | null
}

export interface PaymentItemRow {
  id: string
  programId: string | null
  description: string | null
  amount: number
  program: {
    id: string
    code: string
    name: string
    color: string
    monthlyFee: number
  } | null
}

export interface PaymentRow {
  id: string
  studentId: string
  programId: string | null
  classId: string | null
  month: string // "YYYY-MM"
  amount: number
  paidAmount: number
  method: string // Cash | Card | Bank | Online
  status: string // Pending | Partial | Paid | Overdue
  paidDate: string | null
  dueDate: string | null
  note: string | null
  receiptNo: string | null
  createdAt: string
  updatedAt: string
  student: {
    id: string
    studentId: string
    fullName: string
    guardians: { name: string; phone: string; relationship: string; isPrimary: boolean }[]
  }
  program: { id: string; code: string; name: string; color: string } | null
  items: PaymentItemRow[]
}

export interface PaymentSummary {
  totalBilled: number
  totalCollected: number
  totalOutstanding: number
  pendingCount: number
  overdueCount: number
}

export interface PayrollRow {
  teacher: {
    id: string
    teacherId: string
    fullName: string
    type: string
    epfNo: string | null
    classes: number
  }
  month: string // "YYYY-MM"
  basicSalary: number
  allowances: number
  gross: number
  epfEmployee: number
  netSalary: number
  epfEmployer: number
  etfEmployer: number
  employerCost: number
  status: string // Paid | Pending
  method: string | null // Cash | Bank | Cheque
  paidDate: string | null
  note: string | null
  recordId: string | null
}

export interface PayrollSummary {
  teachers: number
  totalGross: number
  totalEpfEmployee: number
  totalNet: number
  totalEpfEmployer: number
  totalEtfEmployer: number
  totalEmployerCost: number
  paidCount: number
  pendingCount: number
  totalPaid: number
  totalPending: number
}

export const PAYROLL_METHODS = ['Cash', 'Bank', 'Cheque'] as const

export interface AnnouncementRow {
  id: string
  title: string
  body: string
  category: string
  audience: string
  priority: string
  pinned: boolean
  status: string
  publishDate: string
  expiryDate: string | null
  authorName: string | null
  createdAt: string
  updatedAt: string
}

// ─── Expenses (institute operating expenses & outgoings) ──────────────────
export type ExpenseMethod = 'Cash' | 'Bank' | 'Card'
export const EXPENSE_METHODS: ExpenseMethod[] = ['Cash', 'Bank', 'Card']

export const EXPENSE_CATEGORIES = [
  'Rent & Utilities',
  'Salaries & Wages',
  'Teaching Materials',
  'Equipment & Maintenance',
  'Transport',
  'Marketing',
  'Events & Activities',
  'Licenses & Fees',
  'Miscellaneous',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface ExpenseByCategory {
  category: string
  total: number
  count: number
}

export interface ExpenseSummary {
  total: number
  count: number
  byCategory: ExpenseByCategory[]
  methodTotals: Record<string, number>
  statusTotals?: Record<string, { count: number; total: number }>
}

export type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected'

export interface ExpenseRow {
  id: string
  date: string
  category: string
  description: string
  amount: number
  method: ExpenseMethod
  vendor: string | null
  note: string | null
  status: ExpenseStatus
  reviewedAt: string | null
  reviewedBy: string | null
  hasReceipt?: boolean
  receiptName?: string | null
  receiptUrl?: string | null // only present on single-expense GET
  createdAt: string
}

// ─── Payroll history (teacher profile dialog) ──────────────────────────────
export interface PayrollHistoryEntry {
  month: string
  gross: number
  netSalary: number
  epfEmployee: number
  epfEmployer: number
  etfEmployer: number
  status: 'Paid' | 'Pending'
  method: string | null
  paidDate: string | null
  note: string | null
}

export interface PayrollHistoryResponse {
  teacher: { id: string; teacherId: string; fullName: string; type: string }
  history: PayrollHistoryEntry[]
  paidCount: number
  totalPaid: number
}
