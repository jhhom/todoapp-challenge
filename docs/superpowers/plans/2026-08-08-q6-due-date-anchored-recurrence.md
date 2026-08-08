# Q6 Due-Date-Anchored Recurrence with Catch-Up — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anchor a recurring task's next-occurrence due date on the completed task's own due date (not its completion timestamp), and skip ahead by whole intervals ("catch-up") until the next slot is strictly in the future.

**Architecture:** The pure helper `computeNextDueDate` in `src/backend/lib/recurrence.ts` gets a new signature `(schedule, customIntervalDays, anchorDueDate, completedAt)` and an internal catch-up loop (`while next <= completedAt: advance`). The single caller in `todo.service.ts` passes the previous due date as the anchor. The Q4 null-carryover policy (`todo.dueDate ? … : null`) stays in the service. No schema, repo, DTO, or frontend changes.

**Tech Stack:** TypeScript, oRPC, Kysely, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-08-q6-due-date-anchored-recurrence-design.md`

## Global Constraints

- Test runner is Vitest, configured in `vite.config.ts`. There is **no `test` npm script** — run tests via `pnpm vitest run <file>`.
- Integration tests use a separate database (hardcoded in `vite.config.ts` `test.env`). That DB must exist and have the schema applied.
- `fileParallelism: false` — tests run serially. Always run the targeted file, not the whole suite, during iteration.
- Vitest does not type-check at run time (it uses esbuild type-stripping). A wrong argument count will often *run* rather than fail to compile, so verify types with `pnpm exec tsc --noEmit -p tsconfig.app.json` where the plan calls for it.
- `todo.dueDate` is `Date | null` on the repo row (the `Timestamp` read type resolves to `Date`); inside a truthy check TypeScript narrows it to `Date`.

## File Structure

- **Modify:** `src/backend/lib/recurrence.ts` — new `computeNextDueDate` signature + private `advanceOne` helper + catch-up loop.
- **Modify (tests):** `src/backend/lib/recurrence.test.ts` — full rewrite for the new signature (11 deterministic cases).
- **Modify:** `src/backend/domain/todos/todo.service.ts` — update the single `computeNextDueDate` call site to pass the anchor + completion.
- **Modify (tests):** `src/backend/domain/todos/todo.service.test.ts` — rewrite the obsolete `completedAt + 1 day` assertion; add a catch-up integration test.
- **Modify:** `decision-logs/08-AUG-2026/requirement-decisions.md` — amend Q4 (#4) and Q6 (#6) with the new policy.
- **Modify:** `docs/superpowers/specs/2026-08-08-q4-recurring-due-date-carryover-design.md` — add a pointer to the Q6 spec.

No new files. No schema, repo, DTO, frontend, or API changes.

---

### Task 1: Rewrite `computeNextDueDate` (anchored + catch-up) and update its call site

This task is one atomic change because changing the function signature breaks its only caller and the service test that asserts the old `completedAt + 1 day` rule. All three must land together to keep the repo green.

**Files:**
- Modify: `src/backend/lib/recurrence.ts`
- Modify: `src/backend/domain/todos/todo.service.ts:164-170`
- Test: `src/backend/lib/recurrence.test.ts`
- Test: `src/backend/domain/todos/todo.service.test.ts:81-99`

**Interfaces:**
- Produces: `computeNextDueDate(schedule: Schedule, customIntervalDays: number | null, anchorDueDate: Date, completedAt: Date): Date | null`. Returns `null` for `"none"`; otherwise the first occurrence `> completedAt` on the recurrence grid starting at `anchorDueDate`.

- [ ] **Step 1: Rewrite the unit tests for the new signature**

Replace the entire contents of `src/backend/lib/recurrence.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { computeNextDueDate } from "./recurrence";

