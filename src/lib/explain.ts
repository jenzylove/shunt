// The verdict in plain words, built only from computed numbers. No model writes these sentences.
import type { CheckResult } from "./check";
import { weekday } from "./engine/calendar";

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
  const what = (b: { kind: string; label: string }) =>
    ({ horizon: `past ${t.horizonDays} day stretches`, day: "ordinary days", earnings: `past ${p.ticker} earnings days`,
       bellwether: `past ${b.label.split(" ")[0]} report days`, fed: "past Fed decision days", weekend: "past weekends" } as Record<string, string>)[b.kind];
  const worstLine = worst
    ? `In ${odds} ${what(worst.band)}, ${p.ticker} moved less than ${pct(worst.band.pct)}. At ${usd(t.sizeUsd)} that is about ${usd(worst.lossUsd)}, including the cost to get out.`
    : "";
  const liq = [a.day, a.horizon, ...a.events].find((r) => r.liquidates);
  const liqLine = liq && a.liquidationPct != null
    ? ` At ${t.leverage}x you are liquidated by a ${pct(a.liquidationPct)} move, inside what ${p.ticker} has measured; ${a.safeLeverage}x or less clears it.`
    : "";
  const unmeasured = a.unmeasured.length
    ? ` Cannot measure: ${a.unmeasured.map((b) => `${b.label} (${b.n} past)`).join("; ")}.`
    : "";

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
