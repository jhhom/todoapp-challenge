# Decision Log

This document is a compilation of all the decisions made for this project.

Some of the discussions/reasoning behind these decisions are also available under the [decision-logs](/decision-logs/) folder.

## 0. What was built

Based on the project requirements, the following features and capabilities were successfully implemented:

**Core Features**

| Feature | Description |
|---------|-------------|
| **TODO Management** | Full CRUD capabilities with all required fields: Unique ID, Name, Description, Due Date, Status (Not Started, In Progress, Completed, Archived), and Priority. |
| **Recurring Tasks** | Supported schedules for daily, weekly, monthly, and custom day-intervals. The next occurrence is automatically generated when a recurring task is completed. |
| **Task Dependencies** | Users can link prerequisite tasks. The system strictly prevents a dependent task from being moved to "In Progress" or "Completed" until all of its dependencies are "Completed." Circular dependencies are actively blocked by the backend using a Depth-First Search (DFS) algorithm. |
| **Filtering and Sorting** | Included server-side filtering by status, priority, due date, and dependency status (blocked/unblocked), alongside sorting by due date, priority, status, and name. |
| **Web UI** | A functional React-based interface allowing users to manage tasks, manage dependencies, and apply filters/sorts interactively. |

**Non-Functional Requirements**

| Feature | Description |
|---------|-------------|
| **Concurrent Access** | Built to support multiple users working on the same list concurrently via a shared workspace model. |
| **Data Retention** | Implemented soft-deletion (using an `is_deleted` flag) so that deleted TODOs are never permanently lost. |
| **Performance at Scale (10,000+ items)** | Supported large lists without UI degradation by implementing robust database indexing and server-side pagination (maintaining ~6–67ms per page response times). |

**Nice-to-Have Features (Optional)**

| Feature | Description |
|---------|-------------|
| **User Authentication** | Implemented secure JWT-based registration and login, anchoring the shared team workspace model. |
| **DevOps (Docker & CI)** | Partially implemented. Docker for the backend is configured (usage guide in `docs/docker.md`). Continuous Integration (CI) is implemented with two workflows: a manually dispatched workflow that generates a unit test report on GitHub Pages, and an automated unit test workflow for any PR to the `main` branch. Continuous Deployment (CD) was not implemented as the application is not hosted remotely. |
| **Real-time updates** | Any changes to the list of todos or any todo statuses will be reflected automatically in real-time to other users who are viewing the same todo list across browser tabs or users. |
| **Architecture Diagram** | Available in the repository's documentation outlining the full tech stack (React, oRPC, Express, PostgreSQL). |
| **Other Technical Improvements** | Introduced oRPC for end-to-end type safety between frontend and backend, avoiding manual DTOs. Abstracted pure domain logic (recurrence math, dependency graph validation) for high unit-test coverage. |

## 1. How ambiguous or underspecified requirements were interpreted

- **Due Dates are Optional:** The specification did not mandate due dates. I made `due_date` nullable so users can capture tasks before deciding on a deadline.
- **Due Dates in the Past:** Allowed. In real-world scenarios, users often use TODO lists retroactively for tracking or logging tasks they forgot to enter beforehand.
- **Bypassing "In Progress":** Moving a task directly from "Not Started" to "Completed" (bypassing "In Progress") is allowed for unblocked tasks. However, the requirement stated a *blocked* task cannot be moved to "In Progress". I interpreted the intent as enforcing sequential execution, extending this restriction to "Completed" as well (a task that cannot be started logically cannot be finished). Blocked tasks can still be moved directly to "Archived" or soft-deleted.
- **Adding Dependencies to Active Tasks:** The API rejects adding an incomplete dependency to a task that is already "In Progress" or "Completed" to prevent invalid states. However, users can reverse an active task directly back to "Not Started" to fix their workflow.
- **Reversing Completion on Recurring Tasks:** Users can reverse a "Completed" task. The system tracks generation state via a `next_occurrence_id` to ensure that re-completing the task does not spawn a duplicate future occurrence.
- **"Archived" vs. "Deleted":** "Archived" is a non-terminal status (can be reversed), whereas deletion is a soft-delete flag (`is_deleted = true`) to satisfy the "data should not be permanently lost" requirement. Soft-deleting a dependency permanently unblocks its dependent task.
- **Custom Recurrence:** Interpreted as a simple day-interval (e.g., every N days) to keep the scope manageable, rather than implementing complex cron expressions.
- **Recurring Tasks with Non-Recurring Dependencies:** When generating the next occurrence of a recurring task, its one-time (non-recurring) dependencies are not cloned; the new task simply references the original completed dependency to prevent data bloat.
- **Recurring Tasks with Recurring Dependencies:** When generating the next occurrence, the new task will *still depend on the old, already-completed recurring dependency*. While automatically linking to the dependency's future counterpart might seem ideal, it causes severe issues in "Frequency Mismatch" scenarios (e.g., a daily task depending on a yearly task). Because automatically inferring user intent across mismatched schedules requires complex calendar logic, this behavior was explicitly skipped and kept out of scope. Users must manually update the dependency if they wish to block on the next schedule. The detailed reasoning is documented in [08-AUG-2026's requirement-decisions.md](./decision-logs/08-AUG-2026/requirement-decisions.md) (Q2).
- **Strict Scheduling with Catch-up:** For recurring task due dates, the next occurrence's due date is calculated from the *original due date* (`due_date + interval`) and advanced by whole intervals until strictly after the `completed_at` timestamp. This keeps calendar-bound obligations on track while preventing an overdue task from respawning an already-late slot. For tasks without due dates, the next task carries over a `null` due date.

