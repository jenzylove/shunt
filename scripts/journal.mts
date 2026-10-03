// Forward journal: after each US close, lock in Shunt's 80% range for the next trading day for a fixed panel of
// stocks (the earnings range if the stock reports into that day), then grade every earlier entry whose day has closed.
// Entries are written before the outcome exists and never edited afterwards; only the grade fields are added.
// usage: npx tsx scripts/journal.mts
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dayBand, eventBand } from "../src/lib/engine/bands.ts";
import { newYork, reactionDay, tradingDaysAfter } from "../src/lib/engine/calendar.ts";
import { earningsBetween } from "../src/lib/live/calendar.ts";
import type { Calibration, Profile } from "../src/lib/engine/types.ts";

const PANEL = ["NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "META", "GOOGL", "AMD", "AVGO", "MU", "PLTR", "COIN", "HOOD", "MSTR",
  "NFLX", "ORCL", "CRM", "INTC", "QCOM", "SMCI", "ARM", "UBER", "SHOP", "SNOW", "CRWD", "PANW", "LLY", "UNH", "JPM", "XOM"];
const OUT = "public/data/journal.json";

type Entry = {
  made: string; for: string; ticker: string; kind: "day" | "earnings"; band80: number; n: number;
  volNow: number; volAsOf: string | null; actual?: number; inside?: boolean; gradedAt?: string;
};
const j: { entries: Entry[] } = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { entries: [] };
const cal: Calibration = JSON.parse(readFileSync("public/data/calibration.json", "utf8"));
const load = (t: string): Profile | null => { try { return JSON.parse(readFileSync(`public/data/stocks/${t}.json`, "utf8")); } catch { return null; } };

async function closes(t: string): Promise<Map<string, number>> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=1mo&interval=1d`, { headers: { "user-agent": "Mozilla/5.0" } });
  const res = (await r.json()).chart.result[0];
  const adj: number[] = res.indicators.adjclose?.[0]?.adjclose ?? res.indicators.quote[0].close;
  const m = new Map<string, number>();
  res.timestamp.forEach((ts: number, i: number) => adj[i] && m.set(new Date(ts * 1000).toISOString().slice(0, 10), adj[i]));
  return m;
}

const now = new Date();
const ny = newYork(now);

// 1. grade entries whose day has closed (a day closes at 16:00 New York)
const due = j.entries.filter((e) => e.inside === undefined && (e.for < ny.date || (e.for === ny.date && ny.minutes >= 16 * 60 + 15)));
const byTicker = new Map<string, Entry[]>();
due.forEach((e) => byTicker.set(e.ticker, [...(byTicker.get(e.ticker) ?? []), e]));
for (const [t, es] of byTicker) {
  try {
    const m = await closes(t);
    const days = [...m.keys()].sort();
    for (const e of es) {
      const i = days.indexOf(e.for);
      if (i <= 0) continue;
      e.actual = Math.round((m.get(days[i])! / m.get(days[i - 1])! - 1) * 1e5) / 1e5;
      e.inside = Math.abs(e.actual) <= e.band80;
      e.gradedAt = now.toISOString();
    }
  } catch (err) { console.log("grade failed", t, (err as Error).message); }
}

// 2. lock in tomorrow's ranges (only once per target day)
// the next session that has not started: tomorrow's if today is a trading day already under way or closed
const upcoming = tradingDaysAfter(now, 2);
const next = upcoming[0] === ny.date && ny.minutes >= 9 * 60 + 30 ? upcoming[1] : upcoming[0];
if (!j.entries.some((e) => e.for === next)) {
  const scan = [ny.date, next];
  const { rows } = await earningsBetween(scan);
  for (const t of PANEL) {
    const p = load(t);
    if (!p) continue;
    const reports = rows.find((r) => r.symbol === t && reactionDay(r.date, r.timing === "unknown" ? "unknown" : r.timing) === next);
    const b = reports ? eventBand(p, "earnings", 0.8, cal, { label: "earnings", date: next }) : dayBand(p, 0.8, cal);
    if (!b.measurable || b.pct == null) continue;
    j.entries.push({ made: now.toISOString(), for: next, ticker: t, kind: reports ? "earnings" : "day",
      band80: Math.round(b.pct * 1e5) / 1e5, n: b.n, volNow: p.volNow, volAsOf: (p as Profile & { volAsOf?: string }).volAsOf ?? p.asOf });
  }
}

const graded = j.entries.filter((e) => e.inside !== undefined);
const inside = graded.filter((e) => e.inside).length;
const summary = { graded: graded.length, inside, rate: graded.length ? Math.round((inside / graded.length) * 1000) / 1000 : null,
  pending: j.entries.length - graded.length, target: 0.8, updated: now.toISOString() };
writeFileSync(OUT, JSON.stringify({ summary, entries: j.entries }, null, 1));
console.log(summary);
