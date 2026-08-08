Here is the overall requirement description for your TODO application, combining the original assignment constraints with the specific architectural and product decisions we have made.

### Project Objective

Develop a collaborative TODO list web application (backend API and functional web UI) that allows users to manage a shared workspace of tasks. The system must efficiently handle up to 10,000+ items without degrading the user experience.

### System Architecture & Access

* **Authentication & Workspace**: The system utilizes a "Shared Team Workspace" model where authenticated users log in to view and interact with a single, global TODO list.
* **Concurrency**: Multiple users can access and modify the list concurrently.
* **Write Conflicts**: Concurrency is handled using a standard "Last Write Wins" approach, prioritizing core business logic over complex conflict resolution.

### Core TODO Management

* **Task Properties**: Each task includes a Unique ID, Name, Description, Status (Not Started, In Progress, Completed, Archived), and Priority (Low, Medium, High).
* **Optional Deadlines**: The "Due Date" field is optional, allowing users to capture tasks without strict timelines.
* **CRUD Operations**: The system supports standard Create, Read, Update, and Delete operations.
* **Data Retention**: Deleting a task performs a "soft delete," ensuring data is never permanently lost.

### Recurring Tasks Logic

* **Schedules**: Tasks can recur on Daily, Weekly, Monthly, or Custom schedules.
* **Custom Intervals**: A "Custom" schedule is defined as a simple day-interval (e.g., every 3 days).
* **Recurrence Trigger**: When a recurring task is marked as "Completed", the next occurrence is automatically generated.
* **Calculation Base**: The future task's schedule is calculated based on the `completed_at` timestamp of the original task.
* **Status Reversal**: Users can reverse a task from "Completed" back to "In Progress".
* **Duplicate Prevention**: Reversing a completion does not delete the auto-generated future task, and the system tracks generation state to prevent spawning infinite duplicate tasks upon re-completion.

### Task Dependencies Validation

* **Prerequisites**: A task can depend on one or more other tasks.
* **Status Blocking**: A blocked task cannot be moved to "In Progress" or "Completed" until all of its dependencies are "Completed".
* **Terminal Bypassing**: A blocked task can bypass the block to be directly "Archived" or soft-deleted.
* **Cycle Prevention**: Circular dependencies (e.g., A depends on B, B depends on A) are strictly prevented by the backend API, which runs a cycle-detection algorithm and returns a 400 Bad Request if a loop is detected.
* **Deleted Dependencies**: If a dependency is soft-deleted, any task depending on it becomes permanently unblocked.
* **Recurring Dependencies**: When generating the next occurrence of a recurring task, the system does not clone non-recurring dependencies; it simply references the original completed dependency.

### Filtering, Sorting & UI

* **Filtering**: Users can filter tasks by status, priority, due date, and dependency status (blocked/unblocked).
* **Sorting**: Users can sort tasks by due date, priority, status, and name.
* **User Interface**: A functional, usable frontend that surfaces API errors (like circular dependency blocks) and allows full management of the shared list.

---

Would you like to move forward by defining the backend API endpoints next, or should we focus on planning the frontend UI components?