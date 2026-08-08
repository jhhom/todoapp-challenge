# 1. What happens if a user is trying to add a task dependency to a task that is already 'In Progress'?

If a task is already "In Progress" (or "Completed") and a user tries to add a *new* dependency to it, you have to evaluate the status of that new dependency to ensure you don't violate the core requirements.

Here is the most sensible way to handle this scenario:

### The Logic Breakdown

The primary requirement states: *"A dependent task cannot be moved to 'In Progress' until all of its dependencies are 'Completed.'"*

By extension, a task cannot *exist* in the "In Progress" state if it suddenly acquires unfulfilled prerequisites.

* **Scenario A (The new dependency is already "Completed"):** The API should allow this. The condition for being "In Progress" remains satisfied.
  
* **Scenario B (The new dependency is "Not Started" or "In Progress"):** The API must reject this action. Allowing it would instantly create an invalid, illegal state where an "In Progress" task has an unmet dependency.

You *could* program the system to automatically demote the current task back to "Not Started" when an incomplete dependency is added. However, silently changing task statuses in the background can be jarring to the user and might trigger unintended side effects. It is much safer to simply reject the invalid request.

---

### How to frame this in our Decision Log

> **Adding Dependencies to "In Progress" Tasks**
> 
> **Decision:** The backend API strictly validates the status of newly added dependencies against the current status of the parent task. If a user attempts to add an *incomplete* dependency to a task that is currently "In Progress" or "Completed", the API rejects the request with a `400 Bad Request`. If the new dependency is already "Completed", the addition is allowed.
> 
> **Reasoning:** The requirements dictate that a task cannot enter "In Progress" unless all dependencies are completed. Therefore, adding an incomplete dependency to an already in-progress task inherently creates an invalid state. I chose to reject the request rather than silently auto-demoting the parent task back to "Not Started" to ensure predictable system behavior and force the user to make explicit state changes.
> 
> **Trade-off:** This adds slight friction to the UX; if a user genuinely realizes they forgot a prerequisite for a task they already started, they must manually move the task back to "Not Started" before the system will allow them to link the new dependency. However, prioritizing strict data integrity over convenience is the safer architectural choice.

> **Supporting change — direct reversal to "Not Started":** To make the above workflow viable, the state machine (`canTransition`) was extended to allow `in_progress → not_started` and `completed → not_started` directly. Previously the only route back to "Not Started" was via "Archived" (`in_progress/completed → archived → not_started`). `not_started` is not a "blocked" target, so this reversal is always permitted (even while the task is blocked) — demoting a task to the backlog never violates the dependency rule. On a `completed → not_started` reversal, `completedAt` is **retained as history** (consistent with the existing Q9 decision for `completed → in_progress`) and `nextOccurrenceId` is preserved, so re-completion still will not spawn a duplicate occurrence.


# 2. What happens if a recurring task depends on another recurring task?

For example

Task 1: Eat breakfast (recurring daily, depends on task 2)

Task 2: Make oatmeal (recurring daily) 

If we apply the previous rule blindly (always pointing to the original dependency), next week's "Eat breakfast" would point to last week's "Make oatmeal," which is already completed. Next week's breakfast would be born unblocked, completely defeating the purpose of recurring dependencies!

Fortunately, because you already made the smart decision to add the `next_occurrence_id` column to the `todos` table to prevent infinite loops, we can reuse that exact same column to solve this problem elegantly.

Here is the exact step-by-step logic of what happens:

