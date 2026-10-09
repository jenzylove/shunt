// One trade in, one measured answer out. Every number is from the stock's profile, a live source, or the user.
import { promises as fs } from "fs";
import path from "path";
import { dayBand, eventBand, horizonBand } from "./engine/bands";
import { gapDays, newYork, nyInstant, reactionDay, tradingDaysAfter, weekday } from "./engine/calendar";
import { assess, fundingCharged, type Assessment } from "./engine/switchpoint";
import type { Band, Calibration, Profile, ScheduledEvent, Trade } from "./engine/types";
import * as bg from "./live/bitget";
import { earningsBetween, FOMC_UPCOMING } from "./live/calendar";

const DATA = path.join(process.cwd(), "public", "data");

export async function loadProfile(ticker: string): Promise<Profile | null> {
  if (!/^[A-Z.]{1,8}$/.test(ticker)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(DATA, "stocks", `${ticker}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function loadCalibration(): Promise<Calibration | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA, "calibration.json"), "utf8"));
  } catch {
    return null;
  }
}

export type Costs = {
  venue: Trade["venue"];
  entry: bg.Fill & { feeUsd: number };
  exit: bg.Fill & { feeUsd: number };
  entryCostUsd: number;              // slippage plus fee to get in at this size, right now
  exitCostUsd: number;               // slippage plus fee to get out at this size, right now
  fundingUsd: number | null;         // perp only: funding counted against you over the hold (a credit is never counted)
  fundingExpectedUsd: number | null; // perp only: the signed expectation at the recent average rate; positive means you pay
  fundingRuns: number | null;        // funding settlements between now and the close of the last day of the hold
  fundingNextAt: string | null;      // Bitget's next settlement
  fundingRateAt: string | null;      // when the newest rate in the average settled
  totalUsd: number;                  // entry + exit + funding counted against you
  bookAt: string;                    // when Bitget stamped the order book
  readAt: string;
};

/** Past events of a kind that falls inside the hold, newest last, with what this exact trade would have made or lost. */
export type History = {
  kind: "earnings" | "fed" | "bellwether";
  label: string;
  events: { d: string; move: number; pnlUsd: number }[];
  withYou: number;          // times the move went the trade's way
  n: number;
};

export type CheckResult = {
  trade: Trade;
  profile: Pick<Profile, "ticker" | "name" | "sector" | "asOf" | "lastClose" | "volNow" | "perp"> & { earningsN: number; earningsP50: number | null };
  history: History[];
  holdDays: string[];
  events: ScheduledEvent[];
  bands: { day: Band; horizon: Band; events: Band[] };
  assessment: Assessment;
  costs: Costs | null;
  weekendTrading: { traded: boolean; bars: number; weekendOf: string } | null;
  calibration: Calibration | null;
  problems: string[];                // sources that failed; nothing is filled in for them
  calendarAt: string | null;         // when the earnings calendar was actually read (it may be cached for hours)
  checkedAt: string;                 // when this check ran, so the page can say "today" instead of a date
  notes: string[];                   // plain explanations of anything Shunt changed or assumed
};

const STALE_BOOK_MS = 60_000;

type Priced = { costs: Costs; costAt: (sizeUsd: number) => number };

/** Everything it costs to be in the trade at a size: slippage and fees in and out, and perp funding. Infinity when the book cannot fill it. */
async function costs(t: Trade, holdDays: string[], now: Date, problems: string[]): Promise<Priced | null> {
  try {
    const book = t.venue === "perp" ? await bg.perpBook(t.ticker) : await bg.spotBook(t.ticker);
    const age = Date.now() - book.ts;
    if (age > STALE_BOOK_MS) {
      problems.push(`Bitget's order book is ${Math.round(age / 1000)} seconds old, too stale to price a trade, so costs are not shown.`);
      return null;
    }
    const fees = t.venue === "perp" ? await bg.perpInfo(t.ticker) : await bg.spotFees(t.ticker);
    const inSide = t.side === "long" ? "buy" : "sell";
    const outSide = t.side === "long" ? "sell" : "buy";
    const fee = (f: bg.Fill) => f.filledUsd * fees.taker;
    const leg = (size: number, s: "buy" | "sell") => {
      const f = bg.walk(book, size, s);
      return { f, cost: f.complete && f.impactPct != null ? size * f.impactPct + fee(f) : Infinity };
    };
    let rate = 0, runs: number | null = null, nextAt: string | null = null, rateAt: string | null = null;
    if (t.venue === "perp") {
      const [f, sched] = await Promise.all([bg.recentFunding(t.ticker), bg.fundingSchedule(t.ticker)]);
      rate = f.avgRate * (t.side === "long" ? 1 : -1); // positive: you pay
      rateAt = f.lastAt ? new Date(f.lastAt).toISOString() : null;
      nextAt = new Date(sched.next).toISOString();
      // settlements on Bitget's own schedule between now and the close of the last day of the hold
      runs = bg.settlementsBetween(now.getTime(), nyInstant(holdDays[holdDays.length - 1], 16 * 60).getTime(), sched.next, sched.periodHours);
    }
    // funding policy: the future rate is unknown, so the recent average is used, and only when it costs you. A credit is never counted.
    const fundingAt = (size: number) => (runs == null ? 0 : fundingCharged(size, rate, "long", runs).charged);   // rate is already signed for the side
    const costAt = (size: number) => leg(size, inSide).cost + leg(size, outSide).cost + fundingAt(size);
    const e = leg(t.sizeUsd, inSide), x = leg(t.sizeUsd, outSide);
    if (!x.f.complete || !e.f.complete) problems.push(`The ${t.venue === "perp" ? "perp" : "rToken"} book cannot absorb $${Math.round(t.sizeUsd).toLocaleString("en-US")} right now.`);
    const finite = (n: number) => (Number.isFinite(n) ? n : 0);
    return {
      costAt,
      costs: {
        venue: t.venue, entry: { ...e.f, feeUsd: fee(e.f) }, exit: { ...x.f, feeUsd: fee(x.f) },
        entryCostUsd: finite(e.cost), exitCostUsd: finite(x.cost),
        fundingUsd: runs == null ? null : fundingAt(t.sizeUsd), fundingExpectedUsd: runs == null ? null : t.sizeUsd * rate * runs, fundingRuns: runs, fundingNextAt: nextAt, fundingRateAt: rateAt,
        totalUsd: finite(costAt(t.sizeUsd)), bookAt: new Date(book.ts).toISOString(), readAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    problems.push(`Bitget ${t.venue} data unavailable (${(e as Error).message}). Fees and slippage are left out, so this verdict is market moves only.`);
    return null;
  }
}

/** Events that land on the same day hit the same close, so they are combined, not judged one by one. */
export function combineSameDay(bands: Band[]): Band[] {
  const byDate = new Map<string, Band[]>();
  const rest: Band[] = [];
  for (const b of bands) {
    if (!b.measurable || !b.date || b.pct == null) { rest.push(b); continue; }
    byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);
  }
  const out: Band[] = [...rest];
  for (const [date, g] of byDate) {
    if (g.length === 1) { out.push(g[0]); continue; }
    out.push({
      kind: g[0].kind, date, measurable: true, n: Math.min(...g.map((b) => b.n)), method: g[0].method, combined: true,
      pct: g.reduce((a, b) => a + (b.pct ?? 0), 0),
      label: g.map((b) => b.label).join(" and ") + ", same day",
    });
  }
  return out.sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? -1 : 1));
}

