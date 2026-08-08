import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { format } from "date-fns";
import { useMemo } from "react";
import { useTodoList } from "../hooks/todos";
import { TodoFilters, type FilterState } from "../components/TodoFilters";
import { Pagination } from "../components/Pagination";
import { TodoForm } from "../components/TodoForm";
import { TodoDetailDrawer } from "../components/TodoDetailDrawer";
import {
  StatusBadge,
  PriorityBadge,
  BlockedBadge,
} from "../components/TodoBadges";
import { clearToken, getUserEmail } from "../lib/auth";

/**
 * Search-param schema for the workspace (`/`) route.
 * Mirrors the object returned by `validateSearch` below so callers
 * (e.g. {@link TodoDetailDrawer}) can type `Link`/`navigate` updates.
 */
export type WorkspaceSearch = {
  page: number;
  status?: string;
  priority?: string;
  blocked?: string;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  todo?: string;
};

export const Route = createFileRoute("/")({
  component: Workspace,
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 1) || 1,
    status: (search.status as string) || undefined,
    priority: (search.priority as string) || undefined,
    blocked: (search.blocked as string) || undefined,
    sortBy: (search.sortBy as string) || "createdAt",
    sortOrder: (search.sortOrder as "asc" | "desc") || "desc",
    // Which task's detail drawer is open — kept in the URL so it survives
    // refreshes and is shareable / back-button friendly.
    todo: (search.todo as string) || undefined,
  }),
});

export default function Workspace() {
  const search = useSearch({ strict: false }) as WorkspaceSearch;
  const navigate = useNavigate();
  // The currently-open task is read from the ?todo= URL param.
  const selectedId = search.todo ?? null;

  // Only include actual filter/pagination fields in the query input.
  // Excluding `todo` (the open-drawer ID) prevents a refetch + abort
  // every time the detail drawer opens or closes.
  const input = useMemo(
    () => ({
      pageSize: 50,
      page: search.page,
      status: search.status,
      priority: search.priority,
      blocked: search.blocked,
      sortBy: search.sortBy,
      sortOrder: search.sortOrder,
    }),
    [
      search.page,
      search.status,
      search.priority,
      search.blocked,
      search.sortBy,
      search.sortOrder,
    ],
  );

  const { data, isLoading, error } = useTodoList(input);

  const setParam = (next: Record<string, unknown>) =>
    navigate({ to: "/", search: { ...search, ...next } });

  const userEmail = getUserEmail();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TODO Workspace</h1>
        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="text-sm text-muted-foreground">{userEmail}</span>
          )}
          <button
            className="rounded border px-3 py-1 text-sm"
            onClick={() => {
              clearToken();
              navigate({ to: "/login" });
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <TodoFilters
        value={{
          status: search.status,
          priority: search.priority,
          blocked: search.blocked,
          sortBy: search.sortBy,
          sortOrder: search.sortOrder ?? "desc",
        }}
        onChange={(f: FilterState) => setParam({ ...f, page: 1 })}
      />

      <TodoForm />

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-destructive">
          Failed to load tasks. You may need to log in again.
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Name</th>
            <th className="p-2">Status</th>
            <th className="p-2">Priority</th>
            <th className="p-2">Due</th>
            <th className="p-2">Recurs</th>
            <th className="p-2">Blocked</th>
            <th className="p-2">Created By</th>
            <th className="p-2">Created At</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((t) => (
            <tr
              key={t.id}
              className={
                "cursor-pointer border-b hover:bg-muted/50 " +
                (t.id === selectedId
                  ? "bg-primary/2 ring-1 ring-inset ring-primary/40"
                  : "")
              }
              onClick={() => setParam({ todo: t.id })}
            >
              <td className="p-2">{t.name}</td>
              <td className="p-2">
                <StatusBadge status={t.status} />
              </td>
              <td className="p-2">
                <PriorityBadge priority={t.priority} />
              </td>
              <td className="p-2">
                {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}
              </td>
              <td className="p-2">{t.schedule}</td>
              <td className="p-2">
                <BlockedBadge isBlocked={t.isBlocked} />
              </td>
              <td className="p-2 whitespace-nowrap">
                {t.createdByEmail ?? "—"}
              </td>
              <td className="p-2 whitespace-nowrap">
                {format(new Date(t.createdAt), "yy MMM dd HH:mm")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination
        page={data?.meta.page ?? 1}
        totalPages={data?.meta.totalPages ?? 0}
        onChange={(page) => setParam({ page })}
      />

      {/*
        key forces a fresh remount whenever the selected todo changes so that
        transient UI state (e.g. the Add-dependency picker selection) does not
        leak from a previously-viewed todo into the newly-opened one.
      */}
      <TodoDetailDrawer
        key={selectedId ?? "closed"}
        todoId={selectedId}
        onClose={() => setParam({ todo: undefined })}
        onOpenTodo={(id) => setParam({ todo: id })}
      />
    </div>
  );
}
