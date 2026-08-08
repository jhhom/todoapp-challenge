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
  const invalidate = useInvalidateTodos();
  return useMutation(
    orpc.todo.create.mutationOptions({ onSuccess: invalidate }),
  );
}

export function useUpdateTodo() {
  const invalidate = useInvalidateTodos();
  return useMutation(
    orpc.todo.update.mutationOptions({ onSuccess: invalidate }),
  );
}

export function useDeleteTodo() {
  const invalidate = useInvalidateTodos();
  return useMutation(
    orpc.todo.delete.mutationOptions({ onSuccess: invalidate }),
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