1. **The Setup**: Task 1 ("Eat breakfast") depends on Task 2 ("Make oatmeal"). Both are recurring. Task 1 is blocked.
2. **First Completion**: The user completes Task 2 ("Make oatmeal").
3. **First Generation**: The system generates Task 2-B (next week's oatmeal). It then updates the original Task 2, setting its `next_occurrence_id` to point to Task 2-B.
4. **Unblocking**: Because the original Task 2 is now "Completed", Task 1 ("Eat breakfast") is officially unblocked.
5. **Second Completion**: The user completes Task 1 ("Eat breakfast").
6. **The Magic Generation Step**: The system generates Task 1-B (next week's breakfast). When copying over the dependencies, the backend looks at the original dependency (Task 2). It checks if Task 2 has a `next_occurrence_id`.
* Because it *does*, the backend links Task 1-B to Task 2-B.
* If it *didn't* (meaning the dependency was non-recurring), it would just link to the original Task 2.



---

> **Handling Recurring Tasks that Depend on Other Recurring Tasks**
> 
> **Decision:** When a recurring task is completed, the backend checks its dependencies before generating the next occurrence. If a dependency has a `next_occurrence_id` (meaning the dependency was also recurring and has already spawned its future counterpart), the new task will depend on that *future* counterpart. If it does not, it falls back to referencing the original completed dependency.
> 
> **Reasoning:** In a scenario where "Weekly Breakfast" depends on "Weekly Grocery Run", completing this week's breakfast means next week's breakfast must depend on *next week's* groceries, not this week's completed groceries. By leveraging the existing `next_occurrence_id` column introduced for status-reversal tracking, we can dynamically link future tasks to their respective future dependencies without complex graph traversal.
> 
> **Trade-off:** This requires a strict order of operations by the user: they must complete the prerequisite recurring task *before* completing the dependent recurring task so the `next_occurrence_id` exists in time for the backend to find it. However, since the dependent task is strictly blocked from being completed until the prerequisite is completed anyway, the system inherently enforces this correct order.

## What if there is a scenario that recurring Task 1 is created on next schedule, but should still depend on the last completed recurring task

There is a very realistic scenario where a newly generated recurring task *must* depend on the previously completed recurring dependency, rather than the future one. This happens when there is a **Frequency Mismatch** between the two schedules.

Here is the perfect example of when the previous rule breaks down:

### The "Frequency Mismatch" Scenario

Imagine a scenario involving certifications or periodic reviews:

* **Task 2 (Dependency):** "Renew Safety Certification" (Recurring: **Annually**)
* **Task 1:** "Operate Heavy Machinery" (Recurring: **Daily**, depends on Task 2)

**What happens if we blindly link to the *future* counterpart?**

1. The user completes "Renew Safety Certification" for 2026. The system generates the 2027 renewal task and updates the `next_occurrence_id` on the 2026 task.
2. Because the 2026 certification is "Completed," the user is unblocked and completes Monday's "Operate Heavy Machinery."
3. The system generates Tuesday's "Operate Heavy Machinery."
4. If the backend strictly follows the rule—*"If a dependency has a next_occurrence_id... the new task will depend on that future counterpart"*—Tuesday's machinery task will be linked to the **2027** Safety Certification.
5. **The Impact:** The user is now completely blocked from operating the machinery for an entire year until they renew their license in 2027!

In this scenario, Tuesday's machinery task should absolutely spawn linked to the *already completed* 2026 certification, meaning it spawns unblocked.

### How to handle this in our project

Do not try to write code to solve this edge case for the assignment. Automatically inferring user intent when recurring schedules mismatch is notoriously difficult and requires complex calendar-matching algorithms.

This can be something we can consider in **"What we would do differently with more time."**

> **Known Limitation: Frequency Mismatches in Recurring Dependencies**
> 
> **Current Behavior:** When a recurring task spawns its next occurrence, it automatically links to the *future* occurrence of any recurring dependencies (using `next_occurrence_id`).
> 
> **The Flaw:** I identified an edge case where this logic fails: frequency mismatches. If a Daily task depends on a Yearly task (e.g., Task: "Drive Forklift" [Daily] depends on "Renew License" [Yearly]), completing the Daily task will currently link tomorrow's task to next year's license renewal, incorrectly blocking the user for a year.
> 
> **What I would do with more time:** To solve this, I would implement a schedule-comparison utility. Before linking a new task to a future dependency, the backend would compare their recurrence intervals (`schedule` and `custom_interval_days`). If the dependent task occurs at a higher frequency than the prerequisite task, the system would intentionally bypass the `next_occurrence_id` and link back to the most recently completed instance of the dependency to ensure the user remains unblocked for the current cycle.


# 3. Allowing Due Dates in the Past
**Decision**: The system allows users to set a due_date in the past when creating or updating a TODO item.

**Reasoning**: The requirements do not specify restrictions on the timeframe of the due date. In real-world scenarios, users often use TODO lists retroactively for tracking, auditing, or logging tasks they forgot to enter beforehand. Enforcing a strict "future-only" rule would artificially restrict this valid user behavior.

**Trade-off**: The frontend UI might need extra logic to highlight past due dates in red (as "Overdue") immediately upon creation. However, prioritizing user flexibility and avoiding complex timezone validation on the backend is a worthwhile trade-off.

# 4. For recurring todo with due date, when its next todo is created, does the due date stay the same?

Based on the requirements and the architectural decisions you have already established in our decision log, no, the due date does not stay the same.

If the due date stayed the exact same, the newly generated task would immediately be overdue (or share the exact same deadline as the task you just finished), which defeats the purpose of a recurring schedule.

Here is exactly how the new due date should be handled based on our documented decisions:

* It shifts forward based on the completion date: You made the specific decision that the next occurrence's schedule is calculated based on the completed_at timestamp of the original task. Therefore, the new task's due date will be the completed_at timestamp plus the recurring interval (e.g., Daily, Weekly, Monthly, or a Custom day-interval).

* Handling missing due dates: You also established that a task can exist without a due date. If a user completes a recurring task where the due date was left blank (NULL), the newly generated task should simply carry over that NULL value.

By advancing the due date relative to when the user actually finished the previous task, you ensure the user gets a full, standard interval to complete the next cycle.

Question to consider: How to map out the exact date-math logic for how the backend should calculate these intervals (especially for variable lengths like "Monthly"), or should we move on to defining the specific API endpoint payloads?

# 5. For a recurring task without a due date, what distinguish the next schedule todo item with the previous todo item?
Based on the architectural decisions in our decision log, if a recurring task does not have a due date, the newly generated task will simply carry over that `NULL` due date value.

Even without a due date to anchor it, the new task is distinctly separated from the previous task through several key database fields and state changes:

* **Unique ID:** Every TODO item receives its own unique UUID upon creation. The new schedule will be an entirely distinct database record.
* **Creation Date (`created_at`):** The new task will have a fresh `created_at` timestamp representing the exact moment the system automatically generated it.
* **Completion Date (`completed_at`):** The previous task will have a populated `completed_at` timestamp, which serves as the record of exactly when its status changed to "Completed". The newly generated task will inherently not have a completion date yet.
* **Generation Linkage (`next_occurrence_id`):** The previous task will have its `next_occurrence_id` column updated to store the unique ID of the newly generated task. This linkage tracks the generation state and ensures that if a user un-completes the previous task, the system knows it has already spawned its successor.

By relying on these systemic timestamps and relational links, our backend maintains a clear, deterministic history of every recurrence cycle, completely independent of user-defined deadlines.

# 6. if I have a recurring todo 'Do homework' that recurs on 3 days interval with due date on 2026-08-11, and I completed it today

The next todo generated will have what due date?

The next generated TODO will have a due date of **2026-08-11**.

Here is the exact breakdown of how this is calculated based on our established requirements:

* **The Calculation Base:** Based on the architectural decisions established in your decision log, the next occurrence's schedule is calculated using the `completed_at` timestamp of the original task.
* **The Math:** The new task's due date is determined by taking that completion date and adding the recurring interval. Since you completed the task today (August 8, 2026) and your custom schedule interval is 3 days, the system adds 3 days to August 8.
* **The Original Due Date is Ignored:** The original due date you set (2026-08-11) does not factor into calculating the next occurrence's schedule. The system strictly advances the due date relative to the moment you actually finished the previous task.

# 7. If a recurring todo has due date, should the new todo's due date calculated based on the last todo's due date or completion date?

Whether it makes "more sense" to calculate the next schedule based on the original due date versus the completion date depends entirely on the real-world nature of the task. You have uncovered a classic product management debate: **Strict Scheduling vs. Floating Scheduling**.

Here is a breakdown of why both approaches are valid, and how they impact the user:

### 1. The Case for the Original Due Date (Strict Scheduling)

Calculating based on the original due date makes the most sense for **calendar-bound obligations**.

* **Example:** "Pay Monthly Rent" due on August 1st.
* **The Scenario:** You forget and pay it 5 days late on August 6th.
* **The Result:** The next rent payment should still be due exactly on September 1st. If the system calculated it based on your completion date (August 6th + 1 month), your rent would suddenly be due on September 6th, which is incorrect.
* **The Flaw / Edge Case:** What happens if a Daily task is 5 days overdue? If you complete it today, does the system generate yesterday's task (which is already overdue), or does it intelligently skip ahead to tomorrow? This requires complex "catch-up" logic.

### 2. The Case for the Completion Date (Floating Scheduling)

Calculating based on the completion date (which is our current documented decision) makes the most sense for **maintenance and habits**.

* **Example:** "Mow the Lawn" (Weekly).
* **The Scenario:** It rains, so you mow the lawn 3 days late.
* **The Result:** You don't want the system to tell you to mow the lawn again in just 4 days. You want a full 7-day break before you have to do it again. The cycle needs to reset based on when you actually did the work.

---

### How this affects our assignment

If you feel that basing it on the **original due date** is a stronger product decision, we can easily pivot your architecture to support it. You would simply change the logic to: *Next Due Date = Original Due Date + Interval*. If the task did not have an original due date, it would fall back to the completion date.
