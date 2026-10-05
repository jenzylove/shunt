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

/** New York calendar date and minutes after midnight for an instant. */
export function newYork(at: Date): { date: string; minutes: number } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * The `n` trading day closes a position opened at `start` is exposed to:
 * today's close counts if it is a trading day and New York has not closed yet (16:00 ET).
 */
export function tradingDaysAfter(start: Date, n: number): string[] {
  const out: string[] = [];
  const ny = newYork(start);
  const today = new Date(ny.date + "T00:00:00Z");
  if (isTradingDay(today) && ny.minutes < 16 * 60 && n > 0) out.push(ny.date);
  let d = today;
  while (out.length < n) {
    d = addDays(d, 1);
    if (isTradingDay(d)) out.push(iso(d));
  }
  return out;
}

const prevTradingDay = (date: string): string => {
  let d = new Date(date + "T00:00:00Z");
  do d = addDays(d, -1); while (!isTradingDay(d));
  return iso(d);
};

/**
 * Trading days whose open follows a closure of two or more calendar days (weekends and long weekends) that
 * has not already ended when `start` happens. Dates are New York dates, so the answer does not depend on the
 * server's time zone or on whether `start` falls on a weekend.
 */
export function gapDays(days: string[], start: Date): string[] {
  const ny = newYork(start);
  const out: string[] = [];
  for (const d of days) {
    const gap = (Date.parse(d) - Date.parse(prevTradingDay(d))) / 86_400_000;
    const notYetOpen = d > ny.date || (d === ny.date && ny.minutes < 9 * 60 + 30);
    if (gap >= 3 && notYetOpen) out.push(d);
  }
  return out;
}

/** The instant (UTC) that a New York date and minute after midnight fall on, daylight saving included. */
export function nyInstant(date: string, minutes: number): Date {
  for (const offsetHours of [4, 5]) {
    const t = new Date(Date.parse(date + "T00:00:00Z") + (minutes + offsetHours * 60) * 60_000);
    const ny = newYork(t);
    if (ny.date === date && ny.minutes === minutes) return t;
  }
  return new Date(Date.parse(date + "T00:00:00Z") + (minutes + 5 * 60) * 60_000);
}

/** Funding settlements crossed between two instants, for a venue that settles every `intervalHours` from 00:00 UTC. */
export function fundingRunsBetween(from: Date, to: Date, intervalHours: number): number {
  const step = intervalHours * 3_600_000;
  return Math.max(0, Math.floor(to.getTime() / step) - Math.floor(from.getTime() / step));
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
