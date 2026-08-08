# Running the Backend with Docker

This guide explains how to build and run the SleekFlow backend API inside a
Docker container.

The backend is an Express 5 + [oRPC](https://orpc.dev) server that connects to
**PostgreSQL** and listens on **port 5170**. The Docker image bundles the
TypeScript source into a single JavaScript file at build time, so the runtime
image needs only Node.js and the production dependencies.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Docker (or Docker Desktop) | 20.10+ |
| PostgreSQL (local, cloud, or Docker) | 14+ |

> **PostgreSQL is expected to be external** — for example a managed instance on
> AWS RDS, Google Cloud SQL, or a local server. The backend image does **not**
> include a database; you point it at one via `DATABASE_URL`.

---

## Quick start

```bash
# 1 — Build the image
docker build -t sleekflow-backend .

# 2 — Create the database schema (one-time)
psql "$DATABASE_URL" -f src/backend/create-tables.sql

# 3 — Run the container
docker run -d \
  --name sleekflow-api \
  -p 5170:5170 \
  -e DATABASE_URL="postgres://user:password@host:5432/sleekflow" \
  -e JWT_SECRET="your-32-plus-character-secret-key" \
  sleekflow-backend
```

Verify the server is up:

```bash
curl http://localhost:5170/openapi.json | head -c 200
```

---

## Environment variables

The container reads two environment variables at startup:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string, e.g. `postgres://user:pass@host:5432/dbname` |
| `JWT_SECRET` | **Yes** (in production) | `dev-only-change-me-please-32-chars-min` | Secret used to sign/verify JWT auth tokens. Must be ≥ 32 characters. |

Pass them with `-e` flags or an `--env-file`:

```bash
docker run -d -p 5170:5170 --env-file .env.production sleekflow-backend
```

> ⚠️ **Never bake secrets into the image.** The `.dockerignore` excludes
> `.env` files from the build context. Always inject them at runtime.

---

## Database setup

The backend expects the tables defined in
[`src/backend/create-tables.sql`](../src/backend/create-tables.sql) to already
exist. Run this script once against your database (outside Docker):

```bash
psql "postgres://user:password@your-postgres-host:5432/sleekflow" \
  -f src/backend/create-tables.sql
```

The script is idempotent — it drops and recreates the tables, so it's safe to
re-run during development. In production, use a migration tool instead.

If you don't have the `psql` client installed locally, you can run it through a
temporary container instead:

```bash
docker run --rm -i \
  -e PGPASSWORD=yourpassword \
  postgres:16 \
  psql -h your-postgres-host -U user -d sleekflow \
  < src/backend/create-tables.sql
```

---

## Building the image

```bash
docker build -t sleekflow-backend .
```

### What the multi-stage build does

| Stage | Purpose |
|-------|---------|
| **builder** | Installs all dependencies (including devDeps), then runs `pnpm build:server` which uses **esbuild** to bundle `src/backend/main.ts` (+ all local TypeScript) into a single `dist/server.mjs`. Third-party packages are kept external. |
| **deps** | Installs **production dependencies only** (`--prod`) and compiles the `bcrypt` native addon. This stage has the C++ toolchain (python, make, g++). |
| **runtime** | Copies the bundle + production `node_modules` into a slim Node image. No build tools, no TypeScript compiler, no dev dependencies. |

The final image is small and contains only what's needed to run the server.

---

## Running the container

### Basic

```bash
docker run -d \
  --name sleekflow-api \
  -p 5170:5170 \
  -e DATABASE_URL="postgres://user:password@host:5432/sleekflow" \
  -e JWT_SECRET="a-very-long-random-secret-string-here" \
  sleekflow-backend
```

### Connecting to a Postgres running on the host

If PostgreSQL runs on your **host machine** (not in another container), use
`host.docker.internal` so the container can reach it:

```bash
docker run -d \
  -p 5170:5170 \
  -e DATABASE_URL="postgres://user:password@host.docker.internal:5432/sleekflow" \
  -e JWT_SECRET="..." \
  sleekflow-backend
```

> `host.docker.internal` works on Docker Desktop (macOS/Windows). On Linux, add
> `--add-host=host.docker.internal:host-gateway`.

### Using an env file

Create `.env.production`:

```env
DATABASE_URL=postgres://user:password@host:5432/sleekflow
JWT_SECRET=your-32-plus-character-secret-key
```

Then:

```bash
docker run -d -p 5170:5170 --env-file .env.production sleekflow-backend
```

---

## Verifying it works

The server exposes three endpoints once it starts:

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/openapi.json` | GET | — | OpenAPI 3.1.1 spec (use this for health checks) |
| `/api/**` | various | Bearer JWT | REST API |
| `/rpc/**` | various | Bearer JWT | oRPC RPC API |

Quick checks:

```bash
# Server is alive?
curl -s http://localhost:5170/openapi.json | jq '.info'

# Register a user
curl -s -X POST http://localhost:5170/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}'

# Log in to get a JWT
curl -s -X POST http://localhost:5170/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Checking container logs

```bash
docker logs sleekflow-api
```

You should see:

```
Server listening on port 5170
  RPC:   http://localhost:5170/rpc
  REST:  http://localhost:5170/api
  Spec:  http://localhost:5170/openapi.json
```

### Checking health status

The image includes a `HEALTHCHECK`. View it with:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
# → sleekflow-api   Up 2 minutes (healthy)
```

---

## Docker Compose (optional)

If you want to manage the backend with Compose (PostgreSQL stays external),
create a `docker-compose.yml`:

```yaml
services:
  api:
    build: .
    image: sleekflow-backend
    ports:
      - "5170:5170"
    environment:
      DATABASE_URL: "postgres://user:password@your-postgres-host:5432/sleekflow"
      JWT_SECRET: "your-32-plus-character-secret-key"
    restart: unless-stopped
```

Then:

```bash
docker compose up -d
```

---

## Troubleshooting

### `Error: connect ECONNREFUSED` / database connection fails

The container can't reach PostgreSQL. Check:

1. The `DATABASE_URL` host is reachable from inside the container.
2. For host-local Postgres, use `host.docker.internal` (not `localhost`).
3. For cloud Postgres, ensure firewall/security groups allow the connection.

### bcrypt errors / native module failures

The `deps` build stage installs `python3`, `make`, and `g++` to compile bcrypt.
If the build fails on this step, ensure you're not running out of memory during
the Docker build (increase Docker Desktop's memory allocation).

### Port already in use

If port 5170 is taken, map to a different host port:

```bash
docker run -p 8080:5170 ... sleekflow-backend
# API now available at http://localhost:8080
```

### Image is too large

The runtime image is ~490 MB. The bulk comes from production `node_modules`:
this project is a monorepo where backend and frontend share a single
`package.json`, so `pnpm install --prod` also installs React, Tailwind, and
other frontend packages the backend never imports.

To slim it down further you could:

- Switch the base image to `node:22-alpine` (~50 MB smaller), though `bcrypt`
  compiled against musl can occasionally have issues.
- Split backend dependencies into a separate `package.json` under
  `src/backend/` so `--prod` installs only what the server needs.

### Rebuilding after code changes

```bash
docker build --no-cache -t sleekflow-backend .
```

---

## File reference

| File | Purpose |
|------|---------|
| [`Dockerfile`](../Dockerfile) | Multi-stage build recipe |
| [`.dockerignore`](../.dockerignore) | Excludes node_modules, .env, frontend, docs from the build context |
| [`src/backend/create-tables.sql`](../src/backend/create-tables.sql) | Database schema — run once before starting the container |
| [`package.json`](../package.json) `build:server` script | esbuild command that bundles the server |
