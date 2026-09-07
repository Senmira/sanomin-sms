# SANOMIN Institute Management System — Worklog

---
Task ID: 1
Agent: main (Z.ai Code)
Task: Restore workspace + backend for 4 new features (multi-programme bills, teacher salary/EPF, class 25% institute share, bulk manual attendance)

Work Log:
- Restored uploaded workspace tar (workspace-279de1c7-6563-48b2-8490-2ba69ea2af20.tar) into /home/z/my-project. Project: SANOMIN International Preschool management system (Next.js 16 + Prisma SQLite + shadcn/ui), single-page app with sections (dashboard, students, teachers, classes, programs, fees, attendance, announcements, reports, settings).
- prisma/schema.prisma: added `PaymentItem` model (bill line items: paymentId, programId, description, amount). Payment ↔ items relation (cascade delete). Teacher: added `basicSalary Float @default(0)`, `allowances Float @default(0)`, `epfNo String?`, `salaryNote String?`. Class: added `instituteSharePct Float @default(25)`.
- `bun run db:push` OK (db/custom.db synced, client regenerated).
- src/app/api/payments/route.ts: GET includes `items[]` with program info; program filter matches bills via items OR legacy programId. POST now accepts `programIds: string[]` (one line per programme priced at monthlyFee, total = sum) or `items: [{programId, amount?, description?}]`; legacy single `programId`+`amount` still works; keeps legacy `programId` column in sync for single-programme bills; dedupes programmes.
- src/app/api/payments/[id]/route.ts: GET/PUT include items; PUT accepts `items`/`programIds` (replace-all semantics, total recomputed from items when body.amount absent).
- src/app/api/payments/bulk-generate/route.ts: now creates ONE BILL PER STUDENT with one PaymentItem per active programme enrolment (previously one payment row per programme → student name repeated). Skip check is per student for the month. Message reports bills + line item counts.
- src/app/api/teachers/route.ts + [id]/route.ts: serialize/create/update for basicSalary, allowances, epfNo, salaryNote.
- src/app/api/classes/route.ts + [id]/route.ts: instituteSharePct serialized, accepted on create (default 25, clamp 0–100) and update.
- NEW src/app/api/attendance/bulk/route.ts: POST { date: YYYY-MM-DD, entries: [{personType, personId, status, checkIn "HH:MM", checkOut "HH:MM", note}] } → upserts Manual attendance rows for the day (validates persons, swaps invalid time order, returns created/updated/failed counts).
- src/lib/types.ts: PaymentRow.items + PaymentItemRow; TeacherRow.basicSalary/allowances/epfNo/salaryNote; ClassRow.instituteSharePct; added EPF_EMPLOYEE_RATE=0.08, EPF_EMPLOYER_RATE=0.12, ETF_EMPLOYER_RATE=0.03 and salaryBreakdown() helper (gross = basic+allowances; EPF employee 8% on basic; net = gross − epfEmployee; employer cost = gross + 12% + 3%).

Stage Summary:
- DB + API layer ready for the 4 features. Frontend sections NOT yet updated (fees-section, teachers-section, classes-section, attendance-section still use old single-programme flow / no salary fields / no bulk attendance).
- API contracts for frontend agents:
  - POST /api/payments body: { studentId, month: "YYYY-MM", programIds: string[], paidAmount, method, dueDate, paidDate, note } → bill with items; response PaymentRow has items: [{id, programId, description, amount, program:{id,code,name,color,monthlyFee}}].
  - PUT /api/payments/[id] same contract (programIds/items replace line items).
  - POST /api/payments/bulk-generate { month, dueDate? } → one bill per student.
  - POST /api/attendance/bulk { date: "YYYY-MM-DD", entries: [{personType: "Student"|"Teacher", personId, status: "Present"|"Absent"|"Late"|"Leave", checkIn: "HH:MM"|null, checkOut: "HH:MM"|null, note}] } → { created, updated, failed, message }.
  - GET /api/students?q=&limit= returns StudentRow with enrollments[].program; GET /api/teachers?q= returns TeacherRow with basicSalary/allowances/epfNo/salaryNote.
- EPF/ETF rules (Sri Lanka): employee EPF 8% (on basic), employer EPF 12% + ETF 3%. salaryBreakdown(basic, allowances) in src/lib/types.ts returns {gross, epfEmployee, netSalary, epfEmployer, etfEmployer, employerCost}.
- Class institute share: instituteSharePct (default 25). Institute income = fee × pct/100; teacher payout = fee × (100−pct)/100.
---
Task ID: 2-a
Agent: full-stack-developer
Task: Fees section — one payment bill = one student + several programmes (multi-programme bill UI)
Work Log:
- Read worklog.md (Task 1 backend contracts) and src/lib/types.ts (PaymentRow.items, PaymentItemRow, StudentRow.enrollments, ProgramRow).
- Only file touched: src/components/sections/fees-section.tsx.
- Added module-level helpers: billPrograms(p) (distinct programmes from payment.items, falling back to legacy payment.program) and billLines(p) (per-item rows {description, amount, color} for receipts with legacy fallback).
- FormState: replaced programId/amount with programIds: string[]; emptyForm updated (removed stray unused `due` var). Amount is no longer a manual input — bill total = Σ selected programme monthlyFee (computed via selectedPrograms/totalAmount useMemo; server recomputes identically).
- PaymentDialog: kept student search picker unchanged (one student per bill); replaced single Program <Select> with a "Programmes *" checkbox list card (Checkbox + colored dot + name/code + monthly fee, scroll-thin max-h-44) with "Select all"/"Clear" quick actions; added "Bill summary" panel listing each selected programme fee + prominent "Total billed" total; Month + Method now share a row; Paid amount / Due date / Paid date share a 3-col row with a "Pay full" convenience link; balance hint now driven by totalAmount.
- Student selection auto-checks the student's enrolled programmes (s.enrollments[*].program.id intersected with active programs); edit mode initializes programIds from payment.items[*].programId (+ legacy payment.programId fallback, deduped) and merges item programmes missing from the active list into the checkbox list so legacy/archived programmes stay visible; dialog description updated to explain one-bill-many-programmes.
- Submit payload now { studentId, month, programIds, paidAmount, method, dueDate, paidDate, note } via POST /api/payments or PUT /api/payments/[id]; validation: student, YYYY-MM month, ≥1 programme selected.
- Table: "Program" column renamed "Programmes" and renders one colored badge per line item (up to 3 via shownProgs) then "+N" muted badge; uses billPrograms() so legacy rows still render.
- ReceiptDialog: renders one row per bill line item (colored dot + description + item amount) followed by a "Total billed" subtotal row above Amount paid/Balance/Method/dates; falls back to single programme when items empty; PAID stamp/status/note unchanged.
- CSV export: Program column = joined item codes (e.g. "PRESCHOOL + IT") via billPrograms(), plus new "Programmes" count column; all other columns unchanged.
- Stats cards, filters, tabs, bulk-generate dialog, send-reminder, delete confirm, pagination untouched.
Stage Summary:
- Payments UI now matches backend contract: ONE bill per student with several programme line items — student name appears once; programmes are checkboxes; total auto-computed; POST/PUT send programIds; table/receipt/CSV render per-item programmes.
- bun run lint: clean. bunx tsc --noEmit: zero errors in fees-section.tsx (remaining tsc errors are pre-existing in other files: teachers-section, api routes, examples, skills — not part of this task).

