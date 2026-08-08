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

  it("deletes the todo", async () => {
    const todoRepo = createTodoRepo(database);
    const dependencyRepo = createDependencyRepo(database);
    const dependencyService = createDependencyService(dependencyRepo);
    const userRepo = createUserRepo(database);
    const todoService = createTodoService({
      todoRepo,
      dependencyService,
      userRepo,
    });

    const result = await todoService.softDelete(
      "7ac744e5-2e13-4afa-91f0-7d7137e80b04",
    );
    console.log(result);
  });
});
