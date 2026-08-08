import { describe, it, expect } from "vitest";
import { database } from "./db";
import { createTodoRepo } from "./domain/todos/todo.repo";
import { createTodoService } from "./domain/todos/todo.service";
import { createDependencyRepo } from "./domain/dependencies/dependency.repo";
import { createDependencyService } from "./domain/dependencies/dependency.service";
import { createUserRepo } from "./domain/auth/auth.repo";

describe("database", () => {
  it("connects and returns a scalar", async () => {
    const result = await database.executeQuery({
      sql: "select 1 as one",
      parameters: [],
    } as never);
    expect(result.rows).toEqual([{ one: 1 }]);
  });

  it("soft-deletes a todo", async () => {
    const todoRepo = createTodoRepo(database);
    const dependencyRepo = createDependencyRepo(database);
    const dependencyService = createDependencyService(dependencyRepo);
    const userRepo = createUserRepo(database);
    const todoService = createTodoService({
      todoRepo,
      dependencyService,
      userRepo,
    });

    // Self-contained: create a user + todo, then delete it. No reliance on
    // seeded data or hardcoded IDs.
    const user = await database
      .insertInto("appUser")
      .values({
        email: `del-${Date.now()}-${Math.random()}@x.com`,
        passwordHash: "x",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const created = await todoService.create({
      name: "To be deleted",
      createdBy: String(user.id),
      schedule: "none",
      priority: "medium",
    });

    const result = await todoService.softDelete(created.id);
    expect(result).toEqual({ success: true });

    const refetched = await todoRepo.findById(created.id);
    expect(refetched?.isDeleted).toBe(true);
  });
});