## 2. Key architectural decisions and the trade-offs considered

- **oRPC Contract-First Architecture:** Both backend and frontend derive types from a shared `src/shared/api.ts` contract, providing end-to-end type safety without handwritten DTOs.
- **Layered Backend & Pure Logic Modules:** Handlers delegate to domain services, and queries live in repositories. Complex logic (state-machine, recurrence math, DFS cycle detection) is isolated in pure, database-agnostic modules for high testability.
  - *Trade-off:* Slight overhead in boilerplate, but makes the hardest features fast to test (24 unit tests for pure modules alone).
- **Backend DFS for Circular Dependencies:** Validates and rejects dependency cycles on creation/update.
  - *Trade-off:* The UI does not proactively hide invalid tasks in the dropdown due to the performance cost of client-side graph traversal at scale (10,000+ items).
- **PostgreSQL Schema with Indexing for Scale:** Designed for 10k+ rows with UUID primary keys, partial indexes on `is_deleted = false`, and composite indexes on common query combinations `(status, due_date)`.
- **Computed "Blocked" State:** A task is blocked based on a `NOT EXISTS` subquery of incomplete prerequisites, rather than storing a denormalized flag.
  - *Trade-off:* Slightly more expensive read queries, but guarantees perfect consistency without needing to sync flags across the dependency graph.
- **Authentication and Shared State:** Built a "Shared Team Workspace" model. All authenticated users view and interact with a single global list. 
  - *Trade-off:* No per-user privacy, but natively satisfies the concurrent multi-user requirement efficiently without complex Role-Based Access Control (RBAC) overhead.
- **Last-Write-Wins Concurrency:** Defaulted to overwriting concurrent edits.
  - *Trade-off:* Potential for lost updates between users, but prioritized core logic (recurring tasks, validations) over complex Optimistic Concurrency Control given the timeframe.
- **Server-Side Pagination:** The API returns paginated sets rather than shipping 10,000 rows. Verified at ~6-67ms per page, well under the 300ms target.

## 3. What was NOT built and why

| Feature | Reason |
| --- | --- |
| **Bulk Operations** | The concept of `group` is underspecified and unclear from the requirement. It also adds API and UI complexity for marginal MVP value. |
| **RBAC / Private TODO Lists / Sharing** | The shared-workspace model sidesteps this entirely, saving significant time on permissions architecture. |
| **Optimistic Concurrency Control** | Last-write-wins is an acceptable baseline for this scope; prioritized core business logic instead. |
| **JWT Refresh Tokens** | A single 24h access token keeps the MVP simple; re-login is the documented trade-off. |

## 4. What I would do differently with more time

- **Handle Frequency Mismatches in Dependencies:** Currently, if a Daily task depends on a Yearly task, completing it links tomorrow's task to next year's prerequisite, incorrectly blocking the user. I would implement a schedule-comparison utility to link to the most recently completed instance if the dependent task is more frequent.
- **Optimistic Concurrency Control:** Add a `version` column and return `409 Conflict` on stale writes to prevent silent overwrites in the shared workspace.
- **Cursor-Based Pagination:** Transition from `OFFSET` to cursors for stable deep pagination as the dataset grows significantly beyond 10,000 items.
- **Secure Session Management:** Use short-lived access tokens and refresh tokens stored in HTTP-only cookies with CSRF protection, rather than standard local storage tokens.
- **Per-User Isolation:** Support personal lists and explicit task sharing if the product outgrew the simple team workspace model.
- **Proactive Cycle Prevention in UI:** While the backend correctly validates and rejects circular dependencies (returning a 400 error), the ideal UX would be to proactively hide invalid tasks from the frontend dependency selection dropdown so the user cannot even attempt to create a cycle. This could be achieved by having the backend filter the dropdown options to exclude tasks that would cause a cycle. However, this was deferred for scoping and to optimize for time and performance, as calculating valid dependencies across 10,000+ tasks on every dropdown fetch would add significant backend complexity and overhead.

## 5. Edge cases

**1. Stale `next_occurrence_id` after soft-deleting a generated recurring task**

**Scenario:** When a recurring task is completed, the system automatically generates a "next occurrence" task and records its ID in the parent's `next_occurrence_id` column. This pointer serves two purposes: it surfaces the spawned task in the UI ("Next occurrence created: …"), and it prevents duplicate generation on re-completion (the Q9 no-duplicate rule — `next_occurrence_id` is intentionally *not* cleared when a user reverses a completed task back to `in_progress`).

However, if a user soft-deletes that generated next occurrence task, the `next_occurrence_id` pointer on the parent still references the now-deleted task. The pointer is never cleared on deletion.

**Impact:** If the user subsequently reverses the parent task back to `in_progress` and completes it again, the completion logic checks `next_occurrence_id` to decide whether to generate a new occurrence. Because the pointer still holds a value (the deleted task's ID), the guard evaluates to `false` and **silently skips generation** — no new occurrence is created, breaking the recurrence chain indefinitely.

**Root cause:** The generation guard only checked for the *presence* of `next_occurrence_id`, not the *liveness* of the task it pointed to. A soft-deleted occurrence left a dangling reference that was indistinguishable from a live one.

**Resolution:** The completion logic now verifies that `next_occurrence_id` actually points to a **live** (non-deleted) task before suppressing generation. If the referenced occurrence has been soft-deleted (or no longer exists), the slot is treated as empty and a fresh occurrence is regenerated, with `next_occurrence_id` updated to the new task. This preserves the Q9 no-duplicate guarantee for live occurrences while self-healing the recurrence chain when the generated task is deleted.