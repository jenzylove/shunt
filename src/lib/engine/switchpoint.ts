import type { Band, Trade } from "./types";

export type EventRisk = { band: Band; lossUsd: number | null; breaches: boolean; liquidates: boolean };

export type Verdict =
  | { state: "fits" }
  | { state: "fits-if"; maxSizeUsd: number; exitBefore: { date: string; label: string } | null }
  | { state: "does-not-fit"; maxSizeUsd: number }
  | { state: "illiquid"; absorbableUsd: number };   // the live book cannot take this size in or out

export type Assessment = {
  verdict: Verdict;
  day: EventRisk;
  horizon: EventRisk;
  events: EventRisk[];
  worst: EventRisk | null;
  unmeasured: Band[];
  costUsd: number;                 // round trip at the trade's size: fee and slippage in and out, plus perp funding
  liquidationPct: number | null;   // perp only: an estimate of the move that would liquidate (isolated margin, before fees); null when the inputs are missing
  safeLeverage: number | null;     // perp only: highest leverage whose liquidation distance clears the biggest measured move
};

/**
 * Funding counted against a perp position: the recent average rate per settlement, signed for the side (positive means you pay),
 * times the settlements crossed. The future rate is unknown, so a credit is never counted toward fitting your limit.
 */
export function fundingCharged(sizeUsd: number, avgRate: number, side: "long" | "short", runs: number): { charged: number; expected: number } {
  const expected = sizeUsd * avgRate * (side === "long" ? 1 : -1) * runs;
  return { charged: Math.max(0, expected), expected };
}

/** Total cost of the round trip at a size. A plain number is treated as the cost at the trade's own size and scaled linearly. */
export type CostFn = number | ((sizeUsd: number) => number);
const costAt = (c: CostFn, t: Trade, size: number) => (typeof c === "function" ? c(size) : t.sizeUsd > 0 ? (c / t.sizeUsd) * size : 0);

/** Loss if the price moves by `pct` against the position, plus the cost of the round trip. */
export function lossUsd(t: Trade, pct: number | null, cost: CostFn): number | null {
  return pct == null ? null : t.sizeUsd * pct + costAt(cost, t, t.sizeUsd);
}

/**
 * Largest position whose loss at `pct`, plus the round trip cost at that size, stays within the limit.
 * Costs are re-priced at every candidate size (the order book is not linear), so this is a search, not a division.
 */
export function maxSize(t: Trade, pct: number, cost: CostFn): number {
  const fits = (size: number) => size * pct + costAt(cost, t, size) <= t.lossLimitUsd;
  if (pct <= 0 && typeof cost !== "function") return Number.MAX_SAFE_INTEGER;
  let hi = pct > 0 ? t.lossLimitUsd / pct : t.lossLimitUsd * 1000;   // costs only add, so the answer cannot exceed this
  if (fits(hi)) return Math.floor(hi);
  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return Math.max(0, Math.floor(lo));
}

/**
 * Perp liquidation distance as a fraction of the entry price, for an isolated position before fees and funding:
 * a long is liquidated near entry x (1 - 1/L) / (1 - m), a short near entry x (1 + 1/L) / (1 + m).
 * It is an estimate: Bitget's own number depends on margin mode and account state. Returns null without leverage.
 */
export function liquidationPct(leverage: number | undefined, maintenanceRate: number, side: "long" | "short" = "long"): number | null {
  if (!leverage || leverage <= 1) return null;
  const d = side === "long" ? 1 - (1 - 1 / leverage) / (1 - maintenanceRate) : (1 + 1 / leverage) / (1 + maintenanceRate) - 1;
  return Math.max(0, d);
}

/** The highest whole leverage whose liquidation distance still clears `move`. */
export function highestSafeLeverage(move: number, maintenanceRate: number, side: "long" | "short"): number {
  for (let l = 100; l > 1; l--) if ((liquidationPct(l, maintenanceRate, side) ?? 0) > move) return l;
  return 1;
}

export function assess(
  t: Trade,
  day: Band,
  horizon: Band,
  events: Band[],
  cost: CostFn = 0,
  maintenanceRate: number | null = 0.005,
  liquidity?: { absorbableUsd: number; complete: boolean },
): Assessment {
  const liq = t.venue === "perp" && maintenanceRate != null ? liquidationPct(t.leverage, maintenanceRate, t.side) : null;
  const risk = (b: Band): EventRisk => {
    const l = b.measurable ? lossUsd(t, b.pct, cost) : null;
    return { band: b, lossUsd: l, breaches: l != null && l > t.lossLimitUsd,
      liquidates: liq != null && b.pct != null && b.pct >= liq };
  };
  const dayR = risk(day), horizonR = risk(horizon);
  const measured = events.filter((e) => e.measurable).map(risk);
  const unmeasured = events.filter((e) => !e.measurable);
  const all = [...measured, horizonR].filter((r) => r.lossUsd != null);
  const worst = all.reduce<EventRisk | null>((w, r) => (w == null || (r.lossUsd ?? 0) > (w.lossUsd ?? 0) ? r : w), null);
  const biggest = Math.max(0, ...all.map((r) => r.band.pct ?? 0), dayR.band.pct ?? 0);
  const safeLeverage = t.venue === "perp" && maintenanceRate != null && biggest > 0 ? highestSafeLeverage(biggest, maintenanceRate, t.side) : null;

  let verdict: Verdict;
  if (liquidity && !liquidity.complete) {
    // never price an exit that cannot be filled: say so instead of showing a cost of zero
    verdict = { state: "illiquid", absorbableUsd: Math.max(0, Math.floor(liquidity.absorbableUsd)) };
  } else if (dayR.breaches && day.pct != null) {
    verdict = { state: "does-not-fit", maxSizeUsd: maxSize(t, biggest, cost) };
  } else if (all.some((r) => r.breaches) && worst?.band.pct != null) {
    // exiting before the first breaching scheduled event works only if the rest of the hold fits
    const breaching = measured.filter((r) => r.breaches && r.band.date).sort((a, b) => (a.band.date! < b.band.date! ? -1 : 1));
    const first = breaching[0];
    const exitBefore = first && !horizonR.breaches ? { date: first.band.date!, label: first.band.label } : null;
    verdict = { state: "fits-if", maxSizeUsd: maxSize(t, worst.band.pct, cost), exitBefore };
  } else {
    verdict = { state: "fits" };
  }
  return { verdict, day: dayR, horizon: horizonR, events: measured, worst, unmeasured, costUsd: costAt(cost, t, t.sizeUsd), liquidationPct: liq, safeLeverage };
}
