import { describe, it, expect, beforeEach } from "vitest";
import { database } from "../../db";
import { createTodoRepo } from "./todo.repo";
import { createTodoService } from "./todo.service";
import { createDependencyService } from "../dependencies/dependency.service";
import { createDependencyRepo } from "../dependencies/dependency.repo";

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
  return createTodoService({ todoRepo, dependencyService });
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
