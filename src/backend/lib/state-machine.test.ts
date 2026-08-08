import { describe, it, expect } from "vitest";
import { canTransition } from "./state-machine";

describe("canTransition", () => {
  it("allows not_started -> in_progress when unblocked", () => {
    expect(canTransition("not_started", "in_progress", false)).toBe(true);
  });
  it("blocks not_started -> in_progress when blocked", () => {
    expect(canTransition("not_started", "in_progress", true)).toBe(false);
  });
  it("blocks not_started -> completed when blocked", () => {
    expect(canTransition("not_started", "completed", true)).toBe(false);
  });
  it("allows blocked task -> archived regardless of block", () => {
    expect(canTransition("not_started", "archived", true)).toBe(true);
    expect(canTransition("in_progress", "archived", true)).toBe(true);
  });
  it("allows completed -> in_progress reversal when unblocked", () => {
    expect(canTransition("completed", "in_progress", false)).toBe(true);
  });

  it("blocks completed -> in_progress reversal when blocked", () => {
    // The block rule applies to any move to in_progress, including reversal.
    expect(canTransition("completed", "in_progress", true)).toBe(false);
  });
  it("allows in_progress -> not_started reversal (unblocked)", () => {
    expect(canTransition("in_progress", "not_started", false)).toBe(true);
  });
  it("allows in_progress -> not_started reversal even when blocked", () => {
    // Demoting to "not_started" never violates the block rule.
    expect(canTransition("in_progress", "not_started", true)).toBe(true);
  });
  it("allows completed -> not_started reversal (unblocked)", () => {
    expect(canTransition("completed", "not_started", false)).toBe(true);
  });
  it("allows in_progress -> completed when unblocked", () => {
    expect(canTransition("in_progress", "completed", false)).toBe(true);
  });
  it("rejects same-status transitions", () => {
    expect(canTransition("completed", "completed", false)).toBe(false);
  });
  it("allows archived -> not_started (archived is not terminal)", () => {
    expect(canTransition("archived", "not_started", false)).toBe(true);
  });
  it("rejects archived -> in_progress when blocked", () => {
    expect(canTransition("archived", "in_progress", true)).toBe(false);
  });
});
