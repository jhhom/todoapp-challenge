import type { Kysely } from "kysely";
import type { DB } from "../../db.d";

export function createDependencyRepo(db: Kysely<DB>) {
  return {
    /** All dependency edges as an adjacency map: taskId -> [dependsOnId...]. */
    async adjacency(): Promise<Map<string, string[]>> {
      const rows = await db.selectFrom("todoDependency").selectAll().execute();
      const map = new Map<string, string[]>();
      for (const r of rows) {
        const key = String(r.taskId);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(String(r.dependsOnTaskId));
      }
      return map;
    },
    async insert(taskId: string, dependsOnTaskId: string) {
      await db
        .insertInto("todoDependency")
        .values({ taskId, dependsOnTaskId })
        .execute();
    },
    async remove(taskId: string, dependsOnTaskId: string) {
      await db
        .deleteFrom("todoDependency")
        .where("taskId", "=", taskId)
        .where("dependsOnTaskId", "=", dependsOnTaskId)
        .execute();
    },
  };
}

export type DependencyRepo = ReturnType<typeof createDependencyRepo>;
