import { useState } from "react";
import { useCreateTodo } from "../hooks/todos";

const STATUSES = ["not_started", "in_progress", "completed", "archived"];
const PRIORITIES = ["low", "medium", "high"];
const SCHEDULES = ["none", "daily", "weekly", "monthly", "custom"];

const emptyForm = {
  name: "",
  description: "",
  dueDate: "",
  status: "not_started",
  priority: "medium",
  schedule: "none",
  customIntervalDays: "",
};

export function TodoForm() {
  const create = useCreateTodo();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        name: form.name,
        description: form.description || undefined,
        dueDate: form.dueDate
          ? new Date(form.dueDate).toISOString()
          : undefined,
        status: form.status as never,
        priority: form.priority as never,
        schedule: form.schedule as never,
        customIntervalDays:
          form.schedule === "custom" && form.customIntervalDays
            ? Number(form.customIntervalDays)
            : undefined,
      } as never,
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ ...emptyForm });
        },
      },
    );
  };

  return (
    <div>
      <button
        className="rounded bg-primary px-4 py-2 text-primary-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        New task
      </button>
      {open && (
        <form
          onSubmit={submit}
          className="mt-3 grid grid-cols-2 gap-2 rounded border p-3"
        >
          <input
            className="col-span-2 rounded border p-2"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <textarea
            className="col-span-2 rounded border p-2"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input
            className="rounded border p-2"
            type="datetime-local"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
          <select
            className="rounded border p-2"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="rounded border p-2"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
          >
            {PRIORITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="rounded border p-2"
            value={form.schedule}
            onChange={(e) => setForm({ ...form, schedule: e.target.value })}
          >
            {SCHEDULES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {form.schedule === "custom" && (
            <input
              className="rounded border p-2"
              type="number"
              placeholder="interval (days)"
              value={form.customIntervalDays}
              onChange={(e) =>
                setForm({ ...form, customIntervalDays: e.target.value })
              }
            />
          )}
          {create.isError && (
            <p className="col-span-2 text-sm text-destructive">
              Failed to create task.
            </p>
          )}
          <button
            className="col-span-2 rounded bg-primary px-3 py-2 text-primary-foreground"
            type="submit"
          >
            Create
          </button>
        </form>
      )}
    </div>
  );
}
