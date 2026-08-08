# Decision Log — TODO Workspace App

This document consolidates the architectural and product decisions behind this TODO
application. It is organised around the four areas the brief asks for: how ambiguous
requirements were interpreted, key architectural trade-offs, what was deliberately not
built, and what would change with more time. The full reasoning trail lives under
[`decision-logs/`](decision-logs/07-AUG-2026/requirement-decisions.md) and the design
specs under [`docs/superpowers/specs/`](docs/superpowers/specs/2026-08-07-todo-app-design.md).

---

## 1. How ambiguous / underspecified requirements were interpreted

The brief is intentionally open-ended. The hardest work here was not writing code — it
was pinning down the behaviour of edge cases the spec never mentions, because the core
features (recurring tasks + dependencies) interact in non-obvious ways.

- **Due date is optional.** The spec lists "Due Date" as a property but never says whether
  it is required. I made it nullable so users can capture a task before committing to a
  deadline — matching the mental model of every popular TODO app. This decision then
  cascaded into the recurrence rules below.
- **Recurrence is anchored on the task's own due date, with catch-up (Strict Scheduling).**
  The spec only says the next occurrence is "based on its schedule." There are two
  defensible models: *Floating* (anchor on `completed_at`) and *Strict* (anchor on the due
  date). I initially implemented Floating, then pivoted to **Strict Scheduling with
  catch-up**: the next due date is `previousDueDate + interval`, advanced by whole
  intervals until it lands strictly after `completedAt`. This keeps calendar-bound tasks on
  their fixed cadence (monthly rent stays due on the 1st) while preventing an overdue daily
  task from respawning an already-late slot. See
  [`recurrence.computeNextDueDate()`](src/backend/lib/recurrence.ts:45) and the Q6 spec
  ([`docs/superpowers/specs/2026-08-08-q6-due-date-anchored-recurrence-design.md`](docs/superpowers/specs/2026-08-08-q6-due-date-anchored-recurrence-design.md)).
- **A recurring task with no due date produces a next occurrence with no due date** (null
  carryover, Q4). The new occurrence is still distinct (new UUID, fresh `created_at`, a
  `next_occurrence_id` link), but its `due_date` stays `NULL` rather than synthesising a date.
- **Dependency blocking extends to `completed`, not just `in_progress`.** The spec only
  forbids moving a blocked task to "In Progress." I extended the block to `completed` as
  well: a task that logically cannot be started cannot be finished. A blocked task can still
  be moved directly to `archived` or soft-deleted (those are housekeeping, not progress).
  Enforced by the pure [`canTransition()`](src/backend/lib/state-machine.ts) state machine.
- **`archived` is a status, not a hard delete.** It is not terminal — a task can return to
  `not_started`. Returning to `in_progress`/`completed` still respects the block rule above.
- **Soft-deleted prerequisites permanently unblock their dependents.** If a dependency is
  soft-deleted it can never be completed, so holding the dependent blocked would deadlock it
  forever. The `blocked` computation excludes both `completed` and soft-deleted rows.
- **"Custom" recurrence is a simple day-interval** (e.g. every 3 days), not a cron
  expression. Chosen to keep scope manageable; cron matching is documented as future work.
- **Adding an *incomplete* dependency to an already-`in_progress`/`completed` task is
  rejected (`400`).** Allowing it would instantly create an illegal state. I chose rejection
  over silently auto-demoting the parent, so the user always makes explicit state changes.
  To keep that workflow usable, the state machine was extended to allow direct
  `in_progress → not_started` and `completed → not_started` reversals (demotion to the
  backlog never violates the dependency rule).
- **Circular dependencies are rejected at the API (`400`).** Task dependencies form a DAG;
  a cycle would permanently deadlock tasks. The backend runs a DFS cycle check
  ([`wouldCreateCycle()`](src/backend/lib/cycle-detection.ts)) on every add/update.
- **Reversing a completed task (`completed → in_progress`) does *not* delete the
  auto-generated occurrence.** Users misclick constantly, so status reversal is mandatory —
  but the generated task may already carry user edits/dependencies, and the spec says data
  must not be permanently lost. A `next_occurrence_id` column guards against re-completion
  spawning a duplicate.
- **Recurring-task dependency linking.** When a recurring task spawns its next occurrence,
  only its *recurring* dependencies are carried over; one-time prerequisites stay linked to
  the original. If a recurring dependency already spawned *its* future occurrence, the new
  task links to that future counterpart (via the same `next_occurrence_id`), so "next week's
  breakfast" depends on "next week's groceries" rather than last week's completed ones.
- **Past due dates are allowed** (retrospective logging/auditing is a real use case); the UI
  surfaces overdue dates visually rather than rejecting them.

## 2. Key architectural decisions and trade-offs

- **oRPC contract-first with a single shared contract (`src/shared/api.ts`).** Backend and
  frontend derive their types from one Zod-annotated contract — end-to-end type safety with
  zero hand-written DTOs. Frontend reads/mutations/invalidation go through the typed oRPC +
  TanStack Query utils. Trade-off: the API is RPC-shaped (not classic REST), so it is
  documented in [`docs/api.md`](docs/api.md) rather than as a raw OpenAPI file (OpenAPI
  export is listed under future work).
- **Layered backend (Service + Repository).** Thin oRPC handlers delegate to domain
  services; queries live in Kysely repositories; the genuinely *pure* logic — status state
  machine, recurrence date math, and DFS cycle detection — is isolated in `src/backend/lib/`
  so it is unit-testable without a database. This let the hardest features (recurrence
  catch-up, cycle detection, blocking) be tested exhaustively and quickly.
