export type FilterState = {
  status?: string;
  priority?: string;
  blocked?: string;
  sortBy?: string;
  sortOrder: "asc" | "desc";
};

export function TodoFilters({
  value,
  onChange,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const select =
    (key: keyof FilterState) => (e: React.ChangeEvent<HTMLSelectElement>) =>
      onChange({ ...value, [key]: e.target.value || undefined });

  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={value.status ?? ""}
        onChange={select("status")}
        className="rounded border p-2"
      >
        <option value="">All statuses</option>
        <option value="not_started">Not Started</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="archived">Archived</option>
      </select>

      <select
        value={value.priority ?? ""}
        onChange={select("priority")}
        className="rounded border p-2"
      >
        <option value="">All priorities</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>

      <select
        value={value.blocked ?? ""}
        onChange={select("blocked")}
        className="rounded border p-2"
      >
        <option value="">Blocked: any</option>
        <option value="blocked">Blocked only</option>
        <option value="unblocked">Unblocked only</option>
      </select>

      <select
        value={value.sortBy ?? ""}
        onChange={select("sortBy")}
        className="rounded border p-2"
      >
        <option value="">Sort by…</option>
        <option value="dueDate">Due date</option>
        <option value="priority">Priority</option>
        <option value="status">Status</option>
        <option value="name">Name</option>
      </select>

      <select
        value={value.sortOrder}
        onChange={(e) =>
          onChange({ ...value, sortOrder: e.target.value as "asc" | "desc" })
        }
        className="rounded border p-2"
      >
        <option value="asc">Asc</option>
        <option value="desc">Desc</option>
      </select>
    </div>
  );
}
