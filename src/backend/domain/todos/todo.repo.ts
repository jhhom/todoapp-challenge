import type { Kysely, ExpressionBuilder } from "kysely";
import type { DB } from "../../db.d";

type ListInput = {
  page: number;
  pageSize: number;
  status?: "not_started" | "in_progress" | "completed" | "archived";
  priority?: "low" | "medium" | "high";
  dueBefore?: string;
  dueAfter?: string;
  blocked?: "blocked" | "unblocked";
  sortBy?: "createdAt" | "dueDate" | "priority" | "status" | "name";
  sortOrder: "asc" | "desc";
};

const notDeleted = (eb: ExpressionBuilder<DB, "todo">) =>
  eb("isDeleted", "=", false);

/** Matches tasks that have an unfinished (non-completed, non-deleted) prerequisite. */
function hasUnfinishedDependency(eb: ExpressionBuilder<DB, "todo">) {
  return eb.exists(
    eb
      .selectFrom("todoDependency as d")
      .select("d.taskId")
      .innerJoin("todo as dep", "dep.id", "d.dependsOnTaskId")
      .whereRef("d.taskId", "=", "todo.id")
      .where("dep.status", "<>", "completed")
      .where("dep.isDeleted", "=", false),
  );
}

export function createTodoRepo(db: Kysely<DB>) {
  return {
    async list(input: ListInput) {
      let q = db.selectFrom("todo").selectAll().where(notDeleted);

      if (input.status) q = q.where("status", "=", input.status);
      if (input.priority) q = q.where("priority", "=", input.priority);
      if (input.dueBefore)
        q = q.where("dueDate", "<=", new Date(input.dueBefore));
      if (input.dueAfter)
        q = q.where("dueDate", ">=", new Date(input.dueAfter));

      if (input.blocked === "blocked") {
        q = q.where(hasUnfinishedDependency);
      } else if (input.blocked === "unblocked") {
        q = q.where((eb) => eb.not(hasUnfinishedDependency(eb)));
      }

      const totalRow = await db
        .selectFrom("todo")
        .where(notDeleted)
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirstOrThrow();
      const total = Number(totalRow.count);

      const sortCol =
        input.sortBy === "createdAt"
          ? "createdAt"
          : input.sortBy === "dueDate"
            ? "dueDate"
            : input.sortBy === "priority"
              ? "priority"
              : input.sortBy === "status"
                ? "status"
                : "name";
      q = q
        .orderBy(sortCol, input.sortOrder)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      const items = await q.execute();
      return { items, total };
    },

    async findById(id: string) {
      return db
        .selectFrom("todo")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async insert(row: Record<string, unknown>) {
      return db
        .insertInto("todo")
        .values(row as never)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async update(id: string, patch: Record<string, unknown>) {
      return db
        .updateTable("todo")
        .set({ ...patch, updatedAt: new Date() } as never)
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async softDelete(id: string): Promise<void> {
      await db
        .updateTable("todo")
        .set({ isDeleted: true, updatedAt: new Date() } as never)
        .where("id", "=", id)
        .execute();
    },

    async dependenciesOf(taskId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("todoDependency")
        .select("dependsOnTaskId")
        .where("taskId", "=", taskId)
        .execute();
      return rows.map((r) => String(r.dependsOnTaskId));
    },

    async isBlocked(taskId: string): Promise<boolean> {
      const row = await db
        .selectFrom("todoDependency as d")
        .innerJoin("todo as dep", "dep.id", "d.dependsOnTaskId")
        .where("d.taskId", "=", taskId)
        .where("dep.status", "<>", "completed")
        .where("dep.isDeleted", "=", false)
        .select("d.taskId")
        .limit(1)
        .executeTakeFirst();
      return !!row;
    },
  };
}

export type TodoRepo = ReturnType<typeof createTodoRepo>;
/** The select-shape of a todo row (timestamps resolved to Date). */
export type TodoRow = NonNullable<Awaited<ReturnType<TodoRepo["findById"]>>>;
