import type { Band, Calibration, Confidence, EventKind, Profile, Summary } from "./types";

export const MIN_EVENTS = 8;

/** Move size at the chosen confidence, scaled by the stock's current volatility when possible. */
export function sizeFrom(
  s: Summary,
  volNow: number,
  conf: Confidence,
  factor = 1,
  horizonScale = 1,
): { pct: number | null; method: Band["method"] } {
  const z = conf === 0.8 ? s.z80 : s.z95;
  if (z != null && volNow > 0) return { pct: z * volNow * horizonScale * factor, method: "volScaled" };
  const p = conf === 0.8 ? s.p80 : s.p95;
  if (p != null) return { pct: p * factor, method: "history" };
  return { pct: null, method: "none" };
}

/** Correction learned on older data, used only where it helped on unseen data, and only for the 80% band it was fitted for. */
export function correction(cal: Calibration | null, kind: string, conf: Confidence): number {
  const c = cal?.types?.[kind]?.corrected;
  return conf === 0.8 && c?.apply ? c.factor : 1;
}

function summaryOfEvents(moves: { move: number | null; z: number | null }[]): Summary {
  const a = moves.filter((m) => m.move != null).map((m) => Math.abs(m.move as number));
  const z = moves.filter((m) => m.z != null).map((m) => Math.abs(m.z as number));
  if (!a.length) return { n: 0 };
  return { n: a.length, p80: cq(a, 0.8), p95: cq(a, 0.95), z80: z.length ? cq(z, 0.8) : undefined, z95: z.length ? cq(z, 0.95) : undefined };
}

/** Small sample safe quantile, same rule as the dataset builder. */
export function cq(values: number[], level: number): number {
  const a = [...values].sort((x, y) => x - y);
  const k = Math.ceil((a.length + 1) * level) - 1;
  return a[Math.min(Math.max(k, 0), a.length - 1)];
}

export function eventBand(
  p: Profile,
  kind: EventKind,
  conf: Confidence,
  cal: Calibration | null,
  opts: { hub?: string; label: string; date?: string } = { label: "" },
): Band {
  let s: Summary;
  if (kind === "earnings") s = p.earnings;
  else if (kind === "fed") s = p.fed;
  else if (kind === "weekend") s = p.weekend;
  else {
    const b = p.bellwethers.find((x) => x.hub === opts.hub);
    s = b ? summaryOfEvents(b.events) : { n: 0 };
  }
  const base = { kind, label: opts.label, date: opts.date, n: s.n };
  if (s.n < MIN_EVENTS) return { ...base, measurable: false, pct: null, method: "none" };
  const f = correction(cal, kind, conf);
  const { pct, method } = sizeFrom(s, p.volNow, conf, f);
  return { ...base, measurable: pct != null, pct, method, corrected: f !== 1 ? f : undefined };
}

/** Move over the whole holding period, from the stock's measured k day moves (nearest measured k). */
export function horizonBand(p: Profile, days: number, conf: Confidence): Band {
  const ks = Object.keys(p.kDay).map(Number).sort((a, b) => a - b);
  const k = ks.reduce((best, x) => (Math.abs(x - days) < Math.abs(best - days) ? x : best), ks[0]);
  const s = p.kDay[String(k)];
  // z values were normalised by sqrt(k); rescale to the requested length
  const { pct, method } = sizeFrom(s, p.volNow, conf, 1, Math.sqrt(days));
  const hist = method === "history" && pct != null ? pct * Math.sqrt(days / k) : pct;
  return {
    kind: "horizon",
    label: `${days} trading day${days === 1 ? "" : "s"} of ordinary moves`,
    measurable: s.n >= MIN_EVENTS && hist != null,
    n: s.n,
    pct: hist,
    method,
  };
}

export function dayBand(p: Profile, conf: Confidence, cal: Calibration | null): Band {
  const f = correction(cal, "day", conf);
  const { pct, method } = sizeFrom(p.normalDay, p.volNow, conf, f);
  return { kind: "day", label: "one ordinary day", measurable: pct != null, n: p.normalDay.n, pct, method, corrected: f !== 1 ? f : undefined };
}
