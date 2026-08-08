import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "../client";

export type TodoListInput = Parameters<
  typeof orpc.todo.list.queryOptions
>[0] extends {
  input?: infer I;
}
  ? I
  : never;

/** Read: list todos (server-side pagination/filter/sort). */
export function useTodoList(input: Record<string, unknown>) {
  return useQuery(orpc.todo.list.queryOptions({ input: input as never }));
}

function useInvalidateTodos() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: orpc.todo.key() });
}

export function useCreateTodo() {
  const qc = useQueryClient();
  return useMutation(
    orpc.todo.create.mutationOptions({
      onSuccess: async () => {
        // Only invalidate the LIST — creating a todo doesn't change any
        // existing todo's detail data. Avoids refetching todo.get for the
        // currently-open drawer, which could 404 if that todo no longer
        // exists (e.g., stale ?todo= URL param after a DB reset).
        await qc.invalidateQueries({ queryKey: orpc.todo.list.key() });
      },
    }),
  );
}

export function useUpdateTodo() {
  const invalidate = useInvalidateTodos();
  return useMutation(
    orpc.todo.update.mutationOptions({ onSuccess: invalidate }),
  );
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation(
    orpc.todo.delete.mutationOptions({
      onSuccess: async () => {
        // Only invalidate the LIST — do NOT invalidate todo.get or the entire
        // todo.* tree. The detail drawer is still mounted at this point with an
        // active todo.get observer. If we invalidate todo.get, React Query will
        // refetch it for the just-deleted todo and get a 404.
        // The component-level onSuccess (onClose) will unmount the drawer right
        // after, which naturally deactivates the todo.get query.
        await qc.invalidateQueries({ queryKey: orpc.todo.list.key() });
      },
    }),
  );
}

export function useAddDependency() {
  const invalidate = useInvalidateTodos();
  return useMutation(
    orpc.todo.addDependency.mutationOptions({ onSuccess: invalidate }),
  );
}

export function useRemoveDependency() {
  const invalidate = useInvalidateTodos();
  return useMutation(
    orpc.todo.removeDependency.mutationOptions({ onSuccess: invalidate }),
  );
}

/**
 * Whether a change event should trigger a refetch of the open todo's detail.
 * True when the open todo itself changed, or when one of its current
 * dependencies changed — its `isBlocked` status depends on those.
 */
function affectsOpenTodo(
  qc: ReturnType<typeof useQueryClient>,
  e: { todoId: string },
  openTodoId: string,
): boolean {
  if (e.todoId === openTodoId) return true;
  const detail = qc.getQueryData(
    orpc.todo.get.queryKey({ input: { id: openTodoId } }),
  );
  return (
    !!detail &&
    Array.isArray(detail.dependencies) &&
    detail.dependencies.includes(e.todoId)
  );
}

/**
 * Subscribe to backend `todo.changed` notifications (SSE) and refetch the
 * affected queries so the UI stays live without polling.
 *
 * - `todo.list` is invalidated on every event (server-paginated/filtered, so it
 *   must refetch to stay correct).
 * - `todo.get` for the currently-open todo is invalidated when the event is
 *   relevant to it (the open todo changed, or one of its dependencies changed).
 *
 * The connection is held for the component lifetime; switching the open todo
 * does not reconnect. Transient drops are retried with a short backoff.
 */
export function useTodoChanges(openTodoId: string | null) {
  const qc = useQueryClient();
  // Keep the latest open id in a ref so swapping todos does NOT tear down and
  // re-establish the SSE connection.
  const openIdRef = useRef(openTodoId);
  openIdRef.current = openTodoId;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function run() {
      while (!cancelled) {
        try {
          const it = await client.todo.changed(undefined, {
            signal: controller.signal,
          });
          for await (const e of it) {
            if (cancelled) break;
            // The list view is always potentially affected.
            void qc.invalidateQueries({ queryKey: orpc.todo.list.key() });

            const id = openIdRef.current;
            if (id && affectsOpenTodo(qc, e, id)) {
              void qc.invalidateQueries({
                queryKey: orpc.todo.get.queryKey({ input: { id } }),
              });
            }
          }
        } catch {
          if (cancelled || controller.signal.aborted) break;
          // Transient error (network blip, server restart) — wait briefly and retry.
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [qc]);
}
