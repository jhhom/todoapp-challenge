# API Documentation & Procedure Technical Reference

This document provides a comprehensive technical walkthrough of each API procedure implemented in [`src/backend/procedures.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/procedures.ts). It links each endpoint to its corresponding project requirement from [`project-requirements.md`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/project-requirements.md) and details the end-to-end layer-by-layer execution flow—from the oRPC procedure handler and authentication middleware down through the domain service, pure logic helpers, and Kysely repository layer.

---

## Architectural Overview

The backend architecture follows a strict multi-tiered domain-driven design pattern:

1. **Procedure Handler Layer ([`src/backend/procedures.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/procedures.ts) & [`src/shared/api.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts))**: 
   Defines contract-first routes using `@orpc/server` and `@orpc/contract`. Validates request inputs and output DTO schemas via `Zod`.
2. **Middleware Layer ([`src/backend/middleware/auth.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/middleware/auth.ts))**: 
   Intercepts requests on protected endpoints, verifies HTTP Bearer JWT tokens via `jose`, and injects authenticated user context (`context.user`).
3. **Domain Service Layer ([`src/backend/domain/`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/))**: 
   Encapsulates core business rules, state transition invariants, recurrence scheduling, and event publishing (`publishTodoChange`).
4. **Pure Logic Helpers ([`src/backend/lib/`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/))**: 
   Decoupled, unit-tested functions handling recurrence calculation (`recurrence.ts`), state-machine transitions (`state-machine.ts`), dependency graph cycle detection (`cycle-detection.ts`), and SSE event distribution (`events.ts`).
