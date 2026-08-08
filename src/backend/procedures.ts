import { implement } from "@orpc/server";
import { apiContract } from "../shared/api";
import { database } from "./db";
import type { ServerContext } from "./context";
import { createUserRepo } from "./domain/auth/auth.repo";
import { createAuthService } from "./domain/auth/auth.service";
import { requireAuth } from "./middleware/auth";

export const os = implement(apiContract).$context<ServerContext>();

const authService = createAuthService(createUserRepo(database));

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
    // Wired in Task 12 once todo/dependency services exist.
    list: os.todo.list.use(requireAuth).handler(async () => {
      throw new Error("todo.list not implemented");
    }),
    get: os.todo.get.use(requireAuth).handler(async () => {
      throw new Error("todo.get not implemented");
    }),
    create: os.todo.create.use(requireAuth).handler(async () => {
      throw new Error("todo.create not implemented");
    }),
    update: os.todo.update.use(requireAuth).handler(async () => {
      throw new Error("todo.update not implemented");
    }),
    delete: os.todo.delete.use(requireAuth).handler(async () => {
      throw new Error("todo.delete not implemented");
    }),
    addDependency: os.todo.addDependency.use(requireAuth).handler(async () => {
      throw new Error("todo.addDependency not implemented");
    }),
    removeDependency: os.todo.removeDependency
      .use(requireAuth)
      .handler(async () => {
        throw new Error("todo.removeDependency not implemented");
      }),
  },
});
