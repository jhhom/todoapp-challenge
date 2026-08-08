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
 * Coloured, clickable status "pills". Each status uses a semantic colour
 * (slate = not started, blue = in progress, green = completed, zinc =
 * archived); the active status is emphasised with a ring/border.
 */
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
    <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
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
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              STATUS_STYLES[s] ?? STATUS_STYLES.not_started,
              active
                ? "border-foreground/50 ring-2 ring-foreground/15"
                : "border-transparent opacity-60 hover:opacity-100",
              disabled ? "cursor-not-allowed opacity-50" : "",
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
