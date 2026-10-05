// Plain words to a trade. The rule parser handles ordinary sentences with no model; a language model
// handles the rest and its output passes through the same validator, so nothing unchecked reaches the engine.
import { z } from "zod";
import type { Trade } from "./engine/types";
import { gapDays, newYork, tradingDaysAfter } from "./engine/calendar";

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
  // the coming weekend: a Monday morning means next weekend, because this one is ending, not ahead of you
  const first = gapDays(days, now).find((d) => d > newYork(now).date);
  return first ? days.indexOf(first) + 1 : 5;
}

/** "till Friday", "until the 9th": trading sessions from today through that day, counting today. */
function untilDays(s: string, now: Date): number | null {
  const m = s.match(/\b(?:till|until|through|thru)\s+(?:the\s+)?(?:(mon|tue|wed|thu|fri)[a-z]*|(\d{1,2})(?:st|nd|rd|th))\b/);
  if (!m) return null;
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  ny.setHours(12, 0, 0, 0);
  let target: Date | null = null;
  if (m[1]) {
    const want = ["mon", "tue", "wed", "thu", "fri"].indexOf(m[1].slice(0, 3));
    target = new Date(ny);
    for (let i = 0; i < 8; i++) { if (target.getDay() - 1 === want && i > 0) break; target.setDate(target.getDate() + 1); }
  } else {
    target = new Date(ny);
    for (let i = 0; i < 40 && target.getDate() !== Number(m[2]); i++) target.setDate(target.getDate() + 1);
    if (target.getDate() !== Number(m[2])) return null;
  }
  let n = 0;
  for (const c = new Date(ny); c <= target; c.setDate(c.getDate() + 1)) if (c.getDay() > 0 && c.getDay() < 6) n++;
  return n > 0 && n <= 30 ? n : null;
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
  const lim = s.match(new RegExp(String.raw`(?:max(?:imum)?\s*loss|cap(?:\s*(?:the\s*|my\s*)?loss)?(?:\s*at)?|lose(?:\s*up\s*to)?|losing|take\s*(?:a\s*)?(?:loss\s*of\s*)?|risk(?:ing)?|stomach|tolerate|stop(?:\s*me)?(?:\s*at)?|limit(?:\s*of)?)\s*(?:of\s*)?-?\s*\$?\s*${NUM}`));
  if (lim) d.lossLimitUsd = money(lim[1], lim[2]);
  if (!lim) {
    const lim2 = s.match(new RegExp(String.raw`\$?\s*${NUM}\s*(?:dollars?|usd|usdt)?\s*(?:limit|loss|max(?:imum)?\s*loss|stop(?:\s*loss)?)\b`));
    if (lim2) d.lossLimitUsd = money(lim2[1], lim2[2]);
  }
  const pctLim = s.match(/(?:max(?:imum)?\s*loss|lose|risk|limit)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/) ?? s.match(/(\d+(?:\.\d+)?)\s*%\s*(?:max(?:imum)?\s*loss|limit|stop|loss)/);

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
  if (d.sizeUsd == null) {
    // a plain number of four or more digits, "6000" or "1,500", that is not the loss limit
    for (const m of s.matchAll(/(?<![\d.$])(\d{1,3}(?:,\d{3})+|\d{4,7})(?![\d%])/g)) {
      const v = Number(m[1].replace(/,/g, ""));
      if (v !== d.lossLimitUsd) { d.sizeUsd = v; break; }
    }
  }
  if (d.sizeUsd != null && d.leverage && /\bmargin\b|\bcollateral\b|\bof my own\b/.test(s)) d.sizeUsd = d.sizeUsd * d.leverage;
  if (pctLim && d.sizeUsd) d.lossLimitUsd = (Number(pctLim[1]) / 100) * d.sizeUsd;

  // horizon in trading days: "5 days", "2 weeks", "a week", "till friday", "overnight", "over the weekend"
  const NW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const days = s.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:trading\s*)?days?\b/);
  const until = untilDays(s, now);
  const weeks = s.match(/(\d+|a|one|two|three|four)\s*weeks?\b/);
  const W: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 };
  if (days) d.horizonDays = NW[days[1]] ?? Number(days[1]);
  else if (until) d.horizonDays = until;
  else if (weeks) d.horizonDays = 5 * (W[weeks[1]] ?? Number(weeks[1]));
  else if (/\bovernight\b|\btomorrow\b/.test(s)) d.horizonDays = 1;
  else if (/\bweekend\b/.test(s)) d.horizonDays = daysThroughWeekend(now);
  else if (/\bmonth\b/.test(s)) d.horizonDays = 20;

  d.confidence = /\b95\b|worst case|bad case/.test(s) ? 0.95 : 0.8;
  const th = text.match(/\b(?:because|since|thesis:?|i think)\s+(.{8,240})/i);
  if (th) d.thesis = th[1].trim();
  return d;
}

const DraftSchema = z.object({
  ticker: z.string().regex(/^[A-Za-z.]{1,8}$/).optional(),
  venue: z.enum(["rtoken", "perp"]).optional(),
  side: z.enum(["long", "short"]).optional(),
  sizeUsd: z.number().finite().positive().max(1e9).optional(),
  horizonDays: z.number().finite().positive().max(1000).optional(),
  lossLimitUsd: z.number().finite().positive().max(1e9).optional(),
  leverage: z.number().finite().min(1).max(1000).optional(),
  confidence: z.union([z.literal(0.8), z.literal(0.95)]).optional(),
  thesis: z.string().max(500).optional(),
}).strip();

/** A draft that arrives from outside (the browser, or a model): only known fields, only sane numbers. Null if anything is off. */
export function cleanDraft(raw: unknown): Draft | null {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const nulled = Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined));
  const r = DraftSchema.safeParse(nulled);
  return r.success ? (r.data as Draft) : null;
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
  let lev = d.venue === "perp" ? Math.max(1, Number(d.leverage) || 1) : undefined;
  if (lev && lev > 100) { notes.push("Bitget stock perps allow at most 100x; using 100x."); lev = 100; }
  if (d.lossLimitUsd && d.sizeUsd && d.lossLimitUsd > d.sizeUsd && d.venue !== "perp")
    notes.push("Your loss limit is larger than the position, so it can never be breached without leverage.");
  if (lev && lev > 1 && Number(d.sizeUsd) > 0)
    notes.push(`I read ${"$" + Math.round(Number(d.sizeUsd)).toLocaleString("en-US")} as the position value. At ${lev}x that is about ${"$" + Math.round(Number(d.sizeUsd) / lev).toLocaleString("en-US")} of your own money. If you meant that as your money, say "with $${Math.round(Number(d.sizeUsd) / lev).toLocaleString("en-US")} margin".`);
  const trade: Trade | null = missing.length ? null : {
    ticker: String(d.ticker).toUpperCase(), venue: d.venue === "perp" ? "perp" : "rtoken", side: d.side === "short" ? "short" : "long",
    sizeUsd: Number(d.sizeUsd), horizonDays: horizon, lossLimitUsd: Number(d.lossLimitUsd), leverage: lev,
    confidence: d.confidence === 0.95 ? 0.95 : 0.8,
  };
  return { trade, draft: d, missing, notes };
}
