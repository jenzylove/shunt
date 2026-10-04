import { describe, expect, it } from "vitest";
import { ruleParse, validate } from "./parse";

const KNOWN = new Set(["NVDA", "AAPL", "TSLA", "HOOD", "PLTR", "MSFT", "MU", "COIN", "AMD", "SMR"]);
const known = (t: string) => KNOWN.has(t);
const TUE = new Date("2026-09-29T14:00:00Z");
const p = (s: string) => validate(ruleParse(s, known, TUE));

describe("rule parser", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["buy $20k rNVDA, holding 5 days, max loss $600", { ticker: "NVDA", venue: "rtoken", side: "long", sizeUsd: 20000, horizonDays: 5, lossLimitUsd: 600 }],
    ["long 5x TSLA perp $10,000 over the weekend, can lose $400", { ticker: "TSLA", venue: "perp", leverage: 5, sizeUsd: 10000, horizonDays: 5, lossLimitUsd: 400 }],
    ["short $15k of HOODUSDT for 2 weeks risk 750", { ticker: "HOOD", venue: "perp", side: "short", sizeUsd: 15000, horizonDays: 10, lossLimitUsd: 750 }],
    ["I want 8000 usdt of palantir for a week, max loss 3%", { ticker: "PLTR", venue: "rtoken", sizeUsd: 8000, horizonDays: 5, lossLimitUsd: 240 }],
    ["$5k rAAPL overnight, stop at -$150", { ticker: "AAPL", sizeUsd: 5000, horizonDays: 1, lossLimitUsd: 150 }],
    ["buy $50k MSFT for a month, I can stomach $2k", { ticker: "MSFT", sizeUsd: 50000, horizonDays: 20, lossLimitUsd: 2000 }],
    ["put $3k into micron for 3 days, lose up to $90", { ticker: "MU", sizeUsd: 3000, horizonDays: 3, lossLimitUsd: 90 }],
    ["bet against $12k COIN 10x for 4 days limit $500", { ticker: "COIN", venue: "perp", side: "short", leverage: 10, sizeUsd: 12000, horizonDays: 4, lossLimitUsd: 500 }],
  ];
  for (const [text, want] of cases) {
    it(text, () => {
      const r = p(text);
      expect(r.missing).toEqual([]);
      expect(r.trade).toMatchObject(want);
    });
  }
  const lower: [string, Record<string, unknown>][] = [
    ["buy aapl for 5 days", { ticker: "AAPL", horizonDays: 5 }],
    ["hold 20k nvda for 5 days with a 600 limit", { ticker: "NVDA", sizeUsd: 20000, horizonDays: 5, lossLimitUsd: 600 }],
    ["what happens if i hold $20k tsla for 3 days, max loss $500", { ticker: "TSLA", sizeUsd: 20000, horizonDays: 3, lossLimitUsd: 500 }],
    ["how about apple for a week", { ticker: "AAPL", horizonDays: 5 }],
    ["long rnvda 10k two weeks stop 400", { ticker: "NVDA", venue: "rtoken", sizeUsd: 10000, horizonDays: 10, lossLimitUsd: 400 }],
  ];
  for (const [text, want] of lower) {
    it("reads lowercase and loose phrasing: " + text, () => {
      expect(ruleParse(text, known, TUE)).toMatchObject(want);
    });
  }
  it("does not read everyday words as stocks", () => {
    const k = (t: string) => ["ALL", "NOW", "CAN", "ONE", "FOR", "NVDA"].includes(t);
    expect(ruleParse("can i buy one for now, all in on nvda", k, TUE).ticker).toBe("NVDA");
    expect(ruleParse("can i hold it for now", k, TUE).ticker).toBeUndefined();
  });
  it("reports what is missing instead of guessing", () => {
    const r = p("buy some nvidia");
    expect(r.trade).toBeNull();
    expect(r.missing).toEqual(expect.arrayContaining(["sizeUsd", "horizonDays", "lossLimitUsd"]));
  });
  it("keeps the thesis text", () => {
    expect(ruleParse("buy $20k rNVDA 5 days max loss $600 because the selloff is overdone", known).thesis).toContain("selloff is overdone");
  });
  it("caps horizon and leverage and says so", () => {
    const r = p("long $10k TSLA perp 150x for 30 days max loss $500");
    expect(r.trade?.horizonDays).toBe(20);
    expect(r.trade?.leverage).toBe(100);
    expect(r.notes.length).toBe(2);
  });
});
