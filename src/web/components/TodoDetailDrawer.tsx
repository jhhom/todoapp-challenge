import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../client";
import { AppSelect } from "./AppSelect";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
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
  const [pickedId, setPickedId] = useState("");
  const [statusErr, setStatusErr] = useState("");
  const [copied, setCopied] = useState(false);

  const detail = useQuery(
    orpc.todo.get.queryOptions({ input: { id: todoId! } }),
  );

  // Candidate tasks to pick as a dependency (fetched via the TanStack Query client).
  const candidates = useQuery(
    orpc.todo.list.queryOptions({
      input: { page: 1, pageSize: 200, sortOrder: "asc", sortBy: "name" },
    }),
  );

  // Exclude the current task and already-linked dependencies from the picker.
  const existing = new Set(detail.data?.dependencies ?? []);
  const pickable = useMemo(
    () =>
      (candidates.data?.items ?? []).filter(
        (c) => c.id !== todoId && !existing.has(c.id),
      ),
    [candidates.data, existing, todoId],
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
  const byId = new Map((candidates.data?.items ?? []).map((c) => [c.id, c]));
  const labelFor = (id: string) => byId.get(id)?.name ?? `${id.slice(0, 8)}…`;

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

      {/* Task ID — shown so it is discoverable (e.g. for linking). */}
      <div className="space-y-1">
        <label className="text-xs uppercase text-muted-foreground">
          Task ID
        </label>
        <div className="flex items-center gap-2">
          <code className="block flex-1 truncate rounded border bg-muted px-2 py-1 text-xs">
            {t.id}
          </code>
          <Tooltip open={copied}>
            <TooltipTrigger
              render={
                <button
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => {
                    void navigator.clipboard?.writeText(t.id);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1200);
                  }}
                >
                  copy
                </button>
              }
            />
            <TooltipContent side="top">Copied!</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase text-muted-foreground">
          Status
        </label>
        <AppSelect
          value={t.status}
          onChange={(v) => changeStatus(v)}
          options={["not_started", "in_progress", "completed", "archived"].map(
            (s) => ({ value: s, label: s }),
          )}
          triggerClassName="w-full"
        />
        {statusErr && <p className="text-xs text-destructive">{statusErr}</p>}
        {t.isBlocked && (
          <p className="text-xs text-amber-600">
            Blocked by unfinished dependencies.
          </p>
        )}
        {t.nextOccurrenceId && (
          <p className="text-xs text-muted-foreground">
            Next occurrence created: {labelFor(t.nextOccurrenceId)}
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
              <span className="truncate">{labelFor(depId)}</span>
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
          {t.dependencies.length === 0 && (
            <li className="text-xs text-muted-foreground">No dependencies.</li>
          )}
        </ul>

        {/* Pick a dependency by name instead of typing a UUID. */}
        <div className="flex gap-2">
          <AppSelect
            value={pickedId}
            onChange={setPickedId}
            options={[
              { value: "", label: "Select a task…" },
              ...pickable.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.status})`,
              })),
            ]}
            triggerClassName="flex-1"
          />
          <button
            className="rounded border px-3 py-1 text-sm disabled:opacity-40"
            disabled={!pickedId}
            onClick={() => {
              addDep.mutate(
                { taskId: t.id, dependsOnId: pickedId },
                {
                  onSuccess: () => setPickedId(""),
                },
              );
            }}
          >
            Add
          </button>
        </div>
        {pickable.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No more tasks available to add (showing up to 200 by name).
          </p>
        )}
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
