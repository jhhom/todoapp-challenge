export type Status = "not_started" | "in_progress" | "completed" | "archived";

/** Targets that a blocked task cannot move to. */
const BLOCKED_TARGETS: Status[] = ["in_progress", "completed"];

/**
 * Pure status transition validator.
 *
 * Rules (from the decision log):
 *  - A blocked task cannot move to "in_progress" or "completed".
 *  - A blocked task CAN move to "archived" (or be soft-deleted) regardless of block.
 *  - "completed" can reverse to "in_progress".
 *  - "in_progress" and "completed" can both reverse directly to "not_started",
 *    so the Q1 workflow (move a started task back to "Not Started" before linking
 *    an incomplete dependency) works without a detour through "archived".
 *  - "archived" is not terminal; it may return to "not_started" (or to
 *    "in_progress"/"completed", which still respect the block rule).
 */
export function canTransition(
  current: Status,
  target: Status,
  isBlocked: boolean,
): boolean {
  if (current === target) return false;
  if (isBlocked && BLOCKED_TARGETS.includes(target)) return false;

  switch (current) {
    case "not_started":
      return ["in_progress", "completed", "archived"].includes(target);
    case "in_progress":
      return ["not_started", "completed", "archived"].includes(target);
    case "completed":
      return ["not_started", "in_progress", "archived"].includes(target);
    case "archived":
      return ["not_started", "in_progress", "completed"].includes(target);
    default:
      return false;
  }
}