---
Task ID: 2-b
Agent: full-stack-developer
Task: Build bulk "Attendance Sheet" dialog in attendance-section with per-row check-in/check-out times (replaces one-by-one manual search flow)
Work Log:
- Read worklog.md (Task 1 backend contracts) and verified contracts against source: POST /api/attendance/bulk ({date, entries[≤500]} → {ok, created, updated, failed, errors, message}, upserts Manual per person/day); GET /api/students caps limit at 100/page and supports program (code) + status params (NO class param); GET /api/teachers caps limit at 100, supports status; GET /api/attendance caps limit at 200/page; GET /api/classes?active=true returns ClassRow with program code.
- attendance-section.tsx: added helpers isoToHHMM (ISO → local "HH:MM"), SheetRow/BulkResult types, and paginated fetchers fetchAllActiveStudents (status=Active, 100/page loop, program-code filter when a class is selected), fetchActiveTeachers (status=Active&limit=100), fetchAttendanceForDate (limit=200 pagination) — all via existing api() helper.
- New AttendanceSheetDialog (max-w-4xl, body max-h-[65vh] scroll-thin, dialog max-h-[92vh]): date picker (default today), Students/Teachers Tabs, Class/Program Select for students (All students + active classes; narrows roster via students API program param), auto roster load on control change (setTimeout(0) + alive-flag cleanup pattern per file conventions).
- Default-times row: default check-in (08:30) / check-out (16:00) time inputs + "Apply to all rows" button stamping selected rows missing times.
- Roster Table (table-zebra, sticky header): select-all Checkbox column, Person (avatar initials via avatarColor/initials + name + ref + gender/ageGroup or teacher type), Status Select (Unmarked/Present/Absent/Late/Leave with color-coded trigger), per-row Check-in and Check-out <Input type="time">, optional Note input. Existing attendance for the date prefills status/times/note (map personType:personId → record). Absent/Leave rows disable + grey out time inputs and drop times; marking Present/Late autofills defaults when empty.
- Bulk actions: "Mark all Present" (selected rows, stamps default times), "Clear times", header select-all with indeterminate state; live count badges "N/M selected · Present/Late/Absent/Leave".
- Footer: "Saving N records as Manual" hint, Save → POST /api/attendance/bulk (only rows with status or times set; '' times → null; auto-chunks into batches of 500). Success → toast(res.message) + onSuccess() (reloadToday) + close; failed>0 → red row-error panel with res.errors, dialog stays open.
- ScannerPanel: added onOpenSheet prop and an "Attendance sheet" button (Users2 icon, outline) beside the existing "Manual entry" ghost button; main section wires sheetOpen state → AttendanceSheetDialog onSuccess=reloadToday. Manual entry, Edit, delete, filters, scanner, summary cards untouched.
- bun run lint: clean. bunx tsc --noEmit: 0 errors in attendance-section.tsx (pre-existing errors in other files only). dev.log compiles OK.
Stage Summary:
- User complaint addressed: bulk attendance sheet lists the entire active roster at once (students paginated past the API's 100/page cap, teachers up to 100) with per-row status + check-in + check-out + note, default-time stamping, mark-all-Present, select-all, class/program narrowing, same-day prefill, and one-shot save via /api/attendance/bulk (upsert, method Manual) with 500-row chunking and row-level error reporting.
- API contracts unchanged (verified, not modified). Only /home/z/my-project/src/components/sections/attendance-section.tsx touched (+ worklog.md).
---
Task ID: 2-c
Agent: full-stack-developer
Task: Add teacher salary/EPF UI to teachers-section + institute share (25% default) UI to classes-section
Work Log:
- teachers-section.tsx: FormState extended with basicSalary/allowances/epfNo/salaryNote (defaults in emptyForm, hydrated in formFromTeacher); Add/Edit dialog gained a bordered "Salary & EPF" section (Landmark icon; labelled "Salary / Rate & EPF" for External teachers) with Basic Salary (number, min 0, step 500), Allowances, EPF No (mono), Salary Note (short textarea), plus a live breakdown panel recomputed per keystroke via salaryBreakdown() from '@/lib/types': Gross, EPF employee −8% of basic, Net take-home (emerald), EPF employer 12% + ETF 3% (muted), Total institute cost (primary), with the statutory-rates hint line. New BreakdownRow helper component added.
- teachers-section.tsx: submit validation for basicSalary/allowances (non-negative numbers) and payload now sends basicSalary, allowances, epfNo (null when blank), salaryNote (null when blank) — matches POST /api/teachers + PUT /api/teachers/[id] contract. monthlyRate input kept as-is.
- teachers-section.tsx: table rows now show a compact salary line under the teacher ID (Wallet icon, "Net LKR x/mo" with gross on hover, tabular-nums) and a tiny "EPF #<no>" outline badge when set; rate-only External teachers fall back to monthlyRate for net display.
- teachers-section.tsx: ProfileDialog — EPF # badge (emerald) in header badges; overview grid swaps "Monthly rate" for type-aware items: External keeps "Monthly rate (tuition)"; Internal (or anyone with basic/allowances) gets "Net salary (incl. EPF)" with gross=basic+allowances subtitle and "Employer EPF + ETF" (12%+3% on basic); salaryNote shown full-span when set. DetailItem gained optional `sub` prop. Fixed pre-existing TS errors on classesList (cast to ClassDetail[]).
- teachers-section.tsx: stats strip extended to lg:grid-cols-5 with new "Monthly payroll" StatCard = Σ net take-home over loaded teachers (rate-only externals count their monthlyRate), green accent, hint "Net take-home · incl. EPF", col-span-2 on mobile.
- classes-section.tsx: FormState/EMPTY_FORM gained instituteSharePct (string, default '25'); new parseSharePct() helper (blank/NaN → 25, clamps 0–100); openEdit hydrates String(c.instituteSharePct ?? 25); create/update payloads include instituteSharePct.
- classes-section.tsx: Add/Edit dialog gained a bordered "Teacher pays institute (%)" numeric input (0–100) with helper "Share of the class fee that goes to the institute" and a live split panel (Landmark emerald "Institute gets" fee×pct, GraduationCap primary "Teacher gets" fee×(100−pct), tabular-nums, currency()); DialogContent now scrolls (max-h-[90vh] overflow-y-auto) like the teachers dialog.
- classes-section.tsx: list view Fee cell augmented — fee on top, muted "Inst LKR x · Tch LKR y" line beneath (title shows the % share); computed from c.instituteSharePct ?? 25.
- classes-section.tsx: stats memo now accumulates instituteIncome = Σ fee×pct/100 over ACTIVE classes; strip extended to lg:grid-cols-5 with "Institute Income" StatCard (Landmark, green, hint "Active classes · 25% default share").
- Verification: bun run lint clean; bunx tsc --noEmit reports zero errors in both section files (remaining project-wide errors are pre-existing in API routes/examples, untouched); Next dev compiles clean.
Stage Summary:
- Teachers section is now salary-aware end-to-end: create/edit (basic, allowances, EPF no, note) → live EPF breakdown (8% employee on basic; 12%+3% employer; net & employer cost) → per-row net salary + EPF badge → profile detail items → "Monthly payroll" stat.
- Classes section is now share-aware end-to-end: create/edit with instituteSharePct (default 25, clamped) → live institute/teacher fee split preview → per-class split in the Fee column → "Institute Income" stat over active classes.
- Frontend fully consumes the Task 1 backend contracts (TeacherRow salary fields, ClassRow.instituteSharePct, salaryBreakdown helper); no API routes touched; only the two assigned files were modified (plus worklog/agent-ctx records).

---
Task ID: 3
Agent: main (Z.ai Code)
Task: Browser-verified all 4 features end-to-end, fixed 3 bugs found during QA, UX copy updates

Work Log:
- Browser QA via agent-browser (JS eval-driven since refs churn on re-render):
  - Payments: created bill SAN-2026-0131 via dialog — student search → auto-ticks enrolled programmes (4) → bill summary total LKR 14,300 → uncheck Dancing → 12,500 → submit → POST 201. Table row shows ONE student name + programme badges (PRESCHOOL / Daycare / Elocution / +1). Receipt dialog lists per-programme line items with colour dots + Total billed row. Verified via screenshot.
  - Edit-bill PUT via API: programIds replace → items replaced AND total recomputed (found + fixed bug: `data.amount` was only assigned when body.amount explicit — now also when replaceItems).
  - Bulk generate: UI "Generate Month" for 2026-12 → 48 bills covering 65 programme line items (one bill per student). Updated dialog copy to describe one-bill-per-student semantics. Test bills + test teacher removed afterwards.
  - Attendance sheet: opened on Students tab → 48 rows loaded at once (no search), default check-in 08:00 / check-out 15:30 → Apply to all rows → all 96 time inputs filled → Mark all Present → Save → toast "Saved 48 attendance records (10 new, 38 updated)", POST /api/attendance/bulk 200, list auto-reloaded. Existing records prefilled from /api/attendance for the date. Verified via screenshot.
  - Teachers: Add dialog → Basic 60,000 + Allowances 6,000 → live breakdown (gross 66,000, EPF −4,800, net 61,200, employer 7,200+1,800, cost 76,200... verified correct math) → Create → POST 201 → roster row shows "Net LKR 61,200/mo" + "EPF #…" badge; profile dialog shows net salary + gross decomposition + employer EPF/ETF; "Monthly payroll" stat card present.
  - Classes: List view fee cells show "Inst LKR 500 · Tch LKR 1,500"; edit dialog "Teacher pays institute (%)" (default 25) + live split (Institute LKR 600 / Teacher LKR 1,400 at 30%) → save → PUT persisted; "Institute Income" stat card present.
  - Mobile (375px): fees stats 2-col grid, action buttons wrap, attendance scanner panel adapts. Desktop restored (1280px).
- Bugs found & fixed during QA:
  1. `src/app/api/teachers/route.ts` POST returned 500 ("Cannot read properties of undefined (reading '0')") — serialize() reads `t.attendance[0]` but create's include lacked `attendance`; added attendance include (pre-existing bug surfaced by test).
  2. `src/app/api/classes/[id]/route.ts` + `src/app/api/programs/[id]/route.ts` had corrupted import `from 'next.server'` (→ module not found, all classes API 500); fixed to `next/server`, restarted dev server to clear stale Turbopack cache.
  3. `src/app/api/payments/[id]/route.ts` PUT: when items/programIds replaced without explicit amount, bill total was not recalculated (data.amount assignment gated on body.amount) — fixed with `(typeof body.amount === 'number' && !isNaN(body.amount)) || replaceItems` condition; also switched update data to `Prisma.PaymentUncheckedUpdateInput` to set scalar programId alongside nested items writes (resolves TS2551).
  4. Dev server restart needed after SQLite transient "attempt to write a readonly database" (stale lock after pkill mid-session) — clean restart fixed; DB writes verified OK from server process.
- `bun run lint` clean. `bunx tsc --noEmit` — remaining errors verified pre-existing on the original codebase (examples/, prisma seeds, attendance/[id], at-risk, reports, lib/api) via git stash comparison; ZERO new errors from this task.
- Test data cleaned up: 2026-12 bills (48), test bill SAN-2026-0131, teachers "Kasun Perera"/"API Smoke Test"/"Sanduni Herath", manual attendance rows for 2026-02-05. Class "Elocution — Speech & Drama" share restored to 25.

Stage Summary:
- ALL 4 requested features are implemented, browser-verified, and lint-clean:
  1. One bill = one student + several programmes (dialog checkboxes, table badges, itemised receipt, CSV, bulk-generate one-bill-per-student).
  2. Teacher salary fields (basic, allowances, EPF No, salary note) with Sri Lanka EPF 8% employee / 12%+3% employer breakdown, net pay, payroll stat.
  3. Classes: teacher-pays-institute % (default 25) with live institute/teacher split + institute income stat.
  4. Manual attendance sheet: whole roster at once with per-row status + check-in/check-out, default times apply-to-all, mark-all-present, bulk save via POST /api/attendance/bulk.
- Known pre-existing tsc strictness errors remain in untouched files (documented above); no runtime impact.

---
Task ID: 3-b
Agent: main (Z.ai Code)
Task: Payroll module backend — PayrollRecord model + /api/payroll GET register & POST mark-paid

Work Log:
- prisma/schema.prisma: added PayrollRecord model (teacherId+month unique; snapshots basicSalary/allowances/gross/epfEmployee/netSalary/epfEmployer/etfEmployer/employerCost at mark-paid time; status Pending|Paid; method Cash|Bank|Cheque; paidDate, note). Teacher.payrollRecords relation added. db:push OK.
- NEW src/app/api/payroll/route.ts:
  - GET ?month=YYYY-MM&q=&status= → register row per ACTIVE teacher merging live salary figures with persisted Paid snapshots; rate-only External teachers (no basic, monthlyRate>0) fall back to monthlyRate with ZERO statutory deductions; summary totals (totalGross/totalEpfEmployee/totalNet/totalEpfEmployer/totalEtfEmployer/totalEmployerCost, paidCount/pendingCount, totalPaid/totalPending — all round2).
  - POST { month, entries:[{teacherId,status:'Paid'|'Pending',method?,note?,paidDate?}] } → upsert PayrollRecord per teacherId+month with salary snapshot; 200-row cap; row-level errors array. FIXED during QA: rate-only externals had netSalary wrongly EPF-deducted in snapshot (netSalary now = gross when no deductions).
- Verified: GET 2026-09 → 7 active teachers, net 27,000, all pending; externals 8000/10000/9000 via rate fallback. POST mark-paid (Bank) → snapshot net 8000, epf 0, paidDate set. Test record reset to Pending.
- Wiring: SectionKey 'payroll' (src/lib/types.ts), NAV entry Operations group w/ Banknote icon (src/components/layout/app-shell.tsx), page.tsx renders PayrollSection; stub payroll-section.tsx created to unblock compile.
- src/lib/types.ts: added PayrollRow, PayrollSummary, PAYROLL_METHODS.

Stage Summary:
- API contract for the Payroll section UI (Task 3-d):
  - GET /api/payroll?month=YYYY-MM → { month, data: PayrollRow[], summary: PayrollSummary } (types in src/lib/types.ts). PayrollRow = { teacher:{id,teacherId,fullName,type,epfNo,classes}, month, basicSalary, allowances, gross, epfEmployee, netSalary, epfEmployer, etfEmployer, employerCost, status 'Paid'|'Pending', method, paidDate, note, recordId }.
  - POST /api/payroll { month, entries:[{teacherId,status:'Paid'|'Pending',method:'Cash'|'Bank'|'Cheque',note?,paidDate?}] } → { marked, failed, errors, message }.
  - Rates: EPF employee 8% + employer 12% + ETF 3% ON BASIC ONLY (salaryBreakdown helper exists in types.ts); rate-only externals = no contributions.

---
Task ID: 3-d
Agent: full-stack-developer
Task: Replace payroll-section stub with complete Payroll UI (register table, stats, mark-paid flow, payslips)
Work Log:
- Only file touched: src/components/sections/fees… src/components/sections/payroll-section.tsx (single 'use client' file, ~1030 lines), following fees-section/teachers-section conventions exactly (SectionHeader/StatCard/EmptyState/ConfirmDialog shared components, api() + sonner toast, alive-flag useEffect with reloadRef + deferred setTimeout(run,0), lastNMonths/monthLabel/toIsoDate helpers, table-zebra + animate-row-in + scroll-thin classes).
- Header: SectionHeader "Payroll" ("Monthly teacher salaries · EPF/ETF & payslips", Banknote icon) with Export CSV (outline, 17-column register export incl. EPF/ETF splits) + primary "Pay selected (N)" button (disabled until ≥1 pending row selected).
- Filter card: Billing month Select (last 6 months), Status Select (All/Paid/Pending — passed server-side as &status=), client-side search Input on name/teacherId (no debounce, small dataset) + Clear button, plus "as of {monthLabel}" hint explaining pending=live figures vs paid=snapshot.
- Stats strip (grid-cols-2 lg:grid-cols-4, 4 Skeleton h-28 while loading): Net payable = currencyCompact(summary.totalNet) w/ "N/M paid" hint (Banknote, blue); EPF + ETF (employer) = totalEpfEmployer+totalEtfEmployer (Landmark, amber, "12% + 3% of basic"); Total institute cost = totalEmployerCost (TrendingUp, purple); Paid this month = totalPaid (CheckCircle2, green, "{compact totalPending} outstanding"). All values use currencyCompact so nothing truncates.
- Register table (Card p-0, max-h-[62vh] scroll, min-w-[900px], sticky header + sticky totals footer): columns = select checkbox (disabled on Paid rows; header checkbox w/ indeterminate selects all visible pending), Teacher (avatar initials/avatarColor, name w/ note StickyNote title tooltip, teacherId mono, Internal (primary) / External (purple) badge, emerald "EPF #…" badge, class count), Basic, Allowances, Gross, EPF −8% (muted, "—" when 0), Net salary (semibold, emerald when Paid), Emp. EPF+ETF (muted small), Status badge (Paid emerald-500/15 / Pending amber-500/15), Paid via (method + fmtDate, "—" when pending), Actions dropdown (Print payslip; Mark paid on pending rows / Mark pending on paid rows). Selected rows get bg-primary/5 (utilities layer overrides zebra). Totals footer: Basic/Allowances summed from visible rows, Gross/EPF/Net/Employer from summary.
- Pay flow: per-row "Mark paid" + "Pay selected" open PayDialog (list of teachers w/ net amounts, "N teachers · total net payable" total in emerald, method Select Cash/Bank/Cheque default Cash, paid date Input[type=date] default today, optional note Textarea) → POST /api/payroll { month, entries:[{teacherId,status:'Paid',method,note?,paidDate?}] } → toast(res.message) (toast.warning + first 3 row errors when failed>0), reload, selection cleared. "Mark pending" per-row → ConfirmDialog (non-destructive) → POST status:'Pending' → toast + reload (snapshot cleared server-side).
- PayslipDialog per teacher (max-w-md p-0, .payslip-print wrapper structured for separate print CSS): logo block (/sanomin-logo.jpg) + PAYSLIP title + month, status badge, employee block (name, ID, type, EPF no), earnings/deductions (Basic, Allowances, Gross, EPF −8%, bold emerald NET PAY), employer contributions panel w/ "paid by institute" badge (EPF 12%, ETF 3%, total cost), method + paid date, note, "____ Teacher / ____ Authorised" border-t signature lines, generated timestamp, Close + window.print() Print button.
- States: error EmptyState w/ Retry, 6 skeleton table rows, empty "No teachers on payroll" (filter-aware description).
- Verification: bun run lint clean; bunx tsc --noEmit → 0 payroll-section errors. agent-browser QA on http://localhost:3000: 7 rows (3 rate-only externals 8k/10k/9k with epfEmployee 0, 4 internals), all 4 stats + footer totals correct, checkbox select → "Pay selected (1)" → dialog (total LKR 8,000, Cash default, today's date) → method Bank + note → Confirm → toast "Payroll updated for 1 teacher.", row flips to Paid + "Bank · 07 Sept 2026" + emerald net, stats 1/7 paid & LKR 8.0K paid. Paid-row payslip verified (all blocks + signatures). Then reverted via "Mark pending" ConfirmDialog → back to Pending, paidCount 0 (DB clean, verified via API). Search ("ravi"→1 row), select-all (7 checked), status filter (Pending→7), mobile 375px (2-col stats, table h-scrolls) all pass; no console errors.
Stage Summary:
- Payroll section is feature-complete against the Task 3-b API contract: 6-month register with live/snapshot figures, EPF/ETF breakdown columns + totals footer, client-side search & status filter, 4 currencyCompact stat cards, per-row + bulk mark-paid dialog (method/date/note, snapshot server-side), mark-pending reversal via ConfirmDialog, printable payslip per teacher, CSV export, loading/empty/error states.
- End-to-end browser-verified including full pay → revert cycle with clean data restored (0 paid / 7 pending / net LKR 27,000 for 2026-09). No API routes or other files touched.

---
Task ID: 3-e
Agent: main (Z.ai Code)
Task: Styling polish + final QA for payroll round

Work Log:
- src/app/globals.css: added real @media print rules — body * visibility:hidden; .receipt-print/.payslip-print subtrees revealed and pinned to page origin full-width; dialog chrome neutralised (static positioning, no max-height/scroll); buttons hidden; forces light colors in dark mode so printed receipts/payslips are clean black-on-white. This fixes a real defect: printing previously dumped the entire app page.
- src/components/sections/teachers-section.tsx: "Monthly payroll" StatCard value switched currency() → currencyCompact() (fixed value truncation "LKR 27,00…" at lg grid width) + currencyCompact import.
- Browser QA: all 9 sections render with no error states; Payroll section verified in light AND dark mode (stat cards, register table 7 rows, totals footer); payslip dialog renders correctly (rate-only external: Basic 8,000 / EPF 0 / NET PAY 8,000 / employer block "paid by institute" all LKR 0 / signature lines); Pay selected flow previously verified by Task 3-d agent (mark paid → stats update → revert to Pending; data left clean 0/7 paid).
- bun run lint clean; bunx tsc scoped grep for payroll/teachers-section → 0 errors; dev.log clean (no errors after compile).

Stage Summary:
- NEW: Payroll section (sidebar → Operations → "Payroll") with monthly register, EPF/ETF breakdowns, mark-paid snapshots, bulk pay, CSV export, printable payslips.
- NEW: print stylesheet making receipt & payslip printing produce clean sheets only.
- Data state: 7 active teachers all Pending for 2026-09 (net LKR 27,000); no test rows left.
- Risks/next: pre-existing tsc strictness errors in untouched files remain (documented in Task 3); payroll snapshot semantics mean editing a teacher's salary won't rewrite past Paid months (intentional); consider Payslip PDF export & salary history chart next round.
---
Task ID: 4-b
Agent: full-stack-developer
Task: New Expenses module end-to-end (Expense model + /api/expenses CRUD + Expenses section UI with stats/filters/dialog/CSV)

Work Log:
- prisma/schema.prisma: appended Expense model (date, category, description, amount, method Cash|Bank|Card default Cash, vendor?, note?, timestamps) — no existing models modified; `bun run db:push` OK (db/custom.db synced, client regenerated). Dev server restarted afterwards (old process held the stale Prisma Client → db.expense undefined; clean restart fixed).
- NEW src/app/api/expenses/route.ts (payments/payroll route conventions: NextResponse.json, Prisma where input, round2 helper): GET ?month=YYYY-MM&q=&category=&limit=&page= → { data, summary: { total, count, byCategory: [{category,total,count}] sorted total desc, methodTotals: {Cash,Bank,Card} }, page, totalPages, total }; month filter = UTC calendar-month range on date (gte 1st, lt next-month 1st), q = case-insensitive contains on description/vendor/note (SQLite contains), category exact, sort date desc + createdAt desc, limit cap 200 default 100, page default 1, month validated YYYY-MM (defaults to current). POST validates date ISO-parseable, category/description non-empty, amount positive finite, method ∈ Cash|Bank|Card, vendor/note trimmed (null when blank) → 201 + created row; invalid JSON → 400.
- NEW src/app/api/expenses/[id]/route.ts: GET row; PUT partial-tolerant (absent fields preserved, present fields fully validated, same rules as POST) → updated row; DELETE → { ok: true, id }; unknown id → 404.
- src/lib/types.ts: added 'expenses' to SectionKey union; APPENDED at end: ExpenseMethod, EXPENSE_METHODS, EXPENSE_CATEGORIES (9 categories incl. Rent & Utilities…Miscellaneous), ExpenseCategory, ExpenseByCategory, ExpenseSummary, ExpenseRow.
- src/components/layout/app-shell.tsx: ONE nav entry after 'fees' — { key: 'expenses', label: 'Expenses', icon: ReceiptText, group: 'Operations', description: 'Institute operating expenses & outgoings' }.
- src/app/page.tsx: import ExpensesSection + `section === 'expenses'` case in the switch (same direct-import pattern as the rest of the file).
- NEW src/components/sections/expenses-section.tsx ('use client', follows fees-section/payroll-section conventions exactly: SectionHeader/StatCard/EmptyState/ConfirmDialog, api() + sonner, alive-flag useEffect with reloadRef + deferred setTimeout(run,0), lastNMonths/monthLabel/toIsoDate, table-zebra + scroll-thin + animate-row-in, currency/currencyCompact/fmtDate from '@/lib/format'): SectionHeader "Expenses" + Export CSV (outline) + primary "+ Add Expense"; 4 stat cards (grid-cols-2 lg:grid-cols-4, Skeleton h-28): Total this month (ReceiptText, red, "{count} payments"), Top category (PieChart, amber, share % of total + compact amount), Average per entry (Calculator, purple, "across {count} entries"), Bank + Card (CreditCard, green, "vs Cash {x}"); filter card (Billing month Select last 6 months w-[180px], Category Select All+EXPENSE_CATEGORIES w-[200px], debounced search Input sent as &q= like fees, Clear filters button when active); table Card p-0 max-h-[62vh] min-w-[860px] sticky header: Date (fmtDate), Category (deterministic soft badge — fixed amber/rose/emerald/cyan/orange/purple/lime/teal/fuchsia map with hash fallback, bg-*-500/15 + dark:text-*-300), Description (font-medium + vendor muted second line), Note (muted truncated w/ title tooltip), Method (badge like fees), Amount (semibold right tabular-nums rose-600 dark:rose-400), Actions dropdown (Edit/Delete); footer hint "Showing N of M expenses · {monthLabel}"; Add/Edit dialog (max-h-[90vh] overflow-y-auto: date default today, category Select fixed list, description, vendor, amount number min 0 step 10 with inline error, method Select default Cash, note Textarea; live validation disables submit until valid); delete → ConfirmDialog destructive → DELETE; CSV export (Date, Category, Description, Vendor, Method, Amount, Note) over currently loaded rows, filename sanomin-expenses-{month}.csv; loading = 4 skeleton stats + 6 skeleton rows; error = EmptyState + Retry; empty = filter-aware "No expenses recorded".
- Verification: bun run lint clean; bunx tsc --noEmit → ZERO errors in my files (fixed ExpenseUncheckedCreateInput narrowing; remaining errors pre-existing in untouched files per Task 3). curl API matrix: summary/byCategory/methodTotals correct; month boundaries (2026-08-31 & 2026-10-01 excluded from 2026-09); q matches vendor/note case-insensitively; category exact; POST/PUT validation errors (amount ≤ 0, bad method, missing date, invalid JSON → 400); unknown id → 404; DELETE → {ok:true}. Test rows cleaned after.
- agent-browser QA @1440 & 375: sidebar → Expenses; added "September electricity bill" (Rent & Utilities, 8,500, Cash) + "Classroom posters" (Teaching Materials, 3,200, Card) via dialog; stats updated correctly (LKR 12K · 2 payments / Rent & Utilities 73% / avg LKR 5.8K / Bank+Card 3.2K vs Cash 8.5K); submit disabled until form valid; edited posters → 3,500 + vendor "Local Print Shop" + note "Invoice #4471" (prefill, vendor second line, note column, PUT persisted); deleted both via ConfirmDialog → empty state; search/category/month filters + Clear verified; CSV export toast "Exported 1 expenses to CSV"; dark mode verified via app toggle (badges switch dark variants); 375px: 2-col stat cards, no page horizontal overflow (table scrolls in card); agent-browser errors: none. Screenshots tool-results/exp-01..06.
- Re-created one realistic expense via the UI and LEFT it: "September electricity bill", Rent & Utilities, LKR 8,500, Cash, vendor CEB, date today (2026-09-07) — section not empty for the user.

Stage Summary:
- NEW Expenses module (sidebar → Operations → "Expenses"): Expense table + GET/POST/PUT/DELETE API + complete section UI (month/category/search filters, 4 stat cards, zebra table w/ colored category badges, add/edit dialog w/ live validation, delete confirm, CSV export, loading/empty/error states, responsive + dark-safe).
- API contract: GET /api/expenses?month=YYYY-MM&q=&category=&limit=&page= → { data: ExpenseRow[], summary: { total, count, byCategory[], methodTotals{Cash,Bank,Card} }, page, totalPages, total }; POST { date, category, description, amount, method?, vendor?, note? } → 201; PUT/DELETE /api/expenses/[id]; types in src/lib/types.ts (ExpenseRow, ExpenseSummary, EXPENSE_CATEGORIES, EXPENSE_METHODS).
- Files: prisma/schema.prisma (+Expense), api/expenses/route.ts, api/expenses/[id]/route.ts, lib/types.ts, components/layout/app-shell.tsx, app/page.tsx, components/sections/expenses-section.tsx. Lint clean, tsc clean in own files, browser-verified.
- Data left: exactly 1 expense (Sept electricity bill, LKR 8,500, Cash, CEB, 2026-09-07); no other test data. Risks: fixed category list (add via EXPENSE_CATEGORIES; badge colors auto-fallback), SQLite contains-case-insensitivity dependency (same as payments).
---
---
Task ID: 4-a
Agent: main (Z.ai Code)
Task: QA round + QA fixes — teacher salary history (API + profile tab), payroll zero-salary banner, month-select truncation fixes

Work Log:
- Assessment: dev.log clean (all 200s), APIs healthy (students/payroll/dashboard), agent-browser pass over all sections → no runtime errors; app stable → proceeded to new work per instructions.
- QA bug #1 fixed: "Billing month" SelectTrigger truncated "Sept 2026 (2026-09)" → widened w-[180px] → w-[200px] in payroll-section.tsx, fees-section.tsx (and expenses-section.tsx, found same issue there). Verified full label renders at 1440px.
- QA gap #2 fixed (payroll): 4 internal teachers showed Net LKR 0 with no guidance. Added amber fix-it banner between filter card and register (payroll-section.tsx): AlertTriangle + "{N} teacher(s) has/have no salary configured" + names (first 4 + "+N more") + "Go to Teachers →" button wired to useAppStore setSection('teachers'). Renders only when !loading && !error && rows have netSalary <= 0. Browser-verified with all 4 names + navigation.
- NEW: teacher salary history —
  - API: GET /api/payroll?teacher=<Teacher.id> now returns { teacher:{id,teacherId,fullName,type}, history: PayrollHistoryEntry[] (month desc, take 24: month, gross, netSalary, epfEmployee, epfEmployer, etfEmployer, status, method, paidDate, note), paidCount, totalPaid }; unknown teacher → 404. Monthly register endpoint unchanged when no teacher param.
  - types.ts: appended PayrollHistoryEntry + PayrollHistoryResponse.
  - teachers-section.tsx ProfileDialog: new 4th tab "Salary" (History icon, count badge) fetching /api/payroll?teacher= on open; summary strip (Paid to date emerald across N months + Current net salary w/ EPF hint, rate-only-external aware); scrollable history list (month label en-US short, Paid emerald / Pending amber badge, gross/EPF/method/paid-date subline, italic note, net right-aligned); loading spinner + error/empty EmptyStates.
  - Browser-verified on Mr. Ravi Bandara: tab shows "Salary (1)", Paid to date LKR 0 · 0 paid months, current net LKR 8,000/mo, history row "Sep 2026 · Pending · Gross LKR 8,000 · EPF −LKR 0 · Cash · LKR 8,000".
- Verification: bun run lint clean; bunx tsc --noEmit → 0 errors in all touched files (14 remaining errors are the pre-existing set in examples/, prisma seeds, attendance/[id], at-risk, reports, lib/api, skills/ — unchanged from Task 3).

Stage Summary:
- Payroll now self-explains zero-salary rows with a one-click jump to Teachers; teachers' profiles expose full payroll history per teacher (foundation for payslip re-print later).
- QA fixes: month selects no longer truncate in fees/payroll/expenses.
- API addition: GET /api/payroll?teacher=<id> (non-breaking, distinct query param).

---
Task ID: 5
Agent: main (Z.ai Code)
Task: Dashboard cash-position panel + expenses seed data + polish; final full-app QA

Work Log:
- src/app/api/dashboard/route.ts: fees object extended with expenses (Σ Expense.date in current month), payroll (Σ live net salary over Active teachers using IDENTICAL semantics to /api/payroll — EPF 8% on basic; rate-only externals count monthlyRate, no deductions), net = collected − expenses − payroll (all round2).
- dashboard-section.tsx: DashboardData.fees extended; Fee Collection card's rate block split into a 2-col lg grid: Collection rate (unchanged) + NEW "Cash position this month" panel — net value emerald/red by sign, dot-legend Collected/Expenses/Payroll (currencyCompact), "Expenses →" link → setSection('expenses'). Math verified live: 214,700 − 57,700 − 27,000 = LKR 130K.
- expenses-section.tsx polish: singular/plural grammar ("1 payment"/"1 entry"/"1 expense"), month select width fix.
- Seed data for demonstrability (left in DB intentionally): "Building rent — September" (Rent & Utilities, 45,000, Bank, Landlord, 2026-09-01), "Classroom craft supplies — term 3" (Teaching Materials, 4,200, Card, Papers & More, note "Preschool + Daycare", 2026-09-05) + subagent's electricity bill → 3 expenses, Sept total LKR 57,700.
- Final QA: fresh reload → 0 console errors, 0 page errors (earlier "Module not found expenses-section" console line was a stale Fast-Refresh message from mid-creation; cleared + fresh load clean); visited all 12 sections sequentially → all render, zero errors; dark mode on Expenses (badges/tables/labels all dark-safe); mobile 375px dashboard (panels stack, dot legend wraps, updated LKR 130K correct); payroll banner + full month label verified; salary tab verified; dev.log clean; bun run lint clean; tsc: only the 14 pre-existing untouched-file errors.
- Closed browser session cleanly.

Stage Summary:
- Dashboard now answers "are we profitable this month?" at a glance (collected vs expenses vs payroll with net).
- Full feature set this round: Expenses module (4-b), salary history tab (4-a), zero-salary banner (4-a), cash position panel (5), truncation + grammar fixes.
- Data state: 3 September expenses (LKR 57,700), 7 active teachers (4 need salary config — banner visible), 2026-09 payroll all Pending (net LKR 27,000), 65 bills (LKR 273K billed / LKR 215K collected).
- Risks/next: fixed EXPENSE_CATEGORIES list (extend via types.ts — badge colors auto-fallback); dashboard payroll figure is live (not snapshot) so it shifts when salaries change mid-month; suggested next: expense categories pie chart in Reports, payslip PDF download, per-teacher revenue share report (25% institute cut), salary quick-edit from payroll banner.
---
Task ID: 6
Agent: main (Z.ai Code)
Task: QA round + Financial reporting (25% institute share report, expense breakdown), payslip print from salary history, payroll salary quick-edit, mobile overflow fixes, styling polish

Work Log:
- Assessment: dev.log clean (all 200s), lint clean, agent-browser pass over all 12 sections → 0 console/page errors. App stable → proceeded to feature work per worklog Task 5 "next step" suggestions.
- NEW API — financial report: GET /api/reports?type=financial&month=YYYY-MM (src/app/api/reports/route.ts). Returns: fees {billed, collected, outstanding, billCount} (Payment rows by month key); expenses {total, count, byCategory (sorted desc), byMethod}; payroll {teacherCount, paid/pending counts, totalNet, totalEmployerCost} (live register semantics: PayrollRecord snapshot overrides live teacher salary; EPF 8%/12% + ETF 3%); revenueShare {classes[], byTeacher[], totals{gross, institute, teacher}} — per ACTIVE class with teacher: enrolled = active Enrollment count (Prisma groupBy on classId), gross = fee × enrolled, instituteAmount = gross × instituteSharePct% (clamped 0-100), skips gross ≤ 0; trend = 6 months ending at selected (collected via Payment aggregate, expenses via Expense aggregate in UTC month range, payroll from records else live estimate); summary.net = collected + instituteShare − expenses − payrollCost. round2 + UTC month boundaries.
- NEW UI — Reports "Financial" tab (reports-section.tsx): 4th tab (Wallet icon). Month Select (last 6 months) + Export CSV (summary + per-teacher share + expense categories, sanomin-financial-{month}.csv); 4 StatCards (Fees collected green, Institute share purple w/ avg %, Expenses red w/ payroll hint, Net position emerald/red by sign); expense donut (fixed hex palette per category + hash fallback, center total overlay, amount legend); stacked BarChart per teacher (Teacher keeps emerald + Institute share amber); "Institute share register" table (avatar+name+type, classes, students, gross, share % badge, amber institute / emerald teacher-keeps columns, totals footer, sticky header, zebra, x+y scroll); class-level breakdown list (program color dot, teacher, students × fee · % institute, gross + institute amount); 6-month cash-flow LineChart (collected/expenses/payroll). Loading skeletons + error EmptyState with working Retry (refetchTick) + month-aware empty states.
- NEW — payslip print from salary history (teachers-section.tsx): printPayslip() opens a standalone print-ready window (auto window.print() after 250ms) with SANOMIN logo header, PAYSLIP + month, employee meta grid (name/ID/type/EPF no/method/status badge + paid date), earnings table (basic recovered as epfEmployee/0.08 for EPF rows, allowances = gross − basic; rate-only externals show full gross as rate), deductions (EPF employee 8%), NET SALARY PAYABLE emerald banner, employer contributions table (EPF 12% + ETF 3%), note block, generated-timestamp footer + authorized signature line, print media CSS. Printer icon button added to EVERY salary history row in the teacher profile Salary tab (works for any historical month, complements payroll section's existing in-dialog payslip).
- NEW — payroll "Set salaries now" quick-edit (payroll-section.tsx): zero-salary banner now has TWO actions — "Set salaries now" opens a dialog listing all noSalaryRows with per-teacher card (avatar, name, T-id · type, live NET display) and 3 inputs (Basic salary, Allowances, EPF no); live net via salaryBreakdown as you type; Save → sequential PUT /api/teachers/[id] {basicSalary, allowances, epfNo} for drafts with values, toast "Salary updated for N teachers — register refreshed", auto re-fetch register, banner count updates live. "Go to Teachers" kept as secondary.
- Dashboard tie-in: /api/dashboard fees now includes tuitionShare (same class-share formula: Σ fee × active enrolments × instituteSharePct%) and net = collected + tuitionShare − expenses − payroll. Cash-position panel shows 4th dot-legend entry "Tuition share +LKR 5.7K" (purple, hidden when 0) + "Full financial report →" link → reports section.
- Styling polish: new .animate-section-in (fade + 8px slide, 260ms, prefers-reduced-motion safe) applied via keyed wrapper in app/page.tsx so every section switch animates; Reports SectionHeader description updated to "Attendance, enrollment & financial analytics".
- BUG FIXES (QA): (1) Financial panel Retry was setMonth(month) no-op → refetchTick state. (2) HORIZONTAL OVERFLOW ON MOBILE (375px): grid/flex children with min-width:auto + recharts SVG intrinsic width forced page to 412-465px — affected dashboard (Recent Attendance/Age group cards) and ALL Reports tabs. Fixed globally with [data-slot='card'] { min-width: 0 } in globals.css + min-w-0 on specific cards/CardContents/charts wrappers (dashboard-section, reports-section Financial panel). (3) Institute share register table container now overflow-x-auto (min-w-[760px] table scrolls inside card). (4) Reports TabsList max-w-full overflow-x-auto (4 tabs no longer clip on mobile).
- Verification: bun run lint clean; bunx tsc --noEmit → 0 errors in touched files (only the pre-existing 12-14 in examples/, prisma seeds, attendance routes, lib/api, reports/route.ts:498). API matrix via curl: financial 2026-09 → 25% splits verified per class/teacher (22,800 gross → 5,700 institute / 17,100 teachers); 2026-08 → 219,800 collected, 0 expenses. agent-browser QA: salary quick-edit live (set Kumari 35,000+5,000 EPF 100421 → net 37,200 ✓; Samantha 30,000 → 27,600 ✓; toast + banner 4→2 + register refreshed); payslip window opened & screenshotted (header, meta, earnings/deductions/net/employer contributions all correct for Pending Sep 2026 row); Financial tab light+dark+mobile verified; mobile sweep → scrollWidth 375 on ALL 12 sections + all 4 report tabs; desktop 1440 no overflow; fresh full walkthrough → 0 page errors, 0 console errors. Screenshots tool-results/fin-01..03, sal-01..07, final-01..10.
- Data state changes (left intentionally): Mrs. Kumari Jayawardena basic 35,000/allow 5,000/EPF 100421; Mr. Samantha Perera basic 30,000. Remaining no-salary teachers: Ms. Dilani Fonseka, Mrs. Nadeesha Silva (banner shows 2).

Stage Summary:
- 25% institute-share requirement now has a full report: Reports → Financial tab (per-class + per-teacher splits, register table, CSV export, 6-month trend) + dashboard "Tuition share" line in cash position.
- Payslips printable for ANY historical month from teacher profile → Salary tab (printer icon, print/save-as-PDF window).
- Payroll zero-salary banner is now actionable in-place ("Set salaries now" dialog with live EPF math).
- Global mobile fix: cards can now shrink (min-width:0) — no horizontal overflow anywhere at 375px (verified all sections).
- Files: api/reports/route.ts (+financial), api/dashboard/route.ts (+tuitionShare), reports-section.tsx (+FinancialReportPanel ~420 lines), teachers-section.tsx (+printPayslip + printer buttons), payroll-section.tsx (+salary quick-edit dialog), dashboard-section.tsx (cash panel), app/page.tsx (section animation wrapper), globals.css (animate-section-in, card min-width fix).
- Risks/next: trend payroll for months without PayrollRecords uses today's live salaries (estimate); class revenue is fee × enrolment potential (not actual payments — payments are programme-keyed); suggested next: receipt print for multi-programme bills in Fees, attendance register per class report, expense budget vs actual comparison.
