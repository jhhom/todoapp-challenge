# Q4 Recurring Due-Date Null Carryover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a recurring task with no due date is completed, its auto-generated next occurrence must inherit a `null` due date rather than a computed one.

**Architecture:** Single service-layer conditional in `todo.service.ts`. The pure arithmetic helper `computeNextDueDate` is untouched; the carryover *policy* ("no due date → next occurrence has no due date") lives next to the other recurrence rules (Q2/Q3/Q9) in the orchestration layer.

**Tech Stack:** TypeScript, oRPC, Kysely (PostgreSQL), Vitest.

## Global Constraints

- Test runner is Vitest, configured in `vite.config.ts`. There is **no `test` npm script** — run tests via `pnpm vitest run`.
- Integration tests use a **separate database** (`postgres://joohom@localhost:5432/sleekflow_test`, hardcoded in `vite.config.ts` `test.env`). That DB must exist and have the schema applied.
- `fileParallelism: false` — tests run serially. Always run the targeted file, not the whole suite, during iteration.
- `computeNextDueDate` in `src/backend/lib/recurrence.ts` is **out of scope** — do not modify it or its test file.

## File Structure

- **Modify:** `src/backend/domain/todos/todo.service.ts` — wrap the `computeNextDueDate` call in a null-guard.
- **Modify (tests):** `src/backend/domain/todos/todo.service.test.ts` — add two cases (null carryover + non-null shift regression guard).

No new files. No schema, repo, DTO, frontend, or API changes.

---

### Task 1: Null-carryover fix with TDD tests

**Files:**
- Modify: `src/backend/domain/todos/todo.service.ts:160-165`
- Test: `src/backend/domain/todos/todo.service.test.ts`

**Interfaces:**
- Consumes: `computeNextDueDate(schedule, customIntervalDays, completedAt)` from `src/backend/lib/recurrence.ts` (unchanged). `todo.dueDate` is a nullable `Date` on `TodoRow`.
- Produces: No new exports. The `update()` completion path now yields a next occurrence whose `dueDate` is `null` when the source task's `dueDate` was `null`.

- [ ] **Step 1: Write the failing test (null carryover)**

Add this test inside the `describe("todoService", ...)` block in `src/backend/domain/todos/todo.service.test.ts`, immediately after the existing `"generates next occurrence on completion of a recurring task"` test (around line 62):

```ts
  it("carries over a null due date to the next occurrence (Q4)", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Daily, no due date",
      createdBy: String(user.id),
      schedule: "daily",
      priority: "medium",
      // No dueDate: the next occurrence must also have a null due date.
    });
    expect(created.dueDate).toBeNull();
    const completed = await svc.update(created.id, { status: "completed" });
    expect(completed.nextOccurrenceId).not.toBeNull();
    const next = await svc.get(completed.nextOccurrenceId!);
    expect(next.dueDate).toBeNull();
  });
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:
```bash
pnpm vitest run src/backend/domain/todos/todo.service.test.ts
```
Expected: FAIL on `"carries over a null due date to the next occurrence (Q4)"` — `next.dueDate` will be a computed ISO string (not `null`), so the final `expect(...).toBeNull()` assertion fails. The other tests in the file should still pass.

- [ ] **Step 3: Implement the null-guard fix**

In `src/backend/domain/todos/todo.service.ts`, replace the unconditional `computeNextDueDate` call inside the completion block (lines 161-165). The current code is:

```ts
          const nextDue = computeNextDueDate(
            todo.schedule as never,
            todo.customIntervalDays,
            now,
          );
```

Replace it with:

```ts
          // Q4: a recurring task with no due date produces a next occurrence
          // with no due date. Only tasks that already had a due date get the
          // completedAt + interval shift.
          const nextDue = todo.dueDate
            ? computeNextDueDate(
                todo.schedule as never,
                todo.customIntervalDays,
                now,
              )
            : null;
```

`nextDue` (`Date | null`) flows into `todoRepo.insert({ ..., dueDate: nextDue })` unchanged — the repo already accepts a nullable `dueDate`.

- [ ] **Step 4: Run the null-carryover test to verify it passes**

Run:
```bash
pnpm vitest run src/backend/domain/todos/todo.service.test.ts
```
Expected: PASS on `"carries over a null due date to the next occurrence (Q4)"`. All other tests in the file still pass.

- [ ] **Step 5: Add the non-null shift regression-guard test**

Add this test directly after the null-carryover test added in Step 1. It confirms the `completedAt + interval` shift still applies when a due date *is* present, guarding against the new conditional accidentally suppressing it:

```ts
  it("shifts the due date by the interval on the next occurrence (Q4)", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Daily, with due date",
      createdBy: String(user.id),
      schedule: "daily",
      priority: "medium",
      dueDate: "2026-08-10T09:00:00Z",
    });
    const completed = await svc.update(created.id, { status: "completed" });
    expect(completed.nextOccurrenceId).not.toBeNull();
    expect(completed.completedAt).not.toBeNull();
    const next = await svc.get(completed.nextOccurrenceId!);
    // Daily shift: completedAt + 1 day.
    const expected = new Date(completed.completedAt!);
    expected.setUTCDate(expected.getUTCDate() + 1);
    expect(next.dueDate).toBe(expected.toISOString());
  });
```

- [ ] **Step 6: Run the full test file to verify everything passes**

Run:
```bash
pnpm vitest run src/backend/domain/todos/todo.service.test.ts
```
Expected: All tests PASS, including the two new cases.

- [ ] **Step 7: Run the entire test suite as a final regression check**

Run:
```bash
pnpm vitest run
```
Expected: All tests across all files PASS. This confirms the change did not affect `recurrence.test.ts`, `dependency.service.test.ts`, or any other suite.

- [ ] **Step 8: Commit**

```bash
git add src/backend/domain/todos/todo.service.ts src/backend/domain/todos/todo.service.test.ts
git commit -m "fix(todo): carry over null due date to recurring next occurrence (Q4)"
```
