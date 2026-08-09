# TODO Application — Collaborative Workspace

A collaborative TODO web application (backend API + functional web UI) where
authenticated users share a single global workspace of tasks. It supports
recurring tasks, task dependencies with cycle prevention, filtering/sorting, and
server-side pagination engineered for 10,000+ items.

## Stack

- **Backend:** Express 5, [oRPC](https://orpc.unnoq.io) (type-safe, contract-first RPC), Kysely (PostgreSQL query builder), Zod (validation), `bcrypt` + `jose` (JWT auth).
- **Frontend:** React 19, Vite, TanStack Router, TanStack Query, Tailwind CSS v4.
- **Database:** PostgreSQL.
- **Tests:** Vitest.

## Prerequisites

- Node.js 20+, pnpm
- PostgreSQL 14+ running locally with a `todoapp` database

## Setup

```bash
# 1. Install dependencies (bcrypt native module is built automatically)
pnpm install

# 2. Configure environment (already present in .env; adjust if needed)
#    DATABASE_URL=postgres://<user>@localhost:5432/todoapp
#    JWT_SECRET=<any 32+ char string>

# 3. Create the database (if it doesn't exist)
createdb todoapp

# 4. Apply the schema
psql "$DATABASE_URL" -f src/backend/create-tables.sql

# 5. Regenerate Kysely types from the schema
pnpm kysely-codegen
```

## Running locally

```bash
# Backend API (http://localhost:5170)
pnpm dev:be

# In a separate terminal: web UI (http://localhost:5173)
pnpm dev
```

Open the UI, register an account, and start creating tasks.

## Seeding 10,000+ tasks (scale demo)

```bash
pnpm tsx --tsconfig tsconfig.app.json src/backend/seed.ts
```

This inserts 10,000 todos. With the indexed schema and server-side pagination,
`todo.list` responses stay in the single-digit-to-tens-of-milliseconds range
(verified ~6–67ms per page).

## Tests

```bash
pnpm vitest run            # all tests
pnpm vitest run src/backend/lib   # pure-logic unit tests only
```

Integration tests run against the configured PostgreSQL database; vitest is
configured to run files serially (`vite.config.ts` → `test.fileParallelism`)
so concurrent files don't clobber shared test data.

## Deliverables

| Deliverable | Description |
|-------------|-------------|
| README with instructions for setup and local development | Instructions for setup/dev is given in this README |
| API documentation | [openapi.json](/openapi.json) |
| Decision log | The compiled decision logs is in [Decision Log](/decision-log.md). More detailed discussions behind each decision is also available under the [decision-logs](/decision-logs/) folder in this repository, where some of the discussions come from our discussions/answers from AI that has context into the project's requirements and our existing decisions. |

## Implemented Features

Details are also available in [Decision Log](/decision-log.md).

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

Additionally:

- **TODO CRUD** with soft delete (data is never permanently lost).
- **Statuses:** Not Started, In Progress, Completed, Archived.
- **Recurring tasks:** Daily / Weekly / Monthly / Custom (day interval). Marking a
  recurring task Completed auto-generates the next occurrence, calculated from the
  task's `completedAt`.
- **Status reversal:** A Completed task can be moved back to In Progress without
  spawning a duplicate occurrence (`next_occurrence_id` guards it).
- **Task dependencies:** A task can depend on others. A blocked task cannot move to
  In Progress or Completed until all prerequisites are Completed (but it can still
  be Archived or soft-deleted). Circular dependencies are rejected at the API
  (DFS cycle detection → `400`).
- **Filtering:** by status, priority, due-date range, and blocked/unblocked.
- **Sorting:** by due date, priority, status, name.
- **Server-side pagination:** the DB performs `LIMIT/OFFSET` over indexed columns.
- **JWT authentication** over a shared workspace.

**What was NOT built and why**

| Feature | Reason |
| --- | --- |
| **Bulk Operations** | The concept of `group` is underspecified and unclear from the requirement. It also adds API and UI complexity for marginal MVP value. |
| **RBAC / Private TODO Lists / Sharing** | The shared-workspace model sidesteps this entirely, saving significant time on permissions architecture. |
| **Optimistic Concurrency Control** | Last-write-wins is an acceptable baseline for this scope; prioritized core business logic instead. |
| **JWT Refresh Tokens** | A single 24h access token keeps the MVP simple; re-login is the documented trade-off. |

## Project structure

```
src/
├─ main.tsx                       # web entry point (Vite)
├─ shared/
│  └─ api.ts                      # oRPC contract (shared by backend + frontend, full type-safety)
├─ backend/
│  ├─ db.ts, create-tables.sql, db.d.ts   # Kysely connection, schema, generated types
│  ├─ main.ts                     # Express server bootstrap
│  ├─ router.ts                   # oRPC router composition
│  ├─ procedures.ts               # oRPC procedures (thin handlers)
│  ├─ openapi.ts                  # OpenAPI document generation
│  ├─ seed.ts                     # bulk insert 10,000+ todos (scale demo)
│  ├─ context.ts                  # ServerContext / AuthedContext types
│  ├─ middleware/auth.ts          # requireAuth (JWT)
│  ├─ lib/                        # pure logic: state-machine, recurrence,
│  │                              #   cycle-detection, jwt, events (SSE), errors
│  └─ domain/                     # auth, todos, dependencies (service + repo each)
└─ web/
   ├─ App.tsx                     # root app component
   ├─ client.ts                   # oRPC client + TanStack Query utils (orpc)
   ├─ routes/                     # index (workspace), login, register
   ├─ hooks/todos.ts              # TanStack Query hooks
   ├─ lib/                        # auth, utils
   └─ components/                 # TodoFilters, Pagination, TodoForm, TodoDetailDrawer,
                                  #   TodoBadges, AppSelect, ui/ (shadcn)
```

## Documentation

- [API documentation](docs/api.md)
- [Decision log](/decision-log.md)
