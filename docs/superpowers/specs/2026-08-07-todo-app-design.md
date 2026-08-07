# TODO App — Solution Design

**Date:** 2026-08-07
**Status:** Approved (brainstorming complete)
**Author:** Implementation team

This document is the consolidated design for the SleekFlow TODO application. It is
derived from the project requirements ([`sleekflow-project.md`](../../../sleekflow-project.md))
and the decision logs in [`decision-logs/07-AUG-2026/`](../../../decision-logs/07-AUG-2026/),
refined through a brainstorming session that resolved the open questions below.

---

## 1. Resolved Open Questions

These were unresolved in the decision logs and were settled during brainstorming:

| Question | Decision | Source |
|---|---|---|
| Scope of nice-to-haves | **Lean MVP**: core features + auth only. Skip real-time, bulk ops, Docker, CI/CD. | brainstorming |
| 10,000+ items strategy (Q12) | **Server-side pagination + filtering**. DB performs `LIMIT/OFFSET` over indexed columns; API returns pages with total count. | brainstorming |
| Recurrence calculation base | **`completed_at`** (next occurrence calculated from when the task was marked complete). The `created_at` note in `requirement-decisions.md` "Assumptions" is treated as a drafting error — Q2 and `requirement-description.md` are authoritative. | brainstorming |
| Auth mechanism | **JWT access tokens** (stateless). Client stores token in localStorage and sends it as a `Bearer` header — matches the existing oRPC client setup. | brainstorming |

All other decisions follow the existing decision logs (`design-decisions.md`,
`requirement-decisions.md`, and the consolidated `requirement-description.md`):
shared workspace model, soft delete, UUID primary keys, status state machine with
dependency blocking, circular-dependency prevention via DFS, `next_occurrence_id`
duplicate prevention, custom recurrence as a simple day-interval, and "last write wins".

---

## 2. Technology Stack

The stack is fixed by the existing scaffold (an oRPC fullstack template). No changes
to the core choices; a few libraries are added.

**Backend:** Express 5, oRPC (type-safe RPC), Kysely (PostgreSQL query builder),
Zod (validation), Vitest (testing).
**Frontend:** React 19, Vite, TanStack Router, TanStack Query, Tailwind CSS v4, shadcn/ui.
**Database:** PostgreSQL.
**Added libraries:** `bcrypt` (password hashing), `jose` (JWT signing/verification).

---

## 3. Architecture & Project Structure

**Approach:** Layered (Service + Repository). oRPC handlers are thin; business rules
live in domain services; queries live in repositories; genuinely pure logic (cycle
detection, state machine, recurrence math) is isolated so it can be unit-tested
without a database.

```
src/
├─ shared/                      # Type-safe contract shared by FE + BE
│  └─ api.ts                    # oRPC contract: endpoints + Zod schemas
├─ backend/
│  ├─ main.ts                   # Express + oRPC handler + middleware (auth)
│  ├─ router.ts                 # oRPC router composing all procedures
│  ├─ db.ts                     # Kysely instance (env-driven config)
│  ├─ create-tables.sql         # Schema DDL + indexes
│  ├─ context.ts                # oRPC context: { db, user? }
│  ├─ middleware/
│  │  └─ auth.ts                # JWT verify → inject user into context
│  ├─ domain/
│  │  ├─ auth/                  # register, login, issue JWT (service + repo)
│  │  ├─ todos/                 # CRUD + status state machine + pagination
│  │  ├─ dependencies/          # add/remove deps + DFS cycle detection
│  │  └─ recurrence/            # pure: compute next occurrence from completed_at
│  └─ lib/
│     ├─ cycle-detection.ts     # pure DFS over adjacency list
│     ├─ state-machine.ts       # pure status-transition validation
│     └─ errors.ts              # typed app errors → HTTP status mapping
└─ web/
   ├─ routes/                   # TanStack Router file routes
   │  ├─ login.tsx, register.tsx
   │  └─ __root.tsx (auth guard)
   ├─ hooks/                    # TanStack Query hooks per domain
   ├─ components/               # shadcn-based: TodoTable, TodoForm, filters…
   └─ lib/auth.ts               # token storage + oRPC client header wiring
```

**Reconciliations with the existing scaffold (baked into this design):**
- IDs become **UUID** (`gen_random_uuid()`). The placeholder `app_user` table uses
  `SERIAL`; it is migrated to UUID per the decision logs.
- Table named **`app_user`** (not `users`) — `user` is a reserved word in PostgreSQL;
  `app_user` matches the existing convention.
