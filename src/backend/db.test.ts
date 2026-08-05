import { describe, test } from "vitest";
import { database } from "./db";

describe("test db", () => {
  test("test db", async () => {
    const result = await database.selectFrom("appUser").selectAll().execute();
    console.log(result);
  });
});
