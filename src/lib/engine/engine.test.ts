import { describe, expect, it } from "vitest";
import { cq, dayBand, eventBand, horizonBand, MIN_EVENTS } from "./bands";
import { assess, liquidationPct, maxSize } from "./switchpoint";
import { gapDays, reactionDay, tradingDaysAfter } from "./calendar";
import type { Calibration, Profile, Trade } from "./types";

const ev = (move: number, z: number) => ({ d: "2025-01-01", move, z });

const profile: Profile = {
  ticker: "TEST", name: "Test Co", sector: null, perp: true, asOf: "2026-09-28", lastClose: 100,
  volNow: 0.02,
  normalDay: { n: 700, p80: 0.02, p95: 0.035, z80: 1.2, z95: 2.0 },
  kDay: { "1": { n: 700, z80: 1.2, z95: 2.0 }, "5": { n: 700, z80: 1.1, z95: 1.9, p80: 0.05 } },
  overnight: { n: 700, z80: 0.6, z95: 1.2 },
  weekend: { n: 150, z80: 0.8, z95: 1.5 },
  earnings: { n: 20, z80: 4, z95: 6, p80: 0.08, events: [] },
  fed: { n: 5, events: [] },
  bellwethers: [{ hub: "NVDA", n: 10, ratio: 2, events: Array.from({ length: 10 }, (_, i) => ev(0.01 * (i + 1), 0.5 * (i + 1))) }],
};
const cal: Calibration = { asOf: "x", target: 0.8, types: { weekend: { corrected: { factor: 1.4, apply: true, rateAfter: 0.85, uncorrectedRateAfter: 0.7, checkedAfter: 100 } } } };
const trade: Trade = { ticker: "TEST", venue: "rtoken", side: "long", sizeUsd: 20_000, horizonDays: 5, lossLimitUsd: 600, confidence: 0.8 };

