import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../client";
import {
  useAddDependency,
  useDeleteTodo,
  useRemoveDependency,
  useUpdateTodo,
} from "../hooks/todos";

export function TodoDetailDrawer({
  todoId,
  onClose,
}: {
  todoId: string | null;
  onClose: () => void;
}) {
  const update = useUpdateTodo();
  const remove = useDeleteTodo();
  const addDep = useAddDependency();
  const removeDep = useRemoveDependency();
  const [newDep, setNewDep] = useState("");
  const [statusErr, setStatusErr] = useState("");

  const detail = useQuery(
    orpc.todo.get.queryOptions({
      input: { id: todoId! },
    }),
  );

  if (!todoId) return null;
  if (detail.isLoading)
    return (
      <div className="fixed right-0 top-0 h-full w-96 border-l bg-background p-4">
        Loading…
      </div>
    );
  if (detail.isError || !detail.data)
    return (
      <div className="fixed right-0 top-0 h-full w-96 border-l bg-background p-4">
        <button onClick={onClose}>✕</button>
        <p className="mt-4 text-destructive">Could not load task.</p>
      </div>
    );

  const t = detail.data;

  const changeStatus = (status: string) => {
    setStatusErr("");
    update.mutate({ id: t.id, status: status as never } as never, {
      onError: (e) =>
        setStatusErr(
          (e as { message?: string })?.message ??
            "Invalid status change (task may be blocked).",
        ),
    });
  };

  return (
    <div className="fixed right-0 top-0 h-full w-96 space-y-3 overflow-auto border-l bg-background p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t.name}</h2>
        <button onClick={onClose}>✕</button>
      </div>
      <p className="text-sm text-muted-foreground">{t.description}</p>

      <div className="space-y-1">
        <label className="text-xs uppercase text-muted-foreground">
          Status
        </label>
        <select
          className="w-full rounded border p-2"
          value={t.status}
          onChange={(e) => changeStatus(e.target.value)}
        >
          {["not_started", "in_progress", "completed", "archived"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {statusErr && <p className="text-xs text-destructive">{statusErr}</p>}
        {t.isBlocked && (
          <p className="text-xs text-amber-600">
            Blocked by unfinished dependencies.
          </p>
        )}
        {t.nextOccurrenceId && (
          <p className="text-xs text-muted-foreground">
            Next occurrence created: {t.nextOccurrenceId.slice(0, 8)}…
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase text-muted-foreground">
          Dependencies
        </label>
        <ul className="space-y-1">
          {t.dependencies.map((depId) => (
            <li
              key={depId}
              className="flex items-center justify-between rounded border p-2 text-sm"
            >
              <span className="truncate">{depId}</span>
              <button
                className="text-destructive"
                onClick={() =>
                  removeDep.mutate({ taskId: t.id, dependsOnId: depId })
                }
              >
                remove
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border p-2 text-sm"
            placeholder="Dependency task UUID"
            value={newDep}
            onChange={(e) => setNewDep(e.target.value)}
          />
          <button
            className="rounded border px-3 py-1 text-sm"
            onClick={() => {
              addDep.mutate({ taskId: t.id, dependsOnId: newDep });
              setNewDep("");
            }}
          >
            Add
          </button>
        </div>
        {addDep.isError && (
          <p className="text-xs text-destructive">
            Could not add dependency (it may create a cycle).
          </p>
        )}
      </div>

      <button
        className="w-full rounded border border-destructive p-2 text-sm text-destructive"
        onClick={() => {
          remove.mutate({ id: t.id }, { onSuccess: onClose });
        }}
      >
        Delete (soft)
      </button>
    </div>
  );
}
