import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronsUpDownIcon } from "lucide-react";
import { orpc } from "../client";
import { StatusPills } from "./TodoBadges";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  useAddDependency,
  useDeleteTodo,
  useRemoveDependency,
  useUpdateTodo,
} from "../hooks/todos";
import { Link } from "@tanstack/react-router";
import type { WorkspaceSearch } from "../routes/index";

export function TodoDetailDrawer({
  todoId,
  onClose,
}: {
  todoId: string | null;
  onClose: () => void;
  /** Open a different task in the drawer (e.g. clicking a dependency title). */
  onOpenTodo?: (id: string) => void;
}) {
  const update = useUpdateTodo();
  const remove = useDeleteTodo();
  const addDep = useAddDependency();
  const removeDep = useRemoveDependency();
  const [pickedId, setPickedId] = useState("");
  const [depOpen, setDepOpen] = useState(false);
  const [statusErr, setStatusErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const detail = useQuery({
    ...orpc.todo.get.queryOptions({ input: { id: todoId ?? "" } }),
    enabled: !!todoId,
  });

  // Candidate tasks to pick as a dependency (fetched via the TanStack Query client).
  const candidates = useQuery(
    orpc.todo.list.queryOptions({
      input: { page: 1, pageSize: 100, sortOrder: "asc", sortBy: "name" },
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
      <div className="fixed right-0 top-0 h-full w-[26rem] border-l bg-background p-4">
        Loading…
      </div>
    );
  if (detail.isError || !detail.data)
    return (
      <div className="fixed right-0 top-0 h-full w-[26rem] border-l bg-background p-4">
        <button
          className="rounded-md px-1.5 text-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          onClick={onClose}
        >
          ✕
        </button>
        <p className="mt-4 text-destructive">Could not load task.</p>
      </div>
    );

  const t = detail.data;
  const byId = new Map((candidates.data?.items ?? []).map((c) => [c.id, c]));
  const labelFor = (id: string) => {
    const item = byId.get(id);
    if (item) {
      return `${item.name} (${format(new Date(item.createdAt), "MMM dd, yyyy HH:mm:ss")})`;
    } else {
      return `${id.slice(0, 8)}…`;
    }
  };

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

  const picked = pickedId ? byId.get(pickedId) : undefined;

  return (
    <div className="fixed shadow-md right-0 top-0 h-full w-[32rem] space-y-3 overflow-auto border-l bg-background p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t.name}</h2>
        <button
          className="rounded-md px-6 py-1.5 bg-gray-200 cursor-pointer text-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <p className="text-sm text-muted-foreground">{t.description}</p>
      {t.createdAt && (
        <p className="text-sm text-muted-foreground">
          Created {format(new Date(t.createdAt), "MMM dd, yyyy HH:mm:ss")}
        </p>
      )}

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
        <StatusPills
          value={t.status}
          onChange={(v) => changeStatus(v)}
          disabled={update.isPending}
        />
        {statusErr && <p className="text-xs text-destructive">{statusErr}</p>}
        {t.isBlocked && (
          <p className="text-xs text-amber-600">
            Blocked by unfinished dependencies.
          </p>
        )}
        {t.nextOccurrenceId && byId.get(t.nextOccurrenceId) && (
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
          {t.dependencies.map((depId) => {
            const dep = byId.get(depId);
            return (
              <li
                key={depId}
                className="flex items-start justify-between gap-2 rounded border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  {/* Title is a link: clicking opens this dependency in the drawer. */}
                  <Link
                    to="/"
                    search={(prev: WorkspaceSearch) => ({
                      ...prev,
                      todo: depId,
                    })}
                    className="block w-full break-words text-left font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {labelFor(depId)}
                  </Link>
                  {dep?.createdAt && (
                    <Badge
                      variant="secondary"
                      className="mt-1 shrink-0 font-normal tabular-nums"
                    >
                      {format(new Date(dep.createdAt), "MMM dd HH:mm:ss")}
                    </Badge>
                  )}
                </div>
                <button
                  className="shrink-0 text-destructive"
                  onClick={() =>
                    removeDep.mutate({ taskId: t.id, dependsOnId: depId })
                  }
                >
                  remove
                </button>
              </li>
            );
          })}
          {t.dependencies.length === 0 && (
            <li className="text-xs text-muted-foreground">No dependencies.</li>
          )}
        </ul>

        {/* Pick a dependency by name with a searchable combobox. */}
        <div className="flex gap-2">
          <Popover open={depOpen} onOpenChange={setDepOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="flex h-auto min-h-8 min-w-0 flex-1 items-start justify-between whitespace-normal py-1.5 text-left font-normal"
                />
              }
            >
              <span className="min-w-0 break-words">
                {picked ? (
                  <>
                    {picked.name}{" "}
                    <span className="text-muted-foreground">
                      ({picked.status})
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Select a task…</span>
                )}
              </span>
              <ChevronsUpDownIcon data-icon="inline-end" />
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search tasks…" />
                <CommandList>
                  <CommandEmpty>No tasks found.</CommandEmpty>
                  <CommandGroup>
                    {pickable.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.name} ${c.status}`}
                        onSelect={() => {
                          setPickedId(c.id);
                          setDepOpen(false);
                        }}
                      >
                        {c.name}
                        <span className="text-muted-foreground">
                          ({c.status})
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
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
          </Button>
        </div>
        {pickable.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No more tasks available to add (showing up to 100 by name).
          </p>
        )}
        {addDep.isError && (
          <p className="text-xs text-destructive">
            {(addDep.error as { message?: string })?.message ??
              "Could not add dependency (it may create a cycle)."}
          </p>
        )}
      </div>

      <Button
        variant="destructive"
        className="w-full"
        onClick={() => setDeleteOpen(true)}
      >
        Delete (soft)
      </Button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              This will soft-delete "{t.name}". The task will be hidden from the
              active list but can be restored later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate({ id: t.id }, { onSuccess: onClose });
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
