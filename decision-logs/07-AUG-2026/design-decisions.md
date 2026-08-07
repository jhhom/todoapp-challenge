## PostgreSQL Schema Design Decision Document

### Overall Architectural Decisions

* **Authentication and Shared State:** I implemented user authentication, which satisfies a "Nice-to-Have" requirement, but opted for a "Shared Team Workspace" model. In this model, all authenticated users view and interact with a single, global TODO list. This satisfies the non-functional requirement that the API must support multiple users accessing the same TODO list concurrently without the massive overhead of building complex Role-Based Access Control (RBAC) or task-sharing systems.
* **Concurrency Management:** The system will default to a standard "Last Write Wins" behavior. I chose not to implement Optimistic Concurrency Control (e.g., versioning or ETags). While concurrent user access is required, prioritizing the core business logic (recurring tasks and strict dependency validations) over resolving edge-case write conflicts was the most sensible use of the limited timeframe.

---

### Table 1: `users`

This table manages user credentials to fulfill the optional authentication requirement.

| Column Name | Data Type | Reasoning & Requirement Mapping |
| --- | --- | --- |
| `id` | UUID (PK) | Uniquely identifies each user. |
| `email` | VARCHAR(255) | Stores the user's login credential. |
| `password_hash` | VARCHAR(255) | Securely stores the user's password for the optional authentication feature. |
| `created_at` | TIMESTAMP | Tracks when the user account was created. |

---

### Table 2: `todos`

This is the core table fulfilling the "TODO Management" requirement. It handles standard CRUD operations, status tracking, and recurrence configurations.

| Column Name | Data Type | Reasoning & Requirement Mapping |
| --- | --- | --- |
| `id` | UUID (PK) | Fulfills the requirement that each TODO has a unique ID. |
| `name` | VARCHAR(255) | Fulfills the required Name field. |
| `description` | TEXT | Fulfills the required Description field. |
| `due_date` | TIMESTAMP | Fulfills the required Due Date field. It is nullable based on Decision Q1, allowing tasks to exist without a specific deadline to provide users with more flexibility. |
| `status` | ENUM | Restricts values to Not Started, In Progress, Completed, or Archived, as explicitly required. |
| `priority` | ENUM | Restricts values to Low, Medium, High to fulfill the core priority requirement. |
| `schedule` | ENUM | Stores the recurrence interval (None, Daily, Weekly, Monthly, Custom) to fulfill the Recurring Tasks requirement. |
| `custom_interval_days` | INT | Supports Decision Q10 by defining "Custom" recurrence as a simple day-interval to maintain scope and save time. |
| `next_occurrence_id` | UUID (FK) | Fulfills Decision Q9. It links to a self-referencing foreign key to track generation state. If a user un-completes a task (reversing it from "Completed" to "In Progress"), this prevents the system from spawning a duplicate future task upon re-completion. |
| `created_by` | UUID (FK) | Links the task to the `users` table. This tracks the original creator in the shared workspace model. |
| `created_at` | TIMESTAMP | Renamed from `create_date` for standard naming consistency. Serves as the record creation timestamp. |
| `completed_at` | TIMESTAMP | Added to track exactly when a task's status changes to "Completed". This serves as the definitive base date for calculating the next occurrence of a recurring task, aligning with Decision Q2. |
| `updated_at` | TIMESTAMP | Standard metadata to track the last modification time. |
| `is_deleted` | BOOLEAN | Satisfies the non-functional requirement that data is not permanently lost. It acts as a soft-delete flag, supporting Decision Q8 by separating standard deletions from the "Archived" status. |

---

### Table 3: `todo_dependencies`

This junction table maps the relationships between tasks to fulfill the "Task Dependencies" core feature.

| Column Name | Data Type | Reasoning & Requirement Mapping |
| --- | --- | --- |
| `task_id` | UUID (PK/FK) | Identifies the dependent task. |
| `depends_on_task_id` | UUID (PK/FK) | Identifies the prerequisite task. |

**Dependency Architectural Logic:**

* **Validating Cycles:** Based on Decision Q5, the backend API strictly validates against circular dependencies upon creation or update (using a Depth-First Search algorithm). If a cycle is detected, the API rejects the request with a 400 Bad Request to protect data integrity.
* **Enforcing Status Blocks:** Based on Decision Q7, the backend strictly prevents a blocked task from being moved to either "In Progress" OR "Completed". A blocked task can, however, be moved directly to "Archived" or soft-deleted.
* **Handling Deleted Dependencies:** Based on Decision Q6, if a dependency is soft-deleted, the dependent task remains permanently unblocked.
* **Handling Recurring Task Dependencies:** Based on Decision Q3, when generating the next occurrence of a recurring task, the system will not clone its non-recurring dependencies. The newly generated recurring task will simply retain a link to the existing, one-time dependency to prevent unwanted data bloat.