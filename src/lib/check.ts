// One trade in, one measured answer out. Every number is from the stock's profile, a live source, or the user.
import { promises as fs } from "fs";
import path from "path";
import { dayBand, eventBand, horizonBand } from "./engine/bands";
import { gapDays, newYork, reactionDay, tradingDaysAfter, weekday } from "./engine/calendar";
import { assess, type Assessment } from "./engine/switchpoint";
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
  exitCostUsd: number;           // impact plus fee to get out at this size, right now
  fundingUsd: number | null;     // perp only, over the holding period at the recent average rate
  fundingRuns: number | null;
  readAt: string;
};

export type CheckResult = {
  trade: Trade;
  profile: Pick<Profile, "ticker" | "name" | "sector" | "asOf" | "lastClose" | "volNow" | "perp">;
  holdDays: string[];
  events: ScheduledEvent[];
  bands: { day: Band; horizon: Band; events: Band[] };
  assessment: Assessment;
  costs: Costs | null;
  weekendTrading: { traded: boolean; bars: number; weekendOf: string } | null;
  calibration: Calibration | null;
  problems: string[];            // sources that failed; nothing is filled in for them
};

async function costs(t: Trade, problems: string[]): Promise<Costs | null> {
  try {
    const book = t.venue === "perp" ? await bg.perpBook(t.ticker) : await bg.spotBook(t.ticker);
    const fees = t.venue === "perp" ? await bg.perpInfo(t.ticker) : await bg.spotFees(t.ticker);
    const inSide = t.side === "long" ? "buy" : "sell";
    const outSide = t.side === "long" ? "sell" : "buy";
    const entry = bg.walk(book, t.sizeUsd, inSide);
    const exit = bg.walk(book, t.sizeUsd, outSide);
    const fee = (f: bg.Fill) => f.filledUsd * fees.taker;
    const exitCostUsd = exit.impactPct != null ? t.sizeUsd * exit.impactPct + fee(exit) : NaN;
    let fundingUsd: number | null = null, fundingRuns: number | null = null;
    if (t.venue === "perp") {
      const info = fees as bg.PerpInfo;
      const f = await bg.recentFunding(t.ticker);
      fundingRuns = Math.ceil((t.horizonDays * 24 * 7) / 5 / info.fundIntervalHours);
      // positive funding: longs pay; a short receives it
      fundingUsd = t.sizeUsd * f.avgRate * fundingRuns * (t.side === "long" ? 1 : -1);
    }
    if (!exit.complete) problems.push(`The ${t.venue === "perp" ? "perp" : "rToken"} book cannot absorb $${Math.round(t.sizeUsd).toLocaleString()} right now; exit cost is for the part it can.`);
    return {
      venue: t.venue, entry: { ...entry, feeUsd: fee(entry) }, exit: { ...exit, feeUsd: fee(exit) },
      exitCostUsd: Number.isFinite(exitCostUsd) ? exitCostUsd : 0, fundingUsd, fundingRuns, readAt: new Date().toISOString(),
    };
  } catch (e) {
    problems.push(`Bitget ${t.venue} data unavailable: ${(e as Error).message}`);
    return null;
  }
}

export async function checkTrade(trade: Trade, now = new Date()): Promise<CheckResult | { error: string }> {
  const p = await loadProfile(trade.ticker);
  if (!p) return { error: `No measured history for ${trade.ticker}. Shunt covers US stocks listed on Bitget as rTokens.` };
  if (trade.venue === "perp" && !p.perp) return { error: `${trade.ticker} has no stock perp on Bitget; try the rToken.` };
  const cal = await loadCalibration();
  const problems: string[] = [];
  const holdDays = tradingDaysAfter(now, trade.horizonDays);
  const conf = trade.confidence;

  // earnings inside the hold: today (a release after tonight's close lands tomorrow) through the last day
  const ny = newYork(now);
  const scanDates = [ny.date, ...holdDays.filter((d) => d !== ny.date)];
  const { rows, failed } = await earningsBetween(scanDates);
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

  const eventBands = events.map((e) => eventBand(p, e.kind, conf, cal, { label: e.label, date: e.date, hub: e.hub }));
  const day = dayBand(p, conf, cal);
  const horizon = horizonBand(p, trade.horizonDays, conf);
  const [c, weekend, mmr] = await Promise.all([
    costs(trade, problems),
    trade.venue === "rtoken" ? bg.tradedLastWeekend(trade.ticker, now).catch(() => null) : Promise.resolve(null),
    trade.venue === "perp" ? bg.maintenanceRate(trade.ticker, trade.sizeUsd).catch(() => 0.005) : Promise.resolve(0.005),
  ]);
  const assessment = assess(trade, day, horizon, eventBands, c?.exitCostUsd ?? 0, mmr);
  return {
    trade,
    profile: { ticker: p.ticker, name: p.name, sector: p.sector, asOf: p.asOf, lastClose: p.lastClose, volNow: p.volNow, perp: p.perp },
    holdDays, events, bands: { day, horizon, events: eventBands }, assessment, costs: c, weekendTrading: weekend,
    calibration: cal, problems,
  };
}
