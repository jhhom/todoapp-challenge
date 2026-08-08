export type Schedule = "none" | "daily" | "weekly" | "monthly" | "custom";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure recurrence date math.
 *
 * The next occurrence's due date is always calculated from `completedAt`
 * (the authoritative base date per the design spec).
 * Returns null when the schedule is "none".
 */
export function computeNextDueDate(
  schedule: Schedule,
  customIntervalDays: number | null,
  completedAt: Date,
): Date | null {
  switch (schedule) {
    case "none":
      return null;
    case "daily":
      return new Date(completedAt.getTime() + DAY_MS);
    case "weekly":
      return new Date(completedAt.getTime() + 7 * DAY_MS);
    case "monthly": {
      const next = new Date(completedAt);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    }
    case "custom": {
      const days =
        customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 1;
      return new Date(completedAt.getTime() + days * DAY_MS);
    }
    default:
      return null;
  }
}
