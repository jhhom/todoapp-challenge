import { AppSelect, type SelectOption } from "./AppSelect";

export type FilterState = {
  status?: string;
  priority?: string;
  blocked?: string;
  sortBy?: string;
  sortOrder: "asc" | "desc";
};

const STATUS_OPTIONS: SelectOption[] = [
  { value: "", label: "All statuses" },
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: "", label: "All priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const BLOCKED_OPTIONS: SelectOption[] = [
  { value: "", label: "Blocked: any" },
  { value: "blocked", label: "Blocked only" },
  { value: "unblocked", label: "Unblocked only" },
];

const SORT_BY_OPTIONS: SelectOption[] = [
  { value: "createdAt", label: "Created date" },
  { value: "dueDate", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "name", label: "Name" },
];

const SORT_ORDER_OPTIONS: SelectOption[] = [
  { value: "asc", label: "Asc" },
  { value: "desc", label: "Desc" },
];

const empty = (v: string) => (v === "" ? undefined : v);

export function TodoFilters({
  value,
  onChange,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AppSelect
        value={value.status ?? ""}
        onChange={(v) => onChange({ ...value, status: empty(v) })}
        options={STATUS_OPTIONS}
        triggerClassName="w-[150px]"
      />
      <AppSelect
        value={value.priority ?? ""}
        onChange={(v) => onChange({ ...value, priority: empty(v) })}
        options={PRIORITY_OPTIONS}
        triggerClassName="w-[150px]"
      />
      <AppSelect
        value={value.blocked ?? ""}
        onChange={(v) => onChange({ ...value, blocked: empty(v) })}
        options={BLOCKED_OPTIONS}
        triggerClassName="w-[150px]"
      />
      <AppSelect
        value={value.sortBy ?? ""}
        onChange={(v) => onChange({ ...value, sortBy: empty(v) })}
        options={SORT_BY_OPTIONS}
        triggerClassName="w-[140px]"
      />
      <AppSelect
        value={value.sortOrder}
        onChange={(v) =>
          onChange({ ...value, sortOrder: (v || "asc") as "asc" | "desc" })
        }
        options={SORT_ORDER_OPTIONS}
        triggerClassName="w-[100px]"
      />
    </div>
  );
}
