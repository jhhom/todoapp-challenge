# Requirement Interpretation & Ambiguity Navigation Guide

## Objective & Evaluation Criteria

- **Primary Objective**: Demonstrate seniority and architectural maturity by articulating how ambiguous, underspecified, or conflicting requirements were identified, analyzed, and resolved before execution.
- **Key Evaluation Criteria**:
  - **Ambiguity Identification**: Spotting non-obvious requirement conflicts (e.g., state machine conflicts, soft-delete side effects).
  - **Downstream Reasoning**: Evaluating how specific interpretations impact data integrity, user experience, and long-term maintainability.
  - **Intentionality & Trade-off Analysis**: Clear justification for choosing one architectural interpretation over viable alternatives.

---

## Executive Presentation Framework

When presenting requirement interpretations in an interview setting, structure each topic using the **4-Step Ambiguity Resolution Method**:

1. **The Requirement & Hidden Ambiguity**: What the spec said vs. what was underspecified.
2. **Alternative Interpretations Considered**: Options evaluated and their trade-offs.
3. **Chosen Decision & Technical Implementation**: The exact architectural choice made.
4. **Downstream Impact & Safeguards**: How the choice protects data integrity and user experience.

---

## Topic 1: Task Dependencies vs. Task Status Machine

### 1. The Requirement & Hidden Ambiguity
- **Spec Statement**: *"A dependent task cannot be moved to 'In Progress' until all of its dependencies are 'Completed'."*
- **The Hidden Ambiguity**: What happens if a task is **already** `"in_progress"` or `"completed"`, and a user attempts to attach a **new, uncompleted** prerequisite to it?

