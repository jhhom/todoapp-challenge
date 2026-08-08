import { describe, it, expect } from "vitest";
import { database } from "./db";

describe("database", () => {
  it("connects and returns a scalar", async () => {
    const result = await database.executeQuery({
      sql: "select 1 as one",
      parameters: [],
    } as never);
    expect(result.rows).toEqual([{ one: 1 }]);
  });
});
