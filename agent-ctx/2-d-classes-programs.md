# Task 2-d — Classes & Programs Module (agent record)

**Agent:** full-stack-developer (Classes & Programs module)
**Task ID:** 2-d

## What was built

### API routes (4 files)
1. `src/app/api/programs/route.ts` — `GET` (list with optional `?active=true`, includes `_count.enrollments` + `_count.classes`, returns `{ data: ProgramRow[] }`); `POST` create (validates required code+name, enforces unique code, regex-validates hex color, defaults to `#7c3aed`).
2. `src/app/api/programs/[id]/route.ts` — `GET`, `PUT` (partial update, unique-code check excludes self), `DELETE` (blocks deletion with 400 when enrollments or classes still reference the program).
3. `src/app/api/classes/route.ts` — `GET` list with filters `day`, `program` (code), `teacherId`, `active`, `page`, `limit` (default 50, max 200). Returns `{ data: ClassRow[], total }`. Includes `program` + `teacher` relations and `_count.enrollments`. Sorted by day-of-week (Mon..Sun) then start time. `POST` create with FK validation for `programId`/`teacherId` and day-of-week whitelist.
4. `src/app/api/classes/[id]/route.ts` — `GET`, `PUT` (supports connect/disconnect for program & teacher relations), `DELETE` (blocks deletion with 400 when enrollments exist; cascade is implicit via schema onDelete: Cascade on Enrollment.class).

### Section components (2 files, both overwrote stubs)
1. `src/components/sections/programs-section.tsx` — `'use client'`. Header with "Add Program" action; 4-up stats strip (Total / Active / Total Enrollments / Monthly Revenue Potential = Σ enrollments × monthlyFee). Responsive 1/2/3-col card grid with colored top accent bar, code badge, colored icon tile, monthly fee, enrollment/class counts, inline active Switch, dropdown (Edit / Activate|Deactivate / Delete), and a "Manage" button. Add/Edit dialog with code (uppercase, disabled on edit), name, description textarea, 8-preset color swatches + native color input, monthly fee, active switch. ConfirmDialog for delete (warns when enrollments exist). Loading skeletons + EmptyState + error retry.
2. `src/components/sections/classes-section.tsx` — `'use client'`. Header with "Add Class" action; 4-up stats strip (Total / Active / External-Teacher / Total Enrolled). Filter bar Card with Day / Program / Teacher / Status selects + Clear button. Tabs view toggle:
   - **Timetable view**: weekly grid — 64px time column + 7 day columns, hour rows 08:00..18:00. Class cards placed in the cell matching their `dayOfWeek` + start hour, colored by program color (8% tint bg + 55% border + 3px left accent), showing name, time, teacher (with `Ext` badge if External), room, enrolled count. Horizontal scroll on mobile (`min-w-[900px] scroll-thin`).
   - **List view**: shadcn Table with sticky header inside a `max-h-[60vh] scroll-thin overflow-y-auto` Card. Columns: Class (+notes), Program (colored badge), Teacher (name + Int/Ext badge), Day, Time, Room, Capacity (enrolled/cap with Progress bar), Fee (LKR, tabular-nums), Status badge, Actions dropdown. Sorted by day-of-week then start time.
   Add/Edit dialog: name, program (Select with color dot), teacher (Select with Int/Ext badge), dayOfWeek, startTime/endTime (native time inputs), room, capacity, fee, notes textarea, active switch. ConfirmDialog for delete (warns when enrollments exist). Programs and teachers lists cached on mount for fast selects.

## Lint / compile status
- `bun run lint` → 0 errors, 0 warnings.
- Dev server compiles cleanly (`✓ Compiled in 675ms`).
- Smoke-tested endpoints:
  - `GET /api/programs` → 200 (5 seeded programs with counts)
  - `GET /api/programs?active=true` → 200
  - `GET /api/classes` → 200 (with program + teacher relations + `_count.enrollments`)
  - `GET /api/classes?day=Wed&active=true` → 200 (filters work)

## Patterns followed
- `'use client'` at top of both sections.
- `let alive = true` pattern in every `useEffect` (no setState on unmounted).
- Stats computed via `useMemo` (no mutation during render).
- Serializer pattern matching `ProgramRow` / `ClassRow` from `src/lib/types.ts`.
- ISO string conversion only where Dates exist (Program has no Dates in row shape; Class has none either — startTime/endTime are plain `String?`).
- shadcn tokens for chrome; program-specific color values (from DB `color` column) used only as inline-style accents on program tiles / timetable cards / list badges. No raw indigo/blue Tailwind utilities.
- shadcn/ui components used: Card, Button, Input, Label, Textarea, Badge, Switch, Skeleton, Dialog, DropdownMenu, Select, Table, Tabs, Progress.

## Files touched (and only these)
- `src/app/api/programs/route.ts` (new)
- `src/app/api/programs/[id]/route.ts` (new)
- `src/app/api/classes/route.ts` (new)
- `src/app/api/classes/[id]/route.ts` (new)
- `src/components/sections/programs-section.tsx` (overwrote stub)
- `src/components/sections/classes-section.tsx` (overwrote stub)