### 2. Alternative Interpretations & Trade-Offs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Option A: Silently auto-demote parent task back to "Not Started"            │
│ ❌ Downstream Risk: Jarring UX; background status mutation causes confusion │
├─────────────────────────────────────────────────────────────────────────────┤
│ Option B: Allow the addition and leave parent in "In Progress"              │
│ ❌ Downstream Risk: Corrupts state machine (task is "In Progress" + Blocked)│
├─────────────────────────────────────────────────────────────────────────────┤
│ Option C (CHOSEN): Reject request with HTTP 400 Bad Request                 │
│ ✅ Downstream Benefit: Guarantees strict state machine integrity            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Chosen Decision & Implementation
- **Decision**: The API strictly checks the status of newly added dependencies via [`dependency.service.ts#L22`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/dependencies/dependency.service.ts#L22).
  - Adding a **completed** prerequisite to an active task $\rightarrow$ **Allowed**.
  - Adding an **incomplete** prerequisite to an active task $\rightarrow$ **Rejected (`400 Bad Request`)**.
- **Escape Hatch**: To give users a clean workflow to correct mistakes, the state machine ([`state-machine.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/state-machine.ts#L30)) was explicitly extended to allow direct status reversals (`in_progress → not_started`, `completed → not_started`). Users can demote their task back to `"not_started"` and then attach the incomplete prerequisite.

---

## Topic 2: "Soft Delete" Data Retention vs. Active Dependency Chains

### 1. The Requirement & Hidden Ambiguity
- **Spec Statement**: *"Data should not be permanently lost when a TODO is deleted."*
- **The Hidden Ambiguity**: Soft deletion retains rows with `is_deleted = true`. If Task B depends on Task A, and Task A is soft-deleted, how should Task B's blocked status be evaluated?

### 2. Downstream Reasoning & Trade-Offs
- *If soft-deleted tasks are treated as "incomplete"*: Task B remains **permanently blocked** by a prerequisite that no longer appears anywhere in the UI! The user cannot complete Task B or see what is blocking it.
- *If soft-deleted tasks hard-delete dependency links*: Violates audit history and data retention principles.

### 3. Chosen Decision & Implementation
- **Decision**: Soft-deleting a task removes it from active execution pipelines while retaining database records for auditability.
- **Implementation**: The blocked calculation query ([`todo.repo.ts#L124`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.repo.ts#L124)) and dependency lookup ([`todo.repo.ts#L109`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.repo.ts#L109)) explicitly filter `dep.is_deleted = false`.
- **Outcome**: Soft-deleting Task A **instantly unblocks Task B**, allowing the workflow to proceed without orphaned blocked states.

---

## Topic 3: Due Dates (Optionality, Past Dates, & Recurrence Math)

### 1. The Requirements & Hidden Ambiguities
- **Ambiguity A**: Are due dates mandatory for all TODOs?
  - *Decision*: `due_date` is nullable. Users frequently create task drafts before establishing deadlines.
- **Ambiguity B**: Are due dates in the past permitted?
  - *Decision*: Past due dates are allowed. In real-world usage, users log tasks retroactively for auditing or activity tracking.
- **Ambiguity C**: When a recurring task is completed, how should the next due date be calculated?

### 2. Strict Scheduling vs. Floating Scheduling

| Scheduling Model | Calculation Formula | Product Use-Case | Flaw / Edge Case |
|---|---|---|---|
| **Floating Scheduling** | `completedAt + interval` | Maintenance / Habits (e.g. *"Mow lawn"*) | Monthly rent due Aug 1, paid Aug 6 $\rightarrow$ next due Sept 6 (Incorrect!) |
| **Strict Scheduling (CHOSEN)** | `anchorDueDate + interval` (with catch-up) | Fixed Obligations (e.g. *"Pay Rent"*) | Overdue daily task respawns an already-late slot if catch-up is missing |

### 3. Chosen Decision & Implementation
- **Decision**: Adopted **Strict Scheduling with Catch-Up** ([`recurrence.ts#L87`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/recurrence.ts#L87)).
- **Mechanism**: Calculates `anchorDueDate + interval`, then advances whole intervals until the next due date is **strictly after `completedAt`**.
- **Benefit**: Retains fixed calendar deadlines (e.g., monthly rent stays on the 1st of the month) while skipping overdue intermediate slots for late daily tasks.
- **Null Carryover**: A recurring task without a due date (`dueDate = null`) simply carries over `null` to subsequent occurrences.

---

## Topic 4: Reversing Completion on Recurring Tasks (No-Duplicate Guarantee)

### 1. The Requirement & Hidden Ambiguity
- **Spec Statement**: *"When a recurring TODO is marked as completed, the next occurrence should be created automatically based on its schedule."*
- **The Hidden Ambiguity**: Users can toggle task statuses back and forth. What happens if a user completes recurring Task A, reverts Task A back to `"in_progress"`, and then completes it a second time?

### 2. Downstream Risk
- Without tracking, re-completing Task A would spawn **Task A3**, duplicating the recurrence chain and causing infinite task bloat.

### 3. Chosen Decision & Implementation
- **Decision**: Introduced a `next_occurrence_id` pointer column in the `todo` table.
- **Mechanism**:
  1. Completing Task A generates Task A2 and sets `TaskA.next_occurrence_id = TaskA2.id`.
  2. Reversing Task A back to `"in_progress"` **preserves** `next_occurrence_id` (Q9 no-duplicate rule).
  3. Re-completing Task A verifies if `next_occurrence_id` points to a **live, non-deleted task**. If live, duplicate generation is suppressed.
  4. **Self-Healing Extension**: If Task A2 was soft-deleted, the liveness check detects the deletion, treats the slot as empty, and regenerates a fresh occurrence.

---

## Topic 5: Recurring Dependencies & Frequency Mismatches

### 1. The Requirement & Hidden Ambiguity
- **Scenario**: Task B (recurring) depends on Task A (also recurring). What should Task B2 depend on when Task B is completed?

### 2. The Frequency Mismatch Paradox
- Consider:
  - **Task A (Prerequisite)**: *"Renew License"* (Recurring **Annually**).
  - **Task B (Dependent)**: *"Operate Forklift"* (Recurring **Daily**, depends on Task A).
- **The Naive Rule**: *"Link Task B2 to the future counterpart of Task A (Task A2)"*.
- **The Flaw**: Completing Monday's forklift task would link Tuesday's forklift task to the **2027 License Renewal**, blocking the operator for an entire year!

### 3. Chosen Decision & Scope Demarcation
- **Decision**: In MVP scope, recurring clones copy recurring dependencies as-is. Complex frequency-matching algorithms were explicitly deferred and documented as a known limitation.
- **Presentation Takeaway**: Demonstrates deep domain reasoning by identifying where simple automated rules break down under edge-case schedule combinations.

---

## Topic 6: Scope Demarcation — What Was NOT Built & Why

| Feature | Requirement Status | Reason for Exclusion | Architectural Trade-Off |
|---|---|---|---|
| **Bulk Operations ("Groups")** | Optional / Nice-to-Have | Concept of "groups" was underspecified; marginal MVP value | Focused engineering time on core state machine & cycle detection |
| **RBAC / Task Sharing** | Optional / Nice-to-Have | Shared team workspace satisfies multi-user concurrency | Avoided heavy ACL/permissions tables; single team model |
| **Optimistic Concurrency Control** | Non-Functional | Last-write-wins is sufficient baseline | Accepted last-write-wins to prioritize robust dependency validation |

---

## Summary Matrix for Presenters

| Ambiguity / Conflict | Potential Risk | Resolution | Technical Safeguard |
|---|---|---|---|
| Add dep to `in_progress` task | Corrupts blocked state | Reject with 400 Bad Request | `dependency.service.ts` status check |
| Reversals blocked by dep rule | User stuck in invalid state | Allow direct transition to `not_started` | `canTransition` state machine rule |
| Soft-deleting a prerequisite | Permanent orphan blocked task | Subquery excludes `is_deleted = true` | `todoRepo.isBlocked` SQL subquery |
| Past due dates | Invalid date rejection | Allow past dates for retro logging | Nullable `dueDate` schema |
| Late recurring completion | Respawns overdue task | Strict catch-up to future slot | `computeNextDueDate` while-loop |
| Re-completing recurring task | Duplicate task clone bloat | Store `next_occurrence_id` pointer | Liveness check in `todo.service.ts` |
| Frequency mismatch in deps | Long-term improper task block | Documented trade-off for roadmap | Known limitation in decision log |