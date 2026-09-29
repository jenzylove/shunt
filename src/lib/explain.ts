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
  const band = t.confidence === 0.8 ? "4 in 5" : "19 in 20";
  const worst = a.worst;
  const worstLine = worst
    ? `${worst.band.kind === "horizon" ? "Ordinary moves over the whole hold" : worst.band.label} ${worst.band.kind === "horizon" ? "have" : "has"} stayed within ${pct(worst.band.pct)} ${band} times for ${p.ticker}, about ${usd(worst.lossUsd)} at ${usd(t.sizeUsd)} including the cost to get out.`
    : "";
  const unmeasured = a.unmeasured.length
    ? ` Cannot measure: ${a.unmeasured.map((b) => `${b.label} (${b.n} past)`).join("; ")}.`
    : "";

  if (v.state === "fits") {
    return {
      tone: "go",
      headline: `Fits your ${usd(t.lossLimitUsd)} limit.`,
      detail: `Nothing scheduled in your ${t.horizonDays} trading day${t.horizonDays === 1 ? "" : "s"} is measured to cost more than your limit at this size. ${worstLine}${unmeasured}`,
    };
  }
  if (v.state === "does-not-fit") {
    return {
      tone: "stop",
      headline: `Doesn't fit. ${usd(v.maxSizeUsd)} or less would.`,
      detail: `An ordinary ${p.ticker} day has moved up to ${pct(a.day.band.pct)} ${band} times, about ${usd(a.day.lossUsd)} at ${usd(t.sizeUsd)}, already more than your ${usd(t.lossLimitUsd)} before anything scheduled.${unmeasured}`,
    };
  }
  const exit = v.exitBefore;
  return {
    tone: "caution",
    headline: exit
      ? `Fits if you're out before ${day(exit.date)}, or hold ${usd(v.maxSizeUsd)} or less.`
      : `Fits if you hold ${usd(v.maxSizeUsd)} or less.`,
    detail: `${worstLine} That is more than your ${usd(t.lossLimitUsd)}.${unmeasured}`,
  };
}