describe("computeNextDueDate", () => {
  it("returns null for none", () => {
    const anchor = new Date("2026-08-01T00:00:00Z");
    const completed = new Date("2026-08-06T12:00:00Z");
    expect(computeNextDueDate("none", null, anchor, completed)).toBeNull();
  });

  it("advances one day for a daily task completed on the due day", () => {
    const anchor = new Date("2026-08-10T00:00:00Z");
    const completed = new Date("2026-08-10T12:00:00Z");
    expect(computeNextDueDate("daily", null, anchor, completed)).toEqual(
      new Date("2026-08-11T00:00:00Z"),
    );
  });

  it("skips ahead for an overdue daily task (catch-up)", () => {
    // Due Aug 1, completed Aug 6 (5 days late) -> next due Aug 7, not Aug 2.
    const anchor = new Date("2026-08-01T00:00:00Z");
    const completed = new Date("2026-08-06T12:00:00Z");
    expect(computeNextDueDate("daily", null, anchor, completed)).toEqual(
      new Date("2026-08-07T00:00:00Z"),
    );
  });

  it("advances one week for a weekly task less than one interval late", () => {
    const anchor = new Date("2026-08-01T00:00:00Z");
    const completed = new Date("2026-08-04T12:00:00Z"); // 3 days late, < 7
    expect(computeNextDueDate("weekly", null, anchor, completed)).toEqual(
      new Date("2026-08-08T00:00:00Z"),
    );
  });

  it("skips a full week for a weekly task more than one interval late", () => {
    const anchor = new Date("2026-08-01T00:00:00Z");
    const completed = new Date("2026-08-10T12:00:00Z"); // > 7 days late
    expect(computeNextDueDate("weekly", null, anchor, completed)).toEqual(
      new Date("2026-08-15T00:00:00Z"),
    );
  });

  it("advances one month for a monthly task completed before the next slot", () => {
    const anchor = new Date("2026-08-10T00:00:00Z");
    const completed = new Date("2026-08-09T12:00:00Z");
    expect(computeNextDueDate("monthly", null, anchor, completed)).toEqual(
      new Date("2026-09-10T00:00:00Z"),
    );
  });

  it("skips months for an overdue monthly task", () => {
    const anchor = new Date("2026-08-10T00:00:00Z");
    const completed = new Date("2026-10-20T12:00:00Z");
    expect(computeNextDueDate("monthly", null, anchor, completed)).toEqual(
      new Date("2026-11-10T00:00:00Z"),
    );
  });

  it("skips by the custom interval for an overdue custom task", () => {
    // custom = 3 days, due Aug 1, completed Aug 8 -> Aug 4, Aug 7, Aug 10.
    const anchor = new Date("2026-08-01T00:00:00Z");
    const completed = new Date("2026-08-08T12:00:00Z");
    expect(computeNextDueDate("custom", 3, anchor, completed)).toEqual(
      new Date("2026-08-10T00:00:00Z"),
    );
  });

  it("defaults a custom task to a 1-day interval when the interval is missing", () => {
    const anchor = new Date("2026-08-10T00:00:00Z");
    const completed = new Date("2026-08-10T12:00:00Z");
    expect(computeNextDueDate("custom", null, anchor, completed)).toEqual(
      new Date("2026-08-11T00:00:00Z"),
    );
  });

  it("skips ahead when the next slot equals the completion instant exactly", () => {
    // Equal instant must also skip (strictly-greater rule).
    const anchor = new Date("2026-08-10T00:00:00Z");
    const completed = new Date("2026-08-11T00:00:00Z"); // == first advanced slot
    expect(computeNextDueDate("daily", null, anchor, completed)).toEqual(
      new Date("2026-08-12T00:00:00Z"),
    );
  });
});
```

- [ ] **Step 2: Run the unit tests to verify they fail**

Run:
```bash
pnpm vitest run src/backend/lib/recurrence.test.ts
```
Expected: FAIL on the catch-up and boundary cases (e.g. "skips ahead for an overdue daily task", "skips a full week", "skips months", "skips by the custom interval", "skips ahead when the next slot equals the completion instant"). The non-overdue advance cases may still pass. (Vitest will not type-check, so the extra argument is silently accepted by the old 3-arg function, which uses the 3rd arg as its base and ignores the 4th — hence no catch-up.)

- [ ] **Step 3: Implement the new `computeNextDueDate`**

Replace the entire contents of `src/backend/lib/recurrence.ts` with:

```ts
export type Schedule = "none" | "daily" | "weekly" | "monthly" | "custom";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Advance a date by exactly one recurrence interval.
 */
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

/**
 * Pure recurrence date math with catch-up.
 *
 * The next occurrence's due date is anchored on the completed task's own
 * `anchorDueDate` (Strict Scheduling, Q6). It advances one interval at a time
 * until it lands strictly after `completedAt`, so an overdue task skips the
 * missed periods and reschedules to the next future slot instead of an
 * already-overdue date.
 *
 * Returns null when the schedule is "none". The null-due-date carryover policy
 * (Q4) is handled by the caller.
 */
