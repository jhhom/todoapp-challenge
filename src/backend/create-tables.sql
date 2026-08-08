-- Local development schema setup. Drops + recreates tables so it is idempotent.
-- Run: psql "$DATABASE_URL" -f src/backend/create-tables.sql

DROP TABLE IF EXISTS todo_dependency CASCADE;
DROP TABLE IF EXISTS todo CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;

-- Enums
CREATE TYPE todo_status   AS ENUM ('not_started', 'in_progress', 'completed', 'archived');
CREATE TYPE todo_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE todo_schedule AS ENUM ('none', 'daily', 'weekly', 'monthly', 'custom');

-- Users (authentication; shared workspace)
CREATE TABLE app_user (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Todos (core entity)
CREATE TABLE todo (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 VARCHAR(255) NOT NULL,
    description          TEXT,
    due_date             TIMESTAMPTZ,
    status               todo_status   NOT NULL DEFAULT 'not_started',
    priority             todo_priority NOT NULL DEFAULT 'medium',
    schedule             todo_schedule NOT NULL DEFAULT 'none',
    custom_interval_days INT,
    next_occurrence_id   UUID REFERENCES todo(id),
    created_by           UUID NOT NULL REFERENCES app_user(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at         TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted           BOOLEAN NOT NULL DEFAULT FALSE
);

-- Dependencies junction (task depends_on prerequisite)
CREATE TABLE todo_dependency (
    task_id            UUID NOT NULL REFERENCES todo(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES todo(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_task_id),
    CHECK (task_id <> depends_on_task_id)
);

-- Indexes for pagination / filtering / sorting
CREATE INDEX idx_todo_not_deleted ON todo (is_deleted);
CREATE INDEX idx_todo_status       ON todo (status);
CREATE INDEX idx_todo_priority     ON todo (priority);
CREATE INDEX idx_todo_due_date     ON todo (due_date);
CREATE INDEX idx_todo_name         ON todo (name);
CREATE INDEX idx_todo_status_due   ON todo (status, due_date);
CREATE INDEX idx_todo_priority_due ON todo (priority, due_date);
CREATE INDEX idx_todo_created_by   ON todo (created_by);
CREATE INDEX idx_dep_task          ON todo_dependency (task_id);
CREATE INDEX idx_dep_depends_on    ON todo_dependency (depends_on_task_id);
