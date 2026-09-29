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
export async function earningsOn(date: string): Promise<EarningsRow[]> {
  const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; Shunt research)", accept: "application/json" },
    next: { revalidate: 21600 },
  } as RequestInit);
  if (!r.ok) throw new Error(`Nasdaq calendar ${date} HTTP ${r.status}`);
  const j = await r.json();
  const rows: { symbol: string; time: string }[] = j?.data?.rows ?? [];
  return rows.map((x) => ({ symbol: x.symbol.toUpperCase(), date, timing: TIMING[x.time] ?? "unknown" }));
}

/** Earnings rows for a set of dates, fetched in parallel; failures are reported, never filled in. */
export async function earningsBetween(dates: string[]): Promise<{ rows: EarningsRow[]; failed: string[] }> {
  const res = await Promise.allSettled(dates.map(earningsOn));
  const rows: EarningsRow[] = [], failed: string[] = [];
  res.forEach((r, i) => (r.status === "fulfilled" ? rows.push(...r.value) : failed.push(dates[i])));
  return { rows, failed };
}
