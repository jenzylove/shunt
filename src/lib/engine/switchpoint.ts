import type { Band, Trade } from "./types";

export type EventRisk = { band: Band; lossUsd: number | null; breaches: boolean };

export type Verdict =
  | { state: "fits" }
  | { state: "fits-if"; maxSizeUsd: number; exitBefore: { date: string; label: string } | null }
  | { state: "does-not-fit"; maxSizeUsd: number };

export type Assessment = {
  verdict: Verdict;
  day: EventRisk;
  horizon: EventRisk;
  events: EventRisk[];
  worst: EventRisk | null;
  unmeasured: Band[];
  exitCostUsd: number;
  liquidationPct: number | null;   // perp only: move that would liquidate
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
): Assessment {
  const risk = (b: Band): EventRisk => {
    const l = b.measurable ? lossUsd(t, b.pct, exitCostUsd) : null;
    return { band: b, lossUsd: l, breaches: l != null && l > t.lossLimitUsd };
  };
  const dayR = risk(day), horizonR = risk(horizon);
  const measured = events.filter((e) => e.measurable).map(risk);
  const unmeasured = events.filter((e) => !e.measurable);
  const all = [...measured, horizonR].filter((r) => r.lossUsd != null);
  const worst = all.reduce<EventRisk | null>((w, r) => (w == null || (r.lossUsd ?? 0) > (w.lossUsd ?? 0) ? r : w), null);
  const liq = t.venue === "perp" ? liquidationPct(t.leverage, maintenanceRate) : null;

  let verdict: Verdict;
  if (dayR.breaches && day.pct != null) {
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
  return { verdict, day: dayR, horizon: horizonR, events: measured, worst, unmeasured, exitCostUsd, liquidationPct: liq };
}
