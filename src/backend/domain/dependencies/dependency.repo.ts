import type { Kysely } from "kysely";
import type { DB } from "../../db.d";
import type { Status } from "../../lib/state-machine";

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
    /**
     * Looks up the live status of a (non-deleted) todo. Returns `undefined`
     * when the task does not exist or has been soft-deleted. Used by the
     * dependency service to validate state-machine invariants on add.
     */
    async findStatus(id: string): Promise<Status | undefined> {
      const row = await db
        .selectFrom("todo")
        .select("status")
        .where("id", "=", id)
        .where("isDeleted", "=", false)
        .executeTakeFirst();
      return row?.status as Status | undefined;
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
