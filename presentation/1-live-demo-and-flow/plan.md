# Live Demo and Flow Plan (15 Minutes)

## Objective
To demonstrate ownership of the application by guiding the audience through a structured walkthrough, highlighting system reliability, edge-case handling, and acknowledging architectural trade-offs and future improvements.

## Segment 1: The Foundation & Happy Path (3 Minutes)
**Focus:** Demonstrating basic CRUD, UI functionality, and architecture.
- **Action:** Open the web UI. Briefly explain the "Shared Team Workspace" concept (all authenticated users interact with the same list).
- **Action:** Create a standard TODO with a due date and priority.
- **Action:** Demonstrate filtering and sorting (by due date, priority, status).
- **Talking Point:** Mention that the backend is built to handle 10,000+ items with server-side pagination (~6-67ms response times), ensuring UI reliability.
- **Talking Point:** Briefly touch upon the oRPC contract-first architecture guaranteeing end-to-end type safety between the frontend and backend.

## Segment 2: Task Dependencies & Edge Cases (5 Minutes)
**Focus:** Demonstrating logical boundary conditions and error states.
- **Action:** Create Task A and Task B. Link Task B to depend on Task A.
- **Edge Case Demo 1 (Blocked Status):** Attempt to move Task B directly to "In Progress" or "Completed". Show that the system strictly prevents this.
- **Edge Case Demo 2 (Cycle Prevention):** Attempt to make Task A depend on Task B (creating a circular dependency). 
- **Talking Point:** Explain that the backend actively blocks this cycle using a Depth-First Search (DFS) algorithm.
- **Self-Correction:** Acknowledge that the UI currently allows selecting an invalid dependency in the dropdown before throwing an error on submit. Explain this was a deliberate trade-off to maintain performance at scale (avoiding costly cycle checks on 10,000+ items during dropdown render), and mention how it could be improved proactively in the future.

## Segment 3: Recurring Tasks & System Resilience (5 Minutes)
**Focus:** Demonstrating complex domain logic and self-healing mechanisms.
- **Action:** Create a Daily recurring task. Complete it.
- **Talking Point:** Show that a new occurrence is automatically generated and its due date is strictly calculated based on the original due date plus the interval (catch-up logic).
- **Edge Case Demo (The Dangling Pointer):** 
  - Soft-delete the newly generated occurrence.
  - Reverse the original task back to "In Progress".
  - Complete the original task again.
  - Show how the system **self-heals**: instead of silently skipping generation due to a stale pointer (`next_occurrence_id` pointing to a deleted task), it verifies liveness, treats the slot as empty, and successfully generates a fresh occurrence.
- **Self-Correction:** Acknowledge the "Frequency Mismatch" limitation. Explain that if a Daily task depends on a Yearly task, completing it links the new Daily task to the already-completed Yearly task. Detail why complex calendar-aware linking was out of scope for the MVP, and how schedule-comparison logic would solve it.

## Segment 4: Reflection & Future Improvements (2 Minutes)
**Focus:** Identifying current limitations and areas for future architectural evolution.
- **Talking Point (Data Retention):** Highlight that the deletion demonstrated earlier was a soft-delete (`is_deleted = true`), satisfying data retention requirements.
- **Self-Correction (Concurrency):** Discuss the "Last-Write-Wins" concurrency model. Explain that while it works for the MVP, adding Optimistic Concurrency Control (versioning) would be the next step for a shared workspace to prevent silent overwrites.
- **Self-Correction (Pagination):** Mention that while `OFFSET` pagination works currently, transitioning to Cursor-Based Pagination would be required for stable deep pagination as the dataset grows significantly.
