## Question 1: Is Due Date required?
Can a task exist without a due date?

This is not specified in the requirement.

**Decision**: A task CAN exist without a due date.

**Reasoning**: A user may wants the flexibility of able to create a TODO item without specifying its due date. 

A user may not have a due date in mind yet when creating the TODO, rather they just want to create and jot down the TODO first so that they don't forget it later even though they still don't have a definite due date in mind on when they want to pick up the task.

This behavior is also quite common among other TODO apps.


## Question 2: When a recurring TODO is marked as completed, the next TODO will be created based on which date?

For example, if a TODO is on a DAILY recurring schedule.

Once that TODO is completed, the next TODO should be created on the next day.

The question is, that next day is based on which date?

Is it the TODO's due date? Or is it the TODO's create date or completed date?

**Decision**: The next recurring TODO item will be created from TODO's completed date.

## Question 3: If a TODO has a dependency, and that TODO is a recurring task, but its dependency is not recurring. Once that recurring TODO is completed, does its dependency also get created on the next schedule?

Handling Non-Recurring Dependencies for Recurring Tasks

**Decision**: When generating the next occurrence of a recurring task, the system will not clone its non-recurring dependencies. The new task will simply reference the original, completed dependency.

Reasoning: This supports the "one-time prerequisite" use case (e.g., Task: "Weekly Report", Dependency: "Install Reporting Software"). If the system cloned the dependency, it would violate the user's explicit configuration of that task as non-recurring, leading to unwanted data bloat. If a user wants a dependency to recur alongside the parent task, they must explicitly set the dependency as recurring.

Trade-off: A user might have meant for the dependency to happen again but forgot to set it to recurring. However, optimizing for explicit data integrity is safer than attempting to infer user intent and silently altering task properties.

## Question 4: Does it make sense that a TODO is non-recurring, but its dependency is recurring?

Yes it makes sense. There is no problem with its design and implementation either.

# Dependencies & Edge Cases

## Question 5: How should the system handle circular dependencies?

* *Context:* What happens if Task A depends on Task B, and Task B depends on Task A?
  
* *Impact:* If not handled, this creates a deadlock where neither task can ever be moved to "In Progress." Should the API validate and reject circular dependencies upon creation/update, or should the UI hide tasks that would create a cycle from the selection dropdown?
  
**Handling Circular Dependencies**

**Decision**: The backend API strictly validates against circular dependencies upon creation or update. If a cycle is detected, the API rejects the request with a 400 Bad Request, and the UI displays the error message.

**Reasoning**: Task dependencies form a Directed Acyclic Graph (DAG). Allowing cycles would permanently deadlock tasks. I prioritized implementing a cycle-detection algorithm (using Depth-First Search) on the backend because the API must be the ultimate guarantor of data integrity, protecting against invalid payloads regardless of the client.

**Trade-off**: The ideal UX would be to proactively hide invalid tasks from the frontend dependency selection dropdown so the user cannot even attempt to create a cycle. This could be achieved by having the backend filter the dropdown options to exclude tasks that would cause a cycle. However, doing so with 10,000+ tasks would require significant backend complexity and overhead on every dropdown fetch. To limit the scope and to optimize for time and performance, I chose to handle it via backend validation and frontend error surfacing instead.

## Question 6: What happens to a dependent task if its dependency is deleted (soft-deleted)?

* *Context:* Task B depends on Task A. A user deletes Task A. The requirement states data is not permanently lost.
  
* *Impact:* Does Task B become unblocked because Task A is gone? Or does Task B remain permanently blocked because Task A can no longer be "Completed"?

**Decision** Task B remain permanently unblocked.

## Question 7: Can a task bypass the "In Progress" status?

* *Context:* The requirements state: *"A dependent task cannot be moved to 'In Progress' until all of its dependencies are 'Completed'."*
* *Impact:* Can a user move a task directly from "Not Started" to "Completed"? The requirement specifically restricts moving a blocked task to "In Progress," but is silent on skipping steps or terminal states.

**Enforcing Dependency Blocks on Terminal States**

**Decision**: Yes, users are allowed to move an unblocked task directly from "Not Started" to "Completed" (bypassing "In Progress"). However, the system strictly prevents a *blocked* task from being moved to either "In Progress" OR "Completed". A blocked task can still be moved directly to "Archived" or soft-deleted.

**Reasoning**: For normal tasks, skipping "In Progress" is perfectly fine. But for blocked tasks, while the requirement explicitly stated they cannot be moved to "In Progress," it was silent on bypassing to "Completed." I interpreted the intent of this requirement to be the enforcement of sequential execution. Logically, a task that cannot be started cannot be finished. Allowing users to bypass the block by jumping straight to "Completed" would undermine the entire purpose of the dependency feature.

**Trade-off**: This requires slightly more robust validation logic on the backend (a state machine approach rather than a simple status check). I chose to implement this stricter validation because data integrity and logical consistency are critical for a task management system.

# Statuses & Lifecycle

## Question 8: What is the difference between "Archived" and "Deleted"?

* *Context:* The requirement lists "Archived" as a Status, but also requires a soft-delete feature ("Data should not be permanently lost when a TODO is deleted").
* *Impact:* Are these effectively the same thing, just represented differently? Does deleting a task change its status to "Archived," or is "Deleted" a separate boolean flag (e.g., `is_deleted = true`) while "Archived" just removes it from the active view?

