# Todo Change Subscription (oRPC Publisher + SSE)

**Date:** 2026-08-08
**Status:** Approved
**References:** [oRPC Publisher Helper](https://orpc.dev/docs/helpers/publisher), [oRPC Event Iterator / SSE](https://orpc.dev/docs/event-iterator)

## Goal

Whenever the `todo` or `todo_dependency` table is mutated through the application
API, the backend publishes a notification. The frontend subscribes and refetches
`todo.list` (always) and `todo.get` for whichever todo is currently open in
`TodoDetailDrawer` (when relevant), so the UI stays live without polling.

## Non-goals (YAGNI)

- Per-user / tenancy filtering of events.
- Resume support (`Last-Event-ID`) and exactly-once delivery.
- WebSocket transport. Single-process, in-memory pub/sub is sufficient.
- Catching changes made by raw SQL outside the application. (All writes flow
  through the service layer, which is where we publish.)

## Key facts discovered during exploration

- oRPC v1.12.3. `EventPublisher` is re-exported from `@orpc/server`
  (originally `@orpc/shared`). API:
  - `new EventPublisher<TEvents>()`
  - `publisher.publish(event, payload)`
  - `publisher.subscribe(event, { signal })` → `AsyncGenerator` (for a streaming procedure handler)
- `eventIterator(yieldsSchema)` from `@orpc/contract` defines a streaming output.
- The existing fetch-based `RPCLink` already supports SSE streaming; a procedure
  whose handler returns an async iterable is streamed as SSE and the client call
  returns an `AsyncIterable` directly.
- `ClientOptions` has `signal?: AbortSignal`, so a streaming call is
  `client.todo.changed(undefined, { signal })`.
- TanStack Query key helpers: router-level `orpc.todo.list.key()` is a
  **prefix** key (matches all list queries); procedure-level
  `orpc.todo.get.queryKey({ input: { id } })` is a **full-match** key for one
  detail query. Existing code already relies on the prefix form.
- Every write to `todo` / `todo_dependency` flows through `todo.service.ts`
  (`create`, `update`, `softDelete`) and `dependency.service.ts` (`add`, `remove`).

## Architecture

### Event model (coarse-grained, single event)

A single event type **`todo:changed`** is published on every mutation. Payload:

```ts
type TodoChangeEvent = {
  action:
    | "created"
    | "updated"
    | "deleted"
    | "dependency.added"
    | "dependency.removed";
  todoId: string;          // the todo whose row changed, or the taskId of a dependency edge
  dependsOnId?: string;    // present only for dependency.* actions
};
```

Rationale: the list query is server-side paginated/filtered/sorted, so it must
refetch to stay correct regardless of payload richness. A single coarse event
keeps the contract minimal and invalidation is idempotent.

### Backend components

**`src/backend/lib/events.ts`** (new) — single shared publisher instance:

```ts
import { EventPublisher } from "@orpc/server";

export type TodoChangeEvent = { /* ... as above ... */ };
export type TodoChangeEvents = { "todo:changed": TodoChangeEvent };

export const todoPublisher = new EventPublisher<TodoChangeEvents>();
```

**`src/shared/api.ts`** — add a streaming procedure to the contract:

```ts
import { eventIterator } from "@orpc/contract";

// inside todo:
changed: oc
  .route({ method: "GET", path: "/todo/changed" })
  .output(eventIterator(z.object({
    action: z.enum(["created","updated","deleted","dependency.added","dependency.removed"]),
    todoId: z.string().uuid(),
    dependsOnId: z.string().uuid().optional(),
  }))),
```

`GET` route makes it SSE-friendly (and `RPCLink` encodes an empty input in the
query string).

**`src/backend/procedures.ts`** — register the handler:

```ts
changed: os.todo.changed
  .use(requireAuth)
  .handler(async ({ signal }) => todoPublisher.subscribe("todo:changed", { signal })),
```

**Service wiring** — inject `todoPublisher` (as a narrow `publish` callback
dependency) into `createTodoService` and `createDependencyService`, matching the
existing dependency-injection style. Publish after each successful mutation:

| Service method | Events emitted |
| --- | --- |
| `todoService.create` | `created` (the new todo's id) |
| `todoService.update` | `updated` (the todo's id); on recurrence completion also emit `created` for the cloned occurrence's id |
| `todoService.softDelete` | `deleted` (the todo's id) |
| `dependencyService.add` | `dependency.added` with `{ todoId: taskId, dependsOnId }` |
| `dependencyService.remove` | `dependency.removed` with `{ todoId: taskId, dependsOnId }` |

Publishing uses a narrow interface (e.g. `publish: (e: TodoChangeEvent) => void`)
so services stay testable and decoupled from the oRPC helper; tests pass a no-op
or spy.

### Frontend components

**`src/web/hooks/todos.ts`** — new hook `useTodoChanges(openTodoId: string | null)`:

- `useEffect` with an `AbortController`.
- `const it = await client.todo.changed(undefined, { signal: controller.signal })`.
- `for await (const e of it)`:
  - Always: `qc.invalidateQueries({ queryKey: orpc.todo.list.key() })` —
    `key()` is the router-level **prefix** key, matching every `todo.list`
    query regardless of filter/sort/page.
  - Refetch the open todo's detail when the change is relevant to it:
    `qc.invalidateQueries({ queryKey: orpc.todo.get.queryKey({ input: { id: openTodoId } }) })`
    where `queryKey()` is the procedure-level **full-match** key. "Relevant"
    means `e.todoId === openTodoId` OR `e.todoId` is among the open todo's
    current dependencies (read from cache via `qc.getQueryData(...)`). The
    latter is required for correctness: when a todo the open item depends on is
    completed/changed, the open item's `isBlocked` (shown in the drawer) flips,
    even though the event's `todoId` is the *dependency's* id, not the open id.
- Cleanup: `controller.abort()` to close the stream; on unmount the abort is a
  normal cancellation (existing `onError`/logger already skip `AbortError`).

**`src/web/routes/index.tsx`** — call `useTodoChanges(selectedId)` from the
`Workspace` component so the list stays live even when the drawer is closed.

**`TodoDetailDrawer.tsx`** — no logic change required; its `todo.get` query is
already keyed by `id`, so invalidating that key triggers the refetch. (The drawer
benefits from the subscription hosted at the route level.)

### RPCLink logging

The high-frequency event stream would flood the existing request/response logger.
The subscription call is exempted from verbose logging (e.g. skip when
`path` is `['todo','changed']`), so the console stays usable.

## Data flow

```
mutation (create/update/delete/addDep/removeDep)
        │  service publishes
        ▼
todoPublisher.publish('todo:changed', event)
        │  EventPublisher fans out to subscribers
        ▼
todo.changed handler → publisher.subscribe(...) → SSE stream
        │  over the existing fetch RPCLink
        ▼
useTodoChanges(openTodoId) consumes for-await
        │  invalidateQueries
        ▼
todo.list refetch (always) + todo.get refetch (open todo, if relevant)
```

## Error handling & lifecycle

- Auth: the subscription uses `requireAuth`; the `RPCLink` already sends the
  `Authorization` header, so the stream authenticates like any other call.
- Abort/cleanup: `AbortController` on unmount cleanly closes the SSE connection.
- Transient drops: if the stream errors or the browser drops it, the effect
  re-runs (cleanup aborts, then re-subscribes). `AbortError` is treated as
  normal cancellation and not logged as an error.
- Backpressure: `EventPublisher` defaults to a 100-event buffer; for a UI
  invalidation signal this is more than adequate.

## Testing

- **`src/backend/lib/events.test.ts`** (new): verify `publish` → `subscribe`
  yields the event, and that the abort signal stops the iterator.
- **Service tests**: existing tests stay green; the publisher is injected as a
  spy/no-op and assertions can confirm a publish occurred on mutations.
- **Type safety**: the contract change is shared, so `client.todo.changed` is
  end-to-end typed (yields `TodoChangeEvent`).

## Files touched

- New: `src/backend/lib/events.ts`, `src/backend/lib/events.test.ts`
- Edit: `src/shared/api.ts` (contract: `todo.changed`)
- Edit: `src/backend/procedures.ts` (handler + DI wiring)
- Edit: `src/backend/domain/todos/todo.service.ts` (publish on mutations)
- Edit: `src/backend/domain/dependencies/dependency.service.ts` (publish on mutations)
- Edit: `src/web/hooks/todos.ts` (`useTodoChanges`)
- Edit: `src/web/routes/index.tsx` (host the hook)
- Edit: `src/web/client.ts` (quiet logging for the stream)
