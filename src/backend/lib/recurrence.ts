export type Schedule = "none" | "daily" | "weekly" | "monthly" | "custom";

/**
 * Explicit monthly-repeat intent. Disambiguates "the Nth of every month"
 * from "the end of every month" for month-end anchors (e.g. Apr 30), where a
 * single due date cannot express which the user meant.
 *
 * - `"end_of_month"`: always land on the last day of the target month.
 * - `"day_of_month"`: preserve the anchor's day-of-month, clamped to the
 *   target month's length.
 * - `null`: infer from the anchor — end-of-month only if the anchor itself was
 *   the last day of its month, otherwise preserve the day. This keeps legacy
 *   data behaving as before and is the only sensible reading for a
 *   non-month-end anchor.
 */
export type MonthlyRepeatMode = "day_of_month" | "end_of_month";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Last calendar day (UTC) of the month containing `d`, e.g. 28 for Feb 2025. */
function lastDayOfMonthUTC(d: Date): number {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
}

/**
 * Advance a date by exactly one recurrence interval.
 *
 * `anchorDueDate` is the *original* anchor (constant across catch-up
 * iterations); the monthly branch uses it to recover the intended
 * day-of-month, which the drifting `from` value loses after a clamp.
 */
function advanceOne(
  schedule: Schedule,
  customIntervalDays: number | null,
  from: Date,
  anchorDueDate: Date,
  monthlyRepeatMode: MonthlyRepeatMode | null,
): Date {
  switch (schedule) {
    case "daily":
      return new Date(from.getTime() + DAY_MS);
    case "weekly":
      return new Date(from.getTime() + 7 * DAY_MS);
    case "monthly": {
      // Decide end-of-month vs. day-of-month. An explicit monthlyRepeatMode wins;
      // otherwise infer from the *anchor* (not the drifting `from`), so a
      // Jan 30 anchor that clamps to Feb 28 is not hijacked into a
      // month-end chain.
      const anchorDay = anchorDueDate.getUTCDate();
      const useEndOfMonth =
        monthlyRepeatMode === "end_of_month" ||
        (monthlyRepeatMode == null && anchorDay === lastDayOfMonthUTC(anchorDueDate));
      const next = new Date(from);
      next.setUTCDate(1); // neutralize overflow before shifting the month
      next.setUTCMonth(next.getUTCMonth() + 1);
      const lastOfTarget = lastDayOfMonthUTC(next);
      next.setUTCDate(
        useEndOfMonth ? lastOfTarget : Math.min(anchorDay, lastOfTarget),
      );
      return next;
    }
    case "custom": {
      const days =
        customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 1;
      return new Date(from.getTime() + days * DAY_MS);
    }
    default:
      return new Date(from.getTime() + DAY_MS);
  }
}

/**
 * Pure recurrence date math with catch-up.
 *
 * The next occurrence's due date is anchored on the completed task's own
 * `anchorDueDate` (Strict Scheduling, Q6). It advances one interval at a time
 * until it lands strictly after `completedAt`, so an overdue task skips the
 * missed periods and reschedules to the next future slot instead of an
 * already-overdue date.
 *
 * `monthlyRepeatMode` only affects monthly recurrence (see {@link MonthlyRepeatMode}).
 * Returns null when the schedule is "none". The null-due-date carryover policy
 * (Q4) is handled by the caller.
 */
export function computeNextDueDate(
  schedule: Schedule,
  customIntervalDays: number | null,
  anchorDueDate: Date,
  completedAt: Date,
  monthlyRepeatMode: MonthlyRepeatMode | null = null,
): Date | null {
  if (schedule === "none") return null;
  let next = advanceOne(
    schedule,
    customIntervalDays,
    anchorDueDate,
    anchorDueDate,
    monthlyRepeatMode,
  );
  while (next.getTime() <= completedAt.getTime()) {
    next = advanceOne(
      schedule,
      customIntervalDays,
      next,
      anchorDueDate,
      monthlyRepeatMode,
    );
  }
  return next;
}
