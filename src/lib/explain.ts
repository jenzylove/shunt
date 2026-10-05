// The verdict in plain words, built only from computed numbers. No model writes these sentences.
import type { CheckResult } from "./check";
import { weekday } from "./engine/calendar";
import type { Trade } from "./engine/types";

export const usd = (x: number | null | undefined) =>
  x == null || !Number.isFinite(x) ? "n/a" : "$" + Math.round(x).toLocaleString("en-US");
export const pct = (x: number | null | undefined, digits = 1) =>
  x == null || !Number.isFinite(x) ? "n/a" : (x * 100).toFixed(digits) + "%";
export const day = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  return `${weekday(iso)} ${d.getUTCDate()} ${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}`;
};

export type Verdict = { headline: string; detail: string; tone: "go" | "caution" | "stop" };

export function explain(r: CheckResult): Verdict {
  const { trade: t, assessment: a, profile: p } = r;
  const v = a.verdict;
  const worst = a.worst;
  const odds = t.confidence === 0.8 ? "4 of 5" : "19 of 20";
  const what = (b: { kind: string; label: string; combined?: boolean }) =>
    b.combined ? "past days when events like these overlap" : ({ horizon: `past ${t.horizonDays} day stretches`, day: "ordinary days", earnings: `past ${p.ticker} earnings days`,
       bellwether: `past ${b.label.split(" ")[0]} report days`, fed: "past Fed decision days", weekend: "past weekends" } as Record<string, string>)[b.kind];
  const worstLine = worst
    ? `In ${odds} ${what(worst.band)}, ${p.ticker} moved less than ${pct(worst.band.pct)}. At ${usd(t.sizeUsd)} that is about ${usd(worst.lossUsd)}, including fees and slippage in and out${r.costs?.fundingUsd ? " and funding" : ""}.`
    : "";
  const liq = [a.day, a.horizon, ...a.events].find((r) => r.liquidates);
  const liqLine = liq && a.liquidationPct != null
    ? ` At ${t.leverage}x you would be liquidated by roughly a ${pct(a.liquidationPct)} move (an estimate for isolated margin), inside what ${p.ticker} has measured${a.safeLeverage != null ? `; about ${a.safeLeverage}x or less would clear it` : ""}.`
    : "";
  const unmeasured = a.unmeasured.length
    ? ` Cannot measure: ${a.unmeasured.map((b) => `${b.label} (${b.n} past)`).join("; ")}.`
    : "";

  if (v.state === "illiquid") {
    const venue = t.venue === "perp" ? `the ${p.ticker} perp` : `r${p.ticker}`;
    return {
      tone: "stop",
      headline: v.absorbableUsd === 0
        ? `No one is trading ${venue} right now.`
        : `Bitget's book takes about ${usd(v.absorbableUsd)} of this right now.`,
      detail: v.absorbableUsd === 0
        ? `Bitget's order book for ${venue} has nothing to fill ${usd(t.sizeUsd)} against, so Shunt cannot price getting in or out and will not guess. Check again when the market is open, or try the ${t.venue === "perp" ? "rToken" : "perp"}.`
        : `You asked for ${usd(t.sizeUsd)}. The live book fills only about ${usd(v.absorbableUsd)} on the way in or out, so Shunt cannot price the rest of an exit and will not guess. Size to that or less, or split it over time.`,
    };
  }
  if (v.state === "fits") {
    return {
      tone: "go",
      headline: `Fits your ${usd(t.lossLimitUsd)} limit.`,
      detail: `Nothing scheduled in your ${t.horizonDays} trading day${t.horizonDays === 1 ? "" : "s"} is measured to cost more than your limit at this size. ${worstLine}${liqLine}${unmeasured}`,
    };
  }
  if (v.state === "does-not-fit") {
    return {
      tone: "stop",
      headline: `Doesn't fit. ${usd(v.maxSizeUsd)} or less would.`,
      detail: `In ${odds} ordinary days ${p.ticker} moved less than ${pct(a.day.band.pct)}, which is about ${usd(a.day.lossUsd)} at ${usd(t.sizeUsd)}: already more than your ${usd(t.lossLimitUsd)} before anything scheduled.${liqLine}${unmeasured}`,
    };
  }
  const exit = v.exitBefore;
  return {
    tone: "caution",
    headline: exit
      ? `Fits if you're out before ${day(exit.date)}, or hold ${usd(v.maxSizeUsd)} or less.`
      : `Fits if you hold ${usd(v.maxSizeUsd)} or less.`,
    detail: `${worstLine} That is more than your ${usd(t.lossLimitUsd)}.${liqLine}${unmeasured}`,
  };
}

/** The user's trade as one plain question, so it is always clear what the answer below is answering. */
export function questionText(t: Trade): string {
  const days = `${t.horizonDays} trading day${t.horizonDays === 1 ? "" : "s"}`;
  const amt = usd(t.sizeUsd);
  const what = t.venue === "perp"
    ? `hold a ${amt} ${t.side} ${t.ticker} perp${t.leverage && t.leverage > 1 ? ` at ${t.leverage}x (about ${usd(t.sizeUsd / t.leverage)} of my own money)` : ""}`
    : t.side === "short" ? `short ${amt} of ${t.ticker}` : `hold ${amt} of ${t.ticker}`;
  return `What happens if I ${what} for ${days} and can lose at most ${usd(t.lossLimitUsd)}?`;
}
