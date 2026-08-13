# Live Demo & Walkthrough Guide

## Objective & Evaluation Criteria

- **Primary Objective**: Demonstrate complete ownership of the TODO application, highlighting not only core feature functionality but also system reliability, architectural trade-offs, and boundary condition handling.
- **Key Evaluation Criteria**:
  - **Logical Presentation**: A structured, story-driven walkthrough from authentication to scale performance.
  - **Edge Case Awareness**: Proactive demonstration of complex boundary conditions, error handling, and state machine invariants (beyond simple "happy paths").
  - **Self-Correction & Transparency**: Articulation of intentional design choices, trade-offs, and known limitations.

---

## Pre-Flight Checklist & Setup

Before starting the live demo presentation:

```bash
# 1. Ensure PostgreSQL is running locally with the schema initialized
psql "$DATABASE_URL" -f src/backend/create-tables.sql

# 2. Start the Express 5 backend server (runs on http://localhost:5170)
pnpm dev:be

# 3. Start the Vite React web UI (runs on http://localhost:5173)
pnpm dev

# 4. Open two browser tabs side-by-side to http://localhost:5173 (for SSE real-time demo)
```

---

## Presentation Agenda & Timeline (15 Minutes)

```
├── 1. High-Level Architecture & Tech Stack      (2 mins)
├── 2. Core Functional Walkthrough ("Happy Path") (5 mins)
├── 3. Proactive Edge Case & Boundary Demo        (5 mins)
└── 4. Self-Correction, Limitations & Q&A         (3 mins)
```

---

## Phase 1: High-Level Architecture & Tech Stack (2 mins)

### Presenter Script:
> *"Welcome! Today I'm presenting a collaborative TODO list application built with end-to-end type safety, robust domain invariants, and server-side pagination engineered for 10,000+ items."*