- `db.ts` credentials move to **env vars**. `.env` already contains `DATABASE_URL`.
- The oRPC client URL is fixed from `:3000` → `:5170` to match the running server,
  and the hardcoded `Bearer token` header is replaced with the real stored token.

---

## 4. Database Schema

### 4.1 `app_user` (authentication)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `email` | VARCHAR(255) UNIQUE NOT NULL | login credential |
| `password_hash` | VARCHAR(255) NOT NULL | bcrypt hash |
| `created_at` | TIMESTAMPTZ NOT NULL | default `now()` |

### 4.2 `todo` (core entity)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `name` | VARCHAR(255) NOT NULL | required Name |
| `description` | TEXT | nullable |
| `due_date` | TIMESTAMPTZ | nullable (Q1: optional deadline) |
| `status` | todo_status NOT NULL | enum: `not_started, in_progress, completed, archived` |
| `priority` | todo_priority NOT NULL | enum: `low, medium, high` |
| `schedule` | todo_schedule NOT NULL | enum: `none, daily, weekly, monthly, custom` |
| `custom_interval_days` | INT | only meaningful when `schedule = custom` (Q10) |
| `next_occurrence_id` | UUID | self-FK, nullable (Q9 duplicate prevention) |
| `created_by` | UUID FK→app_user | shared-workspace attribution |
| `created_at` | TIMESTAMPTZ NOT NULL | default `now()` |
| `completed_at` | TIMESTAMPTZ | set when status→completed; **recurrence base date** |
| `updated_at` | TIMESTAMPTZ NOT NULL | last-write-wins tracking |
| `is_deleted` | BOOLEAN NOT NULL | default `false` (soft delete, Q8) |

### 4.3 `todo_dependency` (junction)

| Column | Type | Notes |
|---|---|---|
| `task_id` | UUID FK→todo | the dependent task |
| `depends_on_task_id` | UUID FK→todo | the prerequisite |
| | | composite PK `(task_id, depends_on_task_id)` |

### 4.4 Indexing strategy (powers 10k+ pagination/filtering/sorting)

- **Partial index** `WHERE is_deleted = false` on every list query path — soft-deleted
  rows are excluded without runtime filtering.
- B-tree indexes on each sortable/filterable column: `status`, `priority`,
  `due_date`, `name`.
- Composite indexes `(status, due_date)`, `(priority, due_date)` — cover the common
  "filter by status, sort by due date" combos so `LIMIT/OFFSET` queries are index-served.
- Indexes on `todo_dependency(task_id)` and `todo_dependency(depends_on_task_id)` —
  for the blocked/unblocked computation.

### 4.5 "Blocked" is computed, not stored

A task is **blocked** iff it has a dependency whose prerequisite is neither
`completed` nor soft-deleted (Q6). This is resolved at query time via a
`NOT EXISTS` subquery, so the filter stays correct as dependencies change — there is
no denormalized flag to keep in sync. The partial indexes above keep it efficient.

---

## 5. Backend Domain Logic

Each piece of pure logic is isolated for unit testing.

### 5.1 Status state machine — `lib/state-machine.ts` (pure)

`canTransition(current, target, isBlocked)` enforces Q7 + Q9:
- → `in_progress` or → `completed`: **rejected if blocked**.
- → `archived` or soft-delete: **always allowed**, even when blocked.
- `completed → in_progress`: allowed (status reversal).
- `archived` is **not terminal**: it may be returned to `not_started` (archiving is a
  status, not a hard delete). Returning to `in_progress`/`completed` still respects the
  blocked rule above.
- `isBlocked` is computed by the dependency service (any non-completed, non-deleted prerequisite).

### 5.2 Recurrence — `lib/recurrence.ts` (pure)

`computeNextDueDate(schedule, customIntervalDays, completedAt)`:
- `daily` → `completedAt + 1 day`
- `weekly` → `completedAt + 7 days`
- `monthly` → `completedAt + 1 month`
- `custom` → `completedAt + customIntervalDays days`

### 5.3 Cycle detection — `lib/cycle-detection.ts` (pure DFS)

`wouldCreateCycle(taskId, dependsOnId, adjacency)`: DFS from `dependsOnId`; if it
reaches `taskId`, the proposed edge closes a loop → reject (Q5). Traversal only
visits nodes reachable from the new edge, so it stays fast even with 10k tasks.

### 5.4 Completion orchestration — todo service (the one place these compose)

On a transition **to** `completed`, when `schedule != none` **and**
`next_occurrence_id IS NULL`:
1. Set `completed_at = now`.
2. Compute next due date from `completed_at` (5.2).
3. Clone a new `not_started` todo (copy `name`, `description`, `priority`,
   `schedule`, `custom_interval_days`, `created_by`).
