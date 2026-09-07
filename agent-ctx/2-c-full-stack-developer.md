# Task 2-c — full-stack-developer

Task: Teacher salary/EPF UI (teachers-section.tsx) + class institute share UI (classes-section.tsx).

## What was done

### A) src/components/sections/teachers-section.tsx
1. **Form state**: `FormState` + `emptyForm()` + `formFromTeacher()` extended with `basicSalary`, `allowances`, `epfNo`, `salaryNote` (string inputs; numbers default '0').
2. **Add/Edit dialog — "Salary & EPF" section** (bordered, Landmark icon; titled "Salary / Rate & EPF" for External): Basic Salary (number, min 0, step 500), Allowances (number), EPF No (mono text), Salary Note (2-row textarea). Existing monthlyRate input untouched.
3. **Live breakdown panel** under the inputs, recomputed per keystroke via `salaryBreakdown()` from `@/lib/types`: Gross (basic+allowances) → EPF employee −8% of basic → **Net take-home (emerald)** → EPF employer 12% + ETF employer 3% (muted) → **Total institute cost (primary)**; tabular-nums; hint: "EPF 8% employee · 12% + 3% employer (calculated on basic salary — Sri Lanka statutory rates)". New `BreakdownRow` helper.
4. **Submit**: validates basicSalary/allowances ≥ 0; payload sends `basicSalary`, `allowances`, `epfNo`/`salaryNote` (null when blank) — matches POST/PUT /api/teachers contract.
5. **Table rows**: compact salary line under teacher ID — Wallet icon + "Net LKR x/mo" (gross on hover title) + tiny "EPF #<no>" badge when set. Rate-only External teachers fall back to monthlyRate.
6. **ProfileDialog**: emerald "EPF #<no>" badge in header; External keeps "Monthly rate (tuition)" DetailItem; Internal (or anyone with basic/allowances) gets "Net salary (incl. EPF)" (sub: gross = basic + allowances) and "Employer EPF + ETF" (sub: 12% + 3% on basic); salaryNote full-span. `DetailItem` gained optional `sub` prop. Fixed pre-existing TS errors: `classesList` cast to `ClassDetail[]`.
7. **Stats strip**: `lg:grid-cols-5`, new **"Monthly payroll"** StatCard = Σ net take-home of loaded teachers (rate-only externals count monthlyRate), green accent, hint "Net take-home · incl. EPF", spans 2 cols on mobile.

### B) src/components/sections/classes-section.tsx
1. **Form state**: `instituteSharePct: string` default '25' in `EMPTY_FORM`; hydrated from `c.instituteSharePct ?? 25` in `openEdit`; new `parseSharePct()` (blank/NaN → 25, clamp 0–100).
2. **Payloads**: create + update include `instituteSharePct: parseSharePct(...)`.
3. **Add/Edit dialog**: bordered block with "Teacher pays institute (%)" numeric input (0–100) + helper "Share of the class fee that goes to the institute", and a live split panel: Institute gets fee×pct (emerald, Landmark) · Teacher gets fee×(100−pct) (primary, GraduationCap), tabular-nums via `currency()`. DialogContent made scrollable (`max-h-[90vh] overflow-y-auto scroll-thin`).
4. **List view Fee cell**: fee on top + muted "Inst LKR x · Tch LKR y" line (title shows share %), from `c.instituteSharePct ?? 25`.
5. **Stats strip**: `lg:grid-cols-5`, new **"Institute Income"** StatCard = Σ fee×pct/100 over ACTIVE classes, Landmark/green, hint "Active classes · 25% default share".

## Verification
- `bun run lint` → clean.
- `bunx tsc --noEmit` → 0 errors in both section files (other project errors are pre-existing in API routes/examples, untouched per scope).
- Next dev server compiles clean (dev.log ✓).

## Notes for next agents
- TeacherRow salary fields + ClassRow.instituteSharePct are now surfaced in UI exactly per Task 1 contracts; no API changes made.
- CSV export in teachers-section still exports legacy "Monthly Rate" only — candidate for follow-up if salary export is needed.
