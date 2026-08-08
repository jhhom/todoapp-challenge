import { wouldCreateCycle } from "../../lib/cycle-detection";
import { badRequest } from "../../lib/errors";
import type { PublishTodoChange } from "../../lib/events";
import type { DependencyRepo } from "./dependency.repo";

export function createDependencyService(
  repo: DependencyRepo,
  publish: PublishTodoChange = () => {},
) {
  return {
    async add(taskId: string, dependsOnId: string) {
      const adjacency = await repo.adjacency();
      if (wouldCreateCycle(taskId, dependsOnId, adjacency)) {
        badRequest("Circular dependency detected: this would create a loop");
      }

      // State-machine invariant (decision log Q1):
      // A task already "in_progress" or "completed" must not acquire an
      // *incomplete* dependency — doing so would instantly place it in an
      // illegal state. A "completed" dependency is always safe to add.
      const taskStatus = await repo.findStatus(taskId);
      if (taskStatus === "in_progress" || taskStatus === "completed") {
        const depStatus = await repo.findStatus(dependsOnId);
        if (depStatus !== "completed") {
          badRequest(
            `Cannot add a dependency that is not completed (${depStatus ?? "missing"}) to a task that is already "${taskStatus}". `,
          );
        }
      }

      await repo.insert(taskId, dependsOnId);
      publish({ action: "dependency.added", todoId: taskId, dependsOnId });
      return { success: true };
    },
    async remove(taskId: string, dependsOnId: string) {
      await repo.remove(taskId, dependsOnId);
      publish({ action: "dependency.removed", todoId: taskId, dependsOnId });
      return { success: true };
    },
  };
}

export type DependencyService = ReturnType<typeof createDependencyService>;
