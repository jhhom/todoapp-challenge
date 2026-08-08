# ─────────────────────────────────────────────────────────────────────────────
# Dockerfile for the SleekFlow backend API (Express + oRPC + Kysely/Postgres)
#
# Multi-stage build:
#   1. builder  — installs all deps, bundles the TypeScript server with esbuild
#   2. deps     — installs production deps only (compiles the bcrypt native module)
#   3. runtime  — minimal image: bundled code + prod node_modules
#
# Usage:
#   docker build -t sleekflow-backend .
#   docker run -p 5170:5170 -e DATABASE_URL=... -e JWT_SECRET=... sleekflow-backend
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1 · Bundle the server ─────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

# corepack reads the "packageManager" field from package.json (pnpm@10.15.1)
RUN corepack enable pnpm

# Copy lockfile + manifest first for layer caching
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and produce a single self-contained bundle (dist/server.mjs).
# --packages=external keeps every node_modules import external so the runtime
# stage only needs production dependencies — no TypeScript or bundler.
COPY . .
RUN pnpm build:server

# ── Stage 2 · Production dependencies (bcrypt native build) ─────────────────
FROM node:22-slim AS deps
WORKDIR /app

# bcrypt is a C++ addon — it needs a toolchain to compile.
# (bcrypt 6 ships prebuilt binaries for most platforms; these are a fallback.)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# ── Stage 3 · Minimal runtime image ─────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app

# Non-root user for security
RUN useradd --create-home --uid 1001 appuser

# Production node_modules (bcrypt pre-compiled) + the server bundle
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist          ./dist
COPY --from=builder /app/package.json  ./package.json

USER appuser

ENV NODE_ENV=production
EXPOSE 5170

# Lightweight health check using Node 22's built-in fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5170/openapi.json').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.mjs"]