### Key Highlights to Mention:
- **Backend Stack**: Express 5 with [oRPC](https://orpc.unnoq.io) (contract-first RPC with `Zod` validation shared with the frontend), `Kysely` (type-safe SQL query builder for PostgreSQL), and `jose` + `bcrypt` for JWT authentication.
- **Frontend Stack**: React 19, Vite, TanStack Router, TanStack Query, and Tailwind CSS v4.
- **Shared Team Workspace Model**: All authenticated users share a global task workspace, enabling seamless team collaboration out of the box without complex permissions boilerplate.
- **Layered Architecture**: Handlers delegate to domain services (`todo.service.ts`, `dependency.service.ts`, `auth.service.ts`), which rely on decoupled pure logic modules (`recurrence.ts`, `state-machine.ts`, `cycle-detection.ts`) for high unit test coverage.

---

## Phase 2: Core Functional Walkthrough ("Happy Path") (5 mins)

Follow this step-by-step presentation narrative:

### Step 1: User Authentication & Workspace Entry
- **Action**: Register a new user account (or log in).
- **Showcase**:
  - JWT token issued and stored securely.
  - User badge displayed in top-right navigation.
  - Backing endpoints: `POST /auth/register` / `POST /auth/login`.

### Step 2: TODO CRUD & Filtering/Sorting
- **Action**: Create a new task *"Prepare Q3 Presentation"* with high priority, a due date, and a description. Edit its details, change priority, and soft-delete a draft task.
- **Action**: Apply UI filters (by Status, Priority, Due Date Range) and sort by Due Date / Priority.
- **Showcase**:
  - Nullable due dates (tasks can be created without deadlines).
  - Server-side filtering and multi-column sorting via indexed PostgreSQL queries (`GET /todos`).

### Step 3: Task Dependencies & Sequential Execution
- **Action**: Create Task A (*"Draft Design Specification"*) and Task B (*"Implement Frontend Component"*). Add Task A as a dependency to Task B.
- **Showcase**:
  - Task B gains a **Blocked** status badge in the UI.
  - Attempt to move Task B to *"In Progress"* $\rightarrow$ **Blocked by backend rule**: The UI/API strictly prevents a dependent task from starting until all prerequisites are `"completed"`.
  - Mark Task A as `"completed"` $\rightarrow$ Task B's blocked badge automatically clears, and Task B can now transition to *"In Progress"*.
  - Backing endpoints: `POST /todos/{taskId}/dependencies/{dependsOnId}`, `PATCH /todos/{id}`.

### Step 4: Recurring Tasks & Catch-Up Scheduling
- **Action**: Create a recurring task *"Weekly Team Standup"* (Schedule: Weekly, Due Date: Past date). Mark it `"completed"`.
- **Showcase**:
  - System automatically calculates the next occurrence due date using **Strict Scheduling with Catch-up** logic (`computeNextDueDate`).
  - Next occurrence task is generated with `status: "not_started"`.
  - A pointer (`next_occurrence_id`) links the parent to the new occurrence.
  - Supports Daily, Weekly, Monthly (with explicit month-end handling), and Custom day-interval schedules.

### Step 5: Real-Time Multi-Tab Updates (SSE)
- **Action**: Arrange two browser windows side-by-side (logged into the workspace).
- **Action**: Create, update, or complete a task in Window A.
- **Showcase**:
  - Window B updates **instantly in real-time** without any manual page refresh or polling.
  - Backing mechanics: `GET /todos/changed` SSE stream backed by in-process `todoPublisher` event bus.

### Step 6: Performance at Scale (10,000+ Items)
- **Action**: Run seeding script in terminal: `pnpm tsx --tsconfig tsconfig.app.json src/backend/seed.ts`.
- **Showcase**:
  - UI seamlessly navigates through 10,000+ tasks with pagination controls.
  - Response times remain single-digit-to-tens-of-milliseconds (~6–67ms per page) thanks to database indexes (`idx_todo_status`, `idx_todo_priority`, `idx_todo_due_date`, `idx_todo_not_deleted`).

---

## Phase 3: Proactive Edge Case & Boundary Demonstration (5 mins)

> *This section demonstrates deep system ownership by walking the evaluators through intentional edge-case guards and boundary protection rules.*

### Edge Case 1: Circular Dependency Prevention (DFS Algorithm)
- **Scenario**: User attempts to create a circular dependency loop (e.g., Task A $\rightarrow$ Task B $\rightarrow$ Task C $\rightarrow$ Task A).
- **Live Demo Action**: Add Task A as a dependency of Task B. Then attempt to add Task B as a dependency of Task A.
- **System Behavior**:
  - Backend executes a Depth-First Search (DFS) graph traversal (`wouldCreateCycle` in [`cycle-detection.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/cycle-detection.ts)).
  - Request is rejected with HTTP `400 Bad Request`: *"Circular dependency detected: this would create a loop"*.
  - Prevents infinite recursion and broken dependency states.

### Edge Case 2: Attaching Incomplete Prerequisites to Active Tasks
- **Scenario**: A user moves Task X to *"In Progress"*, then later tries to add an uncompleted Task Y as a prerequisite of Task X.
- **Live Demo Action**: Move Task X to *"In Progress"*. Open its dependency modal and attempt to select an incomplete task.
- **System Behavior**:
  - Service layer checks state machine invariants: An active task (`in_progress` or `completed`) cannot acquire an incomplete dependency because doing so would instantly push it into an illegal state.
  - Rejected with HTTP `400 Bad Request`: *"Cannot add a dependency that is not completed to a task that is already 'in_progress'"*.

### Edge Case 3: Residual Blocked State Prevention on Completion Reversal
- **Scenario**: Task A (prerequisite) is completed. Task B (dependent) moves to *"In Progress"*. The user then attempts to reverse Task A back to *"In Progress"*.
- **Live Demo Action**: Complete Task A $\rightarrow$ Start Task B $\rightarrow$ Attempt to uncomplete Task A.
- **System Behavior**:
  - Reversing Task A would re-evaluate Task B's blocked flag to `true`, leaving Task B in an illegal state (simultaneously *"In Progress"* and *"Blocked"*).
  - Cross-task guard (`hasDependentBeyondNotStarted` in [`todo.repo.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.repo.ts#L145)) blocks the action: *"Cannot change this task's status: it is a completed dependency of tasks that have already started. Move those dependent tasks back to 'Not Started' first."*

### Edge Case 4: Preventing Duplicate Occurrences on Completion Reversal
- **Scenario**: Marking a recurring task completed generates Task A2 (`next_occurrence_id`). The user reverses Task A back to *"In Progress"*, then marks it completed again.
- **Live Demo Action**: Complete recurring Task A $\rightarrow$ Revert Task A to *"In Progress"* $\rightarrow$ Re-complete Task A.
- **System Behavior**:
  - `next_occurrence_id` is preserved during reversal (Q9 no-duplicate rule).
  - Re-completing Task A recognizes the existing live occurrence and **does not spawn a duplicate Task A3**.

### Edge Case 5: Stale Pointer Self-Healing on Soft-Deleted Recurring Clones
- **Scenario**: Recurring Task A is completed, spawning Task A2. The user soft-deletes Task A2. Then the user reverses Task A and completes it again.
- **Live Demo Action**: Complete Task A $\rightarrow$ Soft-delete generated Task A2 $\rightarrow$ Revert Task A $\rightarrow$ Re-complete Task A.
- **System Behavior**:
  - Completion logic checks whether `next_occurrence_id` points to a **live** (non-deleted) task (`todo.service.ts#L191`).
  - Detecting that Task A2 was deleted, the system self-heals: it treats the slot as empty and generates a fresh next occurrence.

### Edge Case 6: Month-End Recurrence Preservation & Short-Month Clamping
- **Scenario**: A monthly task is created on a month-end anchor date like Jan 31 or Jan 30.
- **Live Demo Action**: Complete a monthly task anchored on Jan 31.
- **System Behavior**:
  - Standard JS Date arithmetic (`setUTCMonth(+1)`) on Jan 31 overflows to March 3rd!
  - [`recurrence.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/recurrence.ts#L46) detects month-end intent via `monthlyRepeatMode` (`end_of_month` / `day_of_month`).
  - Advances Jan 31 $\rightarrow$ Feb 28 (clamped) $\rightarrow$ recovers back to March 31, April 30, May 31, preserving the intended month-end schedule without date drift.

### Edge Case 7: Unblocking Dependent Tasks on Prerequisite Soft-Deletion
- **Scenario**: Task B is blocked by Task A (prerequisite). A user soft-deletes Task A instead of completing it.
- **Live Demo Action**: Create Task A $\rightarrow$ Link Task B to Task A (Task B shows Blocked badge) $\rightarrow$ Soft-delete Task A.
- **System Behavior**:
  - `todoRepo.isBlocked` subquery explicitly filters out soft-deleted prerequisites (`dep.is_deleted = false`).
  - Soft-deleting Task A instantly unblocks Task B, preventing orphan tasks from remaining permanently blocked.

### Edge Case 8: Archiving & Soft-Deleting Blocked Tasks (Bypassing State Machine Block)
- **Scenario**: Task B is blocked by an uncompleted prerequisite, but the user wants to cancel, archive, or discard Task B.
- **Live Demo Action**: Attempt to move blocked Task B to *"In Progress"* (blocked) $\rightarrow$ Attempt to move blocked Task B to *"Archived"* or soft-delete it.
- **System Behavior**:
  - State machine restriction (`BLOCKED_TARGETS`) strictly blocks entering `"in_progress"` or `"completed"`.
  - Moving a blocked task to `"archived"` or soft-deleting it is explicitly allowed so users can cancel blocked work without being trapped.

### Edge Case 9: Non-Recurring Dependency Referencing (Preventing Data Bloat)
- **Scenario**: Task B (recurring daily) depends on Task A (one-time task, `schedule: 'none'`). Task B is completed.
- **Live Demo Action**: Complete recurring Task B.
- **System Behavior**:
  - When spawning Task B2 (the next occurrence), the system inspects dependency properties.
  - Recurring prerequisites are cloned/linked, but one-time non-recurring dependencies are referenced as-is—preventing infinite duplication of single-instance tasks.

### Edge Case 10: Direct Status Reversal to "Not Started" for Workflow Correction
- **Scenario**: A user accidentally starts or completes a task before linking a prerequisite.
- **Live Demo Action**: Move Task A to *"In Progress"* $\rightarrow$ Move Task A directly back to *"Not Started"*.
- **System Behavior**:
  - State machine allows direct transitions from `"in_progress"` or `"completed"` back to `"not_started"` without needing to detour through `"archived"`.
  - Enables users to reset an active task back to `"not_started"` so they can link new incomplete prerequisites without triggering state invariant errors.

### Edge Case 11: Null Due-Date Carryover on Recurring Tasks
- **Scenario**: A recurring task is created without a due date (`dueDate: null`).
- **Live Demo Action**: Complete a recurring task that has no due date.
- **System Behavior**:
  - `computeNextDueDate` handles `null` due dates gracefully, returning `null`.
  - The completion handler carries over the `null` due date to the generated clone, ensuring recurring tasks without deadlines function smoothly without runtime crashes.

### Edge Case 12: Overdue Catch-Up Scheduling for Recurring Tasks
- **Scenario**: A daily recurring task due on Aug 1 was forgotten and completed on Aug 6 (5 days late).
- **Live Demo Action**: Complete an overdue daily task.
- **System Behavior**:
  - Strict catch-up logic advances intervals iteratively until the next due date is strictly after `completedAt`.
  - Generates the next occurrence for Aug 7 (the next valid future slot) rather than Aug 2 (which would immediately respawn as already overdue).

### Edge Case 13: Direct Self-Dependency Rejection
- **Scenario**: A user attempts to add Task A as a prerequisite of itself (Task A $\rightarrow$ Task A).
- **Live Demo Action**: Open Task A's dependency modal and select Task A.
- **System Behavior**:
  - Backend validation ([`cycle-detection.ts#L16`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/cycle-detection.ts#L16)) immediately checks `taskId === dependsOnId` and returns `true` (cycle detected).
  - PostgreSQL table definition incorporates a DB check constraint (`CHECK (task_id <> depends_on_task_id)`).
  - Rejection returns `400 Bad Request`.

### Edge Case 14: Custom Recurrence Schedule Validation
- **Scenario**: A user creates/updates a task with `schedule: 'custom'`, but omits `customIntervalDays` or enters 0 / negative days.
- **Live Demo Action**: Create a task with Custom schedule and no interval value.
- **System Behavior**:
  - Backend validation ([`todo.service.ts#L101`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.service.ts#L101)) checks `schedule === 'custom' && (!customIntervalDays || customIntervalDays <= 0)`.
  - Rejects creation with HTTP `400 Bad Request`: *"customIntervalDays is required when schedule is 'custom'"*.

### Edge Case 15: SSE Stream Connection Leak Prevention on Disconnect
- **Scenario**: Multiple users open browser tabs subscribing to real-time change streams (`GET /todos/changed`), then close their tabs.
- **Live Demo Action**: Open multiple tabs, then close them.
- **System Behavior**:
  - The `todo.changed` procedure passes the request's HTTP lifecycle `signal` (`AbortSignal`) directly to [`todoPublisher.subscribe('todo:changed', { signal })`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/events.ts#L45).
  - When the browser disconnects, the abort signal fires and immediately unbinds the listener, preventing server-side memory leaks.

### Edge Case 16: Exact-Instant Recurrence Boundary Handling
- **Scenario**: A task's completion timestamp (`completedAt`) matches its next scheduled due date *to the exact millisecond*.
- **Live Demo Action**: Complete a task exactly when its due date arrives.
- **System Behavior**:
  - Recurrence calculator uses strict inequality (`next.getTime() <= completedAt.getTime()`).
  - Forces the schedule to advance to the subsequent future period rather than staying stuck on the current instant.

### Edge Case 17: Filtering Soft-Deleted Dependencies from DTO Responses
- **Scenario**: Task B depends on Task A. Task A is soft-deleted. User views Task B's detail drawer.
- **Live Demo Action**: Open Task B's detail drawer after soft-deleting Task A.
- **System Behavior**:
  - [`todoRepo.dependenciesOf`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.repo.ts#L109) inner-joins `todo as dep` and filters `dep.is_deleted = false`.
  - The soft-deleted task is hidden from Task B's `dependencies` list and will not be copied if Task B is a recurring task.

---

## Phase 4: Self-Correction, Limitations & Architectural Trade-offs (3 mins)

### 1. Intentional Scope Boundaries & Trade-Off Rationale

- **Shared Team Workspace vs. Role-Based Access Control (RBAC)**:
  - *Decision*: Implemented a single shared workspace model where all authenticated users manage a unified task list.
  - *Rationale*: Satisfied the concurrent multi-user access requirement while avoiding heavy permissions architecture (roles, orgs, ACLs) that would distract from core TODO logic.
- **Last-Write-Wins Concurrency vs. Optimistic Concurrency Control (OCC)**:
  - *Decision*: Defaulted to overwriting concurrent edits (last-write-wins).
  - *Rationale*: Prioritized robust state machine and dependency validation. OCC was deferred for MVP scope.
- **Simple Day-Interval Custom Recurrence vs. Cron Expressions**:
  - *Decision*: Constrained custom recurrence to day intervals (`customIntervalDays`, e.g., every 3 days).
  - *Rationale*: Avoided complex cron syntax parsers (e.g., "2nd Tuesday of month") which add significant UI/backend complexity for marginal MVP gain.
- **Single 24-Hour Access Token vs. Refresh Token Flow**:
  - *Decision*: Used a single signed JWT stored in local storage.
  - *Rationale*: Streamlined auth integration; avoided refresh token storage boilerplate.
- **Bulk Operations ("Groups")**:
  - *Decision*: Intentionally skipped.
  - *Rationale*: The concept of task "groups" was underspecified in requirements and added UI complexity without clear core value.

---

### 2. System Architecture Trade-offs

- **Computed "Blocked" State vs. Denormalized Database Flags**:
  - *Current Approach*: Blocked status is dynamically computed on-the-fly via an SQL `EXISTS` subquery (`hasUnfinishedDependency`) during reads.
  - *Trade-Off*: Eliminates any risk of state desynchronization across deep dependency chains, but requires extra SQL execution per read.
- **In-Memory Single-Process SSE Pub/Sub vs. Distributed Redis Bus**:
  - *Current Approach*: Real-time updates use `@orpc/server` `EventPublisher`, an in-memory Node.js event bus.
  - *Trade-Off*: Requires zero external infrastructure (no Redis dependency) and runs blazingly fast in a single server process, but does not fan-out across multiple load-balanced backend instances.
- **Soft Deletion (`is_deleted = true`) vs. Physical Hard Deletes**:
  - *Current Approach*: Deleting a task flags `is_deleted = true` without deleting the database row.
  - *Trade-Off*: Guarantees data is never lost (satisfying non-functional specs), but requires all queries and partial indexes to explicitly filter `WHERE is_deleted = false`.

---

### 3. Future Engineering Roadmap & Self-Corrections

- **Recurring Dependency Frequency Mismatches**:
  - *Limitation*: When a daily recurring task is completed, its next occurrence still points to its original prerequisite. If the prerequisite is on a monthly schedule, the daily task remains blocked until next month.
  - *Roadmap Solution*: Build a schedule comparator to auto-link daily tasks to the most recently completed instance of less-frequent prerequisites.
- **Proactive Frontend Cycle Filtering**:
  - *Limitation*: Cycle detection is currently enforced on the backend (returns 400). The UI dropdown shows all tasks.
  - *Roadmap Solution*: Pre-filter dependency selection dropdowns on the frontend by executing client-side graph traversal or a dedicated graph preview endpoint.
- **Keyset / Cursor-Based Pagination**:
  - *Limitation*: SQL `LIMIT/OFFSET` pagination (currently ~6–67ms for 10k items). As the table grows to millions of rows, deep offsets (`OFFSET 50000`) become slower.
  - *Roadmap Solution*: Upgrade to cursor-based keyset pagination (`WHERE id > cursor LIMIT 50`) for $O(1)$ lookup regardless of page depth.
- **Optimistic Concurrency Control (OCC)**:
  - *Limitation*: Last-write-wins allows silent overwrites if two users edit the same task simultaneously.
  - *Roadmap Solution*: Add a `version` column to the `todo` table. `PATCH /todos/{id}` checks `WHERE version = $version` and returns `409 Conflict` on stale writes.
- **Horizontally Scalable SSE (Redis Pub/Sub / DB LISTEN-NOTIFY)**:
  - *Limitation*: Single-process in-memory event bus.
  - *Roadmap Solution*: Replace in-memory `EventPublisher` with Redis Pub/Sub or PostgreSQL `LISTEN/NOTIFY` to broadcast change notifications across multiple backend cluster nodes.
- **Production Session Security (HTTP-Only Cookie Refresh Tokens)**:
  - *Limitation*: JWT stored in browser `localStorage`.
  - *Roadmap Solution*: Transition to short-lived access tokens (15 mins) and HTTP-only, `SameSite=Strict`, `Secure` refresh cookies to protect against XSS token theft.

---

## Quick Reference Summary Table for Presenters

| Topic / Feature | Primary Endpoint | Key Technical Mechanism | Edge Case / Guard |
|---|---|---|---|
| **Auth & Workspace** | `POST /auth/register` | JWT `jose` + `bcrypt` (24h token) | Unique email enforcement |
| **Filtered Task List** | `GET /todos` | Kysely SQL pagination & indexes | `is_deleted = false` partial filter |
| **Dependency Block** | `POST /todos/{id}/dependencies/{depId}` | SQL `EXISTS` subquery on prerequisites | Rejects blocked task startup |
| **Cycle Detection** | `POST /todos/{id}/dependencies/{depId}` | In-memory DFS (`wouldCreateCycle`) | Returns 400 on circular loops |
| **Self-Dependency** | `POST /todos/{id}/dependencies/{depId}` | DB CHECK constraint + DFS check | Prevents task depending on itself |
| **Active Task Dep Invariant** | `POST /todos/{id}/dependencies/{depId}` | State check (`dependency.service.ts`) | Rejects incomplete dep on active task |
| **Reverse Dep Guard** | `PATCH /todos/{id}` | `hasDependentBeyondNotStarted` query | Blocks reversing completed prerequisite with active dependents |
| **Auto-Recurrence** | `PATCH /todos/{id}` | Strict catch-up (`computeNextDueDate`) | Preserves `next_occurrence_id` (no dupes) |
| **Month-End Recurrence** | `PATCH /todos/{id}` | `monthlyRepeatMode` handling | Prevents Feb 28 $\rightarrow$ Mar 3 drift |
| **Stale Pointer Healing** | `PATCH /todos/{id}` | Liveness check on `next_occurrence_id` | Regenerates clone if prev clone deleted |
| **Soft-Delete Dep Unblock** | `DELETE /todos/{id}` | Subquery excludes `is_deleted = true` | Unblocks dependent tasks on dep soft-deletion |
| **Archive Blocked Tasks** | `PATCH /todos/{id}` | State machine `BLOCKED_TARGETS` check | Allows archiving/deleting blocked tasks |
| **Custom Interval Validation** | `POST /todos` / `PATCH /todos/{id}` | Input guard (`customIntervalDays > 0`) | Requires positive interval for custom schedule |
| **Soft Delete** | `DELETE /todos/{id}` | `is_deleted = true` column flag | Data retained for recovery |
| **Real-time SSE** | `GET /todos/changed` | `EventPublisher` + `AbortSignal` | Stream listener unbinds on client disconnect |


