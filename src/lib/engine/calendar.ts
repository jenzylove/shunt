// US equity trading calendar and the scheduled events inside a holding period.

// NYSE full-day closures (nyse.com holidays page), enough to cover any 20 trading day hold from late 2026 into 2027.
export const NYSE_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03",
  "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05",
  "2027-09-06", "2027-11-25", "2027-12-24",
]);

export const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function isTradingDay(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !NYSE_HOLIDAYS.has(iso(d));
}

/** The next `n` trading days strictly after `start` (the trading days whose closes the position is exposed to). */
export function tradingDaysAfter(start: Date, n: number): string[] {
  const out: string[] = [];
  let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (out.length < n) {
    d = addDays(d, 1);
    if (isTradingDay(d)) out.push(iso(d));
  }
  return out;
}

/** Trading days whose open follows a closure of two or more calendar days (weekends and long weekends). */
export function gapDays(days: string[], start: Date): string[] {
  const out: string[] = [];
  let prev = iso(start);
  for (const d of days) {
    const gap = (Date.parse(d) - Date.parse(prev)) / 86_400_000;
    if (gap >= 3) out.push(d);
    prev = d;
  }
  return out;
}

/** An earnings release maps to the first trading day whose close reflects it. */
export function reactionDay(date: string, timing: "before open" | "after close" | "during session" | "unknown"): string {
  if (timing !== "after close") return date;
  let d = new Date(date + "T00:00:00Z");
  do d = addDays(d, 1); while (!isTradingDay(d));
  return iso(d);
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekday = (isoDate: string) => WD[new Date(isoDate + "T00:00:00Z").getUTCDay()];
