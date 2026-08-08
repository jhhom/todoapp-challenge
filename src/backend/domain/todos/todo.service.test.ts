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
});
