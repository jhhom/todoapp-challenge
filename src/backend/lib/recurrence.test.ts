import { describe, it, expect } from "vitest";
import { computeNextDueDate } from "./recurrence";

describe("computeNextDueDate", () => {
  it("returns null for none", () => {
    const anchor = new Date("2026-08-01T00:00:00Z");
    const completed = new Date("2026-08-06T12:00:00Z");
    expect(computeNextDueDate("none", null, anchor, completed)).toBeNull();
  });

  it("advances one day for a daily task completed on the due day", () => {
    const anchor = new Date("2026-08-10T00:00:00Z");
    const completed = new Date("2026-08-10T12:00:00Z");
    expect(computeNextDueDate("daily", null, anchor, completed)).toEqual(
      new Date("2026-08-11T00:00:00Z"),
    );
  });

  it("skips ahead for an overdue daily task (catch-up)", () => {
    // Due Aug 1, completed Aug 6 (5 days late) -> next due Aug 7, not Aug 2.
    const anchor = new Date("2026-08-01T00:00:00Z");
    const completed = new Date("2026-08-06T12:00:00Z");
    expect(computeNextDueDate("daily", null, anchor, completed)).toEqual(
      new Date("2026-08-07T00:00:00Z"),
    );
  });

  it("advances one week for a weekly task less than one interval late", () => {
    const anchor = new Date("2026-08-01T00:00:00Z");
    const completed = new Date("2026-08-04T12:00:00Z"); // 3 days late, < 7
    expect(computeNextDueDate("weekly", null, anchor, completed)).toEqual(
      new Date("2026-08-08T00:00:00Z"),
    );
  });

  it("skips a full week for a weekly task more than one interval late", () => {
    const anchor = new Date("2026-08-01T00:00:00Z");
    const completed = new Date("2026-08-10T12:00:00Z"); // > 7 days late
    expect(computeNextDueDate("weekly", null, anchor, completed)).toEqual(
      new Date("2026-08-15T00:00:00Z"),
    );
  });

  it("advances one month for a monthly task completed before the next slot", () => {
    const anchor = new Date("2026-08-10T00:00:00Z");
    const completed = new Date("2026-08-09T12:00:00Z");
    expect(computeNextDueDate("monthly", null, anchor, completed)).toEqual(
      new Date("2026-09-10T00:00:00Z"),
    );
  });

  it("skips months for an overdue monthly task", () => {
    const anchor = new Date("2026-08-10T00:00:00Z");
    const completed = new Date("2026-10-20T12:00:00Z");
    expect(computeNextDueDate("monthly", null, anchor, completed)).toEqual(
      new Date("2026-11-10T00:00:00Z"),
    );
  });

  it("skips by the custom interval for an overdue custom task", () => {
    // custom = 3 days, due Aug 1, completed Aug 8 -> Aug 4, Aug 7, Aug 10.
    const anchor = new Date("2026-08-01T00:00:00Z");
    const completed = new Date("2026-08-08T12:00:00Z");
    expect(computeNextDueDate("custom", 3, anchor, completed)).toEqual(
      new Date("2026-08-10T00:00:00Z"),
    );
  });

  it("defaults a custom task to a 1-day interval when the interval is missing", () => {
    const anchor = new Date("2026-08-10T00:00:00Z");
    const completed = new Date("2026-08-10T12:00:00Z");
    expect(computeNextDueDate("custom", null, anchor, completed)).toEqual(
      new Date("2026-08-11T00:00:00Z"),
    );
  });

  it("skips ahead when the next slot equals the completion instant exactly", () => {
    // Equal instant must also skip (strictly-greater rule).
    const anchor = new Date("2026-08-10T00:00:00Z");
    const completed = new Date("2026-08-11T00:00:00Z"); // == first advanced slot
    expect(computeNextDueDate("daily", null, anchor, completed)).toEqual(
      new Date("2026-08-12T00:00:00Z"),
    );
  });
});
