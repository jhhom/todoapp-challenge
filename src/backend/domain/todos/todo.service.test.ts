import { describe, it, expect, beforeEach } from "vitest";
import { database } from "../../db";
import { createTodoRepo } from "./todo.repo";
import { createTodoService } from "./todo.service";
import { createDependencyService } from "../dependencies/dependency.service";
import { createDependencyRepo } from "../dependencies/dependency.repo";
import { createUserRepo } from "../auth/auth.repo";

async function seedUser() {
  return database
    .insertInto("appUser")
    .values({
      email: `s-${Date.now()}-${Math.random()}@x.com`,
      passwordHash: "x",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

function makeService() {
  const todoRepo = createTodoRepo(database);
  const dependencyRepo = createDependencyRepo(database);
  const dependencyService = createDependencyService(dependencyRepo);
  const userRepo = createUserRepo(database);
  return createTodoService({ todoRepo, dependencyService, userRepo });
}

describe("todoService", () => {
  beforeEach(async () => {
    await database.deleteFrom("todoDependency").execute();
    await database.deleteFrom("todo").execute();
    await database.deleteFrom("appUser").execute();
  });

  it("creates and fetches a todo", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "My task",
      createdBy: String(user.id),
      schedule: "none",
      priority: "high",
    });
    const fetched = await svc.get(created.id);
    expect(fetched.name).toBe("My task");
    expect(fetched.priority).toBe("high");
  });

  it("generates next occurrence on completion of a recurring task", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Daily standup",
      createdBy: String(user.id),
      schedule: "daily",
      priority: "medium",
    });
    const completed = await svc.update(created.id, { status: "completed" });
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).not.toBeNull();
    expect(completed.nextOccurrenceId).not.toBeNull();
  });

  it("carries over a null due date to the next occurrence (Q4)", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Daily, no due date",
      createdBy: String(user.id),
      schedule: "daily",
      priority: "medium",
      // No dueDate: the next occurrence must also have a null due date.
    });
    expect(created.dueDate).toBeNull();
    const completed = await svc.update(created.id, { status: "completed" });
    expect(completed.nextOccurrenceId).not.toBeNull();
    const next = await svc.get(completed.nextOccurrenceId!);
    expect(next.dueDate).toBeNull();
  });

  it("anchors the next due date on the previous due date (Q6)", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Daily, future due date",
      createdBy: String(user.id),
      schedule: "daily",
      priority: "medium",
      // A future due date (not overdue) -> next due = dueDate + 1 day,
      // independent of completedAt. 2099 keeps it future-dated (no catch-up)
      // so the assertion is deterministic and clock-independent.
      dueDate: "2099-01-10T00:00:00Z",
    });
    const completed = await svc.update(created.id, { status: "completed" });
    expect(completed.nextOccurrenceId).not.toBeNull();
    const next = await svc.get(completed.nextOccurrenceId!);
    // Due-date-anchored: next due is exactly dueDate + 1 day. toISOString()
    // always emits milliseconds, so the expected string includes .000Z.
    expect(next.dueDate).toBe("2099-01-11T00:00:00.000Z");
  });

  it("catches up an overdue recurring task to the next future slot (Q6)", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Overdue daily",
      createdBy: String(user.id),
      schedule: "daily",
      priority: "medium",
      dueDate: "2000-01-01T00:00:00Z", // far in the past -> triggers catch-up
    });
    const completed = await svc.update(created.id, { status: "completed" });
    const next = await svc.get(completed.nextOccurrenceId!);

    const nextDue = new Date(next.dueDate!);
    const completedAt = new Date(completed.completedAt!);
    const anchor = new Date(created.dueDate as string);
    const dayMs = 24 * 60 * 60 * 1000;

    // Catch-up: the next due date is strictly in the future…
    expect(nextDue.getTime()).toBeGreaterThan(completedAt.getTime());
    // …and it stays on the original daily grid (whole days from the anchor),
    // which is the defining property of due-date-anchored recurrence.
    expect((nextDue.getTime() - anchor.getTime()) % dayMs).toBe(0);
  });

  it("does not spawn a duplicate when re-completing after reversal", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Weekly",
      createdBy: String(user.id),
      schedule: "weekly",
      priority: "medium",
    });
    const completed = await svc.update(created.id, { status: "completed" });
    const firstOccurrence = completed.nextOccurrenceId;
    // reverse to in_progress
    await svc.update(created.id, { status: "in_progress" });
    // complete again
    const recompleted = await svc.update(created.id, { status: "completed" });
    expect(recompleted.nextOccurrenceId).toBe(firstOccurrence);
  });

  it("regenerates the next occurrence when the generated task is soft-deleted then re-completed", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Daily",
      createdBy: String(user.id),
      schedule: "daily",
      priority: "medium",
    });
    // Complete -> generates first occurrence.
    const completed = await svc.update(created.id, { status: "completed" });
    const firstOccurrence = completed.nextOccurrenceId!;
    expect(firstOccurrence).not.toBeNull();

    // User soft-deletes the generated recurring task.
    await svc.softDelete(firstOccurrence);

    // Reverse the parent back to in_progress, then complete again.
    await svc.update(created.id, { status: "in_progress" });
    const recompleted = await svc.update(created.id, { status: "completed" });

    // A NEW occurrence must be generated, distinct from the deleted one.
    expect(recompleted.nextOccurrenceId).not.toBeNull();
    expect(recompleted.nextOccurrenceId).not.toBe(firstOccurrence);
    // The new occurrence must be live (fetchable).
    const regenerated = await svc.get(recompleted.nextOccurrenceId!);
    expect(regenerated.name).toBe("Daily");
    expect(regenerated.schedule).toBe("daily");
  });

  it("allows reversing in_progress/completed directly back to not_started", async () => {
    const user = await seedUser();
    const svc = makeService();
    const created = await svc.create({
      name: "Task",
      createdBy: String(user.id),
      schedule: "none",
      priority: "medium",
    });
    const started = await svc.update(created.id, { status: "in_progress" });
    const reversed = await svc.update(started.id, { status: "not_started" });
    expect(reversed.status).toBe("not_started");

    // completed -> not_started should also be a legal, direct reversal.
    const completed = await svc.update(created.id, { status: "completed" });
    expect(completed.completedAt).not.toBeNull();
    const fromCompleted = await svc.update(completed.id, {
      status: "not_started",
    });
    expect(fromCompleted.status).toBe("not_started");
    // completedAt is retained as history (Q9 behaviour), not cleared.
    expect(fromCompleted.completedAt).not.toBeNull();
  });

  it("enables the Q1 workflow: reverse to not_started, then add an incomplete dependency", async () => {
    const user = await seedUser();
    const svc = makeService();
    const parent = await svc.create({
      name: "Parent",
      createdBy: String(user.id),
      schedule: "none",
      priority: "medium",
    });
    const prereq = await svc.create({
      name: "Prereq",
      createdBy: String(user.id),
      schedule: "none",
      priority: "medium",
    });
    // Parent is in_progress; adding the incomplete prereq must be rejected.
    await svc.update(parent.id, { status: "in_progress" });
    await expect(svc.addDependency(parent.id, prereq.id)).rejects.toThrow();

    // Reverse parent to not_started, then the incomplete dependency is allowed.
    await svc.update(parent.id, { status: "not_started" });
    const result = await svc.addDependency(parent.id, prereq.id);
    expect(result.success).toBe(true);
  });

  it("blocks moving a blocked task to in_progress", async () => {
    const user = await seedUser();
    const svc = makeService();
    const prereq = await svc.create({
      name: "Prereq",
      createdBy: String(user.id),
      schedule: "none",
      priority: "medium",
    });
    const task = await svc.create({
      name: "Task",
      createdBy: String(user.id),
      schedule: "none",
      priority: "medium",
    });
    await svc.addDependency(task.id, prereq.id);
    await expect(
      svc.update(task.id, { status: "in_progress" }),
    ).rejects.toThrow();
  });

  it("hides soft-deleted tasks from the dependencies list", async () => {
    const user = await seedUser();
    const svc = makeService();
    const prereq = await svc.create({
      name: "Prereq",
      createdBy: String(user.id),
      schedule: "none",
      priority: "medium",
    });
    const task = await svc.create({
      name: "Task",
      createdBy: String(user.id),
      schedule: "none",
      priority: "medium",
    });
    await svc.addDependency(task.id, prereq.id);
    // Soft-delete the prerequisite.
    await svc.softDelete(prereq.id);

    const dto = await svc.get(task.id);
    expect(dto.dependencies).toEqual([]);
  });

  it("allows a blocked task to be archived", async () => {
    const user = await seedUser();
    const svc = makeService();
    const prereq = await svc.create({
      name: "Prereq",
      createdBy: String(user.id),
      schedule: "none",
      priority: "medium",
    });
    const task = await svc.create({
      name: "Task",
      createdBy: String(user.id),
      schedule: "none",
      priority: "medium",
    });
    await svc.addDependency(task.id, prereq.id);
    const archived = await svc.update(task.id, { status: "archived" });
    expect(archived.status).toBe("archived");
  });

  describe("Edge Case Demo 5: reversing a completed prerequisite with an active dependent", () => {
    /** Seeds prerequisite A + dependent B (B depends on A) with A completed. */
    async function seedPrereqAndDependent() {
      const user = await seedUser();
      const svc = makeService();
      const prereq = await svc.create({
        name: "Task A (prerequisite)",
        createdBy: String(user.id),
        schedule: "none",
        priority: "medium",
      });
      const dependent = await svc.create({
        name: "Task B (depends on A)",
        createdBy: String(user.id),
        schedule: "none",
        priority: "medium",
      });
      // B depends on A; A must be completed before B can progress.
      await svc.addDependency(dependent.id, prereq.id);
      await svc.update(prereq.id, { status: "completed" });
      return { svc, prereq, dependent };
    }

    it("rejects reversing a completed prerequisite when the dependent is completed", async () => {
      const { svc, prereq, dependent } = await seedPrereqAndDependent();
      await svc.update(dependent.id, { status: "completed" });
      // Reversing A back to not_started must be blocked (the Demo 5 scenario).
      await expect(
        svc.update(prereq.id, { status: "not_started" }),
      ).rejects.toThrow(/completed dependency/);
    });

    it("rejects reversing a completed prerequisite when the dependent is in_progress", async () => {
      const { svc, prereq, dependent } = await seedPrereqAndDependent();
      await svc.update(dependent.id, { status: "in_progress" });
      await expect(
        svc.update(prereq.id, { status: "in_progress" }),
      ).rejects.toThrow(/completed dependency/);
    });

    it("rejects reversing a completed prerequisite when the dependent is archived", async () => {
      const { svc, prereq, dependent } = await seedPrereqAndDependent();
      await svc.update(dependent.id, { status: "archived" });
      await expect(
        svc.update(prereq.id, { status: "not_started" }),
      ).rejects.toThrow(/completed dependency/);
    });

    it("allows reversing when the dependent is still not_started (escape hatch)", async () => {
      const { svc, prereq, dependent } = await seedPrereqAndDependent();
      // Dependent never progressed past not_started -> reversal is safe.
      expect(dependent.status).toBe("not_started");
      const reversed = await svc.update(prereq.id, { status: "not_started" });
      expect(reversed.status).toBe("not_started");
    });

    it("allows reversing a completed task that has no dependents", async () => {
      const user = await seedUser();
      const svc = makeService();
      const standalone = await svc.create({
        name: "Standalone",
        createdBy: String(user.id),
        schedule: "none",
        priority: "medium",
      });
      await svc.update(standalone.id, { status: "completed" });
      const reversed = await svc.update(standalone.id, {
        status: "not_started",
      });
      expect(reversed.status).toBe("not_started");
    });

    it("rejects when any one of several dependents has progressed", async () => {
      const user = await seedUser();
      const svc = makeService();
      const prereq = await svc.create({
        name: "Task A",
        createdBy: String(user.id),
        schedule: "none",
        priority: "medium",
      });
      const b = await svc.create({
        name: "Task B (not_started)",
        createdBy: String(user.id),
        schedule: "none",
        priority: "medium",
      });
      const c = await svc.create({
        name: "Task C (completed)",
        createdBy: String(user.id),
        schedule: "none",
        priority: "medium",
      });
      await svc.addDependency(b.id, prereq.id);
      await svc.addDependency(c.id, prereq.id);
      await svc.update(prereq.id, { status: "completed" });
      // B stays not_started, but C completes -> reversing A must be blocked.
      await svc.update(c.id, { status: "completed" });
      await expect(
        svc.update(prereq.id, { status: "in_progress" }),
      ).rejects.toThrow(/completed dependency/);
    });
  });
});
