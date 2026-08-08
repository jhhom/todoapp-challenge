import { describe, it, expect } from "vitest";
import { database } from "./db";

async function columnsOf(table: string): Promise<string[]> {
  // Alias to a single-word column so the CamelCasePlugin leaves the key unchanged.
  const result = await database.executeQuery({
    sql: `select column_name as col from information_schema.columns
          where table_name = '${table}' order by ordinal_position`,
    parameters: [],
  } as never);
  return (result.rows as { col: string }[]).map((r) => r.col);
}

describe("schema", () => {
  it("has the todo table with expected columns", async () => {
    const names = await columnsOf("todo");
    for (const required of [
      "id",
      "name",
      "description",
      "due_date",
      "status",
      "priority",
      "schedule",
      "custom_interval_days",
      "next_occurrence_id",
      "created_by",
      "created_at",
      "completed_at",
      "updated_at",
      "is_deleted",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("has the todo_dependency junction table", async () => {
    const names = await columnsOf("todo_dependency");
    expect(names).toContain("task_id");
    expect(names).toContain("depends_on_task_id");
  });

  it("has the app_user table with uuid/email/password", async () => {
    const names = await columnsOf("app_user");
    expect(names).toContain("id");
    expect(names).toContain("email");
    expect(names).toContain("password_hash");
  });
});