export async function checkTrade(input: Trade, now = new Date()): Promise<CheckResult | { error: string }> {
  const p = await loadProfile(input.ticker);
  if (!p) return { error: `No measured history for ${input.ticker}. Shunt covers US stocks listed on Bitget as rTokens.` };
  const notes: string[] = [];
  let trade = input;
  if (trade.venue === "rtoken" && trade.side === "short") {
    // an rToken is a spot token: selling it only sells what you own. A short needs the perp.
    if (!p.perp) return { error: `${trade.ticker} can't be shorted here: an rToken is a spot token, and ${trade.ticker} has no stock perp on Bitget.` };
    trade = { ...trade, venue: "perp", leverage: trade.leverage ?? 1 };
    notes.push(`A short needs the perp, because an rToken is a spot token and selling one only sells what you own. This is checked as a ${trade.ticker} perp at ${trade.leverage}x.`);
  }
  if (trade.venue === "perp" && !p.perp) return { error: `${trade.ticker} has no stock perp on Bitget; try the rToken.` };
  const cal = await loadCalibration();
  const problems: string[] = [];
  const holdDays = tradingDaysAfter(now, trade.horizonDays);
  const conf = trade.confidence;

  // earnings inside the hold: today (a release after tonight's close lands tomorrow) through the last day
  const ny = newYork(now);
  const scanDates = [ny.date, ...holdDays.filter((d) => d !== ny.date)];
  const { rows, failed, oldestReadAt } = await earningsBetween(scanDates);
  if (failed.length) problems.push(`Earnings calendar unavailable for ${failed.join(", ")}; earnings on those dates are not shown.`);
  const events: ScheduledEvent[] = [];
  const within = new Set(holdDays);
  for (const r of rows) {
    const d = reactionDay(r.date, r.timing === "unknown" ? "unknown" : r.timing);
    if (!within.has(d)) continue;
    // a release before today's open is already in the price once the session has started
    if (r.date === ny.date && r.timing === "before open" && ny.minutes >= 9 * 60 + 30) continue;
    const when = r.timing === "unknown" ? `on ${weekday(r.date)}, time not given` : `${r.timing} ${weekday(r.date)}`;
    if (r.symbol === trade.ticker) events.push({ kind: "earnings", date: d, label: `${trade.ticker} earnings (${when})`, timing: r.timing });
    else if (p.bellwethers.some((b) => b.hub === r.symbol)) events.push({ kind: "bellwether", date: d, hub: r.symbol, label: `${r.symbol} earnings (${when})`, timing: r.timing });
  }
  for (const d of FOMC_UPCOMING) if (within.has(d)) events.push({ kind: "fed", date: d, label: `Fed decision (${weekday(d)} 2pm ET)` });
  for (const d of gapDays(holdDays, now)) events.push({ kind: "weekend", date: d, label: `Wall Street closed until ${weekday(d)} open` });
  events.sort((a, b) => (a.date < b.date ? -1 : 1));

  const rawBands = events.map((e) => eventBand(p, e.kind, conf, cal, { label: e.label, date: e.date, hub: e.hub }));
  const eventBands = combineSameDay(rawBands);
  if (eventBands.some((b) => b.combined)) notes.push("Two or more events land on the same day. Their ranges are added, which is a cautious upper bound: they have not been measured together.");
  const day = dayBand(p, conf, cal);
  const horizon = horizonBand(p, trade.horizonDays, conf);
  const [priced, weekend, mmr] = await Promise.all([
    costs(trade, holdDays, now, problems),
    trade.venue === "rtoken" ? bg.tradedLastWeekend(trade.ticker, now).catch(() => null) : Promise.resolve(null),
    trade.venue === "perp" ? bg.maintenanceRate(trade.ticker, trade.sizeUsd).catch(() => null) : Promise.resolve(0.005),
  ]);
  if (trade.venue === "perp" && mmr == null && (trade.leverage ?? 1) > 1) {
    problems.push("Bitget's margin tiers could not be read, so the liquidation distance and the safe leverage are not shown rather than guessed.");
  }
  const c = priced?.costs ?? null;
  const liquidity = c
    ? { absorbableUsd: Math.min(c.entry.filledUsd, c.exit.filledUsd), complete: c.entry.complete && c.exit.complete }
    : undefined;
  const assessment = assess(trade, day, horizon, eventBands, priced?.costAt ?? 0, mmr, liquidity);
  // fail closed: without live costs the loss is understated, so the market risk is shown but no verdict is given
  if (!priced) assessment.verdict = { state: "incomplete", reason: "Bitget's live costs could not be read" };
  // past situations like this one: every stored event of the kinds inside the hold, priced for this trade
  const sign = trade.side === "long" ? 1 : -1;
  const roundTrip = assessment.costUsd;
  const hist = (kind: History["kind"], label: string, evs: { d: string; move: number | null }[]): History | null => {
    const rows = evs.filter((e) => e.move != null).slice(-12).map((e) => ({ d: e.d, move: e.move as number, pnlUsd: trade.sizeUsd * (e.move as number) * sign - roundTrip }));
    return rows.length ? { kind, label, events: rows, withYou: rows.filter((r) => r.move * sign > 0).length, n: rows.length } : null;
  };
  const kinds = new Set(events.map((e) => e.kind));
  const inHold = [
    kinds.has("earnings") ? hist("earnings", `${p.ticker}'s last earnings days`, p.earnings.events ?? []) : null,
    kinds.has("fed") ? hist("fed", "the last Fed decision days", p.fed.events ?? []) : null,
    ...[...new Set(events.filter((e) => e.kind === "bellwether").map((e) => e.hub))].map((h) =>
      hist("bellwether", `the last ${h} report days`, p.bellwethers.find((b) => b.hub === h)?.events ?? [])),
  ].filter((x): x is History => x != null);
  // nothing with a stored history inside the hold: show the stock's last earnings days for reference (the page labels it)
  const ref = inHold.length ? null : hist("earnings", `${p.ticker}'s last earnings days`, p.earnings.events ?? []);
  const history = ref ? [ref] : inHold;
  return {
    trade, history,
    profile: { ticker: p.ticker, name: p.name, sector: p.sector, asOf: p.asOf, lastClose: p.lastClose, volNow: p.volNow, perp: p.perp,
      earningsN: p.earnings.n ?? 0, earningsP50: p.earnings.p50 ?? null },
    holdDays, events, bands: { day, horizon, events: eventBands }, assessment, costs: c, weekendTrading: weekend,
    calibration: cal, problems, notes, checkedAt: now.toISOString(), calendarAt: oldestReadAt ? new Date(oldestReadAt).toISOString() : null,
  };
}
