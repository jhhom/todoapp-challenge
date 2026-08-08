import { wouldCreateCycle } from "../../lib/cycle-detection";
import { badRequest } from "../../lib/errors";
import type { DependencyRepo } from "./dependency.repo";

export function createDependencyService(repo: DependencyRepo) {
  return {
    async add(taskId: string, dependsOnId: string) {
      const adjacency = await repo.adjacency();
      if (wouldCreateCycle(taskId, dependsOnId, adjacency)) {
        badRequest("Circular dependency detected: this would create a loop");
      }
      await repo.insert(taskId, dependsOnId);
      return { success: true };
    },
    async remove(taskId: string, dependsOnId: string) {
      await repo.remove(taskId, dependsOnId);
      return { success: true };
    },
  };
}

export type DependencyService = ReturnType<typeof createDependencyService>;
