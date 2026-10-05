// Regression cases from the 5 Oct audit of the live app: every one is a way the verdict was wrong or the page broke.
import { describe, expect, it } from "vitest";
import { combineSameDay } from "./check";
import { fundingRunsBetween, gapDays, nyInstant, tradingDaysAfter } from "./engine/calendar";
import { assess, highestSafeLeverage, liquidationPct, maxSize } from "./engine/switchpoint";
import type { Band, Trade } from "./engine/types";
import { cleanDraft, daysThroughWeekend, ruleParse, validate } from "./parse";
import { POST } from "../app/api/check/route";

const post = (body: unknown) => POST(new Request("http://x/api/check", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "x-real-ip": "9.9.9." + Math.floor(Math.random() * 1e6) } }));

describe("over the weekend", () => {
  const hold = (iso: string) => daysThroughWeekend(new Date(iso));
  it("Friday before the close holds through Monday: two sessions", () => expect(hold("2026-10-02T14:00:00Z")).toBe(2));
  it("Friday after the close: Monday only", () => expect(hold("2026-10-02T21:00:00Z")).toBe(1));
  it("Saturday and Sunday: Monday only", () => {
    expect(hold("2026-10-03T12:00:00Z")).toBe(1);
    expect(hold("2026-10-04T12:00:00Z")).toBe(1);
  });
  it("Monday during the session means the coming weekend, through the Monday after", () => expect(hold("2026-10-05T14:00:00Z")).toBe(6));
  it("uses New York dates, not UTC: Sunday 22:00 New York is already Monday in UTC", () => {
    expect(hold("2026-10-05T02:00:00Z")).toBe(1);
    expect(hold("2026-10-04T02:00:00Z")).toBe(1);
  });
  it("Monday before the open means the next weekend, not the one that is ending", () => expect(hold("2026-10-05T13:20:00Z")).toBe(6));
  it("a holiday weekend counts: Thanksgiving week", () => expect(hold("2026-11-25T15:00:00Z")).toBe(3));
  it("a weekend closure that already ended is not a scheduled event", () => {
    const now = new Date("2026-10-05T15:00:00Z");
    expect(gapDays(tradingDaysAfter(now, 3), now)).toEqual([]);
  });
  it("the featured preset reads the same way", () => {
    const d = ruleParse("long 5x TSLA perp $10k over the weekend, can lose $400", () => true, new Date("2026-10-05T15:00:00Z"));
    expect(d).toMatchObject({ horizonDays: 6, sizeUsd: 10000, lossLimitUsd: 400, leverage: 5 });
  });
});

describe("funding", () => {
  it("counts the settlements actually crossed", () => {
    expect(fundingRunsBetween(new Date("2026-10-05T07:59:00Z"), new Date("2026-10-05T16:01:00Z"), 8)).toBe(2);   // 08:00 and 16:00 UTC
    expect(fundingRunsBetween(new Date("2026-10-05T16:30:00Z"), new Date("2026-10-05T20:00:00Z"), 8)).toBe(0);
    expect(fundingRunsBetween(new Date("2026-10-05T00:00:00Z"), new Date("2026-10-12T00:00:00Z"), 8)).toBe(21);
  });
  it("finds the close of a New York day in UTC, daylight saving included", () => {
    expect(nyInstant("2026-10-05", 16 * 60).toISOString()).toBe("2026-10-05T20:00:00.000Z");
    expect(nyInstant("2026-11-06", 16 * 60).toISOString()).toBe("2026-11-06T21:00:00.000Z");
  });
});

const T: Trade = { ticker: "X", venue: "perp", side: "long", sizeUsd: 10_000, horizonDays: 3, lossLimitUsd: 500, leverage: 5, confidence: 0.8 };
const band = (pct: number, date?: string, kind: Band["kind"] = "earnings"): Band => ({ kind, label: kind, date, measurable: true, n: 30, pct, method: "volScaled" });

