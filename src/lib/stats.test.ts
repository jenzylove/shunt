import { describe, expect, it } from "vitest";
import { median, wilson } from "./stats";

describe("stats", () => {
  it("gives the textbook Wilson interval", () => {
    const [lo, hi] = wilson(0.8, 100);
    expect(lo).toBeCloseTo(0.711, 3);
    expect(hi).toBeCloseTo(0.867, 3);
  });
  it("narrows with more checks and stays inside 0 to 1", () => {
    const [lo, hi] = wilson(0.805, 302_642);
    expect(hi - lo).toBeLessThan(0.004);
    expect(wilson(1, 5)[1]).toBe(1);
    expect(wilson(0, 5)[0]).toBe(0);
  });
  it("finds the median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
