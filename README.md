# SleekFlow TODO — Collaborative Workspace

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
- PostgreSQL 14+ running locally with a `sleekflow` database

## Setup

```bash
# 1. Install dependencies (bcrypt native module is built automatically)
pnpm install

# 2. Configure environment (already present in .env; adjust if needed)
#    DATABASE_URL=postgres://<user>@localhost:5432/sleekflow
#    JWT_SECRET=<any 32+ char string>

# 3. Create the database (if it doesn't exist)
createdb sleekflow

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

## Features

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

## Project structure

```
src/
├─ shared/api.ts          # oRPC contract (shared by backend + frontend, full type-safety)
├─ backend/
│  ├─ db.ts, create-tables.sql, db.d.ts
│  ├─ context.ts          # ServerContext / AuthedContext types
│  ├─ procedures.ts       # oRPC router (thin handlers)
│  ├─ middleware/auth.ts  # requireAuth (JWT)
│  ├─ lib/                # pure: state-machine, recurrence, cycle-detection, jwt, errors
│  └─ domain/             # auth, todos, dependencies (service + repo each)
└─ web/
   ├─ client.ts           # oRPC client + TanStack Query utils (orpc)
   ├─ routes/             # login, register, workspace
   └─ components/         # TodoTable, TodoFilters, Pagination, TodoForm, TodoDetailDrawer
```

## Documentation

- [API documentation](docs/api.md)
- [Decision log](decision-logs/07-AUG-2026/final-decision-log.md)
