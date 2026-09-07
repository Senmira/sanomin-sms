# Task 4-b — Expenses module (full-stack-developer)

## What was built
End-to-end Expenses module: Prisma `Expense` model, `/api/expenses` REST API, and the `expenses-section.tsx` UI (nav: sidebar → Operations → "Expenses", ReceiptText icon).

## Files touched (exactly the allowed list)
- `prisma/schema.prisma` — APPENDED `Expense` model only (no existing models modified). `bun run db:push` OK.
- `src/app/api/expenses/route.ts` — NEW (GET list+summary, POST create).
- `src/app/api/expenses/[id]/route.ts` — NEW (GET, PUT partial-tolerant, DELETE).
- `src/lib/types.ts` — added `'expenses'` to `SectionKey` union (top of file, one line) + APPENDED Expense types/consts at the end.
- `src/components/layout/app-shell.tsx` — ONE NAV entry after 'fees' (`ReceiptText`, Operations group).
- `src/app/page.tsx` — ONE import + ONE case in section switch (direct-import pattern, matching existing style).
- `src/components/sections/expenses-section.tsx` — NEW 'use client' section (~740 lines), follows fees-section/payroll-section conventions exactly.

## API contract
- `GET /api/expenses?month=YYYY-MM&q=&category=&limit=&page=` → `{ data: ExpenseRow[], summary: { total, count, byCategory: [{category,total,count}] (sorted total desc), methodTotals: {Cash,Bank,Card} }, page, totalPages, total }`. Month filter = UTC calendar-month range on `date` (gte 1st, lt 1st of next month). `q` = case-insensitive contains on description/vendor/note. Sort `date desc, createdAt desc`. limit cap 200 (default 100), page default 1. month defaults to current month, validated `YYYY-MM`.
- `POST /api/expenses` body `{ date, category, description, amount, method?, vendor?, note? }` → 201 + row. Validations: date ISO-parseable, category/description non-empty, amount positive finite, method ∈ Cash|Bank|Card (default Cash), vendor/note trimmed or null when blank.
- `PUT /api/expenses/[id]` — partial-tolerant: absent fields preserved, present fields fully validated → updated row.
- `DELETE /api/expenses/[id]` → `{ ok: true, id }`.
- Errors: invalid JSON → 400 `Invalid JSON body`; unknown id → 404 `Expense not found`; invalid field → 400 with message.

## QA performed
- `bun run lint`: clean. `bunx tsc --noEmit`: ZERO errors in my files (fixed one `ExpenseUncheckedCreateInput` narrowing issue; remaining project errors are the documented pre-existing ones in examples/, prisma seeds, skills, attendance/[id], at-risk, reports, lib/api).
- curl API matrix: GET summary/byCategory/methodTotals ✓, month boundaries (2026-08-31 and 2026-10-01 excluded from 2026-09) ✓, q on vendor/note (case-insensitive) ✓, category exact ✓, all POST/PUT validation errors ✓, 404s ✓, DELETE ✓. Test rows cleaned.
- Dev server restart was required after `db:push` (old process had stale Prisma Client → `db.expense` undefined); restarted via `pkill`+`bun run dev`, all green since.
- agent-browser UI QA @1440px & 375px: sidebar entry present; empty state; Add dialog (live validation disables submit until date/category/description/amount>0 valid); created "September electricity bill" (Rent & Utilities, 8,500, Cash) + "Classroom posters" (Teaching Materials, 3,200 → edited to 3,500 + vendor + note, Card); stats update correctly (Total 12K/2 payments, Top category 73%, Average 5.8K, Bank+Card 3.2K vs Cash 8.5K); edit dialog prefills; delete via ConfirmDialog ×2 → empty state "No expenses recorded for Sept 2026 yet."; search filter (ceb → 1 row; zzzz → filter-aware empty; Clear button), category filter, month switch (Aug empty / Sept back), CSV export toast "Exported 1 expenses to CSV"; dark mode toggle verified (badge colors switch to dark variants); mobile 375px: 2-col stat cards, no page horizontal overflow (table scrolls inside card); `agent-browser errors` empty.
- Screenshots: tool-results/exp-01..exp-06 (initial, empty, two-rows, desktop-1440, mobile-375, dark).

## Data left behind
Exactly ONE expense row (intentional): "September electricity bill", Rent & Utilities, LKR 8,500, Cash, vendor CEB, date 2026-09-07. No other test data.

## Risks / notes for next agents
- `q` search relies on SQLite `contains` case-insensitivity (same as payments route).
- Expense categories are a fixed list in `EXPENSE_CATEGORIES` (types.ts) — table badge colors are a deterministic map keyed by category with hash fallback, so adding categories later only needs a palette fallback (auto-handled).
- Worklog appended by parent instruction (Task 4-b template); see worklog.md.
