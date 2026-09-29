// Plain words to a trade. The rule parser handles ordinary sentences with no model; a language model
// handles the rest and its output passes through the same validator, so nothing unchecked reaches the engine.
import type { Trade } from "./engine/types";
import { gapDays, tradingDaysAfter } from "./engine/calendar";

export type Draft = Partial<Trade> & { thesis?: string };
export type Parsed = { trade: Trade | null; draft: Draft; missing: (keyof Trade)[]; notes: string[] };

const NUM = String.raw`(\d+(?:[.,]\d+)?)\s*(k|m)?`;
const money = (n: string, unit?: string) => Number(n.replace(",", "")) * (unit?.toLowerCase() === "k" ? 1e3 : unit?.toLowerCase() === "m" ? 1e6 : 1);

const COMPANY: Record<string, string> = {
  nvidia: "NVDA", apple: "AAPL", microsoft: "MSFT", amazon: "AMZN", google: "GOOGL", alphabet: "GOOGL", meta: "META",
  facebook: "META", tesla: "TSLA", broadcom: "AVGO", netflix: "NFLX", palantir: "PLTR", robinhood: "HOOD",
  coinbase: "COIN", microstrategy: "MSTR", strategy: "MSTR", micron: "MU", intel: "INTC", oracle: "ORCL",
  salesforce: "CRM", adobe: "ADBE", qualcomm: "QCOM", boeing: "BA", disney: "DIS", nike: "NKE", walmart: "WMT",
  costco: "COST", "eli lilly": "LLY", lilly: "LLY", unitedhealth: "UNH", jpmorgan: "JPM", "goldman": "GS",
  "home depot": "HD", amd: "AMD", "advanced micro": "AMD", tsmc: "TSM", "super micro": "SMCI", vistra: "VST",
  constellation: "CEG", oklo: "OKLO", nuscale: "SMR",
};

/** Deterministic parser for common phrasing: "buy $20k rNVDA, hold 5 days, max loss $600". */
/** Trading days from now through the first open after the next weekend. */
export function daysThroughWeekend(now: Date): number {
  const days = tradingDaysAfter(now, 10);
  const first = gapDays(days, now)[0];
  return first ? days.indexOf(first) + 1 : 5;
}

export function ruleParse(text: string, known: (t: string) => boolean, now = new Date()): Draft {
  const s = " " + text.toLowerCase().replace(/[’']/g, "'") + " ";
  const d: Draft = {};

  // venue and ticker: rNVDA / NVDA perp / NVDAUSDT / plain ticker / company name
  const rtok = text.match(/\br([A-Z]{1,5})\b/);
  const usdt = text.match(/\b([A-Z]{1,5})USDT\b/);
  const bare = [...text.matchAll(/\b\$?([A-Z]{1,5})\b/g)].map((m) => m[1]).find((t) => known(t));
  if (rtok && known(rtok[1])) { d.ticker = rtok[1]; d.venue = "rtoken"; }
  else if (usdt && known(usdt[1])) { d.ticker = usdt[1]; d.venue = "perp"; }
  else if (bare) d.ticker = bare;
  else {
    const hit = Object.keys(COMPANY).sort((a, b) => b.length - a.length).find((k) => s.includes(" " + k));
    if (hit) d.ticker = COMPANY[hit];
  }
  if (/\bperps?\b|\bfutures?\b|\bleverage|\b\d+(\.\d+)?\s*x\b/.test(s)) d.venue = "perp";
  if (!d.venue) d.venue = "rtoken";

  if (/\b(short|sell short|bet against|bearish)\b/.test(s)) d.side = "short";
  else d.side = "long";

  const lev = s.match(/\b(\d+(?:\.\d+)?)\s*x\b/);
  if (lev) d.leverage = Number(lev[1]);

  // loss limit: "max loss $600", "can lose 600", "risk $500", "stop at -$400"
  const lim = s.match(new RegExp(String.raw`(?:max(?:imum)?\s*loss|lose(?:\s*up\s*to)?|losing|risk(?:ing)?|stomach|tolerate|stop(?:\s*at)?|limit(?:\s*of)?)\s*(?:of\s*)?-?\s*\$?\s*${NUM}`));
  if (lim) d.lossLimitUsd = money(lim[1], lim[2]);
  const pctLim = s.match(/(?:max(?:imum)?\s*loss|lose|risk|limit)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/);

  // size: first money amount that is not the loss limit: "$20k", "20,000 dollars", "20k usdt"
  for (const m of s.matchAll(new RegExp(String.raw`\$\s*${NUM}|${NUM}\s*(?:usd|usdt|dollars|bucks)\b`, "g"))) {
    const v = m[1] ? money(m[1], m[2]) : money(m[3], m[4]);
    if (v !== d.lossLimitUsd) { d.sizeUsd = v; break; }
  }
  if (pctLim && d.sizeUsd) d.lossLimitUsd = (Number(pctLim[1]) / 100) * d.sizeUsd;

  // horizon in trading days: "5 days", "2 weeks", "a week", "till friday", "overnight", "over the weekend"
  const days = s.match(/(\d+)\s*(?:trading\s*)?days?\b/);
  const weeks = s.match(/(\d+|a|one|two|three|four)\s*weeks?\b/);
  const W: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 };
  if (days) d.horizonDays = Number(days[1]);
  else if (weeks) d.horizonDays = 5 * (W[weeks[1]] ?? Number(weeks[1]));
  else if (/\bovernight\b|\btomorrow\b/.test(s)) d.horizonDays = 1;
  else if (/\bweekend\b/.test(s)) d.horizonDays = daysThroughWeekend(now);
  else if (/\bmonth\b/.test(s)) d.horizonDays = 20;

  d.confidence = /\b95\b|worst case|bad case/.test(s) ? 0.95 : 0.8;
  const th = text.match(/\b(?:because|since|thesis:?|i think)\s+(.{8,240})/i);
  if (th) d.thesis = th[1].trim();
  return d;
}

/** Everything that reaches the engine goes through here, including model output. */
export function validate(d: Draft): Parsed {
  const notes: string[] = [];
  const missing: (keyof Trade)[] = [];
  if (!d.ticker) missing.push("ticker");
  if (!(Number(d.sizeUsd) > 0)) missing.push("sizeUsd");
  if (!(Number(d.horizonDays) > 0)) missing.push("horizonDays");
  if (!(Number(d.lossLimitUsd) > 0)) missing.push("lossLimitUsd");
  let horizon = Math.round(Number(d.horizonDays));
  if (horizon > 20) { notes.push("Shunt measures holds up to 20 trading days; using 20."); horizon = 20; }
  let lev = d.venue === "perp" ? Number(d.leverage) || 1 : undefined;
  if (lev && lev > 100) { notes.push("Bitget stock perps allow at most 100x; using 100x."); lev = 100; }
  if (d.lossLimitUsd && d.sizeUsd && d.lossLimitUsd > d.sizeUsd && d.venue !== "perp")
    notes.push("Your loss limit is larger than the position, so it can never be breached without leverage.");
  const trade: Trade | null = missing.length ? null : {
    ticker: String(d.ticker).toUpperCase(), venue: d.venue === "perp" ? "perp" : "rtoken", side: d.side === "short" ? "short" : "long",
    sizeUsd: Number(d.sizeUsd), horizonDays: horizon, lossLimitUsd: Number(d.lossLimitUsd), leverage: lev,
    confidence: d.confidence === 0.95 ? 0.95 : 0.8,
  };
  return { trade, draft: d, missing, notes };
}
