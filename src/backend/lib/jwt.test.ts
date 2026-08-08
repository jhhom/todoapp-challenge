import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "./jwt";

describe("jwt", () => {
  it("round-trips a signed token", async () => {
    const token = await signToken({ sub: "user-1", email: "a@b.com" });
    const payload = await verifyToken(token);
    expect(payload).toEqual({ sub: "user-1", email: "a@b.com" });
  });

  it("returns null for a tampered token", async () => {
    const token = await signToken({ sub: "user-1", email: "a@b.com" });
    const payload = await verifyToken(token + "tampered");
    expect(payload).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await verifyToken("not-a-token")).toBeNull();
  });
});