describe("bands", () => {
  it("small sample quantile picks the ceil((n+1)q)th value", () => {
    expect(cq([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.8)).toBe(9);
    expect(cq([5], 0.95)).toBe(5);
  });
  it("scales event bands by current volatility", () => {
    const b = eventBand(profile, "earnings", 0.8, null, { label: "e" });
    expect(b.measurable).toBe(true);
    expect(b.pct).toBeCloseTo(4 * 0.02);
  });
  it("marks thin history as cannot measure instead of guessing", () => {
    const b = eventBand(profile, "fed", 0.8, null, { label: "f" });
    expect(profile.fed.n).toBeLessThan(MIN_EVENTS);
    expect(b.measurable).toBe(false);
    expect(b.pct).toBeNull();
  });
  it("applies a learned correction only at the 80% band it was fitted for", () => {
    expect(eventBand(profile, "weekend", 0.8, cal, { label: "w" }).pct).toBeCloseTo(0.8 * 0.02 * 1.4);
    expect(eventBand(profile, "weekend", 0.95, cal, { label: "w" }).pct).toBeCloseTo(1.5 * 0.02);
  });
  it("computes bellwether bands from that bellwether's events", () => {
    const b = eventBand(profile, "bellwether", 0.8, null, { label: "b", hub: "NVDA" });
    expect(b.n).toBe(10);
    expect(b.pct).toBeCloseTo(cq([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5], 0.8) * 0.02);
    expect(eventBand(profile, "bellwether", 0.8, null, { label: "b", hub: "AAPL" }).measurable).toBe(false);
  });
  it("scales the holding period band with the square root of time", () => {
    const b = horizonBand(profile, 5, 0.8);
    expect(b.pct).toBeCloseTo(1.1 * 0.02 * Math.sqrt(5));
  });
});

describe("switchpoint", () => {
  const day = dayBand(profile, 0.8, null);
  const horizon = horizonBand(profile, 5, 0.8);
  it("says fits when nothing scheduled breaches the limit", () => {
    const a = assess({ ...trade, lossLimitUsd: 5_000 }, day, horizon, [eventBand(profile, "earnings", 0.8, null, { label: "e", date: "2026-10-02" })]);
    expect(a.verdict.state).toBe("fits");
  });
  it("finds the size that fits and the exit before the breaching event", () => {
    const e = eventBand(profile, "earnings", 0.8, null, { label: "TEST earnings", date: "2026-10-02" });
    const a = assess({ ...trade, lossLimitUsd: 1_000 }, day, horizon, [e]);
    expect(a.verdict.state).toBe("fits-if");
    if (a.verdict.state === "fits-if") {
      expect(a.verdict.maxSizeUsd).toBe(Math.floor(1_000 / 0.08));
      expect(a.verdict.exitBefore?.date).toBe("2026-10-02");
    }
  });
  it("says does not fit when an ordinary day already breaches", () => {
    const a = assess({ ...trade, lossLimitUsd: 300 }, day, horizon, []);
    expect(a.verdict.state).toBe("does-not-fit");
  });
  it("sizes a rejected trade for the whole hold and every measured event", () => {
    const t = { ...trade, lossLimitUsd: 300 };
    const earnings = eventBand(profile, "earnings", 0.8, null, { label: "earnings" });
    const cost = (size: number) => size * 0.001 + size * size * 1e-8;
    for (const events of [[], [earnings]]) {
      const a = assess(t, day, horizon, events, cost);
      expect(a.verdict.state).toBe("does-not-fit");
      if (a.verdict.state !== "does-not-fit") throw new Error("Expected rejected trade");
      const resized = assess({ ...t, sizeUsd: a.verdict.maxSizeUsd }, day, horizon, events, cost);
      expect(resized.verdict.state).toBe("fits");
      expect(resized.day.breaches).toBe(false);
      expect(resized.horizon.breaches).toBe(false);
      expect(resized.events.every((event) => !event.breaches)).toBe(true);
    }
  });
  it("includes the cost of getting out in the loss", () => {
    expect(maxSize({ ...trade, lossLimitUsd: 1_000 }, 0.04, 20)).toBe(Math.floor(1_000 / (0.04 + 0.001)));
  });
  it("reports perp liquidation distance", () => {
    expect(liquidationPct(10, 0.005)).toBeCloseTo(0.095);
    expect(liquidationPct(undefined, 0.005)).toBeNull();
  });
  it("flags a measured move that would liquidate a leveraged perp", () => {
    const e = eventBand(profile, "earnings", 0.8, null, { label: "e", date: "2026-10-02" }); // 8% move
    const a = assess({ ...trade, venue: "perp", leverage: 20, lossLimitUsd: 50_000 }, day, horizon, [e]);
    expect(a.liquidationPct).toBeCloseTo(0.045);
    expect(a.events[0].liquidates).toBe(true);
    expect(a.safeLeverage).toBe(Math.floor(1 / (0.08 + 0.005)));
  });
  it("refuses to price an exit the book cannot fill, instead of showing zero cost", () => {
    const e = eventBand(profile, "earnings", 0.8, null, { label: "e", date: "2026-10-02" });
    const empty = assess({ ...trade, lossLimitUsd: 50_000 }, day, horizon, [e], 0, 0.005, { absorbableUsd: 0, complete: false });
    expect(empty.verdict).toEqual({ state: "illiquid", absorbableUsd: 0 });
    const thin = assess({ ...trade, lossLimitUsd: 50_000 }, day, horizon, [e], 0, 0.005, { absorbableUsd: 11_234.9, complete: false });
    expect(thin.verdict).toEqual({ state: "illiquid", absorbableUsd: 11_234 });
    const deep = assess({ ...trade, lossLimitUsd: 50_000 }, day, horizon, [e], 0, 0.005, { absorbableUsd: 20_000, complete: true });
    expect(deep.verdict.state).toBe("fits");
  });
  it("lists events it cannot measure separately", () => {
    const a = assess(trade, day, horizon, [eventBand(profile, "fed", 0.8, null, { label: "Fed", date: "2026-10-28" })]);
    expect(a.unmeasured).toHaveLength(1);
    expect(a.events).toHaveLength(0);
  });
});

describe("calendar", () => {
  it("skips weekends and NYSE holidays", () => {
    expect(tradingDaysAfter(new Date("2026-11-24T22:00:00Z"), 3)).toEqual(["2026-11-25", "2026-11-27", "2026-11-30"]);
  });
  it("counts today's close when bought before 4pm New York time", () => {
    expect(tradingDaysAfter(new Date("2026-09-29T14:00:00Z"), 2)).toEqual(["2026-09-29", "2026-09-30"]);
    expect(tradingDaysAfter(new Date("2026-09-29T20:30:00Z"), 2)).toEqual(["2026-09-30", "2026-10-01"]);
    expect(tradingDaysAfter(new Date("2026-10-03T12:00:00Z"), 1)).toEqual(["2026-10-05"]);
  });
  it("finds the openings that follow a weekend", () => {
    const days = tradingDaysAfter(new Date("2026-10-01T21:00:00Z"), 4);
    expect(gapDays(days, new Date("2026-10-01T21:00:00Z"))).toEqual(["2026-10-05"]);
  });
  it("maps after close earnings to the next trading day", () => {
    expect(reactionDay("2026-10-02", "after close")).toBe("2026-10-05");
    expect(reactionDay("2026-10-02", "before open")).toBe("2026-10-02");
  });
});
