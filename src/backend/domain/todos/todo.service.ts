import { canTransition } from "../../lib/state-machine";
import type { Status } from "../../lib/state-machine";
import { computeNextDueDate, type MonthlyRepeatMode } from "../../lib/recurrence";
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
  monthlyRepeatMode?: MonthlyRepeatMode | null;
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
      monthlyRepeatMode: todo.monthlyRepeatMode,
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
        monthlyRepeatMode: input.monthlyRepeatMode ?? null,
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

        // Edge Case Demo 5 fix: prevent reversing a completed prerequisite
        // when a dependent task has already advanced beyond "Not Started".
        // Reversing would re-evaluate the dependent's computed "Blocked" flag
        // and silently invalidate an active/terminal state (e.g. a task that
        // is simultaneously Completed and Blocked). The dependent must be moved
        // back to "Not Started" first. This is a cross-task domain guard, so it
        // lives here rather than in the pure single-task state machine.
        if (todo.status === "completed" && patch.status !== "completed") {
          const hasActiveDependent =
            await todoRepo.hasDependentBeyondNotStarted(id);
          if (hasActiveDependent) {
            badRequest(
              "Cannot change this task's status: it is a completed dependency of " +
                "tasks that have already started. Move those dependent tasks back " +
                "to 'Not Started' first.",
            );
          }
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
      if (patch.monthlyRepeatMode !== undefined)
        updates.monthlyRepeatMode = patch.monthlyRepeatMode;

      // Recurrence orchestration on transition to completed
      if (patch.status === "completed" && todo.status !== "completed") {
        const now = new Date();
        updates.completedAt = now;
        if (todo.schedule !== "none") {
          // Determine whether the existing nextOccurrenceId is still "live".
          // A soft-deleted (or missing) occurrence must be treated as if the
          // slot is empty, so that completion regenerates a fresh occurrence
          // instead of silently doing nothing. This preserves the Q9
          // no-duplicate rule for *live* occurrences while fixing the case
          // where the user deletes the generated task.
          let occurrenceLive = false;
          if (todo.nextOccurrenceId) {
            const existing = await todoRepo.findById(
              String(todo.nextOccurrenceId),
            );
            occurrenceLive = !!existing && !existing.isDeleted;
          }
          if (!occurrenceLive) {
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
                  todo.monthlyRepeatMode,
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
              monthlyRepeatMode: todo.monthlyRepeatMode,
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
