import { useState } from "react";
import { useCreateTodo } from "../hooks/todos";
import { AppSelect, type SelectOption } from "./AppSelect";
import { Button } from "./ui/button";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

const STATUSES: SelectOption[] = [
  { value: "not_started", label: "not_started" },
  { value: "in_progress", label: "in_progress" },
  { value: "completed", label: "completed" },
  { value: "archived", label: "archived" },
];
const PRIORITIES: SelectOption[] = [
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
];
const SCHEDULES: SelectOption[] = [
  { value: "none", label: "none" },
  { value: "daily", label: "daily" },
  { value: "weekly", label: "weekly" },
  { value: "monthly", label: "monthly" },
  { value: "custom", label: "custom" },
];

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
      <Button variant="default" onClick={() => setOpen((o) => !o)}>
        New task
      </Button>
      {open && (
        <form onSubmit={submit} className="mt-3 rounded-lg border p-3">
          <FieldGroup className="grid grid-cols-2 gap-4">
            <Field className="col-span-2">
              <FieldLabel htmlFor="tf-name">Name</FieldLabel>
              <Input
                id="tf-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field className="col-span-2">
              <FieldLabel htmlFor="tf-description">Description</FieldLabel>
              <Textarea
                id="tf-description"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tf-due">Due date</FieldLabel>
              <Input
                id="tf-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tf-status">Status</FieldLabel>
              <AppSelect
                id="tf-status"
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={STATUSES}
                triggerClassName="w-full"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tf-priority">Priority</FieldLabel>
              <AppSelect
                id="tf-priority"
                value={form.priority}
                onChange={(v) => setForm({ ...form, priority: v })}
                options={PRIORITIES}
                triggerClassName="w-full"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tf-schedule">Schedule</FieldLabel>
              <AppSelect
                id="tf-schedule"
                value={form.schedule}
                onChange={(v) => setForm({ ...form, schedule: v })}
                options={SCHEDULES}
                triggerClassName="w-full"
              />
            </Field>
            {form.schedule === "custom" && (
              <Field className="col-span-2">
                <FieldLabel htmlFor="tf-interval">Interval (days)</FieldLabel>
                <Input
                  id="tf-interval"
                  type="number"
                  min={1}
                  placeholder="e.g. 7"
                  value={form.customIntervalDays}
                  onChange={(e) =>
                    setForm({ ...form, customIntervalDays: e.target.value })
                  }
                />
              </Field>
            )}
            {create.isError && (
              <p className="col-span-2 text-sm text-destructive">
                Failed to create task.
              </p>
            )}
            <Button className="col-span-2" type="submit">
              Create
            </Button>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