- **PostgreSQL schema indexed for 10k+ scale.** UUID primary keys; a partial index on
  `is_deleted = false` so soft-deleted rows are excluded by the index itself; B-tree indexes
  on every filter/sort column; composite indexes on the common `(status, due_date)` and
  `(priority, due_date)` combinations so `LIMIT/OFFSET` pagination is index-served.
- **`blocked` is *computed*, not stored.** A task is blocked iff a `NOT EXISTS` subquery
  finds a non-completed, non-deleted prerequisite. This avoids a denormalized flag that must
  be kept in sync as dependencies change — the filter is always correct, by construction.
- **Server-side pagination.** The API returns pages `{ items, meta: { total, totalPages } }`
  rather than shipping all rows. Verified at 10,000 seeded rows: ~6–67 ms per page.
- **Shared-workspace auth with stateless JWT.** Implemented user auth (a nice-to-have) but
  used a "shared team workspace" model: all authenticated users see the same global list.
  This satisfies the concurrent-multi-user requirement without the heavy cost of RBAC,
  ACLs, or task-sharing tables. Trade-off: no per-user privacy — framed as a team board
  (like a shared backlog), not a personal diary.
- **Last-write-wins concurrency.** Deliberately chose *not* to implement optimistic
  concurrency control (versioning/ETags). Prioritising recurring-task correctness and
  dependency validation was the better use of time; the trade-off is documented honestly.
- **Real-time updates via SSE (built after the initial MVP cut).** After the core features
  were solid, I added a `todo.changed` streaming procedure using oRPC's `EventPublisher`.
  Every service mutation publishes a coarse `todo:changed` event; the frontend subscribes and
  invalidates the list (and the open detail when relevant), so multiple tabs/users stay live
  without polling. It is single-process in-memory pub/sub — deliberately simpler than
  DB-level `LISTEN/NOTIFY` or WebSocket transport. See
  [`src/backend/lib/events.ts`](src/backend/lib/events.ts) and the subscription spec.
- **One `next_occurrence_id` column, two responsibilities.** Originally added to prevent
  duplicate occurrences on status reversal (Q9), it is reused to link recurring tasks to
  their future recurring dependencies (Q2/Q3) — one column elegantly solves two problems
  without extra tables.

## 3. What I chose NOT to build (and why)

| Cut | Reason |
| --- | --- |
| Bulk operations (e.g. "complete all") | Adds API + UI complexity for marginal MVP value; single-item mutations already cover the core flow. |
| Docker / CI/CD | Local `pnpm dev` + `pnpm dev:be` is sufficient for the demo; containerization deferred. |
| Optimistic concurrency control (versioning / `409`) | Last-write-wins is acceptable at this scope; time was better spent on recurrence/dependency correctness. |
| Proactive frontend cycle prevention (hiding invalid deps in the picker) | With 10k+ tasks, client-side graph traversal is expensive; backend DFS validation + clear error surfacing is the pragmatic choice. |
| JWT refresh tokens | A single 24h access token keeps the MVP simple; re-login is the documented trade-off. |
| RBAC / private lists / task sharing | The shared-workspace model sidesteps the entire permission rabbit hole. |
| Frequency-mismatch resolution for recurring deps | If a Daily task depends on a Yearly one, today's logic links to the *future* occurrence, over-blocking for a cycle. Inferring intent here needs complex calendar-matching; treated as a known limitation rather than guessed at. |
| Cron-style custom recurrence | Kept as a simple day-interval to bound scope. |
| `Last-Event-ID` resume / exactly-once SSE delivery | YAGNI for a single-process invalidation signal; the stream re-subscribes on transient drops. |

## 4. What I would do differently with more time

- **Refresh tokens** + short-lived access tokens, stored in HTTP-only cookies with CSRF
  protection — the current single long-lived JWT in `localStorage` is convenient but less
  secure.
- **Optimistic concurrency control** (a `version` column + `409 Conflict` on stale writes)
  to prevent silent overwrites between concurrent users.
- **Cursor-based pagination** instead of `OFFSET` for stable deep pagination at very large
  scales (offset degrades as you page deep).
- **Per-user isolation / sharing** if the product moved away from a single shared workspace.
- **Proactive frontend cycle prevention** — restrict the dependency picker via a lightweight
  reachable-set query rather than relying solely on backend rejection.
- **OpenAPI export** from the oRPC contract for machine-consumable docs / Postman collections.
- **Resolve the frequency-mismatch edge case** with a schedule-comparison utility: before
  linking a new task to a future recurring dependency, compare their intervals and, if the
  dependent recurs more frequently, link back to the most recently *completed* instance so
  the user stays unblocked for the current cycle.
- **`Last-Event-ID` resume** for the SSE stream so a reconnect doesn't miss interim changes.

## Architecture diagram

```
┌──────────────────── Browser ────────────────────┐
│ React 19 + TanStack Router ── TanStack Query ── UI │
│        oRPC client (Bearer JWT) → :5170            │
└─────────────────────┬─────────────────────────────┘
                      │ RPC (+ SSE for todo.changed)
┌─────────────────────▼─────────────────────────────┐
│ Express 5 + oRPC handler                           │
│   requireAuth middleware → context { db, user }    │
│   procedures: auth.* | todo.*                      │
│   domain services: todos / dependencies / auth     │
│   pure lib: state-machine / recurrence / DFS       │
│   in-memory pub/sub: todoPublisher (SSE source)    │
└─────────────────────┬─────────────────────────────┘
                      │ Kysely (SQL)
┌─────────────────────▼─────────────────────────────┐
│ PostgreSQL: app_user · todo · todo_dependency      │
│ (+ partial & composite indexes for 10k+ pagination)│
└────────────────────────────────────────────────────┘
```