4. **Copy only recurring dependencies** to the clone (Q3 — non-recurring deps are
   *referenced*, not cloned).
5. Set `original.next_occurrence_id = clone.id`.

Reversal (`completed → in_progress`) does **not** delete the clone and **does not**
clear `next_occurrence_id` — so re-completion cannot spawn a duplicate (Q9).

### 5.5 Auth — auth service + `middleware/auth.ts`

- `register`/`login` → bcrypt hash → sign JWT `{ sub, email }` (short expiry).
- Middleware verifies the Bearer token and injects `user` into oRPC context.
- Protected procedures require a valid user; the shared-workspace list is global
  (no per-user scoping).

---

## 6. API Contract (oRPC)

The contract lives in [`src/shared/api.ts`](../../../src/shared/api.ts) and is shared by
both sides — every procedure's Zod input/output gives the frontend a fully typed
client with zero hand-written types. All procedures except auth require the JWT context.

### 6.1 Auth (public)

| Procedure | Input | Output |
|---|---|---|
| `auth.register` | `{ email, password }` | `{ token, user: { id, email } }` |
| `auth.login` | `{ email, password }` | `{ token, user: { id, email } }` |

### 6.2 Todos (protected)

| Procedure | Input | Output |
|---|---|---|
| `todo.list` | pagination + filters (below) | `{ items: Todo[], total, page, pageSize, totalPages }` |
| `todo.get` | `{ id }` | `Todo` (+ its dependencies + blocked flag) |
| `todo.create` | `{ name, description?, dueDate?, status, priority, schedule, customIntervalDays?, dependencyIds? }` | `Todo` |
| `todo.update` | `{ id, ...patch }` | `Todo` — runs state machine; on →completed triggers recurrence |
| `todo.delete` | `{ id }` | `{ success }` — soft delete (`is_deleted = true`) |

**`todo.list` query shape:**
```
{ page, pageSize,
  status?, priority?,
  dueBefore?, dueAfter?,     // due-date range filter
  blocked?,                  // 'blocked' | 'unblocked'
  sortBy?,                   // 'dueDate' | 'priority' | 'status' | 'name'
  sortOrder? }               // 'asc' | 'desc'
```
Server applies `LIMIT/OFFSET`, the partial `is_deleted = false` index, and indexed
filter/sort columns. Always excludes soft-deleted rows.

### 6.3 Dependencies (protected)

| Procedure | Input | Output |
|---|---|---|
| `todo.addDependency` | `{ taskId, dependsOnId }` | `{ success }` — runs DFS cycle check first |
| `todo.removeDependency` | `{ taskId, dependsOnId }` | `{ success }` |

### 6.4 Error contract

Typed app errors (`lib/errors.ts`) map to oRPC error codes:
- `400` — validation failure / circular dependency / blocked transition.
- `401` — missing or invalid token.
- `404` — todo not found.

No `409` since the system uses last-write-wins.

---

## 7. Frontend Design

"Functional and usable is sufficient" per the requirements, so the UI leans on
shadcn primitives rather than custom styling.

**Routes** (TanStack file-routes):
- `/login`, `/register` — public auth pages.
- `__root.tsx` — auth guard: if no token in localStorage, redirect to `/login`;
  otherwise render the app shell (header with user email + logout).
- `/` — the TODO workspace (list + filters + create).

**Data flow** (TanStack Query):
- `hooks/auth.ts` — `useLogin`, `useRegister` (mutations → store token, update client header).
- `hooks/todos.ts` — `useTodoList` (query keyed by filter/sort/page params → auto-refetches
  when filters change), `useCreateTodo`, `useUpdateTodo`, `useDeleteTodo` (mutations →
  invalidate list).
- Filter/sort/pagination state lives in **URL search params**, so the query key is
  derived from the URL and bookmarks/deep-links work.

**Components** (shadcn-based):
- `TodoFilters` — status, priority, due-date range, blocked/unblocked selects + sort
  dropdown. Bound to URL params.
- `TodoTable` — paginated rows (page size 50, server-driven); columns: name, status
  (badge), priority (badge), due date, recurrence icon, blocked indicator. Row click
  → `TodoDetailDrawer`.
- `TodoForm` — create/edit dialog: name, description, due date, status, priority,
  schedule (+ custom interval when selected), dependency multi-select.
- `TodoDetailDrawer` — view/edit a todo, manage dependencies inline, see blocked-by list.
- `Pagination` — prev/next + page numbers, driven by `{ total, totalPages }`.
- `ErrorToast` — surfaces API errors (e.g. "Circular dependency detected",
  "Task is blocked").

