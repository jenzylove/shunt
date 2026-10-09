// When a required live Bitget input is missing or stale, Shunt shows the market risk but gives no verdict.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "./live/bitget";

const book = (ts = Date.now()): Book => ({
  ts,
  bids: Array.from({ length: 50 }, (_, i) => [String(100 - i * 0.01), "1000"]),
  asks: Array.from({ length: 50 }, (_, i) => [String(100.01 + i * 0.01), "1000"]),
});

const live = {
  spotBook: vi.fn(async () => book()),
  perpBook: vi.fn(async () => book()),
  spotFees: vi.fn(async () => ({ maker: 0.001, taker: 0.001 })),
  perpInfo: vi.fn(async () => ({ maker: 0.0002, taker: 0.0006, fundIntervalHours: 8, maxLever: 50 })),
  recentFunding: vi.fn(async () => ({ avgRate: 0.0001, n: 30, lastAt: Date.now() - 3_600_000 })),
  fundingSchedule: vi.fn(async () => ({ next: Date.now() + 3_600_000, periodHours: 8 })),
  maintenanceRate: vi.fn(async () => 0.005),
  tradedLastWeekend: vi.fn(async () => ({ traded: true, bars: 10, weekendOf: "2026-10-03" })),
};

vi.mock("./live/bitget", async (orig) => ({ ...(await orig<typeof import("./live/bitget")>()), ...live }));
vi.mock("./live/calendar", async (orig) => ({
  ...(await orig<typeof import("./live/calendar")>()),
  earningsBetween: vi.fn(async () => ({ rows: [], failed: [], oldestReadAt: Date.now() })),
}));

const { checkTrade } = await import("./check");
const spot = { ticker: "NVDA", venue: "rtoken" as const, side: "long" as const, sizeUsd: 1_000, horizonDays: 3, lossLimitUsd: 500, confidence: 0.8 as const };
const perp = { ...spot, venue: "perp" as const, leverage: 3 };

async function state(t: typeof spot | typeof perp) {
  const r = await checkTrade(t, new Date("2026-10-07T15:00:00Z"));
  if ("error" in r) throw new Error(r.error);
  return r;
}

describe("fail closed on missing live costs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gives a normal verdict when every input is there", async () => {
    expect((await state(spot)).assessment.verdict.state).toBe("fits");
    expect((await state(perp)).assessment.verdict.state).toBe("fits");
  });

  const failures: [string, () => void, typeof spot | typeof perp][] = [
    ["order book unavailable", () => live.spotBook.mockRejectedValueOnce(new Error("HTTP 500")), spot],
    ["perp order book unavailable", () => live.perpBook.mockRejectedValueOnce(new Error("timeout")), perp],
    ["stale order book", () => live.spotBook.mockResolvedValueOnce(book(Date.now() - 5 * 60_000)), spot],
    ["fee endpoint unavailable", () => live.spotFees.mockRejectedValueOnce(new Error("HTTP 502")), spot],
    ["perp contract info unavailable", () => live.perpInfo.mockRejectedValueOnce(new Error("HTTP 502")), perp],
    ["funding history unavailable", () => live.recentFunding.mockRejectedValueOnce(new Error("HTTP 429")), perp],
    ["funding schedule unavailable", () => live.fundingSchedule.mockRejectedValueOnce(new Error("no funding schedule")), perp],
  ];
  for (const [name, breakIt, t] of failures) {
    it(`withholds the verdict when the ${name}`, async () => {
      breakIt();
      const r = await state(t);
      expect(r.assessment.verdict.state).toBe("incomplete");
      expect(r.costs).toBeNull();
      expect(r.problems.join(" ")).toMatch(/Bitget|stale/);
      expect(r.assessment.worst?.lossUsd).toBeGreaterThan(0);   // the market risk is still shown
    });
  }

  it("hides liquidation but still gives a verdict when only the margin tiers are missing", async () => {
    live.maintenanceRate.mockRejectedValueOnce(new Error("HTTP 500"));
    const r = await state(perp);
    expect(r.assessment.verdict.state).toBe("fits");
    expect(r.assessment.liquidationPct).toBeNull();
    expect(r.assessment.safeLeverage).toBeNull();
  });

  it("recovers on the next check once Bitget answers again", async () => {
    live.spotBook.mockRejectedValueOnce(new Error("HTTP 500"));
    expect((await state(spot)).assessment.verdict.state).toBe("incomplete");
    expect((await state(spot)).assessment.verdict.state).toBe("fits");
  });
});
