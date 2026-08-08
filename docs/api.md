# API Documentation

The backend exposes its API in two complementary ways via [oRPC](https://orpc.unnoq.io):

| Interface | Base URL | Use case |
| --- | --- | --- |
| **RPC** (type-safe) | `http://localhost:5170/rpc` | Internal frontend calls via the typed oRPC + TanStack Query client |
| **REST / OpenAPI** | `http://localhost:5170/api` | Third-party integrations, curl, Postman, generated SDKs |

## OpenAPI Specification

A fully generated **OpenAPI 3.1.1** document is available at:

```
http://localhost:5170/openapi.json
```

Regenerate the spec to a local file for CI/tooling:

```bash
pnpm openapi:gen     # writes openapi.json at the project root
```

### REST endpoint map

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | — | Register a new account |
| `POST` | `/auth/login` | — | Login and receive a JWT |
| `GET` | `/todos` | ✅ | List todos (query params for filtering/sorting/pagination) |
| `POST` | `/todos` | ✅ | Create a todo |
| `GET` | `/todos/{id}` | ✅ | Get a single todo |
| `PATCH` | `/todos/{id}` | ✅ | Update a todo |
| `DELETE` | `/todos/{id}` | ✅ | Soft-delete a todo |
| `POST` | `/todos/{taskId}/dependencies/{dependsOnId}` | ✅ | Add a dependency |
| `DELETE` | `/todos/{taskId}/dependencies/{dependsOnId}` | ✅ | Remove a dependency |
| `GET` | `/todos/changed` | ✅ | SSE stream of todo change events |

### curl examples

```bash
# Register
curl -X POST http://localhost:5170/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"secret123"}'

# List todos (replace <token>)
curl http://localhost:5170/api/todos?page=1&pageSize=10&status=in_progress \
  -H 'Authorization: Bearer <token>'

# Create a todo
curl -X POST http://localhost:5170/api/todos \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"name":"Buy groceries","priority":"high"}'
```

## RPC API details

- **Content type:** The oRPC RPC client serializes inputs using its Standard RPC
  JSON serializer. The frontend consumes this through the typed `orpc` TanStack
  Query client. (Direct `curl` with a bare JSON body is **not** supported — use the
  REST interface above or the oRPC client.)
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