**Auth wiring** (`lib/auth.ts`): token stored in localStorage; the oRPC client's
`headers()` reads it and sends `Authorization: Bearer <token>` (fixing the current
hardcoded `Bearer token` and wrong port `:3000`→`:5170`). On `401`, clear token +
redirect to login.

---

## 8. Error Handling & Testing Strategy

### 8.1 Error handling (defense in depth)
- **Input validation:** Zod schemas in the oRPC contract reject malformed payloads
  as `400` before any handler runs — every field has explicit constraints
  (e.g. `customIntervalDays` only valid when `schedule = custom`, `name` non-empty).
- **Business-rule errors:** typed errors from services — `BlockedTransitionError`,
  `CircularDependencyError`, `NotFoundError`, `UnauthorizedError` — mapped to oRPC
  codes in one central interceptor. No scattered `res.status()` calls.
- **Frontend:** TanStack Query exposes error states per query/mutation; `ErrorToast`
  turns `400`s into readable messages.

### 8.2 Testing strategy (Vitest)
- **Unit tests (pure logic, no DB, fast):**
  - `state-machine`: every status transition × blocked/unblocked.
  - `recurrence`: each schedule type + custom interval, base date = `completed_at`.
  - `cycle-detection`: no loop, direct (A↔B), transitive (A→B→C→A).
- **Integration tests (services against a test PostgreSQL instance):**
  - Completion orchestration: generates next occurrence, sets `next_occurrence_id`,
    copies only recurring deps, blocks duplicate on re-completion.
  - Dependencies: add/remove + cycle rejection at the boundary.
  - `todo.list`: pagination correctness, soft-delete exclusion, each filter, each
    sort, blocked/unblocked computation.
- **Auth tests:** hashing/verification, JWT issue + verify, rejected tampered tokens.

### 8.3 Performance verification
A seed script inserts 10,000+ todos so `todo.list` pagination can be demonstrated
staying snappy — turning the scale requirement into something demonstrable for the demo.

---

## 9. Scope Cuts & Non-Goals

| Cut | Requirement source | Why |
|---|---|---|
| Real-time updates (SSE/WebSocket) | Nice-to-have | Lean MVP scope. TanStack Query refetch on focus/invalidation covers single-tab correctness; cross-tab sync is polish, not core. |
| Bulk operations | Nice-to-have | Adds UI + API complexity for marginal MVP value. |
| Docker / CI/CD | Nice-to-have | Local `pnpm dev` + `pnpm dev:be` is sufficient for the demo; containerization deferred. |
| Architecture diagram | Nice-to-have | A simple ASCII diagram is included in the decision log instead. |
| Optimistic concurrency control | Non-functional (Q11) | "Last write wins" per the decision log — sufficient for the timeframe; documented as a trade-off. |
| Frontend cycle prevention (hiding invalid deps) | Q5 trade-off | Backend DFS validation + error surfacing is the pragmatic choice for 10k+ items. |
| JWT refresh tokens | Auth implementation | Single short-lived access token keeps the MVP simple; re-login is the documented trade-off. |
| RBAC / private lists / task sharing | Auth model | Shared workspace model sidesteps the permission rabbit hole. |

**In scope (the demoable core):** TODO CRUD · soft delete · recurring tasks (all
schedules + custom) · task dependencies (cycle prevention + blocking) · filtering &
sorting · server-side pagination · JWT auth (register/login) · shared workspace ·
unit + integration tests · 10k-seed performance check.

---

## 10. Architectural Diagram (ASCII)

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React + TanStack Router ─── TanStack Query hooks ─── shadcn UI │
│                  │ oRPC client (Bearer JWT, :5170)               │
└──────────────────┼──────────────────────────────────────────────┘
                   │ HTTPS / RPC
┌──────────────────▼──────────────────────────────────────────────┐
│ Express 5 + oRPC handler (main.ts)                              │
│   auth middleware ─→ oRPC context { db, user? }                 │
│   router.ts:  auth.*  todo.*                                    │
│        ┌───────────── domain services ─────────────┐            │
│        │  todos        dependencies   recurrence   auth         │
│        │   │               │              │          │          │
│        │   └── lib/state-machine / cycle-detection ┘ (pure)     │
│        └──────────────────────┬────────────────────┘            │
└───────────────────────────────┼─────────────────────────────────┘
                                │ Kysely (SQL)
┌───────────────────────────────▼─────────────────────────────────┐
│ PostgreSQL: app_user · todo · todo_dependency (+ indexes)       │
└─────────────────────────────────────────────────────────────────┘
```
