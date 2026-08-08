# API Documentation

The backend exposes a type-safe RPC API via [oRPC](https://orpc.unnoq.io).

- **Base URL:** `http://localhost:5170/rpc`
- **Content type:** The oRPC RPC client serializes inputs using its Standard RPC
  JSON serializer. The frontend consumes this through the typed `orpc` TanStack
  Query client. (Direct `curl` with a bare JSON body is **not** supported — use the
  oRPC client.)
- **Auth:** All `todo.*` procedures require an `Authorization: Bearer <jwt>` header.
  `auth.*` procedures are public.

## Error codes

| Code | Meaning |
| --- | --- |
| `BAD_REQUEST` (400) | Input validation failed / circular dependency / invalid (blocked) status transition |
| `UNAUTHORIZED` (401) | Missing or invalid JWT (on protected procedures) |
| `NOT_FOUND` (404) | Referenced todo not found (or soft-deleted) |

## `auth.register` (public)

Create an account and receive a JWT.

- **Input:** `{ email: string, password: string (min 8 chars) }`
- **Output:** `{ token: string, user: { id: UUID, email: string } }`
- **Errors:** `400` if the email is already registered.

## `auth.login` (public)

- **Input:** `{ email: string, password: string }`
- **Output:** `{ token: string, user: { id: UUID, email: string } }`
- **Errors:** `401` for invalid credentials.

## `todo.list` (protected)

Server-side paginated, filtered, sorted list. Always excludes soft-deleted todos.

- **Input:**
  ```
  {
    page: number (default 1),
    pageSize: number (default 50, max 100),
    status?: "not_started" | "in_progress" | "completed" | "archived",
    priority?: "low" | "medium" | "high",
    dueBefore?: ISO datetime,
    dueAfter?: ISO datetime,
    blocked?: "blocked" | "unblocked",
    sortBy?: "dueDate" | "priority" | "status" | "name",
    sortOrder: "asc" | "desc" (default "asc")
  }
  ```
- **Output:**
  ```
  { items: Todo[], meta: { total, page, pageSize, totalPages } }
  ```
- **"blocked" semantics:** a task is blocked iff it has a dependency whose
  prerequisite is neither `completed` nor soft-deleted.

## `todo.get` (protected)

- **Input:** `{ id: UUID }`
- **Output:** `Todo` (includes computed `isBlocked` and its `dependencies` ids).
- **Errors:** `404` if not found.

## `todo.create` (protected)

- **Input:**
  ```
  {
    name: string,
    description?: string,
    dueDate?: ISO datetime,
    status?: Status (default "not_started"),
    priority?: Priority (default "medium"),
    schedule?: Schedule (default "none"),
    customIntervalDays?: positive int (required when schedule = "custom"),
    dependencyIds?: UUID[]
  }
  ```
- **Output:** `Todo`
- **Errors:** `400` if `schedule = "custom"` without a positive `customIntervalDays`,
  or if a supplied dependency would create a cycle.

## `todo.update` (protected)

Updates a todo. Status changes are validated against the state machine
(blocked tasks cannot move to `in_progress`/`completed`; `archived`/soft-delete
are always allowed). Transitioning a recurring task **to `completed`**
auto-generates the next occurrence (from `completedAt`) and sets
`nextOccurrenceId`. Reversing to `in_progress` does **not** delete the generated
occurrence and does **not** clear `nextOccurrenceId`, so re-completion cannot
spawn a duplicate.

- **Input:** `{ id: UUID, ...optional patch fields }`
- **Output:** `Todo`
- **Errors:** `400` on an invalid/blocked transition; `404` if not found.

## `todo.delete` (protected)

Soft-deletes a todo (`is_deleted = true`). Data is never permanently lost.

- **Input:** `{ id: UUID }`
- **Output:** `{ success: true }`

## `todo.addDependency` (protected)

Adds a prerequisite edge `taskId -> dependsOnId`. Runs DFS cycle detection first.

- **Input:** `{ taskId: UUID, dependsOnId: UUID }`
- **Output:** `{ success: true }`
- **Errors:** `400` if the edge would create a cycle.

## `todo.removeDependency` (protected)

- **Input:** `{ taskId: UUID, dependsOnId: UUID }`
- **Output:** `{ success: true }`

## The `Todo` shape

```
{
  id: UUID,
  name: string,
  description: string | null,
  dueDate: ISO datetime | null,
  status: "not_started" | "in_progress" | "completed" | "archived",
  priority: "low" | "medium" | "high",
  schedule: "none" | "daily" | "weekly" | "monthly" | "custom",
  customIntervalDays: number | null,
  nextOccurrenceId: UUID | null,
  createdBy: UUID,
  createdAt: ISO datetime,
  completedAt: ISO datetime | null,
  updatedAt: ISO datetime,
  isBlocked: boolean,
  dependencies: UUID[]
}
```
