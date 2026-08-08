import { canTransition } from "../../lib/state-machine";
import type { Status } from "../../lib/state-machine";
import { computeNextDueDate } from "../../lib/recurrence";
import { badRequest, notFound } from "../../lib/errors";
import type { PublishTodoChange } from "../../lib/events";
import type { TodoRepo, TodoRow } from "./todo.repo";
import type { DependencyService } from "../dependencies/dependency.service";
import type { UserRepo } from "../auth/auth.repo";

type CreateInput = {
  name: string;
  description?: string;
  dueDate?: string;
  status?: Status;
  priority?: "low" | "medium" | "high";
  schedule?: "none" | "daily" | "weekly" | "monthly" | "custom";
  customIntervalDays?: number;
  createdBy: string;
  dependencyIds?: string[];
};

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function createTodoService(deps: {
  todoRepo: TodoRepo;
  dependencyService: DependencyService;
  userRepo: UserRepo;
  publish?: PublishTodoChange;
}) {
  const { todoRepo, dependencyService, userRepo, publish = () => {} } = deps;

  async function toDto(todo: TodoRow) {
    const creator = await userRepo.findById(String(todo.createdBy));
    return {
      id: String(todo.id),
      name: todo.name,
      description: todo.description,
      dueDate: toIso(todo.dueDate),
      status: todo.status as Status,
      priority: todo.priority as "low" | "medium" | "high",
      schedule: todo.schedule as
        | "none"
        | "daily"
        | "weekly"
        | "monthly"
        | "custom",
      customIntervalDays: todo.customIntervalDays,
      nextOccurrenceId: todo.nextOccurrenceId
        ? String(todo.nextOccurrenceId)
        : null,
      createdBy: String(todo.createdBy),
      createdByEmail: creator?.email ?? null,
      createdAt: todo.createdAt.toISOString(),
      completedAt: toIso(todo.completedAt),
      updatedAt: todo.updatedAt.toISOString(),
      isBlocked: await todoRepo.isBlocked(String(todo.id)),
      dependencies: await todoRepo.dependenciesOf(String(todo.id)),
    };
  }

  return {
    toDto,

    async list(input: {
      page: number;
      pageSize: number;
      status?: Status;
      priority?: "low" | "medium" | "high";
      dueBefore?: string;
      dueAfter?: string;
      blocked?: "blocked" | "unblocked";
      sortBy?: "createdAt" | "dueDate" | "priority" | "status" | "name";
      sortOrder: "asc" | "desc";
    }) {
      const { items, total } = await todoRepo.list(input);
      const dtoItems = await Promise.all(items.map(toDto));
      const pageSize = input.pageSize;
      return {
        items: dtoItems,
        meta: {
          total,
          page: input.page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    },

    async get(id: string) {
      const todo = await todoRepo.findById(id);
      if (!todo || todo.isDeleted) notFound("Todo not found");
      return toDto(todo!);
    },

    async create(input: CreateInput) {
      if (
        input.schedule === "custom" &&
        (!input.customIntervalDays || input.customIntervalDays <= 0)
      ) {
        badRequest("customIntervalDays is required when schedule is 'custom'");
      }
      const todo = await todoRepo.insert({
        name: input.name,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        status: (input.status ?? "not_started") as Status,
        priority: (input.priority ?? "medium") as "low" | "medium" | "high",
        schedule: (input.schedule ?? "none") as never,
        customIntervalDays: input.customIntervalDays ?? null,
        createdBy: input.createdBy,
      });
      for (const depId of input.dependencyIds ?? []) {
        await dependencyService.add(String(todo.id), depId);
      }
      publish({ action: "created", todoId: String(todo.id) });
      return toDto(todo);
    },

    async update(id: string, patch: Record<string, unknown>) {
      const todo = await todoRepo.findById(id);
      if (!todo || todo.isDeleted) notFound("Todo not found");

      // Status transition validation
      if (patch.status && patch.status !== todo.status) {
        const isBlocked = await todoRepo.isBlocked(id);
        if (
          !canTransition(
            todo.status as Status,
            patch.status as Status,
            isBlocked,
          )
        ) {
          badRequest(
            isBlocked
              ? "Task is blocked by unfinished dependencies"
              : "Invalid status transition",
          );
        }
      }

      const updates: Record<string, unknown> = {};
      if (patch.name !== undefined) updates.name = patch.name;
      if (patch.description !== undefined)
        updates.description = patch.description;
      if (patch.dueDate !== undefined) {
        updates.dueDate =
          patch.dueDate === null ? null : new Date(patch.dueDate as string);
      }
      if (patch.priority !== undefined) updates.priority = patch.priority;
      if (patch.schedule !== undefined) updates.schedule = patch.schedule;
      if (patch.customIntervalDays !== undefined)
        updates.customIntervalDays = patch.customIntervalDays;

      // Recurrence orchestration on transition to completed
      if (patch.status === "completed" && todo.status !== "completed") {
        const now = new Date();
        updates.completedAt = now;
        if (todo.schedule !== "none" && !todo.nextOccurrenceId) {
          // Q6: anchor on the completed task's own due date and skip ahead
          // (catch-up) until the next slot is strictly after completion. A
          // task with no due date still produces a next occurrence with no
          // due date (Q4 null carryover).
          const nextDue = todo.dueDate
            ? computeNextDueDate(
                todo.schedule as never,
                todo.customIntervalDays,
                todo.dueDate,
                now,
              )
            : null;
          const clone = await todoRepo.insert({
            name: todo.name,
            description: todo.description,
            dueDate: nextDue,
            status: "not_started",
            priority: todo.priority,
            schedule: todo.schedule,
            customIntervalDays: todo.customIntervalDays,
            createdBy: todo.createdBy,
          });
          updates.nextOccurrenceId = clone.id;
          // The recurring clone is a new todo the UI should learn about.
          publish({ action: "created", todoId: String(clone.id) });
          // Copy only recurring dependencies (Q3); non-recurring deps are referenced,
          // not cloned.
          const depIds = await todoRepo.dependenciesOf(id);
          for (const depId of depIds) {
            const dep = await todoRepo.findById(depId);
            if (dep && dep.schedule !== "none") {
              await dependencyService.add(String(clone.id), depId);
            }
          }
        }
      }

      // Reversal (completed -> in_progress): do NOT clear nextOccurrenceId (Q9),
      // so re-completion cannot spawn a duplicate. completedAt retained as history.
      if (patch.status !== undefined) updates.status = patch.status;

      const updated = await todoRepo.update(id, updates);
      publish({ action: "updated", todoId: String(updated.id) });
      return toDto(updated);
    },

    async softDelete(id: string) {
      const todo = await todoRepo.findById(id);
      if (!todo || todo.isDeleted) notFound("Todo not found");
      await todoRepo.softDelete(id);
      publish({ action: "deleted", todoId: id });
      return { success: true };
    },

    async addDependency(taskId: string, dependsOnId: string) {
      return dependencyService.add(taskId, dependsOnId);
    },
    async removeDependency(taskId: string, dependsOnId: string) {
      return dependencyService.remove(taskId, dependsOnId);
    },
  };
}

export type TodoService = ReturnType<typeof createTodoService>;
