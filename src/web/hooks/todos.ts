import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../client";

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
