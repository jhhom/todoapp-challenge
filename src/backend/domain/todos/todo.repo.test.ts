import { describe, it, expect, beforeEach } from "vitest";
import { database } from "../../db";
import { createTodoRepo } from "./todo.repo";

async function seedUser() {
  return database
    .insertInto("appUser")
    .values({
      email: `t-${Date.now()}-${Math.random()}@x.com`,
      passwordHash: "x",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function seedTodo(
  userId: string,
  name: string,
  status: "not_started" | "completed" = "not_started",
) {
  return database
    .insertInto("todo")
    .values({
      name,
      status,
      priority: "medium",
      schedule: "none",
      createdBy: userId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

describe("todoRepo", () => {
  beforeEach(async () => {
    await database.deleteFrom("todoDependency").execute();
    await database.deleteFrom("todo").execute();
    await database.deleteFrom("appUser").execute();
  });

  it("lists paginated items", async () => {
    const user = await seedUser();
    const repo = createTodoRepo(database);
    for (let i = 0; i < 3; i++) await seedTodo(String(user.id), `T${i}`);
    const { items, total } = await repo.list({
      page: 1,
      pageSize: 2,
      sortOrder: "asc",
    });
    expect(items.length).toBe(2);
    expect(total).toBe(3);
  });

  it("excludes soft-deleted rows", async () => {
    const user = await seedUser();
    const repo = createTodoRepo(database);
    const a = await seedTodo(String(user.id), "A");
    await seedTodo(String(user.id), "B");
    await repo.softDelete(String(a.id));
    const { items, total } = await repo.list({
      page: 1,
      pageSize: 50,
      sortOrder: "asc",
    });
    expect(total).toBe(1);
    expect(items[0].name).toBe("B");
  });

  it("filters by status", async () => {
    const user = await seedUser();
    const repo = createTodoRepo(database);
    await seedTodo(String(user.id), "A", "completed");
    await seedTodo(String(user.id), "B", "not_started");
    const { items } = await repo.list({
      page: 1,
      pageSize: 50,
      status: "completed",
      sortOrder: "asc",
    });
    expect(items.length).toBe(1);
    expect(items[0].name).toBe("A");
  });

  it("filters blocked/unblocked", async () => {
    const user = await seedUser();
    const repo = createTodoRepo(database);
    const prereq = await seedTodo(String(user.id), "P");
    const task = await seedTodo(String(user.id), "T");
    await database
      .insertInto("todoDependency")
      .values({ taskId: task.id, dependsOnTaskId: prereq.id })
      .execute();

    const blocked = await repo.list({
      page: 1,
      pageSize: 50,
      blocked: "blocked",
      sortOrder: "asc",
    });
    expect(blocked.items.map((i) => i.name)).toEqual(["T"]);

    const unblocked = await repo.list({
      page: 1,
      pageSize: 50,
      blocked: "unblocked",
      sortOrder: "asc",
    });
    expect(unblocked.items.map((i) => i.name)).toEqual(["P"]);
  });

  it("isBlocked reflects unfinished prerequisites", async () => {
    const user = await seedUser();
    const repo = createTodoRepo(database);
    const prereq = await seedTodo(String(user.id), "P");
    const task = await seedTodo(String(user.id), "T");
    await database
      .insertInto("todoDependency")
      .values({ taskId: task.id, dependsOnTaskId: prereq.id })
      .execute();
    expect(await repo.isBlocked(String(task.id))).toBe(true);
    expect(await repo.isBlocked(String(prereq.id))).toBe(false);
  });

  it("dependenciesOf returns live (non-deleted) dependencies", async () => {
    const user = await seedUser();
    const repo = createTodoRepo(database);
    const prereq = await seedTodo(String(user.id), "P");
    const task = await seedTodo(String(user.id), "T");
    await database
      .insertInto("todoDependency")
      .values({ taskId: task.id, dependsOnTaskId: prereq.id })
      .execute();
    const deps = await repo.dependenciesOf(String(task.id));
    expect(deps).toEqual([String(prereq.id)]);
  });

  it("dependenciesOf excludes soft-deleted dependencies", async () => {
    const user = await seedUser();
    const repo = createTodoRepo(database);
    const prereq = await seedTodo(String(user.id), "P");
    const task = await seedTodo(String(user.id), "T");
    await database
      .insertInto("todoDependency")
      .values({ taskId: task.id, dependsOnTaskId: prereq.id })
      .execute();
    // Soft-delete the prerequisite; the edge should no longer surface.
    await repo.softDelete(String(prereq.id));
    const deps = await repo.dependenciesOf(String(task.id));
    expect(deps).toEqual([]);
  });
});
