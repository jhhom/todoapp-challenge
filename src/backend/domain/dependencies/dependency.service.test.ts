import { describe, it, expect, beforeEach } from "vitest";
import { database } from "../../db";
import type { Status } from "../../lib/state-machine";
import { createDependencyRepo } from "./dependency.repo";
import { createDependencyService } from "./dependency.service";

async function seedUser() {
  return database
    .insertInto("appUser")
    .values({
      email: `d-${Date.now()}-${Math.random()}@x.com`,
      passwordHash: "x",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
async function seedTodo(userId: string, name: string) {
  return database
    .insertInto("todo")
    .values({
      name,
      status: "not_started",
      priority: "medium",
      schedule: "none",
      createdBy: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function setStatus(id: string, status: Status) {
  await database
    .updateTable("todo")
    .set({ status })
    .where("id", "=", id)
    .execute();
}

describe("dependencyService", () => {
  beforeEach(async () => {
    await database.deleteFrom("todoDependency").execute();
    await database.deleteFrom("todo").execute();
    await database.deleteFrom("appUser").execute();
  });

  it("adds a dependency that does not create a cycle", async () => {
    const user = await seedUser();
    const a = await seedTodo(String(user.id), "A");
    const b = await seedTodo(String(user.id), "B");
    const svc = createDependencyService(createDependencyRepo(database));
    const result = await svc.add(String(b.id), String(a.id));
    expect(result.success).toBe(true);
  });

  it("rejects a dependency that would create a cycle", async () => {
    const user = await seedUser();
    const a = await seedTodo(String(user.id), "A");
    const b = await seedTodo(String(user.id), "B");
    const svc = createDependencyService(createDependencyRepo(database));
    await svc.add(String(b.id), String(a.id)); // B depends on A
    await expect(svc.add(String(a.id), String(b.id))).rejects.toThrow();
  });

  it("allows adding a completed dependency to an in_progress task", async () => {
    const user = await seedUser();
    const parent = await seedTodo(String(user.id), "Parent");
    const dep = await seedTodo(String(user.id), "Dep");
    await setStatus(String(dep.id), "completed");
    await setStatus(String(parent.id), "in_progress");
    const svc = createDependencyService(createDependencyRepo(database));
    const result = await svc.add(String(parent.id), String(dep.id));
    expect(result.success).toBe(true);
  });

  it("rejects an incomplete dependency on an in_progress task", async () => {
    const user = await seedUser();
    const parent = await seedTodo(String(user.id), "Parent");
    const dep = await seedTodo(String(user.id), "Dep"); // not_started
    await setStatus(String(parent.id), "in_progress");
    const svc = createDependencyService(createDependencyRepo(database));
    await expect(svc.add(String(parent.id), String(dep.id))).rejects.toThrow();
  });

  it("rejects an in_progress dependency on a completed task", async () => {
    const user = await seedUser();
    const parent = await seedTodo(String(user.id), "Parent");
    const dep = await seedTodo(String(user.id), "Dep");
    await setStatus(String(parent.id), "completed");
    await setStatus(String(dep.id), "in_progress");
    const svc = createDependencyService(createDependencyRepo(database));
    await expect(svc.add(String(parent.id), String(dep.id))).rejects.toThrow();
  });

  it("allows adding any dependency to a not_started task", async () => {
    const user = await seedUser();
    const parent = await seedTodo(String(user.id), "Parent");
    const dep = await seedTodo(String(user.id), "Dep"); // not_started
    const svc = createDependencyService(createDependencyRepo(database));
    const result = await svc.add(String(parent.id), String(dep.id));
    expect(result.success).toBe(true);
  });

  it("removes a dependency", async () => {
    const user = await seedUser();
    const a = await seedTodo(String(user.id), "A");
    const b = await seedTodo(String(user.id), "B");
    const repo = createDependencyRepo(database);
    const svc = createDependencyService(repo);
    await svc.add(String(b.id), String(a.id));
    await svc.remove(String(b.id), String(a.id));
    const adj = await repo.adjacency();
    expect(adj.size).toBe(0);
  });
});
