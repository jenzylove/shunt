// Questions about a trade, as opposed to changes to it. The words decide which question; code computes every number
// in the answer from the check itself. Nothing here predicts direction.
import type { CheckResult } from "./check";
import { day, pct, usd } from "./explain";

export type QuestionKind = "upside" | "worst" | "why" | "size" | "next-earnings" | "compare" | "explain";
export type Question = { kind: QuestionKind; tickers?: string[] };

const has = (s: string, re: RegExp) => re.test(s);

/**
 * Reads a question from the words, with no model. `changes` says whether the same words also change the trade
 * (a new stock, size, hold or limit); a sentence that both describes a trade and asks "is it safe" is answered by the
 * check itself, so it is not treated as a question.
 */
export function detectQuestion(text: string, tickers: string[], changes: boolean): Question | null {
  const s = " " + text.toLowerCase().replace(/[’']/g, "'") + " ";
  if (tickers.length >= 2 && has(s, /\bcompare\b|\bvs\.?\b|\bversus\b|\bor\b|\bbetter\b|\bbetween\b/)) return { kind: "compare", tickers: tickers.slice(0, 3) };
  if (has(s, /\b(when|next)\b[^.?]*\b(earnings|report|reports|reporting)\b|\breport(s|ing)? next\b/)) return { kind: "next-earnings" };
  if (changes) return null;
  if (has(s, /\bupside\b|\bhow much (could|can|might|would) i (make|gain|win|earn)\b|\bbest case\b|\bprofit\b|\bpotential gain\b/)) return { kind: "upside" };
  if (has(s, /\bwhat('s| is| would be)? the worst\b|\bworst that\b|\bhow bad\b|\bdownside\b/)) return { kind: "worst" };
  if (has(s, /\bwhy\b/)) return { kind: "why" };
  if (has(s, /\bwhat size\b|\bhow (much|big) (can|could|should) i\b|\b(largest|biggest|max(imum)?) size\b|\bsize (that )?(would )?fits?\b/)) return { kind: "size" };
  if (has(s, /\bis (this|it) (a )?(good|safe|smart|wise|ok|okay)\b|\bshould i\b|\bdoes (this|it) (make sense|work)\b|\bworth it\b/)) return { kind: "explain" };
  return null;
}

export type Answer = { kind: QuestionKind; title: string; lines: string[] };

/** The answer in plain words, built only from numbers the check already computed. */
export function answer(q: Question, r: CheckResult, extra: { worst?: CheckResult; nextEarnings?: { date: string; timing: string } | null; compare?: CompareRow[] } = {}): Answer {
  const { trade: t, assessment: a, profile: p } = r;
  const odds = t.confidence === 0.8 ? "4 in 5" : "19 in 20";
  const cost = a.costUsd;
  const big = a.worst ?? a.horizon;
  const pctBig = big.band.pct ?? 0;
  const costLine = r.costs ? `${usd(cost)} of ${t.venue === "perp" ? "fees, slippage and funding" : "fees and slippage"}` : "costs (not available right now)";

  if (q.kind === "upside") {
    return {
      kind: q.kind, title: "The upside, at the same odds",
      lines: [
        `Your way, about +${usd(t.sizeUsd * pctBig - cost)}. Against you, about -${usd(t.sizeUsd * pctBig + cost)}.`,
        `In ${odds} past cases like the biggest risk in your hold (${big.band.label.toLowerCase()}), ${p.ticker} moved less than ${pct(pctBig)} either way. The gap between the two is the ${costLine}, which count against you both ways.`,
        `Shunt measures how big moves have been, not which way the next one goes, so this is the room either way, not a forecast.`,
      ],
    };
  }
  if (q.kind === "worst") {
    const w = extra.worst;
    const wb = w?.assessment.worst ?? w?.assessment.horizon;
    return {
      kind: q.kind, title: "A worse case: 19 in 20",
      lines: w && wb ? [
        `The answer above uses moves ${p.ticker} stayed within 4 times in 5. Stretching to 19 times in 20, the biggest risk in your hold is a move of ${pct(wb.band.pct)}: about ${usd(wb.lossUsd)} at ${usd(t.sizeUsd)}, against your ${usd(t.lossLimitUsd)} limit.`,
        w.assessment.verdict.state === "fits" ? "Even at 19 in 20, it fits." : w.assessment.verdict.state === "does-not-fit" || w.assessment.verdict.state === "fits-if" ? `At 19 in 20 the largest size that fits is ${usd(w.assessment.verdict.maxSizeUsd)}.` : "",
        "The one time in 20 is outside every range by definition, which is why the limit is yours to set.",
      ].filter(Boolean) : ["The 19 in 20 check could not be run right now."],
    };
  }
  if (q.kind === "why") {
    const breach = [a.day, a.horizon, ...a.events].filter((e) => e.breaches).sort((x, y) => (y.lossUsd ?? 0) - (x.lossUsd ?? 0))[0];
    return {
      kind: q.kind, title: breach ? "Why it doesn't fit as it is" : "Why it fits",
      lines: breach ? [
        `${breach.band.label[0].toUpperCase() + breach.band.label.slice(1)}: ${p.ticker} has moved up to ${pct(breach.band.pct)} in ${odds} past cases. At ${usd(t.sizeUsd)} that is about ${usd(breach.lossUsd)} including ${costLine}, which is ${usd((breach.lossUsd ?? 0) - t.lossLimitUsd)} over your ${usd(t.lossLimitUsd)} limit.`,
        a.largestFitUsd != null ? `At ${usd(a.largestFitUsd)} or less, every measured risk in the hold stays inside the limit.` : "",
      ].filter(Boolean) : [
        `The biggest measured risk in your hold is ${big.band.label.toLowerCase()}: about ${usd(big.lossUsd)} at your size, including ${costLine}, under your ${usd(t.lossLimitUsd)} limit.`,
      ],
    };
  }
  if (q.kind === "size") {
    return {
      kind: q.kind, title: "The largest size that fits",
      lines: [
        a.largestFitUsd != null
          ? `${usd(a.largestFitUsd)} is the largest position whose worst measured loss over the whole hold, plus ${r.costs ? "costs re-priced at that size on Bitget's live book" : "the market move alone (live costs unavailable)"}, stays within ${usd(t.lossLimitUsd)}. You asked about ${usd(t.sizeUsd)}.`
          : "There is not enough measured history to size this trade.",
      ],
    };
  }
  if (q.kind === "next-earnings") {
    const n = extra.nextEarnings;
    const last = [...(r.history?.find((h) => h.kind === "earnings")?.events ?? [])];
    const inHold = n && r.holdDays.includes(n.date);
    return {
      kind: q.kind, title: `${p.ticker}'s next earnings`,
      lines: [
        n ? `${p.ticker} next reports on ${day(n.date)} (${n.timing === "unknown" ? "time not given" : n.timing}), per the Nasdaq calendar. That is ${inHold ? "inside" : "outside"} your ${t.horizonDays} day hold.` : `${p.ticker} has no report on the Nasdaq calendar in the next six weeks.`,
        `On its last ${p.earningsN} reports, ${p.ticker} moved a median ${pct(p.earningsP50)} on the reaction day${last.length ? `; the latest was ${last[last.length - 1].move > 0 ? "+" : ""}${pct(last[last.length - 1].move)} on ${day(last[last.length - 1].d)}` : ""}.`,
      ],
    };
  }
  if (q.kind === "compare") {
    const rows = extra.compare ?? [];
    return {
      kind: q.kind, title: "Side by side, same size, hold and limit",
      lines: [
        ...rows.map((c) => c.error ? `${c.ticker}: ${c.error}` : `${c.ticker}: ${c.headline} Worst measured loss about ${usd(c.worstLossUsd)}; costs ${usd(c.costUsd)}.`),
        `The full check below is for ${p.ticker}. Ask "same for ${rows.find((c) => c.ticker !== p.ticker)?.ticker ?? "the other"} instead" to open the other one.`,
      ],
    };
  }
  return {
    kind: "explain", title: "Shunt doesn't call a trade good or bad",
    lines: [
      "It checks whether your trade, at your size, survives what is scheduled while you hold it, within the loss you set. That part is answered below.",
      "Whether to take it is your call: the upside, the worst case and the history are one question away.",
    ],
  };
}

export type CompareRow = { ticker: string; headline?: string; state?: string; worstLossUsd?: number | null; costUsd?: number; error?: string };