describe("loss budget", () => {
  it("includes the full round trip cost and funding in the loss and the verdict", () => {
    const flat = assess(T, band(0.04), band(0.04), [], 0);
    expect(flat.verdict.state).toBe("fits");                                            // 4% of 10k is 400, under 500
    const withCosts = assess(T, band(0.04), band(0.04), [], 150);
    expect(withCosts.verdict.state).toBe("does-not-fit");                               // 400 + 150 breaches 500
    expect(withCosts.costUsd).toBe(150);
  });
  it("re-prices the order book at each candidate size instead of scaling linearly", () => {
    const cost = (size: number) => (size > 6_000 ? Infinity : size * 0.002);           // the book is gone beyond 6k
    expect(maxSize(T, 0.03, cost)).toBeLessThanOrEqual(6_000);
    expect(maxSize(T, 0.03, cost)).toBeGreaterThan(5_000);
    const steep = (size: number) => size * 0.001 + (size * size) / 2e6;                  // costs grow faster than size
    const m = maxSize(T, 0.03, steep);
    expect(m * 0.03 + steep(m)).toBeLessThanOrEqual(500);
    expect((m + 2) * 0.03 + steep(m + 2)).toBeGreaterThan(500);
  });
  it("shows no liquidation or safe leverage when the margin tiers are missing", () => {
    const a = assess(T, band(0.04), band(0.04), [], 0, null);
    expect(a.liquidationPct).toBeNull();
    expect(a.safeLeverage).toBeNull();
  });
  it("uses the side specific liquidation formula", () => {
    expect(liquidationPct(10, 0.005, "long")).toBeCloseTo(0.0955, 3);
    expect(liquidationPct(10, 0.005, "short")).toBeCloseTo(0.0945, 3);
    expect(highestSafeLeverage(0.05, 0.005, "long")).toBe(18);
  });
});

describe("overlapping events", () => {
  it("combines events on the same day into one cautious range, and leaves the rest alone", () => {
    const out = combineSameDay([band(0.05, "2026-10-12"), band(0.02, "2026-10-12", "weekend"), band(0.03, "2026-10-14", "fed")]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ date: "2026-10-12", combined: true });
    expect(out[0].pct).toBeCloseTo(0.07);
    expect(out[1].pct).toBe(0.03);
  });
});

describe("strict drafts", () => {
  it("keeps known sane fields and drops the rest", () => {
    expect(cleanDraft({ ticker: "NVDA", sizeUsd: 5000, evil: "x" })).toEqual({ ticker: "NVDA", sizeUsd: 5000 });
    expect(cleanDraft({ sizeUsd: null })).toEqual({});
  });
  it("rejects non finite, negative, absurd and malformed values", () => {
    for (const bad of [{ sizeUsd: -5 }, { sizeUsd: 1e12 }, { horizonDays: 0 }, { leverage: 0.2 }, { venue: "futures" }, { ticker: "NV DA!" }, { lossLimitUsd: "600" }, [1], "x"]) {
      expect(cleanDraft(bad)).toBeNull();
    }
  });
  it("explains that a leveraged size is the position value", () => {
    const r = validate({ ticker: "TSLA", venue: "perp", sizeUsd: 10_000, horizonDays: 3, lossLimitUsd: 400, leverage: 5 });
    expect(r.notes.join(" ")).toContain("$2,000 of your own money");
  });
  it("reads a margin amount at its leverage", () => {
    expect(ruleParse("long TSLA perp 5x with $2k margin 3 days max loss 300", () => true).sizeUsd).toBe(10_000);
  });
});

describe("the api never breaks the page", () => {
  it("answers bad input with a normal error that has the usual shape", async () => {
    for (const [body, status] of [["{bad", 400], ["[]", 400], [{ text: 5 }, 400], [{ draft: { sizeUsd: -1 } }, 400], [{ text: "x".repeat(25_000) }, 413]] as const) {
      const r = await post(body);
      expect(r.status).toBe(status);
      const j = await r.json();
      expect(typeof j.error).toBe("string");
      expect(j.parsed).toBeTruthy();
    }
  });
  it("answers a 429 in the same shape", async () => {
    const mk = () => POST(new Request("http://x/api/check", { method: "POST", body: "{}", headers: { "x-real-ip": "1.2.3.4" } }));
    let last: Response | null = null;
    for (let i = 0; i < 45; i++) last = await mk();
    expect(last!.status).toBe(429);
    expect((await last!.json()).parsed).toBeTruthy();
  });
});
