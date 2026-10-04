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
  exitCostUsd: number;
  liquidationPct: number | null;   // perp only: move that would liquidate
  safeLeverage: number | null;     // perp only: highest leverage whose liquidation distance clears the biggest measured move
};

/** Loss if the price moves by `pct` against the position, plus the cost of getting out. */
export function lossUsd(t: Trade, pct: number | null, exitCostUsd: number): number | null {
  return pct == null ? null : t.sizeUsd * pct + exitCostUsd;
}

/** Largest position whose loss at `pct`, plus exit cost scaled to size, stays within the limit. */
export function maxSize(t: Trade, pct: number, exitCostUsd: number): number {
  const costRate = t.sizeUsd > 0 ? exitCostUsd / t.sizeUsd : 0;
  return Math.max(0, Math.floor(t.lossLimitUsd / (pct + costRate)));
}

/** Perp liquidation distance: roughly 1/leverage minus the maintenance margin rate. */
export function liquidationPct(leverage: number | undefined, maintenanceRate: number): number | null {
  if (!leverage || leverage <= 1) return null;
  return Math.max(0, 1 / leverage - maintenanceRate);
}

export function assess(
  t: Trade,
  day: Band,
  horizon: Band,
  events: Band[],
  exitCostUsd = 0,
  maintenanceRate = 0.005,
  liquidity?: { absorbableUsd: number; complete: boolean },
): Assessment {
  const liq = t.venue === "perp" ? liquidationPct(t.leverage, maintenanceRate) : null;
  const risk = (b: Band): EventRisk => {
    const l = b.measurable ? lossUsd(t, b.pct, exitCostUsd) : null;
    return { band: b, lossUsd: l, breaches: l != null && l > t.lossLimitUsd,
      liquidates: liq != null && b.pct != null && b.pct >= liq };
  };
  const dayR = risk(day), horizonR = risk(horizon);
  const measured = events.filter((e) => e.measurable).map(risk);
  const unmeasured = events.filter((e) => !e.measurable);
  const all = [...measured, horizonR].filter((r) => r.lossUsd != null);
  const worst = all.reduce<EventRisk | null>((w, r) => (w == null || (r.lossUsd ?? 0) > (w.lossUsd ?? 0) ? r : w), null);
  const biggest = Math.max(0, ...all.map((r) => r.band.pct ?? 0), dayR.band.pct ?? 0);
  const safeLeverage = t.venue === "perp" && biggest > 0 ? Math.max(1, Math.floor(1 / (biggest + maintenanceRate))) : null;

  let verdict: Verdict;
  if (liquidity && !liquidity.complete) {
    // never price an exit that cannot be filled: say so instead of showing a cost of zero
    verdict = { state: "illiquid", absorbableUsd: Math.max(0, Math.floor(liquidity.absorbableUsd)) };
  } else if (dayR.breaches && day.pct != null) {
    verdict = { state: "does-not-fit", maxSizeUsd: maxSize(t, day.pct, exitCostUsd) };
  } else if (all.some((r) => r.breaches) && worst?.band.pct != null) {
    // exiting before the first breaching scheduled event works only if the rest of the hold fits
    const breaching = measured.filter((r) => r.breaches && r.band.date).sort((a, b) => (a.band.date! < b.band.date! ? -1 : 1));
    const first = breaching[0];
    const exitBefore = first && !horizonR.breaches ? { date: first.band.date!, label: first.band.label } : null;
    verdict = { state: "fits-if", maxSizeUsd: maxSize(t, worst.band.pct, exitCostUsd), exitBefore };
  } else {
    verdict = { state: "fits" };
  }
  return { verdict, day: dayR, horizon: horizonR, events: measured, worst, unmeasured, exitCostUsd, liquidationPct: liq, safeLeverage };
}
