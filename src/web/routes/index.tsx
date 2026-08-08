import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { useTodoList } from "../hooks/todos";
import { TodoFilters, type FilterState } from "../components/TodoFilters";
import { Pagination } from "../components/Pagination";
import { TodoForm } from "../components/TodoForm";
import { TodoDetailDrawer } from "../components/TodoDetailDrawer";
import { clearToken } from "../lib/auth";

export const Route = createFileRoute("/")({
  component: Workspace,
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 1) || 1,
    status: (search.status as string) || undefined,
    priority: (search.priority as string) || undefined,
    blocked: (search.blocked as string) || undefined,
    sortBy: (search.sortBy as string) || undefined,
    sortOrder: (search.sortOrder as "asc" | "desc") || "asc",
  }),
});

export default function Workspace() {
  const search = useSearch({ strict: false }) as {
    page: number;
    status?: string;
    priority?: string;
    blocked?: string;
    sortBy?: string;
    sortOrder: "asc" | "desc";
  };
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const input = useMemo(() => ({ pageSize: 50, ...search }), [search]);

  const { data, isLoading, error } = useTodoList(input);

  const setParam = (next: Record<string, unknown>) =>
    navigate({ to: "/", search: { ...search, ...next } });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TODO Workspace</h1>
        <button
          className="rounded border px-3 py-1 text-sm"
          onClick={() => {
            clearToken();
            navigate({ to: "/login" });
          }}
        >
          Log out
        </button>
      </header>

      <TodoFilters
        value={{
          status: search.status,
          priority: search.priority,
          blocked: search.blocked,
          sortBy: search.sortBy,
          sortOrder: search.sortOrder ?? "asc",
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
            <th className="p-2">Created At</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((t) => (
            <tr
              key={t.id}
              className="cursor-pointer border-b hover:bg-muted/50"
              onClick={() => setSelectedId(t.id)}
            >
              <td className="p-2">{t.name}</td>
              <td className="p-2">{t.status}</td>
              <td className="p-2">{t.priority}</td>
              <td className="p-2">
                {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "—"}
              </td>
              <td className="p-2">{t.schedule}</td>
              <td className="p-2">{t.isBlocked ? "yes" : "no"}</td>
              <td className="p-2 whitespace-nowrap">
                {format(new Date(t.createdAt), "yyyy-MM-dd HH:mm:ss")}
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

      <TodoDetailDrawer
        todoId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
