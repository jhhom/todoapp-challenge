# Q4 — Recurring Todo Next-Occurrence Due Date (Null Carryover Fix)

**Date:** 2026-08-08
**Decision log reference:** `decision-logs/08-AUG-2026/requirement-decisions.md` (Q4)
**Status:** Approved

> **Note (2026-08-08):** The `completedAt + interval` rule described below is superseded for tasks **with** a due date by `docs/superpowers/specs/2026-08-08-q6-due-date-anchored-recurrence-design.md` (due-date-anchored + catch-up). The null-carryover rule in this doc remains valid.

## Background

Requirement decision Q4 states:

> For a recurring todo with a due date, when its next todo is created, the due
> date does **not** stay the same. The new due date is `completed_at + interval`
> (daily / weekly / monthly / custom day-count). When the source task has **no**
> due date (`NULL`), the next occurrence must carry over that `NULL` value.

The `completed_at + interval` shift is already implemented by
[`computeNextDueDate`](../../../src/backend/lib/recurrence.ts) and wired into the
completion path of [`todo.service.ts`](../../../src/backend/domain/todos/todo.service.ts).

The gap: when a recurring task has a `NULL` `due_date`, the service still calls
`computeNextDueDate`, which produces a *computed* date for the next occurrence.
This contradicts Q4, which requires the next occurrence to inherit `NULL`.

## Scope

Focused fix only:

1. Apply the null-carryover rule at the service layer.
2. Add targeted tests covering both the null-carryover case and a regression
   guard for the non-null shift.

**Out of scope:**

- `computeNextDueDate` itself (its pure-arithmetic contract is unchanged).
- The existing [`recurrence.test.ts`](../../../src/backend/lib/recurrence.test.ts) suite.
- Frontend, API payloads, schema, and all other Q-decisions.

## Approach

**Service-layer null-guard (Approach A).** The carryover policy lives in the
orchestration layer next to the other recurrence decisions (Q2, Q3, Q9), while
`computeNextDueDate` remains a pure date-arithmetic utility.

Rationale for not placing this inside `computeNextDueDate` (Approach B) or a new
wrapper (Approach C):

- `computeNextDueDate`'s name promises "compute a date"; making it conditionally
  return `null` for a *policy* reason (not just `schedule === "none"`) muddies
  its contract.
- A dedicated wrapper (Approach C) is over-engineered for a single conditional
  ternary and violates YAGNI.

## Changes

### Change 1 — Service-layer null-guard

File: [`src/backend/domain/todos/todo.service.ts`](../../../src/backend/domain/todos/todo.service.ts)

In the completion block (the branch guarded by
`patch.status === "completed" && todo.status !== "completed"`), replace the
unconditional call:

```ts
const nextDue = computeNextDueDate(
  todo.schedule as never,
  todo.customIntervalDays,
  now,
);
```

with a null-guard:

```ts
// Q4: a recurring task with no due date produces a next occurrence with no due
// date. Only tasks that already had a due date get the completedAt + interval
// shift.
const nextDue = todo.dueDate
  ? computeNextDueDate(todo.schedule as never, todo.customIntervalDays, now)
  : null;
```

The resulting `nextDue` (`Date | null`) flows into `todoRepo.insert` unchanged —
the repo already accepts a nullable `dueDate`.

### Change 2 — Service test: null carryover

File: [`src/backend/domain/todos/todo.service.test.ts`](../../../src/backend/domain/todos/todo.service.test.ts)

Add a test alongside the existing "generates next occurrence on completion"
case:

- Create a recurring **daily** task with **no** `dueDate`.
- Complete it.
- Assert `nextOccurrenceId` is non-null.
- Fetch the next occurrence via `svc.get(completed.nextOccurrenceId)`.
- Assert `dueDate === null`.

### Change 3 — Service test: non-null shift regression guard

File: [`src/backend/domain/todos/todo.service.test.ts`](../../../src/backend/domain/todos/todo.service.test.ts)

Add a test that confirms the shift still applies when a due date *is* present:

- Create a recurring **daily** task with an explicit `dueDate`.
- Complete it and capture `completedAt`.
- Fetch the next occurrence.
- Assert `next.dueDate` equals `completedAt + 1 day` (the daily interval).

This guards against the new conditional accidentally suppressing the shift for
tasks that do have a due date.

## Data Flow

```
update() → status becomes "completed"
         → if recurring && no prior nextOccurrenceId:
             nextDue = todo.dueDate ? completedAt + interval : null
             clone = todoRepo.insert({ ..., dueDate: nextDue, status: "not_started" })
             updates.nextOccurrenceId = clone.id
```

No changes to the repo layer, schema, or DTO shape. The DTO's `dueDate` is
already nullable via [`toIso`](../../../src/backend/domain/todos/todo.service.ts).

## Error Handling

No new error paths. The fix is a conditional that selects `null` vs. a computed
date; it introduces no failure modes beyond those already handled by the
completion path.

## Testing Strategy

- **Unit (service):** Changes 2 and 3 above run against the in-memory database
  via the existing [`todo.service.test.ts`](../../../src/backend/domain/todos/todo.service.test.ts)
  harness (real repos, no mocks).
- **No new tests for `recurrence.ts`:** its pure arithmetic is unchanged and
  already covered by [`recurrence.test.ts`](../../../src/backend/lib/recurrence.test.ts).
- **Verification command:** `pnpm test` (or the project's configured test runner)
  must pass with the two new cases added.
