# Segment 2: Requirement and Interpretation

## Objective
To demonstrate the ability to navigate ambiguity, identify non-obvious conflicts in requirements, reason about downstream impacts, and justify architectural interpretations.

## Introduction (1 min)
- Briefly state that the project requirements intentionally left several edge cases underspecified.
- Emphasize the approach: prioritizing strict data integrity and predictable user experience when resolving ambiguities.

---

## Topic 1: The "Soft Delete" vs. Dependencies Conflict (2 mins)
*Focus: Ambiguity identification (as highlighted in the rubric)*

- **The Ambiguity / Conflict**: 
  - Requirement A: "Data should not be permanently lost" (handled via `is_deleted` soft-delete flag).
  - Requirement B: "Dependent task cannot be moved to 'In Progress' until all dependencies are 'Completed'".
- **Downstream Reasoning**: If a user soft-deletes a prerequisite task, does the dependent task stay blocked forever? If we treat soft-deleted tasks as "uncompleted", the dependent task becomes permanently uncompletable, ruining the user's workflow. 

- **Intentionality / Decision**: 
  - **"Archived" vs. "Deleted"**: "Archived" is a non-terminal status (can be reversed), whereas deletion is a soft-delete flag (`is_deleted = true`) to satisfy the "data should not be permanently lost" requirement. Soft-deleting a dependency permanently unblocks its dependent task.

---

## Topic 2: Recurring Tasks with Recurring Dependencies (2 mins)
*Focus: Downstream reasoning and identifying complex edge cases*

- **The Ambiguity / Conflict**: If "Task A" (recurring) depends on "Task B" (recurring), what happens when they complete? 
- **Downstream Reasoning**: 
  - *Standard case*: "Weekly Breakfast" depends on "Weekly Groceries". Completing them should link *next week's* breakfast to *next week's* groceries. We solved this using the `next_occurrence_id` pointer.
  - *The "Frequency Mismatch" Edge Case*: What if a **Daily** task ("Drive Forklift") depends on a **Yearly** task ("Renew License")? If we blindly link to the future counterpart, completing the daily task links tomorrow's forklift drive to *next year's* license renewal. The user is now blocked for a year!
- **Intentionality / Decision**: 
  - For the MVP, we link to the future counterpart if `next_occurrence_id` exists, but explicitly recognized the frequency mismatch limitation.
  - **Reversing Completion on Recurring Tasks**: Users can reverse a "Completed" task. The system tracks generation state via a `next_occurrence_id` to ensure that re-completing the task does not spawn a duplicate future occurrence.

---

## Topic 3: The "In Progress" State Violation (2 mins)
*Focus: Intentionality and UX vs. Data Integrity trade-offs*

- **The Ambiguity / Conflict**: What happens if a user tries to add an *incomplete* dependency to a task that is *already* "In Progress" or "Completed"?
- **Downstream Reasoning**: Allowing this instantly creates an illegal state (an In-Progress task with unmet dependencies). We could program the system to automatically demote the parent task back to "Not Started" behind the scenes. However, silently changing task statuses can be jarring and cause unintended side effects.
- **Intentionality / Decision**: 
  - Prioritized strict data integrity over convenience. The API rejects the request (400 Bad Request).
  - **Bypassing "In Progress"**: Moving a task directly from "Not Started" to "Completed" (bypassing "In Progress") is allowed for unblocked tasks. The requirement stated a *blocked* task cannot be moved to "In Progress". Blocked tasks can still be moved directly to "Archived" or soft-deleted.

---

## Topic 4: Due Date Calculation & Scope Management (2 mins)
*Focus: Business logic interpretation & managing project scope*

- **Due Date Calculation - Strict vs. Floating**: When generating the next occurrence of a recurring task with a due date, is the next due date based on the *original due date* or the *completion date*?
  - *Floating (Completion Date)*: Good for habits (e.g., Mowing the lawn 3 days late means you still want 7 days before the next mow).
  - *Strict (Original Due Date)*: Good for calendar obligations. But if you are 5 days late on a daily task, strictly adding 1 day spawns an already-overdue task.
  - *Decision*: Implemented **Strict Scheduling with catch-up**. The next due date anchors on the original due date, but advances by whole intervals until it is strictly *after* the `completed_at` timestamp.
- **Custom Recurrence**: 
  - *Ambiguity*: Requirement asked for "custom" schedules without defining complexity.
  - *Decision*: Interpreted as a simple day-interval (e.g., every N days) to keep the scope manageable, rather than implementing complex cron expressions.

---

## Conclusion & Q&A (1 min)
- Summarize that the core mental model is: **"Does this state transition create an illegal state down the road, and how can we prevent it elegantly?"**
- Open the floor to discuss any specific decisions or alternative approaches.
