# Q6 — Due-Date-Anchored Recurrence with Catch-Up

**Date:** 2026-08-08
**Decision log reference:** `decision-logs/08-AUG-2026/requirement-decisions.md` (Q4, Q6)
**Status:** Approved (pending spec review)
**Supersedes (partially):** the `completedAt + interval` rule documented in the Q4 spec
  `docs/superpowers/specs/2026-08-08-q4-recurring-due-date-carryover-design.md`

## Background

Requirement decision Q6 frames a classic product debate — **Strict Scheduling**
(anchor on the original due date) vs **Floating Scheduling** (anchor on the
completion date). The codebase previously implemented Floating Scheduling: the
next occurrence's due date was `completedAt + interval`, computed by
[`computeNextDueDate`](../../../src/backend/lib/recurrence.ts) and wired into the
completion path of [`todo.service.ts`](../../../src/backend/domain/todos/todo.service.ts).

We are pivoting to **Strict Scheduling with catch-up**:

- The next occurrence's due date is anchored on the **completed task's own due
  date**, not its completion timestamp.
- When that anchor is so far in the past that `dueDate + interval` would still be
  overdue, the system **skips ahead** by whole intervals until the next due date
  lands strictly in the future. This is the "catch-up" logic called out in Q6's
  edge case (a daily task completed five days late should reschedule to tomorrow,
  not to an already-overdue slot).

The Q4 null-carryover rule is **unchanged**: a recurring task with a `NULL`
`due_date` still produces a next occurrence with a `NULL` due date. Catch-up only
applies to tasks that have a due date.

## Scope

Focused change to the recurrence date math and its single caller:

1. Rewrite [`computeNextDueDate`](../../../src/backend/lib/recurrence.ts) to anchor on
   the previous due date and perform the catch-up loop internally.
2. Update the single call site in [`todo.service.ts`](../../../src/backend/domain/todos/todo.service.ts)
   to pass the anchor and completion timestamp.
3. Rewrite [`recurrence.test.ts`](../../../src/backend/lib/recurrence.test.ts) for the
   new signature, including dedicated catch-up cases.
4. Update [`todo.service.test.ts`](../../../src/backend/domain/todos/todo.service.test.ts):
   fix the now-obsolete `completedAt + 1 day` assertion and add a catch-up
   integration test.
5. Reconcile documentation (decision log Q4/Q6) with the new policy.

**Out of scope:**

