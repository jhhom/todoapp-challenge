I'll explore the presentation plan and documentation to understand the todo app and identify edge cases.

Let me explore the decision logs to get full context on the design decisions.

Now let me look at the design decisions and the actual implementation to understand what edge cases may exist in the code.

Let me dig into the actual implementation of the core domain logic to find real edge cases.

Let me read the core domain logic files in parallel.

Let me look at the repos and the recurrence test to understand more edge cases.

Let me verify a few key behaviors against the schema and tests before finalizing.

Let me check the schema definition and the todo service test to confirm the recurring-dependency behavior.

I have a thorough understanding now. Let me do one final verification grep to confirm a key finding about how recurring dependencies are linked on clone.

I've read the plan, decision logs, and traced the actual implementation (state machine, recurrence math, cycle detection, services, repos, and tests). The plan already covers: blocked-status enforcement, cycle prevention, recurrence catch-up, the dangling-pointer self-heal, frequency mismatch, soft-delete retention, LWW, and OFFSET pagination. Here are **additional** edge cases I found, grouped by how much they matter for your demo.

## ⚠️ Tier 1 — Doc-vs-code discrepancies (reconcile before the demo)

These matter most: your decision log describes behavior the code doesn't actually do. An evaluator following the log into the code would catch this.

**1. Recurring-on-recurring dependencies spawn *already unblocked* (the documented fix isn't implemented)**
Your `08-AUG/requirement-decisions.md` Q2 describes a "magic generation step": when cloning a recurring task, if its recurring dependency has a `next_occurrence_id`, link the clone to that **future counterpart**. But the code links to the **original** (already-completed) dependency:

`src/backend/domain/todos/todo.service.ts:200-208`
```js
const depIds = await todoRepo.dependenciesOf(id);
for (const depId of depIds) {
  const dep = await todoRepo.findById(depId);
  if (dep && dep.schedule !== "none") {
    await dependencyService.add(String(clone.id), depId); // ← original, never dep.nextOccurrenceId
  }
}
```
**Consequence:** "Daily Breakfast" depending on "Daily Oatmeal" — after completing both in order, tomorrow's Breakfast depends on *today's already-completed* Oatmeal, so it's born unblocked. This is exactly the flaw Q2 claims to have solved. (No test covers it.) If you demo recurring-dependencies live, the real behavior will contradict your own write-up.

**2. Non-recurring dependencies are *dropped*, not "referenced"**
Q3 says the clone "simply references the original, completed dependency." The same code block above only adds deps where `dep.schedule !== "none"`, so one-time prerequisites are silently dropped from the clone entirely (benign in practice since they're completed, but it contradicts the documented "reference" behavior).

## 🔸 Tier 2 — Reachable inconsistent states

**3. A task can end up "Completed" while also "Blocked"**

The state machine only guards *moves into* `completed`/`in_progress`. Nothing prevents a dependency from being reversed underneath an already-completed task:

- A depends on B. Complete B → complete A. Now reverse B back to `not_started` (`completed → not_started` is allowed, `todo.service.ts`, `state-machine.ts:33`).
- Result: **A is `completed` with `isBlocked = true`** — the UI shows a completed task wearing a "Blocked" badge, and A can't even move to `in_progress` anymore (`canTransition(completed, in_progress, true)` → false). The dependency graph can invalidate a terminal state that was valid when entered.

**4. Editing `dueDate` after reversal doesn't regenerate the next occurrence**
Because `nextOccurrenceId` is preserved across reversal (Q9), re-completing skips generation even if you changed the due date in between (`todo.service.ts:174`). So the rescheduled "next" task keeps its *old* due date. The self-heal only triggers if the spawned task is deleted — a subtle interaction worth a talking point.

## 📐 Tier 3 — Recurrence correctness & performance (good demo material)

**5. Catch-up loop is O(overdue intervals), and past due dates are explicitly allowed**

`recurrence.ts:52-55` advances one interval at a time. A daily task created with `due_date = 2000-01-01` (allowed per your "past due dates" decision) runs ~9,700 iterations on completion. Your own test uses exactly that anchor (`todo.service.test.ts:110`). Not infinite, but a real CPU spike / mild DoS surface — worth mentioning alongside the pagination perf talk.

**6. Monthly recurrence drifts on month-end dates**

`advanceOne` uses `setUTCMonth(+1)` (`recurrence.ts:19-20`). A monthly task due **Jan 31** → Feb 31 overflows to **Mar 3**, skipping February entirely, then drifts to the 3rd of each subsequent month. Classic JS `Date` quirk; tasks anchored to the 29th/30th/31st are affected.

**7. The recurring clone is attributed to the *original creator*, not the completer**

`todo.service.ts:195` sets `createdBy: todo.createdBy`. In a shared workspace, the spawned task's ownership doesn't reflect who actually did the work — a minor semantic gap for the "team workspace" framing.

## 🔀 Tier 4 — Concurrency races (concrete instances of your LWW model)

Your plan discusses LWW abstractly; these are *specific* places it bites:

**8. Concurrent completion of one recurring task produces duplicate occurrences**
Two users complete the same recurring task at once: both read `nextOccurrenceId` as not-live, both insert a clone, last `nextOccurrenceId` write wins — leaving an **orphaned duplicate clone** and breaking the Q9 no-duplicate guarantee. No row lock around the check-then-generate.

**9. Cycle detection has a TOCTOU race**

`dependency.service.ts:12-15` reads the full adjacency, checks the cycle, then inserts — with no transaction/lock. Two concurrent adds (A→B and B→A) each pass individually but form a cycle together.

**10. `adjacency()` includes edges to/from soft-deleted tasks**
`dependency.repo.ts:8-17` selects *all* rows with no `isDeleted` filter, so deleted tasks' "ghost" edges participate in cycle detection — a deleted task could theoretically cause a false cycle rejection.

## Minor
- `customIntervalDays` is validated on create but **not on update** (`todo.service.ts:152-154`) — safe only because `advanceOne` falls back to 1 day for ≤0, so no infinite loop, but an inconsistency.
- Sorting by `dueDate` with `NULL` due dates relies on Postgres NULL ordering (NULLs last in ASC) — predictable but maybe not what users expect.

---

**Recommendation for the presentation:** Tier 1 items 1 & 2 are the ones I'd reconcile first — either update the decision log to match the shipped (simple) behavior, or implement the `next_occurrence_id` redirection. Tier 2 item 3 and Tier 4 item 8 are the strongest "honest reflection" additions to Segment 4, since they're concrete failure modes of decisions you've already made rather than generic hand-waving.

Want me to (a) write these into a new `decision-logs/` entry or an appendix on `decision-log.md`, (b) add a real test that reproduces #1 or #3 so you can show it, or (c) implement the `next_occurrence_id` redirection for recurring deps so the code matches the log?