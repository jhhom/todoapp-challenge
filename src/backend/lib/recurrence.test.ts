import { describe, it, expect } from "vitest";
import { computeNextDueDate } from "./recurrence";

const base = new Date("2026-08-10T12:00:00Z");

describe("computeNextDueDate", () => {
  it("returns null for none", () => {
    expect(computeNextDueDate("none", null, base)).toBeNull();
  });
  it("adds one day for daily", () => {
    expect(computeNextDueDate("daily", null, base)).toEqual(
      new Date("2026-08-11T12:00:00Z"),
    );
  });
  it("adds seven days for weekly", () => {
    expect(computeNextDueDate("weekly", null, base)).toEqual(
      new Date("2026-08-17T12:00:00Z"),
    );
  });
  it("adds one month for monthly", () => {
    expect(computeNextDueDate("monthly", null, base)).toEqual(
      new Date("2026-09-10T12:00:00Z"),
    );
  });
  it("adds N days for custom", () => {
    expect(computeNextDueDate("custom", 3, base)).toEqual(
      new Date("2026-08-13T12:00:00Z"),
    );
  });
  it("defaults custom to 1 day when interval missing", () => {
    expect(computeNextDueDate("custom", null, base)).toEqual(
      new Date("2026-08-11T12:00:00Z"),
    );
  });
});
