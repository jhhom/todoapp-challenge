import { Badge } from "./ui/badge";

/* ------------------------------------------------------------------ */
/*  Status                                                             */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, string> = {
  not_started:
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  completed:
    "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  archived: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  archived: "Archived",
};

/** Canonical ordering of statuses shown in pickers. */
export const STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "archived",
] as const;

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="secondary"
      className={STATUS_STYLES[status] ?? STATUS_STYLES.not_started}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

/**
 * A compact, single-track segmented control for picking a status. The active
 * segment is filled with its semantic colour (white text + soft shadow); the
 * others are muted and light up on hover. Kept on the same props as before so
 * callers (e.g. TodoDetailDrawer) need no changes.
 *
 * Semantic colours: slate = Not Started, blue = In Progress, green =
 * Completed, zinc = Archived.
 */

/** Solid fills for the active segment of the segmented control. */
const STATUS_ACTIVE_STYLES: Record<string, string> = {
  not_started: "bg-slate-500 text-white dark:bg-slate-600",
  in_progress: "bg-blue-600 text-white dark:bg-blue-700",
  completed: "bg-green-600 text-white dark:bg-green-700",
  archived: "bg-zinc-500 text-white dark:bg-zinc-600",
};

export function StatusPills({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (status: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Status"
      className={[
        "inline-flex flex-wrap gap-0.5 rounded-lg border bg-muted/50 p-1",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      {STATUSES.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(s)}
            className={[
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? `${STATUS_ACTIVE_STYLES[s] ?? STATUS_ACTIVE_STYLES.not_started} shadow-sm`
                : "text-muted-foreground hover:bg-background hover:text-foreground",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
          >
            {STATUS_LABELS[s] ?? s}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Priority                                                           */
/* ------------------------------------------------------------------ */

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge
      variant="secondary"
      className={PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.low}
    >
      {PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Blocked                                                            */
/* ------------------------------------------------------------------ */

export function BlockedBadge({ isBlocked }: { isBlocked: boolean }) {
  return (
    <Badge
      variant="secondary"
      className={
        isBlocked
          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
          : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
      }
    >
      {isBlocked ? "Blocked" : "Clear"}
    </Badge>
  );
}
