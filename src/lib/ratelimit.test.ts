import { describe, expect, it } from "vitest";
import { limited } from "./ratelimit";

describe("limiter", () => {
  it("allows up to max in the window, then blocks, then recovers", () => {
    const k = "t1";
    for (let i = 0; i < 3; i++) expect(limited(k, 3, 1000, 100 + i)).toBe(false);
    expect(limited(k, 3, 1000, 200)).toBe(true);
    expect(limited(k, 3, 1000, 1500)).toBe(false);
  });
  it("keeps separate counts per key", () => {
    expect(limited("a", 1, 1000, 0)).toBe(false);
    expect(limited("b", 1, 1000, 0)).toBe(false);
    expect(limited("a", 1, 1000, 1)).toBe(true);
  });
});
