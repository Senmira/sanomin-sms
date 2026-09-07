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
