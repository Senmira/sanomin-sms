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

export const PROGRAM_COLORS: Record<string, string> = {
  PRESCHOOL: '#1e40af',
  Daycare: '#7c3aed',
  IT: '#dc2626',
  Elocution: '#0d9488',
  Dancing: '#d97706',
}

export const AGE_GROUPS = ['1-2', '2-3', '3-4', '4-5'] as const
export const GENDERS = ['Male', 'Female'] as const
export const RELIGIONS = ['Buddhist', 'Hindu', 'Islam', 'Christian', 'Roman Catholic'] as const
export const STUDENT_STATUS = ['Active', 'Inactive', 'Graduated'] as const
export const TEACHER_TYPES = ['Internal', 'External'] as const
export const TEACHER_STATUS = ['Active', 'Inactive', 'On Leave'] as const
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const ATTENDANCE_METHODS = ['Barcode', 'Fingerprint', 'Manual'] as const
export const ATTENDANCE_STATUS = ['Present', 'Absent', 'Late', 'Leave'] as const

export const PROGRAM_LIST = ['PRESCHOOL', 'Daycare', 'IT', 'Elocution', 'Dancing'] as const

// API response shapes (loosely typed on the client via the API returns)
export interface StudentRow {
  id: string
  studentId: string
  indexNo: string | null
  barcode: string
  fullName: string
  gender: string
  dob: string | null
  ageGroup: string | null
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
  enrollments: Array<{ id: string; program: { id: string; code: string; name: string; color: string } }>
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
  classes: Array<{ id: string; name: string; dayOfWeek: string | null; startTime: string | null }>
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
  _count?: { enrollments: number; classes: number }
}

export interface ClassRow {
  id: string
  name: string
  dayOfWeek: string | null
  startTime: string | null
  endTime: string | null
  room: string | null
  capacity: number
  fee: number
  instituteSharePct: number
  active: boolean
  notes: string | null
  program: { id: string; code: string; name: string; color: string } | null
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
  student: { id: string; studentId: string; fullName: string }
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
}

export interface ExpenseRow {
  id: string
  date: string
  category: string
  description: string
  amount: number
  method: ExpenseMethod
  vendor: string | null
  note: string | null
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
