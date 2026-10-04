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

// everyday words that are also tickers: never read these as a stock unless written in capitals
const STOP = new Set(("all can now one for big low new key cash well true good best real safe open line play move post plus any are was you the and buy sell long short hold " +
  "days day week weeks loss max risk lose over take stop size bet weekend month year till with from into that this what when will down high less more most much many " +
  "just like want need have has had not out off per its our your their them they then than also only very each both such same other another about after before while").split(" "));

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
  const words = text.match(/[A-Za-z][A-Za-z.]*/g) ?? [];
  // "rNVDA" or "rnvda": the leading r marks the rToken
  const rtok = words.map((w) => (/^r[a-z]{2,5}$/i.test(w) ? w.slice(1).toUpperCase() : "")).find((t) => t && known(t));
  const usdt = text.match(/\b([A-Za-z]{1,5})USDT\b/i)?.[1]?.toUpperCase();
  // a plain ticker: capitals always count; lowercase only for 3+ letters that are not an everyday word
  const bare = words.find((w) => {
    const up = w.toUpperCase();
    if (!known(up)) return false;
    return w === up || (w.length >= 3 && !STOP.has(w.toLowerCase()));
  })?.toUpperCase();
  if (rtok && known(rtok)) { d.ticker = rtok; d.venue = "rtoken"; }
  else if (usdt && known(usdt)) { d.ticker = usdt; d.venue = "perp"; }
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
  if (!lim) {
    const lim2 = s.match(new RegExp(String.raw`\$?\s*${NUM}\s*(?:dollars?|usd|usdt)?\s*(?:limit|max(?:imum)?\s*loss|stop(?:\s*loss)?)\b`));
    if (lim2) d.lossLimitUsd = money(lim2[1], lim2[2]);
  }
  const pctLim = s.match(/(?:max(?:imum)?\s*loss|lose|risk|limit)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/);

  // size: first money amount that is not the loss limit: "$20k", "20,000 dollars", "20k usdt"
  for (const m of s.matchAll(new RegExp(String.raw`\$\s*${NUM}|${NUM}\s*(?:usd|usdt|dollars|bucks)\b`, "g"))) {
    const v = m[1] ? money(m[1], m[2]) : money(m[3], m[4]);
    if (v !== d.lossLimitUsd) { d.sizeUsd = v; break; }
  }
  if (d.sizeUsd == null) {
    for (const m of s.matchAll(/\b(\d+(?:\.\d+)?)\s*(k|m)\b/g)) {
      const v = money(m[1], m[2]);
      if (v !== d.lossLimitUsd) { d.sizeUsd = v; break; }
    }
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
