import { implement } from "@orpc/server";
import { apiContract } from "../shared/api";
import { database } from "./db";
import type { ServerContext } from "./context";
import { todoPublisher, publishTodoChange } from "./lib/events";
import { createUserRepo } from "./domain/auth/auth.repo";
import { createAuthService } from "./domain/auth/auth.service";
import { createTodoRepo } from "./domain/todos/todo.repo";
import { createTodoService } from "./domain/todos/todo.service";
import { createDependencyRepo } from "./domain/dependencies/dependency.repo";
import { createDependencyService } from "./domain/dependencies/dependency.service";
import { requireAuth } from "./middleware/auth";

export const os = implement(apiContract).$context<ServerContext>();

const userRepo = createUserRepo(database);
const authService = createAuthService(userRepo);
const dependencyRepo = createDependencyRepo(database);
const dependencyService = createDependencyService(
  dependencyRepo,
  publishTodoChange,
);
const todoRepo = createTodoRepo(database);
const todoService = createTodoService({
  todoRepo,
  dependencyService,
  userRepo,
  publish: publishTodoChange,
});

export const router = os.router({
  auth: {
    register: os.auth.register.handler(async ({ input }) =>
      authService.register(input.email, input.password),
    ),
    login: os.auth.login.handler(async ({ input }) =>
      authService.login(input.email, input.password),
    ),
  },
  todo: {
    list: os.todo.list
      .use(requireAuth)
      .handler(async ({ input }) => todoService.list(input)),
    get: os.todo.get
      .use(requireAuth)
      .handler(async ({ input }) => todoService.get(input.id)),
    create: os.todo.create
      .use(requireAuth)
      .handler(async ({ input, context }) =>
        todoService.create({ ...input, createdBy: context.user.sub }),
      ),
    update: os.todo.update
      .use(requireAuth)
      .handler(async ({ input }) => todoService.update(input.id, input)),
    delete: os.todo.delete
      .use(requireAuth)
      .handler(async ({ input }) => todoService.softDelete(input.id)),
    addDependency: os.todo.addDependency
      .use(requireAuth)
      .handler(async ({ input }) =>
        todoService.addDependency(input.taskId, input.dependsOnId),
      ),
    removeDependency: os.todo.removeDependency
      .use(requireAuth)
      .handler(async ({ input }) =>
        todoService.removeDependency(input.taskId, input.dependsOnId),
      ),
    // Streaming subscription: forwards every `todo:changed` event to the
    // client over SSE. The abort signal from the request lifecycle is passed
    // through so the iterator (and the underlying connection) closes when the
    // client disconnects.
    changed: os.todo.changed
      .use(requireAuth)
      .handler(async ({ signal }) =>
        todoPublisher.subscribe("todo:changed", { signal }),
      ),
  },
});
