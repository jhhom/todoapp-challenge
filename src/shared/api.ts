import { oc, eventIterator } from "@orpc/contract";
import { z } from "zod";

export const StatusEnum = z.enum([
  "not_started",
  "in_progress",
  "completed",
  "archived",
]);
export const PriorityEnum = z.enum(["low", "medium", "high"]);
export const ScheduleEnum = z.enum([
  "none",
  "daily",
  "weekly",
  "monthly",
  "custom",
]);
export const MonthlyRepeatModeEnum = z.enum(["day_of_month", "end_of_month"]);

export const TodoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  dueDate: z.string().datetime().nullable(),
  status: StatusEnum,
  priority: PriorityEnum,
  schedule: ScheduleEnum,
  customIntervalDays: z.number().int().positive().nullable(),
  monthlyRepeatMode: MonthlyRepeatModeEnum.nullable(),
  nextOccurrenceId: z.string().uuid().nullable(),
  createdBy: z.string().uuid(),
  createdByEmail: z.string().email().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  isBlocked: z.boolean(),
  dependencies: z.array(z.string().uuid()),
});

export const PageMeta = z.object({
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().min(0),
});

export const TokenOutput = z.object({
  token: z.string(),
  user: z.object({ id: z.string().uuid(), email: z.string().email() }),
});

const ListInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  status: StatusEnum.optional(),
  priority: PriorityEnum.optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  blocked: z.enum(["blocked", "unblocked"]).optional(),
  sortBy: z
    .enum(["createdAt", "dueDate", "priority", "status", "name"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const CreateInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  status: StatusEnum.default("not_started"),
  priority: PriorityEnum.default("medium"),
  schedule: ScheduleEnum.default("none"),
  customIntervalDays: z.number().int().positive().optional(),
  monthlyRepeatMode: MonthlyRepeatModeEnum.nullable().optional(),
  dependencyIds: z.array(z.string().uuid()).default([]),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: StatusEnum.optional(),
  priority: PriorityEnum.optional(),
  schedule: ScheduleEnum.optional(),
  customIntervalDays: z.number().int().positive().nullable().optional(),
  monthlyRepeatMode: MonthlyRepeatModeEnum.nullable().optional(),
});

/**
 * One notification yielded by the `todo.changed` subscription whenever a
 * `todo` or `todo_dependency` row is mutated through the API.
 *
 * Routed as GET so the oRPC RPC link streams it over SSE.
 */
export const TodoChangeEventSchema = z.object({
  action: z.enum([
    "created",
    "updated",
    "deleted",
    "dependency.added",
    "dependency.removed",
  ]),
  todoId: z.string().uuid(),
  dependsOnId: z.string().uuid().optional(),
});

export const ListOutput = z.object({
  items: z.array(TodoSchema),
  meta: PageMeta,
});

export const SuccessOutput = z.object({ success: z.boolean() });

export const apiContract = {
  auth: {
    register: oc
      .route({
        method: "POST",
        path: "/auth/register",
        tags: ["Auth"],
        summary: "Register a new account",
        description:
          "Creates a new user and returns a JWT token for subsequent requests.",
      })
      .input(
        z.object({ email: z.string().email(), password: z.string().min(8) }),
      )
      .output(TokenOutput),
    login: oc
      .route({
        method: "POST",
        path: "/auth/login",
        tags: ["Auth"],
        summary: "Login and receive a JWT",
        description:
          "Authenticates a user with email and password, returning a JWT token.",
      })
      .input(
        z.object({ email: z.string().email(), password: z.string().min(1) }),
      )
      .output(TokenOutput),
  },
  todo: {
    list: oc
      .route({
        method: "GET",
        path: "/todos",
        tags: ["Todos"],
        summary: "List todos with filtering, sorting, and pagination",
      })
      .input(ListInput)
      .output(ListOutput),
    get: oc
      .route({
        method: "GET",
        path: "/todos/{id}",
        tags: ["Todos"],
        summary: "Get a single todo by ID",
      })
      .input(z.object({ id: z.string().uuid() }))
      .output(TodoSchema),
    create: oc
      .route({
        method: "POST",
        path: "/todos",
        tags: ["Todos"],
        summary: "Create a new todo",
      })
      .input(CreateInput)
      .output(TodoSchema),
    update: oc
      .route({
        method: "PATCH",
        path: "/todos/{id}",
        tags: ["Todos"],
        summary: "Update an existing todo",
      })
      .input(UpdateInput)
      .output(TodoSchema),
    delete: oc
      .route({
        method: "DELETE",
        path: "/todos/{id}",
        tags: ["Todos"],
        summary: "Soft-delete a todo",
      })
      .input(z.object({ id: z.string().uuid() }))
      .output(SuccessOutput),
    addDependency: oc
      .route({
        method: "POST",
        path: "/todos/{taskId}/dependencies/{dependsOnId}",
        tags: ["Dependencies"],
        summary: "Add a dependency to a todo",
      })
      .input(
        z.object({
          taskId: z.string().uuid(),
          dependsOnId: z.string().uuid(),
        }),
      )
      .output(SuccessOutput),
    removeDependency: oc
      .route({
        method: "DELETE",
        path: "/todos/{taskId}/dependencies/{dependsOnId}",
        tags: ["Dependencies"],
        summary: "Remove a dependency from a todo",
      })
      .input(
        z.object({
          taskId: z.string().uuid(),
          dependsOnId: z.string().uuid(),
        }),
      )
      .output(SuccessOutput),
    // Real-time subscription: yields a TodoChangeEvent on every todo /
    // todo_dependency mutation. GET + eventIterator → streamed as SSE.
    changed: oc
      .route({
        method: "GET",
        path: "/todos/changed",
        tags: ["Todos"],
        summary: "Subscribe to todo change events (SSE stream)",
        description:
          "Server-Sent Events stream that emits a notification whenever a " +
          "todo or todo dependency is created, updated, or deleted.",
      })
      .output(eventIterator(TodoChangeEventSchema)),
  },
};
