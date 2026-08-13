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

  // End-of-month preservation: a month-end anchor (e.g. Jan 31) must land on
  // the last day of each target month, rather than overflowing (Feb 31 -> Mar 3)
  // or sticking on the first clamped day (Feb 28 -> Mar 28).
  it("preserves end-of-month across a short month (Jan 31 -> Feb 28)", () => {
    const anchor = new Date("2025-01-31T00:00:00Z");
    // completed == anchor => a single advance, isolating the Jan 31 step.
    expect(computeNextDueDate("monthly", null, anchor, anchor)).toEqual(
      new Date("2025-02-28T00:00:00Z"),
    );
  });

  it("recovers the month-end after February instead of drifting (Jan 31 -> Jun 30)", () => {
    // After clamping to Feb 28, subsequent months return to their last day
    // (Mar 31, Apr 30, May 31, Jun 30) rather than sticking on the 28th or
    // drifting to the 3rd as the old setUTCMonth(+1) overflow did.
    const anchor = new Date("2025-01-31T00:00:00Z");
    const completed = new Date("2025-06-15T12:00:00Z");
    expect(computeNextDueDate("monthly", null, anchor, completed)).toEqual(
      new Date("2025-06-30T00:00:00Z"),
    );
  });

  // Explicit monthlyRepeatMode disambiguates "the Nth" vs "end of month" for
  // month-end anchors in short months (e.g. Apr 30), where a single due date
  // can't express which the user meant.
  it("honors explicit end_of_month for a 30-day month-end anchor (Apr 30 -> May 31)", () => {
    const anchor = new Date("2025-04-30T00:00:00Z");
    expect(
      computeNextDueDate("monthly", null, anchor, anchor, "end_of_month"),
    ).toEqual(new Date("2025-05-31T00:00:00Z"));
  });

  it("honors explicit day_of_month for a 30-day month-end anchor (Apr 30 -> May 30)", () => {
    const anchor = new Date("2025-04-30T00:00:00Z");
    expect(
      computeNextDueDate("monthly", null, anchor, anchor, "day_of_month"),
    ).toEqual(new Date("2025-05-30T00:00:00Z"));
  });

  it("day_of_month preserves the 30th after a short month (Jan 30 -> Mar 30)", () => {
    // The old code drifted Jan 30 -> Feb 28 -> Mar 31. Explicit day_of_month
    // keeps the anchor day across the clamp.
    const anchor = new Date("2025-01-30T00:00:00Z");
    const completed = new Date("2025-02-28T00:00:00Z");
    expect(
      computeNextDueDate("monthly", null, anchor, completed, "day_of_month"),
    ).toEqual(new Date("2025-03-30T00:00:00Z"));
  });

  it("null monthlyRepeatMode is anchor-aware: a non-month-end anchor keeps its day (Jan 30 -> Mar 30)", () => {
    // The null fallback fixes the drift for legacy / non-disambiguated tasks,
    // while genuine month-end anchors keep their behavior (Jan 31 -> Feb 28).
    const anchor = new Date("2025-01-30T00:00:00Z");
    const completed = new Date("2025-02-28T00:00:00Z");
    expect(computeNextDueDate("monthly", null, anchor, completed)).toEqual(
      new Date("2025-03-30T00:00:00Z"),
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