## Question 9: Can a task's status be reversed from "Completed" back to "In Progress"?

* *Context:* Users make mistakes and might accidentally mark a task as completed.
  
* *Impact:* If the task was a recurring task, marking it "Completed" automatically generated the next occurrence. If the user reverses the completion, do we delete the newly generated future task?

**Reversing Completion on Recurring Tasks**

**Decision**: Users can reverse a "Completed" task back to "In Progress". When this happens, the system will not delete the auto-generated future task. However, the system tracks generation state via a next_occurrence_id column to ensure that re-completing the task does not spawn a second duplicate future task.

**Reasoning**: Users frequently click the wrong status by mistake, so status reversal is a mandatory UX requirement. I chose not to cascade-delete the auto-generated future task because the user might have already added notes or dependencies to it; auto-deleting it violates the requirement that "data should not be permanently lost."

**Trade-off**: If the user legitimately didn't want the future task, they now have to manually delete it. However, optimizing for data safety (preventing accidental deletion of user notes) takes priority over saving the user a single click to delete an unwanted task.

# Recurring Tasks

## Question 10: How complex does the "Custom" recurring schedule need to be?

* *Context:* Options are daily, weekly, monthly, or custom.
* *Impact:* Does "custom" mean an interval like "every 3 days"? Or does it mean a complex cron expression like "Every second Tuesday of the month"?


**Decision** For scoping, we define "custom" as a simple day-interval to save time.

# Concurrency & Scale

## Question 11: How do we resolve write conflicts for concurrent users?

* *Context:* "The API should support multiple users accessing the same TODO list concurrently."
  
* *Impact:* User A opens Task 1. User B opens Task 1. User A changes the priority to High and saves. User B changes the status to Completed and saves. Does User B's save overwrite User A's priority change? (You'll need to decide between "Last Write Wins" or implementing Optimistic Concurrency Control using a version number or ETag).

## Question 12: Does handling 10,000+ items imply server-side pagination, or is client-side enough?

* *Context:* "Handle a TODO list with 10,000+ items without degrading user experience."
* *Impact:* Sending 10,000 items in a single API payload will bloat network traffic and freeze DOM rendering. You will likely need to decide if you want to implement server-side pagination/filtering or if you want to send all 10,000 lightweight objects and use a virtualized list in the UI (like `react-window`).

# How to use these in your project

You don't need to build the perfect solution for all of these—in fact, the prompt explicitly says you shouldn't try to build everything.

The best way to handle these is to pick the **simplest possible implementation** for your code, and explicitly write down in your **Decision Log** *why* you chose that route.

For example: *"Regarding Q5 (Circular Dependencies): To prevent deadlocks, I implemented a simple cycle-detection algorithm on the backend that returns a 400 Bad Request if a cycle is detected. I chose not to implement cycle-prevention on the frontend UI to save time, though that would be the ideal UX."*


# Assumptions made

## 1. When a recurring TODO is marked as completed, the next occurrence is created based on its DUE_DATE

If the recurring task has a `due_date`, the next task's `due_date` will be calculated by adding the recurring interval to the original `due_date`. 

For example, if a task recurs WEEKLY with a `due_date` of 08 Aug, and it's completed on 10 Aug, its next task will be created with a `due_date` of 08 Aug + 7 days, which is 15 Aug.

If the recurring task does not have a `due_date`, then it will keep a `null` (empty) `due_date` for the next recurring task.


# Authentication and Shared State

Building an authentication system where all users share a single, global list is a highly effective strategy for this assignment.

### Why This Approach Makes Perfect Sense

* **It hits the core requirements simultaneously:** The assignment explicitly lists "User authentication and registration" as an optional nice-to-have feature. It also mandates as a non-functional requirement that the API must support multiple users accessing the same TODO list concurrently. Your approach tackles both elegantly.
* **It avoids the permission rabbit hole:** Building a robust sharing system with access control lists (ACL), invitations, and view/edit permissions is incredibly time-consuming. Skipping the sharing system keeps the scope manageable while still demonstrating your ability to handle user sessions and security.
* **It mirrors real-world collaborative tools:** If you frame the application as a "Team Board" or "Workspace" (similar to a Jira backlog, a team Kanban board, or a shared family grocery list) rather than a "Personal Diary," a globally visible list becomes a standard product feature rather than a privacy flaw.

### How to Document This in Your Decision Log

You can frame this compromise clearly to show the evaluators that you understand product scoping and trade-offs.

> **Authentication and Shared State**
> * **Decision:** I implemented user authentication, but opted for a "Shared Team Workspace" model where all authenticated users view and interact with a single, global TODO list. I chose not to implement isolated private lists or a task-sharing system.
> * **Reasoning:** The requirements asked to support multiple concurrent users on the same list, while listing authentication as a nice-to-have. By building a unified workspace, I was able to demonstrate secure authentication practices while natively satisfying the concurrent access requirement. This avoided the massive overhead of Role-Based Access Control (RBAC) or complex user-to-task mapping tables.
> * **Trade-off:** Users lack privacy for their individual tasks. However, prioritizing a robust shared-state backend over complex permissions allowed me to focus on the core challenges of dependency validation and recurring tasks within the time constraints.
> 
