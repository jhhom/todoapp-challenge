import { describe, it, expect } from "vitest";
import { EventPublisher } from "@orpc/server";
import { todoPublisher, publishTodoChange } from "./events";

describe("todo change events", () => {
  it("callback subscribers receive events published via publishTodoChange", () => {
    const seen: string[] = [];
    const unsub = todoPublisher.subscribe("todo:changed", (e) =>
      seen.push(
        `${e.action}:${e.todoId}${e.dependsOnId ? ":" + e.dependsOnId : ""}`,
      ),
    );
    publishTodoChange({ action: "created", todoId: "abc" });
    publishTodoChange({
      action: "dependency.added",
      todoId: "t1",
      dependsOnId: "t2",
    });
    unsub();
    // After unsubscribe, events are no longer delivered to this listener.
    publishTodoChange({ action: "updated", todoId: "xyz" });
    expect(seen).toEqual(["created:abc", "dependency.added:t1:t2"]);
  });

  it("async-iterator subscribers receive published events", async () => {
    // Fresh instance so the test is fully isolated from the shared singleton.
    const pub = new EventPublisher<{ "todo:changed": { todoId: string } }>();
    const seen: string[] = [];
    const iter = pub.subscribe("todo:changed");
    const done = (async () => {
      for await (const e of iter) {
        seen.push(e.todoId);
        if (seen.length === 2) break;
      }
    })();

    // Yield to the event loop so the generator registers its listener.
    await new Promise((r) => setTimeout(r, 10));
    pub.publish("todo:changed", { todoId: "one" });
    pub.publish("todo:changed", { todoId: "two" });
    await done;
    expect(seen).toEqual(["one", "two"]);
  });

  it("aborting the signal ends the async iterator", async () => {
    const pub = new EventPublisher<{ "todo:changed": { todoId: string } }>();
    const controller = new AbortController();
    const seen: string[] = [];
    const iter = pub.subscribe("todo:changed", { signal: controller.signal });
    const done = (async () => {
      try {
        for await (const e of iter) seen.push(e.todoId);
      } catch {
        // Abort during an active pull may throw; that is acceptable.
      }
    })();

    await new Promise((r) => setTimeout(r, 10));
    pub.publish("todo:changed", { todoId: "x" });
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await done;
    // The event published before abort was delivered; nothing after.
    pub.publish("todo:changed", { todoId: "y" });
    expect(seen).toEqual(["x"]);
  });
});
