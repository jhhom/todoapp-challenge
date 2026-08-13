export type Schedule = "none" | "daily" | "weekly" | "monthly" | "custom";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Advance a date by exactly one recurrence interval.
 */
function advanceOne(
  schedule: Schedule,
  customIntervalDays: number | null,
  from: Date,
): Date {
  switch (schedule) {
    case "daily":
      return new Date(from.getTime() + DAY_MS);
    case "weekly":
      return new Date(from.getTime() + 7 * DAY_MS);
    case "monthly": {
      // Preserve "end of month" intent. setUTCMonth(+1) alone overflows
      // month-end anchors (Jan 31 -> Feb 31 -> Mar 3), skipping short months
      // and drifting to a random day. If `from` is the last day of its month,
      // land on the last day of the target month; otherwise keep the
      // day-of-month, clamped to the target month's length.
      const day = from.getUTCDate();
      const lastDayOfFrom = new Date(
        Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const isEndOfMonth = day === lastDayOfFrom;
      const next = new Date(from);
      next.setUTCDate(1); // neutralize overflow before shifting the month
      next.setUTCMonth(next.getUTCMonth() + 1);
      const lastDayOfTarget = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next.setUTCDate(
        isEndOfMonth ? lastDayOfTarget : Math.min(day, lastDayOfTarget),
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
 * Returns null when the schedule is "none". The null-due-date carryover policy
 * (Q4) is handled by the caller.
 */
export function computeNextDueDate(
  schedule: Schedule,
  customIntervalDays: number | null,
  anchorDueDate: Date,
  completedAt: Date,
): Date | null {
  if (schedule === "none") return null;
  let next = advanceOne(schedule, customIntervalDays, anchorDueDate);
  while (next.getTime() <= completedAt.getTime()) {
    next = advanceOne(schedule, customIntervalDays, next);
  }
  return next;
}
