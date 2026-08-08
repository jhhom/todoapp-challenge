import { describe, it, expect } from "vitest";
import { wouldCreateCycle } from "./cycle-detection";

describe("wouldCreateCycle", () => {
  it("returns false when no cycle (chain)", () => {
    // B depends on A; proposing C depends on B
    const adj = new Map([["B", ["A"]]]);
    expect(wouldCreateCycle("C", "B", adj)).toBe(false);
  });

  it("returns true for a direct 2-cycle", () => {
    // A depends on B; proposing B depends on A
    const adj = new Map([["A", ["B"]]]);
    expect(wouldCreateCycle("B", "A", adj)).toBe(true);
  });

  it("returns true for a transitive cycle (A->B->C->A)", () => {
    const adj = new Map([
      ["A", ["B"]],
      ["B", ["C"]],
    ]);
    expect(wouldCreateCycle("C", "A", adj)).toBe(true);
  });

  it("returns false when the new edge points to a leaf", () => {
    const adj = new Map([
      ["A", ["B"]],
      ["B", []],
    ]);
    expect(wouldCreateCycle("C", "A", adj)).toBe(false);
  });

  it("returns true when a task depends on itself", () => {
    expect(wouldCreateCycle("A", "A", new Map())).toBe(true);
  });
});
