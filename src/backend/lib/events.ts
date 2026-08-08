import { EventPublisher } from "@orpc/server";

/**
 * What kind of mutation occurred on the `todo` / `todo_dependency` tables.
 * Emitted as part of a {@link TodoChangeEvent} so subscribers can decide what
 * to refetch.
 */
export type TodoChangeAction =
  | "created"
  | "updated"
  | "deleted"
  | "dependency.added"
  | "dependency.removed";

/**
 * A single change notification.
 *
 * - `todoId` is the todo whose row changed. For dependency actions it is the
 *   `taskId` (the task whose edge/blocked-status changed).
 * - `dependsOnId` is only present for `dependency.*` actions and identifies the
 *   other end of the edge.
 */
export interface TodoChangeEvent {
  action: TodoChangeAction;
  todoId: string;
  dependsOnId?: string;
}

/** Event map understood by the {@link todoPublisher}. */
export type TodoChangeEvents = {
  "todo:changed": TodoChangeEvent;
};

/**
 * Narrow callback services use to announce a change. Keeping this a plain
 * function (rather than the oRPC helper itself) keeps services decoupled from
 * `@orpc/server` and trivially testable with a spy or the default no-op.
 */
export type PublishTodoChange = (event: TodoChangeEvent) => void;

/**
 * In-process pub/sub for todo/dependency mutations.
 *
 * Services call {@link publishTodoChange} after each successful mutation; the
 * `todo.changed` streaming procedure subscribes via
 * `todoPublisher.subscribe('todo:changed', { signal })` and forwards the events
 * to clients over SSE.
 *
 * This is single-process, in-memory pub/sub — sufficient for this app and
 * intentionally simpler than a DB-level LISTEN/NOTIFY setup.
 */
export const todoPublisher = new EventPublisher<TodoChangeEvents>();

/**
 * Publish a `todo:changed` event to all subscribers. This is the function
 * injected into the todo/dependency services.
 */
export const publishTodoChange: PublishTodoChange = (event) =>
  todoPublisher.publish("todo:changed", event);
