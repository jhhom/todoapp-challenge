# Decision Log — TODO App

## 1. How ambiguous / underspecified requirements were interpreted

- **Due date is optional.** The spec did not say whether a TODO can exist without a due date. I made `due_date` nullable so users can capture tasks before deciding on a deadline — matching common TODO-app behaviour.
- **Recurrence is calculated from `completed_at`.** The spec said the next occurrence is created "based on its schedule" but did not specify the base date. I used the completion timestamp (`completed_at`) as the base, so a daily task completed today recurs tomorrow. *(Note: an earlier brainstorming draft mentioned `created_at`; that was a drafting error — `completed_at` is authoritative.)*
- **Dependency blocking extends to `completed`.** The spec only explicitly forbids moving a blocked task to `in_progress`. I extended the block to `completed` as well: a task that cannot be started logically cannot be finished. A blocked task can still be moved directly to `archived` or soft-deleted.
- **`archived` is not terminal.** It is a status, not a hard delete, so a task can return to `not_started` (returns to `in_progress`/`completed` still respect the block rule).
- **Soft-deleted prerequisites unblock dependents.** If a dependency is soft-deleted, any task depending on it becomes permanently unblocked (the prerequisite can never be completed, so holding the dependent would deadlock it).
- **"Custom" recurrence is a simple day interval** (e.g. every 3 days), not a cron expression — chosen to keep scope manageable.
- **Recurring dependencies are not cloned to the next occurrence; non-recurring deps are referenced.** When a recurring task generates its next occurrence, only its *recurring* dependencies are copied to the clone; one-time prerequisites remain linked to the original.

## 2. Key architectural decisions and trade-offs

- **oRPC contract-first with a shared contract (`src/shared/api.ts`).** Both backend and frontend derive their types from one Zod-annotated contract, giving end-to-end type safety with no hand-written DTOs. Frontend calls go through the oRPC TanStack Query utils (`orpc`) so reads/mutations/invalidation are fully typed.
- **Layered backend (Service + Repository).** Thin oRPC handlers delegate to domain services; queries live in Kysely repositories; the genuinely pure logic — status state machine, recurrence date math, and DFS cycle detection — is isolated so it is unit-testable without a database. This made the hardest features fast to test (24 unit tests alone for the pure modules).
- **PostgreSQL schema with indexing for 10k+ scale.** UUID primary keys; a partial index path on `is_deleted = false`; B-tree indexes on every filter/sort column; composite indexes on the common `(status, due_date)` and `(priority, due_date)` combinations. `todo.list` performs `LIMIT/OFFSET` over these indexes.
- **"blocked" is computed, not stored.** A task is blocked iff a `NOT EXISTS` subquery finds a non-completed, non-deleted prerequisite. This avoids a denormalized flag that must be kept in sync as dependencies change.
- **Server-side pagination.** The API returns pages (`{ items, meta: { total, totalPages } }`) rather than shipping all rows. Verified at 10,000 rows: ~6–67ms per page, well under the 300ms target.
- **Shared-workspace auth with stateless JWT.** Implemented user auth (a nice-to-have) but used a "shared team workspace" model: all authenticated users see the same global list. This satisfies the concurrent-multi-user requirement without the heavy cost of RBAC or task-sharing. Trade-off: no per-user privacy.
- **Last-write-wins concurrency.** Deliberately chose not to implement optimistic concurrency control (versioning/ETags). It is documented as a trade-off; prioritising recurring-task correctness and dependency validation was the better use of time.

## 3. What I chose NOT to build (and why)

| Cut | Reason |
| --- | --- |
| Real-time updates (SSE/WebSocket) | Nice-to-have; out of MVP scope. TanStack Query refetch-on-focus/invalidation keeps a single tab correct. |
| Bulk operations | Adds API + UI complexity for marginal MVP value. |
| Docker / CI/CD | Local `pnpm dev` + `pnpm dev:be` suffices for the demo. |
| Optimistic concurrency control | Last-write-wins is acceptable for this scope (see above). |
| Frontend proactive cycle prevention (hiding invalid deps in the picker) | With 10k+ tasks, client-side graph traversal is expensive; backend DFS validation + clear error surfacing is the pragmatic choice. |
| JWT refresh tokens | A single 24h access token keeps the MVP simple; re-login is the documented trade-off. |
| RBAC / private lists / task sharing | The shared-workspace model sidesteps this entirely. |

## 4. What I would do differently with more time

- **Refresh tokens** + short-lived access tokens, stored in HTTP-only cookies with CSRF protection.
- **Optimistic concurrency control** (a `version` column + `409` on stale writes) to prevent silent overwrites between concurrent users.
- **Real-time cross-tab/user sync** via SSE so the list updates live without manual refresh.
- **OpenAPI export** from the oRPC contract for machine-consumable API docs / Postman.
- **Proactive frontend cycle prevention** — restrict the dependency picker using a lightweight reachable-set query.
- **Cursor-based pagination** instead of `OFFSET` for stable deep pagination at very large scales.
- **Per-user isolation / sharing** if the product direction moved away from a single shared workspace.

## Architecture diagram

```
┌──────────────────── Browser ────────────────────┐
│ React + TanStack Router ── TanStack Query ── UI │
│        oRPC client (Bearer JWT) → :5170          │
└─────────────────────┬───────────────────────────┘
                      │ RPC
┌─────────────────────▼───────────────────────────┐
│ Express 5 + oRPC handler                         │
│   requireAuth middleware → context { db, user }  │
│   procedures: auth.* | todo.*                    │
│   domain services: todos / dependencies / auth   │
│   pure lib: state-machine / recurrence / DFS     │
└─────────────────────┬───────────────────────────┘
                      │ Kysely (SQL)
┌─────────────────────▼───────────────────────────┐
│ PostgreSQL: app_user · todo · todo_dependency    │
│ (+ indexes for pagination/filtering/sorting)     │
└──────────────────────────────────────────────────┘
```