- The repo layer, DB schema, DTO shape, and API payloads (unchanged).
- Frontend (no new inputs; the date-only due-date field already produces
  midnight-UTC values that interact cleanly with the boundary — see
  [Boundary semantics](#boundary-semantics)).
- The recurring-dependency linking logic (Q2/Q3) and the frequency-mismatch
  limitation (Q6 known limitation).

## The algorithm

### New `computeNextDueDate` contract

File: [`src/backend/lib/recurrence.ts`](../../../src/backend/lib/recurrence.ts)

```ts
export function computeNextDueDate(
  schedule: Schedule,
  customIntervalDays: number | null,
  anchorDueDate: Date,   // the completed task's own due date (the base)
  completedAt: Date,     // completion moment; the result must be strictly after this
): Date | null
```

- `schedule === "none"` → `null` (unchanged).
- Otherwise: advance one interval from `anchorDueDate`, then **keep advancing
  while the result is `<= completedAt`**.

A small private `advanceOne` helper encapsulates the per-schedule single step so
the catch-up loop reads cleanly and the per-schedule switch is not duplicated:

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

function advanceOne(
  schedule: Schedule,
  customIntervalDays: number | null,
  from: Date,
): Date {
  switch (schedule) {
    case "daily":
      return new Date(from.getTime() + DAY_MS);
    case "weekly":
      return new Date(from.getTime() + 7 * DAY_MS);
    case "monthly": {
      const next = new Date(from);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    }
    case "custom": {
      const days =
        customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 1;
      return new Date(from.getTime() + days * DAY_MS);
    }
    default:
      return new Date(from.getTime() + DAY_MS);
  }
}

export function computeNextDueDate(
  schedule,
  customIntervalDays,
  anchorDueDate,
  completedAt,
): Date | null {
  if (schedule === "none") return null;
  let next = advanceOne(schedule, customIntervalDays, anchorDueDate);
  while (next.getTime() <= completedAt.getTime()) {
    next = advanceOne(schedule, customIntervalDays, next);
  }
  return next;
}
```

**Termination:** each `advanceOne` step moves forward by at least one day
(daily/weekly/custom add `>= 1 * DAY_MS`; monthly adds a calendar month, which is
also strictly forward). Because `completedAt` is fixed, the loop always
terminates.

### Boundary semantics

The comparison is exact-timestamp: the next due date must be **strictly greater
than** `completedAt` (`<=` continues the loop, so an instant equal to
`completedAt` also skips ahead).

Because the create form now uses a **date-only** input (`type="date"`), due dates
are stored as midnight UTC (`...T00:00:00.000Z`). Completion always happens later
in the day, so a daily task due `Aug 1 00:00` completed `Aug 6` (daytime) skips
`Aug 2 … Aug 6 00:00` (all `<=` the daytime completion) and lands on
`Aug 7 00:00` — exactly the "skip ahead to tomorrow" behaviour Q6 describes. If a
due date ever carries a non-midnight time, the exact-timestamp rule still yields
the earliest strictly-future occurrence, which remains the correct interpretation.

## Service wiring

File: [`src/backend/domain/todos/todo.service.ts`](../../../src/backend/domain/todos/todo.service.ts)

In the completion block (the branch guarded by
`patch.status === "completed" && todo.status !== "completed"`), replace:

```ts
const nextDue = todo.dueDate
  ? computeNextDueDate(todo.schedule as never, todo.customIntervalDays, now)
  : null;
```

with:

```ts
// Q6: anchor on the completed task's own due date and skip ahead (catch-up)
// until the next slot is strictly after completion. A task with no due date
// still produces a next occurrence with no due date (Q4 null carryover).
const nextDue = todo.dueDate
  ? computeNextDueDate(
      todo.schedule as never,
      todo.customIntervalDays,
      todo.dueDate,
      now,
    )
  : null;
```

`todo.dueDate` is `Date | null` (the repo's `Timestamp` read type resolves to
`Date`); inside the truthy branch TypeScript narrows it to `Date`, satisfying the
new parameter. The resulting `nextDue` (`Date | null`) flows into
`todoRepo.insert` unchanged — the repo already accepts a nullable `dueDate`.

No other part of the completion path (dependency cloning, `nextOccurrenceId`
assignment, event publishing) changes.

## Testing strategy

### Unit — [`recurrence.test.ts`](../../../src/backend/lib/recurrence.test.ts)

Rewrite for the new four-argument signature. All cases use explicit dates (no
real clock), so they are fully deterministic. `completedAt` is chosen during the
daytime so the date-only anchor behaves as described above.

Covered cases:

1. `none` → `null` (any anchor / completion).
2. Daily, on-time (anchor `Aug 10 00:00`, completed `Aug 10 12:00`) →
   `Aug 11 00:00` (single advance, no skip).
3. **Daily, five days overdue → skips to the next future day** (headline
   catch-up: anchor `Aug 1 00:00`, completed `Aug 6 12:00` → `Aug 7 00:00`).
4. Weekly, less than one interval late → single advance, no skip (anchor
   `Aug 1`, completed `Aug 4` → `Aug 8`).
5. Weekly, more than one interval late → skips one week (anchor `Aug 1`,
   completed `Aug 10` → `Aug 15`).
6. Monthly, on-time → `anchor + 1 month`.
7. Monthly, overdue → skips months until future (anchor `Aug 10`, completed
   `Oct 20` → `Nov 10`).
8. Custom N days, overdue catch-up (e.g. `custom=3`, anchor `Aug 1`, completed
   `Aug 8` → `Aug 10`).
9. Custom with a missing/invalid interval → defaults to 1 day.

### Service — [`todo.service.test.ts`](../../../src/backend/domain/todos/todo.service.test.ts)

- **Unchanged:** the null-carryover test ("carries over a null due date to the
  next occurrence (Q4)") still passes — no due date → null next occurrence.
- **Rewritten:** the "shifts the due date by the interval on the next occurrence
  (Q4)" test currently asserts `completedAt + 1 day`. That assertion is obsolete
  under the new anchoring and **will fail**. It is rewritten to use a future
  `dueDate` and assert `dueDate + 1 day` (the not-overdue path, which is
  deterministic and clock-independent).
- **New — catch-up integration test:** create a daily task with a **past**
  `dueDate`, complete it now, and assert the next occurrence's due date is the
  minimal future slot:
  - `new Date(next.dueDate) > completedAt` (strictly future), **and**
  - the prior slot `new Date(next.dueDate) - 1 day <= completedAt` (proves it is
    the *first* future slot, i.e. catch-up worked end-to-end).

  These are invariant properties, so the test is clock-independent.

**Verification command:** `pnpm test` must pass with the rewritten and new cases.

## Documentation reconciliation

- **Decision log** `decision-logs/08-AUG-2026/requirement-decisions.md`:
  - Update Q4 (#4) and Q6 (#6) to state the new policy: the next occurrence's due
    date is `previousDueDate + interval`, advanced by whole intervals until
    strictly after completion (catch-up). Note the null-carryover rule is
    unchanged.
  - Q6's "debate" resolves to **Strict Scheduling + catch-up**.
- **Q4 spec** (`docs/superpowers/specs/2026-08-08-q4-recurring-due-date-carryover-design.md`):
  its null-carryover half remains valid; the `completedAt + interval` half is
  superseded by this spec. Add a one-line pointer to this document.

## Data flow

```
update() → status becomes "completed"
         → if recurring && no prior nextOccurrenceId:
             nextDue = todo.dueDate
               ? computeNextDueDate(schedule, custom, todo.dueDate, now)  // anchored + catch-up
               : null                                                    // Q4 null carryover
             clone = todoRepo.insert({ ..., dueDate: nextDue, status: "not_started" })
             updates.nextOccurrenceId = clone.id
```

No changes to the repo layer, schema, or DTO shape.

## Error handling

No new error paths. The change is a different base date plus a deterministic
advance loop; it introduces no failure modes beyond those already handled by the
completion path. The loop is guaranteed to terminate (see [The algorithm](#the-algorithm)).
