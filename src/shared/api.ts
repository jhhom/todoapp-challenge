import { oc } from "@orpc/contract";
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

export const TodoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  dueDate: z.string().datetime().nullable(),
  status: StatusEnum,
  priority: PriorityEnum,
  schedule: ScheduleEnum,
  customIntervalDays: z.number().int().positive().nullable(),
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

const TokenOutput = z.object({
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
});

export const apiContract = {
  auth: {
    register: oc
      .input(
        z.object({ email: z.string().email(), password: z.string().min(8) }),
      )
      .output(TokenOutput),
    login: oc
      .input(
        z.object({ email: z.string().email(), password: z.string().min(1) }),
      )
      .output(TokenOutput),
  },
  todo: {
    list: oc
      .input(ListInput)
      .output(z.object({ items: z.array(TodoSchema), meta: PageMeta })),
    get: oc.input(z.object({ id: z.string().uuid() })).output(TodoSchema),
    create: oc.input(CreateInput).output(TodoSchema),
    update: oc.input(UpdateInput).output(TodoSchema),
    delete: oc
      .input(z.object({ id: z.string().uuid() }))
      .output(z.object({ success: z.boolean() })),
    addDependency: oc
      .input(
        z.object({
          taskId: z.string().uuid(),
          dependsOnId: z.string().uuid(),
        }),
      )
      .output(z.object({ success: z.boolean() })),
    removeDependency: oc
      .input(
        z.object({
          taskId: z.string().uuid(),
          dependsOnId: z.string().uuid(),
        }),
      )
      .output(z.object({ success: z.boolean() })),
  },
};
