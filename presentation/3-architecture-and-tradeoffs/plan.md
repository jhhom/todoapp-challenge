# Segment 3: Architecture and Trade-offs

## Objective
To discuss the long-term consequences of architectural decisions, focusing on scalability, concurrency, second-order thinking, and risk-based testing strategies.

## Introduction (1 min)
- Briefly state the core tech stack (React, Express, PostgreSQL) and the contract-first approach using oRPC for end-to-end type safety.
- Emphasize the architectural philosophy: isolation of complex domain logic and optimizing for data consistency.

---

## Topic 1: System Stress-Testing (Scale & Concurrency) (3 mins)
*Focus: How the system behaves under load (10k+ tasks) and high concurrency*

- **Scale (10,000+ items)**:
  - Addressed via PostgreSQL schema optimizations: UUID primary keys, partial indexes (`is_deleted = false`), and composite indexes for common queries like `(status, due_date)`.
  - Implemented server-side pagination rather than shipping 10k rows to the client, maintaining fast ~6-67ms response times.
  - *Trade-off / Future Improvement*: Currently using `OFFSET` pagination. While fine for 10k rows, it degrades at extreme depths. I would transition to cursor-based pagination for massive datasets.
- **Concurrency**:
  - Built a "Shared Team Workspace" model where multiple users interact with the same global list.
  - *Current behavior*: "Last-Write-Wins". This is a baseline MVP approach but risks silent data overwriting if users edit the same task simultaneously.
  - *Future Improvement*: I would introduce Optimistic Concurrency Control (OCC) by adding a `version` column and returning a `409 Conflict` on stale writes, forcing the client to resolve the conflict.

---

## Topic 2: Second-Order Thinking (Ripple Effects) (3 mins)
*Focus: Tracing the impact of a design change across the stack*

- **Example A: The Computed "Blocked" State**:
  - Instead of storing a denormalized `is_blocked` boolean on the task, the blocked state is computed dynamically via a `NOT EXISTS` SQL subquery (checking for any incomplete dependencies).
  - *Ripple Effect*: This makes read queries slightly more expensive, but it **guarantees perfect consistency**. It eliminates the massive complexity and race conditions involved in trying to sync boolean flags across a deep, multi-level dependency graph every time a single task's status changes.
- **Example B: Circular Dependency Prevention**:
  - Cycle detection (DFS algorithm) is strictly enforced on the backend during creation and updates.
  - *Ripple Effect on UI*: Ideally, the UI would proactively hide invalid dependencies from dropdowns so users can't even attempt to create a cycle. However, computing valid graphs for 10k+ items on every frontend dropdown fetch would cripple the backend performance.
  - *Trade-off*: Sacrificed proactive UI hiding (UX) in favor of fast performance and strict backend safety (returning a 400 Bad Request if a cycle is attempted).

---

## Topic 3: Risk-Based Testing Strategy (2 mins)
*Focus: Strategic testing focusing on high-risk logic rather than trivial CRUD*

- **Layered Architecture & Pure Logic Modules**:
  - Handlers delegate to domain services, and complex business rules are completely isolated into pure, database-agnostic modules.
- **Testing High-Risk Areas**:
  - Instead of focusing on heavy integration tests for simple database inserts (trivial CRUD), testing was heavily concentrated on the pure logic modules.
  - Wrote 24 unit tests specifically targeting the highest-risk logic: **State-machine transitions**, **Recurrence math (date shifting)**, and **DFS cycle detection**.
  - *Why?*: A bug in standard CRUD is usually obvious immediately. But a bug in recurrence logic silently corrupts user data over time, and a cycle in the dependency graph breaks the entire rendering of the list. These require deterministic, exhaustive testing.

---

## Conclusion & Q&A (1 min)
- Summarize that the architecture prioritized data safety (consistency over denormalization) and high testability for complex logic.
- Open the floor for any deep dives into the codebase or database schema.