5. **Repository Layer ([`src/backend/domain/**/*.repo.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/))**: 
   Type-safe SQL query builder layer powered by `Kysely` interfacing directly with `PostgreSQL`.

---

## Procedure Reference

### 1. `auth.register`

- **Endpoint & Method**: `POST /auth/register`
- **Satisfied Requirements**:
  - **Nice-to-Have Features**: *User authentication and registration*.
  - **Non-Functional Requirements**: *Concurrent Access* — establishes user identity (`app_user` records) to support multiple users operating within a shared team workspace.

#### Layer-by-Layer Execution Flow:
1. **oRPC Contract & Validation**: 
   - Route defined in [`apiContract.auth.register`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts#L117-L129).
   - Validates input payload: `{ email: string (valid email format), password: string (minimum 8 characters) }`.
   - Public procedure (no auth middleware).
2. **Service Layer ([`createAuthService.register`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/auth/auth.service.ts#L8-L18))**:
   - Calls `userRepo.findByEmail(email)` to check if the email is already registered. If found, throws `badRequest("Email already registered")` (HTTP 400).
   - Hashes the plaintext password securely using `bcrypt.hash(password, 10)`.
   - Calls `userRepo.create(email, passwordHash)` to persist the user.
   - Generates a signed JWT access token containing `{ sub: user.id, email: user.email }` using `signToken()` in [`lib/jwt.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/jwt.ts) with a 24-hour expiration.
   - Returns `{ token, user: { id, email } }`.
3. **Repository Layer ([`createUserRepo`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/auth/auth.repo.ts))**:
   - `findByEmail`: `db.selectFrom("appUser").selectAll().where("email", "=", email).executeTakeFirst()`.
   - `create`: `db.insertInto("appUser").values({ email, passwordHash }).returningAll().executeTakeFirstOrThrow()`.

---

### 2. `auth.login`

- **Endpoint & Method**: `POST /auth/login`
- **Satisfied Requirements**:
  - **Nice-to-Have Features**: *User authentication and registration*.

#### Layer-by-Layer Execution Flow:
1. **oRPC Contract & Validation**: 
   - Route defined in [`apiContract.auth.login`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts#L130-L142).
   - Validates input payload: `{ email: string, password: string }`.
2. **Service Layer ([`createAuthService.login`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/auth/auth.service.ts#L19-L29))**:
   - Calls `userRepo.findByEmail(email)`. If no user exists, throws `unauthorized("Invalid credentials")` (HTTP 401).
   - Verifies the password using `bcrypt.compare(password, user.passwordHash)`. Throws `unauthorized` on mismatch.
   - Signs and returns a JWT access token via `signToken()`.
3. **Repository Layer ([`createUserRepo.findByEmail`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/auth/auth.repo.ts#L13-L19))**:
   - Queries `app_user` by email using Kysely.

---

### 3. `todo.list`

- **Endpoint & Method**: `GET /todos`
- **Satisfied Requirements**:
  - **Core Features**: *TODO Management* (Read list of tasks), *Filtering and Sorting* (Filter by status, priority, due date range, dependency status [blocked/unblocked]; sort by due date, priority, status, name).
  - **Non-Functional Requirements**: *Performance at Scale (10,000+ items)* — implemented via server-side SQL pagination (`LIMIT` / `OFFSET`), database indexes (`idx_todo_status`, `idx_todo_priority`, `idx_todo_due_date`, etc.), achieving single-digit to tens-of-milliseconds response times.

#### Layer-by-Layer Execution Flow:
1. **oRPC Contract & Validation**: 
   - Route defined in [`apiContract.todo.list`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts#L145-L153).
   - Validates inputs with defaults: `page` (default 1), `pageSize` (default 50, max 100), optional filters (`status`, `priority`, `dueBefore`, `dueAfter`, `blocked`), and sort controls (`sortBy`, `sortOrder`).
2. **Middleware**:
   - Protected by `requireAuth` ([`src/backend/middleware/auth.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/middleware/auth.ts)). Verifies JWT from header and passes `context.user`.
3. **Service Layer ([`createTodoService.list`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.service.ts#L68-L91))**:
   - Delegates database query and total count calculation to `todoRepo.list(input)`.
   - Transforms each retrieved database row into a rich DTO via `toDto()`.
   - `toDto()` resolves the creator's email (`userRepo.findById`), calculates dynamic dependency status (`todoRepo.isBlocked`), and fetches active dependency IDs (`todoRepo.dependenciesOf`).
   - Computes pagination metadata: `totalPages = Math.ceil(total / pageSize)`.
   - Returns `{ items: DtoItem[], meta: PageMeta }`.
4. **Repository Layer ([`createTodoRepo.list`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.repo.ts#L34-L74))**:
   - Applies soft-deletion filter: `WHERE is_deleted = FALSE`.
   - Dynamic filters: `.where("status", "=")`, `.where("priority", "=")`, `.where("due_date", "<=" / ">=")`.
   - Blocked filtering (`hasUnfinishedDependency`): Uses an SQL `EXISTS` subquery over `todo_dependency` joined with `todo` to check for non-completed, non-deleted prerequisites.
   - Executes count query: `SELECT COUNT(*) FROM todo WHERE is_deleted = FALSE`.
   - Applies sorting and pagination: `.orderBy(sortCol, sortOrder).limit(pageSize).offset((page - 1) * pageSize)`.

---

### 4. `todo.get`

- **Endpoint & Method**: `GET /todos/{id}`
- **Satisfied Requirements**:
  - **Core Features**: *TODO Management* (Read single TODO by Unique ID).

#### Layer-by-Layer Execution Flow:
1. **oRPC Contract & Validation**: 
   - Route defined in [`apiContract.todo.get`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts#L154-L162). Validates `id` as a valid UUID.
2. **Middleware**:
   - Protected by `requireAuth`.
3. **Service Layer ([`createTodoService.get`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.service.ts#L93-L97))**:
   - Calls `todoRepo.findById(id)`.
   - If the task does not exist or has `isDeleted === true`, throws `notFound("Todo not found")` (HTTP 404).
   - Converts the database row into a DTO via `toDto()` and returns it.
4. **Repository Layer ([`createTodoRepo.findById`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.repo.ts#L76-L82))**:
   - Executes `SELECT * FROM todo WHERE id = $1`.

---

### 5. `todo.create`

- **Endpoint & Method**: `POST /todos`
- **Satisfied Requirements**:
  - **Core Features**: *TODO Management* (Create task with Name, Description, Due Date, Status, Priority), *Recurring Tasks* (Accepts recurrence schedule configuration), *Task Dependencies* (Links prerequisite task IDs during creation).
  - **Nice-to-Have Features**: *Real-time updates* (Emits `created` change notification).

#### Layer-by-Layer Execution Flow:
1. **oRPC Contract & Validation**: 
   - Route defined in [`apiContract.todo.create`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts#L163-L171).
   - Validates input attributes (`name`, `description`, `dueDate`, `status`, `priority`, `schedule`, `customIntervalDays`, `monthlyRepeatMode`, `dependencyIds`).
2. **Middleware**:
   - Protected by `requireAuth`. Context provides authenticated `user.sub` as `createdBy`.
3. **Service Layer ([`createTodoService.create`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.service.ts#L99-L122))**:
   - Validates that if `schedule === "custom"`, `customIntervalDays` is provided and positive (> 0); throws `badRequest` otherwise.
   - Persists the new task row via `todoRepo.insert()`.
   - For each ID in `dependencyIds`, calls `dependencyService.add(todo.id, depId)` to validate and store prerequisite links.
   - Publishes real-time event: `publish({ action: "created", todoId: todo.id })`.
   - Returns converted DTO.
4. **Repository Layer ([`createTodoRepo.insert`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.repo.ts#L84-L90))**:
   - Executes `INSERT INTO todo (...) VALUES (...) RETURNING *`.

---

### 6. `todo.update`

- **Endpoint & Method**: `PATCH /todos/{id}`
- **Satisfied Requirements**:
  - **Core Features**: *TODO Management* (Update task fields), *Task Dependencies* (Enforces invariant that a blocked task cannot be moved to "In Progress" or "Completed"), *Recurring Tasks* (Automatically generates the next occurrence on completion with catch-up logic and recurring dependency copying).
  - **Non-Functional Requirements**: *Data Retention* (Preserves completion timestamp history `completedAt`).
  - **Nice-to-Have Features**: *Real-time updates* (Emits `updated` and clone `created` events).

#### Layer-by-Layer Execution Flow:
1. **oRPC Contract & Validation**: 
   - Route defined in [`apiContract.todo.update`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts#L172-L180). Validates partial update fields.
2. **Middleware**:
   - Protected by `requireAuth`.
3. **Service Layer ([`createTodoService.update`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.service.ts#L124-L246))**:
   - **Existence Check**: Fetches existing task via `todoRepo.findById(id)`. Throws 404 if missing or soft-deleted.
   - **State Machine Validation**: If `patch.status` is changing, checks current blocked state via `todoRepo.isBlocked(id)`. Evaluates state machine rules in [`lib/state-machine.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/state-machine.ts) via `canTransition(current, target, isBlocked)`. Rejects invalid transitions or movements of blocked tasks into `in_progress` / `completed`.
   - **Reverse Dependency Protection**: If reversing a completed task (`completed -> in_progress`), checks `todoRepo.hasDependentBeyondNotStarted(id)`. Rejects if dependent tasks have already advanced beyond `not_started`, preventing invalid residual blocked states.
   - **Recurring Task Auto-Generation**:
     - When transition targets `completed` and `schedule !== "none"`:
     - Checks if `nextOccurrenceId` is already set and live (`!isDeleted`). If not, computes next due date using `computeNextDueDate()` in [`lib/recurrence.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/recurrence.ts) (which includes catch-up logic for overdue items).
     - Creates the next task occurrence with `status: "not_started"` via `todoRepo.insert()`.
     - Links `nextOccurrenceId` to the newly cloned task.
     - Copies recurring dependencies of the completed task to the new clone via `dependencyService.add()`.
     - Publishes `created` event for the clone task.
   - **Persistence**: Executes `todoRepo.update(id, updates)`.
   - **Notification**: Publishes `publish({ action: "updated", todoId: id })` and returns updated DTO.
4. **Repository Layer ([`createTodoRepo.update`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.repo.ts#L92-L98))**:
   - Executes `UPDATE todo SET ... , updated_at = NOW() WHERE id = $1 RETURNING *`.

---

### 7. `todo.delete`

- **Endpoint & Method**: `DELETE /todos/{id}`
- **Satisfied Requirements**:
  - **Core Features**: *TODO Management* (Delete task).
  - **Non-Functional Requirements**: *Data Retention* (Implements soft deletion using `is_deleted = TRUE`, ensuring deleted TODOs are never permanently lost).
  - **Nice-to-Have Features**: *Real-time updates* (Emits `deleted` event).

#### Layer-by-Layer Execution Flow:
1. **oRPC Contract & Validation**: 
   - Route defined in [`apiContract.todo.delete`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts#L181-L189). Validates `id` parameter.
2. **Middleware**:
   - Protected by `requireAuth`.
3. **Service Layer ([`createTodoService.softDelete`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.service.ts#L248-L254))**:
   - Checks task existence and `isDeleted` status. Throws 404 if soft-deleted or non-existent.
   - Calls `todoRepo.softDelete(id)`.
   - Publishes event: `publish({ action: "deleted", todoId: id })`.
   - Returns `{ success: true }`.
4. **Repository Layer ([`createTodoRepo.softDelete`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/todos/todo.repo.ts#L101-L107))**:
   - Executes `UPDATE todo SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`.

---

### 8. `todo.addDependency`

- **Endpoint & Method**: `POST /todos/{taskId}/dependencies/{dependsOnId}`
- **Satisfied Requirements**:
  - **Core Features**: *Task Dependencies* (Add prerequisite link between tasks, strictly preventing circular dependencies using DFS graph traversal).
  - **Nice-to-Have Features**: *Real-time updates* (Emits `dependency.added` event).

#### Layer-by-Layer Execution Flow:
1. **oRPC Contract & Validation**: 
   - Route defined in [`apiContract.todo.addDependency`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts#L190-L204). Validates `taskId` and `dependsOnId` UUIDs.
2. **Middleware**:
   - Protected by `requireAuth`.
3. **Service Layer ([`createDependencyService.add`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/dependencies/dependency.service.ts#L11-L34))**:
   - **Cycle Detection**: Loads entire graph adjacency map via `dependencyRepo.adjacency()`. Executes Depth-First Search `wouldCreateCycle(taskId, dependsOnId, adjacency)` in [`lib/cycle-detection.ts`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/cycle-detection.ts). If adding the edge creates a cycle (or self-dependency), throws `badRequest("Circular dependency detected: this would create a loop")` (HTTP 400).
   - **State Machine Invariant Check**: Queries current status of `taskId` via `repo.findStatus(taskId)`. If `taskId` is already `in_progress` or `completed`, checks `dependsOnId` status. Rejects if the proposed prerequisite is not `completed` (preventing tasks from immediately entering an illegal blocked state).
   - **Persistence**: Calls `dependencyRepo.insert(taskId, dependsOnId)`.
   - **Notification**: Publishes `publish({ action: "dependency.added", todoId: taskId, dependsOnId })`.
   - Returns `{ success: true }`.
4. **Repository Layer ([`createDependencyRepo`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/dependencies/dependency.repo.ts))**:
   - `adjacency`: Reads `todo_dependency` table into an in-memory adjacency map `Map<taskId, dependsOnTaskId[]>`.
   - `findStatus`: Queries `SELECT status FROM todo WHERE id = $1 AND is_deleted = FALSE`.
   - `insert`: Executes `INSERT INTO todo_dependency (task_id, depends_on_task_id) VALUES ($1, $2)`.

---

### 9. `todo.removeDependency`

- **Endpoint & Method**: `DELETE /todos/{taskId}/dependencies/{dependsOnId}`
- **Satisfied Requirements**:
  - **Core Features**: *Task Dependencies* (Remove prerequisite link).
  - **Nice-to-Have Features**: *Real-time updates* (Emits `dependency.removed` event).

#### Layer-by-Layer Execution Flow:
1. **oRPC Contract & Validation**: 
   - Route defined in [`apiContract.todo.removeDependency`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts#L205-L217). Validates `taskId` and `dependsOnId` UUIDs.
2. **Middleware**:
   - Protected by `requireAuth`.
3. **Service Layer ([`createDependencyService.remove`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/dependencies/dependency.service.ts#L35-L39))**:
   - Calls `dependencyRepo.remove(taskId, dependsOnId)`.
   - Publishes `publish({ action: "dependency.removed", todoId: taskId, dependsOnId })`.
   - Returns `{ success: true }`.
4. **Repository Layer ([`createDependencyRepo.remove`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/domain/dependencies/dependency.repo.ts#L38-L44))**:
   - Executes `DELETE FROM todo_dependency WHERE task_id = $1 AND depends_on_task_id = $2`.

---

### 10. `todo.changed`

- **Endpoint & Method**: `GET /todos/changed`
- **Satisfied Requirements**:
  - **Nice-to-Have Features**: *Real-time updates across browser tabs or users* (Emits Server-Sent Events [SSE] stream whenever tasks or dependencies are mutated).

#### Layer-by-Layer Execution Flow:
1. **oRPC Contract & Validation**: 
   - Route defined in [`apiContract.todo.changed`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/shared/api.ts#L218-L231).
   - Configured with `eventIterator(TodoChangeEventSchema)`.
2. **Middleware**:
   - Protected by `requireAuth`.
3. **PubSub / Event Layer ([`todoPublisher.subscribe`](file:///Users/joohom/personal/sleekflow-challenge.worktrees/attempt-5/src/backend/lib/events.ts))**:
   - Procedure handler in `procedures.ts` subscribes to `todoPublisher` for channel `"todo:changed"`, forwarding request lifecycle `signal` (AbortSignal) so streams close cleanly when clients disconnect.
   - Whenever any mutation endpoint (`create`, `update`, `delete`, `addDependency`, `removeDependency`) completes, `publishTodoChange()` broadcasts a `TodoChangeEvent` containing `{ action, todoId, dependsOnId }` to all connected clients over SSE.

---

## Summary Mapping Table

| Procedure | Method & Path | Primary Requirement Satisfied | Key Layer Components |
|---|---|---|---|
| `auth.register` | `POST /auth/register` | Authentication & Concurrent Workspace | `authService` → `bcrypt` / `jose` → `userRepo` (`app_user`) |
| `auth.login` | `POST /auth/login` | Authentication | `authService` → `bcrypt` / `jose` → `userRepo` (`app_user`) |
| `todo.list` | `GET /todos` | TODO CRUD, Filtering/Sorting, Scale (10k+) | `requireAuth` → `todoService` → `todoRepo` (`LIMIT/OFFSET`, indexes) |
| `todo.get` | `GET /todos/{id}` | TODO CRUD (Read single) | `requireAuth` → `todoService` → `todoRepo` (`todo`) |
| `todo.create` | `POST /todos` | TODO Creation, Recurrence, Dependencies | `requireAuth` → `todoService` → `dependencyService` → `todoRepo` |
| `todo.update` | `PATCH /todos/{id}` | Update, Dependency Block, Auto-Recurrence | `requireAuth` → `todoService` → `canTransition` / `recurrence` → `todoRepo` |
| `todo.delete` | `DELETE /todos/{id}` | Soft Delete (Data Retention) | `requireAuth` → `todoService` → `todoRepo` (`is_deleted = TRUE`) |
| `todo.addDependency` | `POST /todos/{id}/dependencies/{depId}` | Task Dependencies & Cycle Prevention | `requireAuth` → `dependencyService` → `wouldCreateCycle` (DFS) → `dependencyRepo` |
| `todo.removeDependency` | `DELETE /todos/{id}/dependencies/{depId}` | Task Dependencies | `requireAuth` → `dependencyService` → `dependencyRepo` (`todo_dependency`) |
| `todo.changed` | `GET /todos/changed` | Real-time Updates (SSE Stream) | `requireAuth` → `todoPublisher` (in-memory pub/sub) |