export function computeNextDueDate(
  schedule: Schedule,
  customIntervalDays: number | null,
  anchorDueDate: Date,
  completedAt: Date,
): Date | null {
  if (schedule === "none") return null;
  let next = advanceOne(schedule, customIntervalDays, anchorDueDate);
  while (next.getTime() <= completedAt.getTime()) {
    next = advanceOne(schedule, customIntervalDays, next);
  }
  return next;
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run:
```bash
pnpm vitest run src/backend/lib/recurrence.test.ts
```
Expected: PASS (all 11 cases).

- [ ] **Step 5: Update the call site in the service**

In `src/backend/domain/todos/todo.service.ts`, inside the completion block, replace:

```ts
          const nextDue = todo.dueDate
            ? computeNextDueDate(
                todo.schedule as never,
                todo.customIntervalDays,
                now,
              )
            : null;
```

with:

```ts
          // Q6: anchor on the completed task's own due date and skip ahead
          // (catch-up) until the next slot is strictly after completion. A
          // task with no due date still produces a next occurrence with no
          // due date (Q4 null carryover).
          const nextDue = todo.dueDate
            ? computeNextDueDate(
                todo.schedule as never,
                todo.customIntervalDays,
                todo.dueDate,
                now,
              )
            : null;
```

- [ ] **Step 6: Run the service tests to verify the obsolete assertion now fails**

Run:
```bash
pnpm vitest run src/backend/domain/todos/todo.service.test.ts
```
Expected: FAIL on `"shifts the due date by the interval on the next occurrence (Q4)"` — it now returns `dueDate + 1 day` (due-date-anchored), not `completedAt + 1 day`. The null-carryover test and the rest still pass.

- [ ] **Step 7: Rewrite the obsolete service test**

In `src/backend/domain/todos/todo.service.test.ts`, replace the entire `"shifts the due date by the interval on the next occurrence (Q4)"` test (the block from `it("shifts the due date...` through its closing `});`) with:

```ts
  it("anchors the next due date on the previous due date (Q6)", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Daily, future due date",
      createdBy: String(user.id),
      schedule: "daily",
      priority: "medium",
      // A future due date (not overdue) -> next due = dueDate + 1 day,
      // independent of completedAt. 2099 keeps it future-dated (no catch-up)
      // so the assertion is deterministic and clock-independent.
      dueDate: "2099-01-10T00:00:00Z",
    });
    const completed = await svc.update(created.id, { status: "completed" });
    expect(completed.nextOccurrenceId).not.toBeNull();
    const next = await svc.get(completed.nextOccurrenceId!);
    // Due-date-anchored: next due is exactly dueDate + 1 day.
    expect(next.dueDate).toBe("2099-01-11T00:00:00Z");
  });
```

- [ ] **Step 8: Run the service tests to verify they pass**

Run:
```bash
pnpm vitest run src/backend/domain/todos/todo.service.test.ts
```
Expected: PASS (all cases, including the rewritten anchor test and the unchanged null-carryover test).

- [ ] **Step 9: Type-check the whole project**

Run:
```bash
pnpm exec tsc --noEmit -p tsconfig.app.json
```
Expected: no errors. (Confirms the new 4-arg signature is satisfied at the call site and `todo.dueDate` narrows to `Date`.)

- [ ] **Step 10: Commit**

```bash
git add src/backend/lib/recurrence.ts src/backend/lib/recurrence.test.ts \
        src/backend/domain/todos/todo.service.ts \
        src/backend/domain/todos/todo.service.test.ts
git commit -m "feat(recurrence): anchor next due date on previous due date with catch-up (Q6)"
```

---

### Task 2: Add a catch-up service integration test

A regression guard proving catch-up works end-to-end through the service (the unit tests already pin the exact arithmetic). It asserts the defining property of due-date-anchored recurrence: an overdue task's next due date lands strictly in the future **and** on the original daily grid.

**Files:**
- Test: `src/backend/domain/todos/todo.service.test.ts`

**Interfaces:**
- Consumes: the completed task's `dueDate` (ISO string in the DTO) and `completedAt` (ISO string), and the next occurrence's `dueDate` (ISO string).

- [ ] **Step 1: Add the integration test**

In `src/backend/domain/todos/todo.service.test.ts`, immediately after the `"anchors the next due date on the previous due date (Q6)"` test added in Task 1, add:

```ts
  it("catches up an overdue recurring task to the next future slot (Q6)", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Overdue daily",
      createdBy: String(user.id),
      schedule: "daily",
      priority: "medium",
      dueDate: "2000-01-01T00:00:00Z", // far in the past -> triggers catch-up
    });
    const completed = await svc.update(created.id, { status: "completed" });
    const next = await svc.get(completed.nextOccurrenceId!);

    const nextDue = new Date(next.dueDate!);
    const completedAt = new Date(completed.completedAt!);
    const anchor = new Date(created.dueDate as string);
    const dayMs = 24 * 60 * 60 * 1000;

    // Catch-up: the next due date is strictly in the future…
    expect(nextDue.getTime()).toBeGreaterThan(completedAt.getTime());
    // …and it stays on the original daily grid (whole days from the anchor),
    // which is the defining property of due-date-anchored recurrence.
    expect((nextDue.getTime() - anchor.getTime()) % dayMs).toBe(0);
  });
```

- [ ] **Step 2: Run the service tests to verify they pass**

Run:
```bash
pnpm vitest run src/backend/domain/todos/todo.service.test.ts
```
Expected: PASS (including the new catch-up integration test).

- [ ] **Step 3: Commit**

```bash
git add src/backend/domain/todos/todo.service.test.ts
git commit -m "test(recurrence): add catch-up service integration test (Q6)"
```

---

### Task 3: Reconcile documentation

Amend the decision log (preserve the historical reasoning; append dated amendments) and add a pointer from the Q4 spec to the Q6 spec.

**Files:**
- Modify: `decision-logs/08-AUG-2026/requirement-decisions.md`
- Modify: `docs/superpowers/specs/2026-08-08-q4-recurring-due-date-carryover-design.md`

- [ ] **Step 1: Amend decision-log Q4 (#4)**

In `decision-logs/08-AUG-2026/requirement-decisions.md`, find the Q4 section. It currently ends around the paragraph that mentions "Question to consider: How to map out the exact date-math logic…" (the end of section `# 4.`). Immediately after that paragraph, insert:

```markdown
> **Update (2026-08-08, Q6):** The base for the shift is no longer `completed_at`. For a recurring task **with** a due date, the next occurrence's due date is now anchored on the **previous due date** and advanced by whole intervals until strictly after `completed_at` (catch-up), so an overdue task reschedules to the next future slot rather than `completed_at + interval`. The null-carryover rule above is unchanged: a task **without** a due date still produces a next occurrence with a `null` due date. See `docs/superpowers/specs/2026-08-08-q6-due-date-anchored-recurrence-design.md`.
```

- [ ] **Step 2: Amend decision-log Q6 (#6)**

In the same file, find the Q6 section (`# 6.`). It ends with the paragraph that begins "If you feel that basing it on the **original due date** is a stronger product decision…". Immediately after that paragraph, insert:

```markdown
> **Decision (2026-08-08):** We adopted **Strict Scheduling with catch-up**. The next occurrence's due date is computed from the **original due date** (`dueDate + interval`), then advanced by whole intervals until it is strictly after the completion timestamp. This keeps calendar-bound obligations on their fixed cadence (e.g. monthly rent stays due on the 1st) while preventing an overdue daily task from respawning an already-late slot — it skips to the next future slot ("catch-up"). The floating/completion-based behaviour is no longer used. See `docs/superpowers/specs/2026-08-08-q6-due-date-anchored-recurrence-design.md`.
```

- [ ] **Step 3: Add a pointer from the Q4 spec**

In `docs/superpowers/specs/2026-08-08-q4-recurring-due-date-carryover-design.md`, find the `**Status:** Approved` line (near the top). Immediately after that line, insert:

```markdown
> **Note (2026-08-08):** The `completedAt + interval` rule described below is superseded for tasks **with** a due date by `docs/superpowers/specs/2026-08-08-q6-due-date-anchored-recurrence-design.md` (due-date-anchored + catch-up). The null-carryover rule in this doc remains valid.
```

- [ ] **Step 4: Commit**

```bash
git add decision-logs/08-AUG-2026/requirement-decisions.md \
        docs/superpowers/specs/2026-08-08-q4-recurring-due-date-carryover-design.md
git commit -m "docs: reconcile Q4/Q6 decision log for due-date-anchored recurrence"
```
