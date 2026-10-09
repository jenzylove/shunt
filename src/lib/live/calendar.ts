// Scheduled events: earnings from the Nasdaq earnings calendar, Fed decisions from the Federal Reserve calendar.

// Statement days (second day of each meeting), read from federalreserve.gov/monetarypolicy/fomccalendars.htm on 2026-09-29.
export const FOMC_UPCOMING = [
  "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08",
];

export type EarningsRow = { symbol: string; date: string; timing: "before open" | "after close" | "unknown" };

const TIMING: Record<string, EarningsRow["timing"]> = {
  "time-pre-market": "before open",
  "time-after-hours": "after close",
};

/** All companies reporting on one date (Nasdaq public calendar). */
export async function earningsOn(date: string): Promise<EarningsRow[] & { readAt?: number }> {
  const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; Shunt research)", accept: "application/json" },
    next: { revalidate: 21600 },
    signal: AbortSignal.timeout(8000),
  } as RequestInit);
  if (!r.ok) throw new Error(`Nasdaq calendar ${date} HTTP ${r.status}`);
  const j = await r.json();
  const rows: { symbol: string; time: string }[] = j?.data?.rows ?? [];
  const out = rows.map((x) => ({ symbol: x.symbol.toUpperCase(), date, timing: TIMING[x.time] ?? "unknown" })) as EarningsRow[] & { readAt?: number };
  // the response may come from a cache of up to six hours: its own Date header says when Nasdaq actually answered
  out.readAt = Date.parse(r.headers.get("date") ?? "") || Date.now();
  return out;
}

/** The next date a ticker reports, scanning the Nasdaq calendar over the coming weekdays. Null if none is listed. */
export async function nextEarnings(ticker: string, from: string, weekdays = 30): Promise<{ date: string; timing: string } | null> {
  const dates: string[] = [];
  for (let d = new Date(from + "T12:00:00Z"); dates.length < weekdays; d = new Date(d.getTime() + 86_400_000)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push(d.toISOString().slice(0, 10));
  }
  const { rows } = await earningsBetween(dates);
  const hit = rows.filter((r) => r.symbol === ticker).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return hit ? { date: hit.date, timing: hit.timing } : null;
}

/** Earnings rows for a set of dates, fetched in parallel; failures are reported, never filled in. */
export async function earningsBetween(dates: string[]): Promise<{ rows: EarningsRow[]; failed: string[]; oldestReadAt: number | null }> {
  const res = await Promise.allSettled(dates.map(earningsOn));
  const rows: EarningsRow[] = [], failed: string[] = [];
  let oldest: number | null = null;
  res.forEach((r, i) => {
    if (r.status === "fulfilled") { rows.push(...r.value); if (r.value.readAt) oldest = Math.min(oldest ?? Infinity, r.value.readAt); }
    else failed.push(dates[i]);
  });
  return { rows, failed, oldestReadAt: oldest };
}
