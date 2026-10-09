import { describe, expect, it } from "vitest";
import { detectQuestion } from "./questions";
import { ruleParse, tickersIn } from "./parse";

const known = (t: string) => ["NVDA", "AMD", "AAPL", "TSLA", "NEXT", "MSFT", "META"].includes(t);

describe("questions about a trade", () => {
  const q = (s: string, changes = false) => detectQuestion(s, tickersIn(s, known), changes)?.kind ?? null;
  it("reads the common questions without a model", () => {
    expect(q("what about the upside?")).toBe("upside");
    expect(q("how much could I make?")).toBe("upside");
    expect(q("what's the worst that could happen?")).toBe("worst");
    expect(q("why doesn't it fit?")).toBe("why");
    expect(q("what size would fit?")).toBe("size");
    expect(q("when is the next earnings?")).toBe("next-earnings");
    expect(q("when does nvidia report next?", true)).toBe("next-earnings");
    expect(q("is this a good trade?")).toBe("explain");
  });
  it("compares two stocks", () => {
    const s = "compare nvda and amd for a 10k 5 day trade, max loss 400";
    expect(detectQuestion(s, tickersIn(s, known), true)).toEqual({ kind: "compare", tickers: ["NVDA", "AMD"] });
  });
  it("leaves changes alone", () => {
    expect(q("make it 10k", true)).toBeNull();
    expect(q("use the worst case")).toBeNull();
    expect(q("is it safe to hold 8k of apple over the weekend, max loss 300", true)).toBeNull();
  });
  it("never reads everyday words as stocks", () => {
    expect(ruleParse("when is the next earnings?", known).ticker).toBeUndefined();
    expect(tickersIn("when is the next earnings?", known)).toEqual([]);
  });
  it("flags other currencies and two different loss limits", () => {
    expect(ruleParse("€5000 of NVDA for 3 days max loss €200", known).currency).toBe("€");
    expect(ruleParse("buy $10k AAPL for 5 days, max loss $500 or 2%, whichever", known).lossConflict).toEqual([500, 200]);
    expect(ruleParse("buy $10k AAPL for 5 days, max loss $200 or 2%", known).lossConflict).toBeUndefined();
  });
});
