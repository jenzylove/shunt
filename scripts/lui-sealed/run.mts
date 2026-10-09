// Runs the sealed language test (cases.json) against a running Shunt and scores every case pass or fail.
// usage: npx tsx scripts/lui-sealed/run.mts <baseUrl> <label>      e.g. https://shunt-eight.vercel.app baseline
// Writes scripts/lui-sealed/results-<label>.json. Paced to stay under the public rate limit.
import { readFileSync, writeFileSync } from "fs";

const BASE = (process.argv[2] ?? "https://shunt-eight.vercel.app").replace(/\/$/, "");
const LABEL = process.argv[3] ?? "run";
const PACE_MS = Number(process.env.PACE_MS ?? 16_000);
const spec = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
type Fields = Record<string, unknown>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// trading sessions a position opened now is exposed to, through the named weekday's close (NYSE holidays aside)
function sessionsThrough(weekday: string, now = new Date()): number {
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const want = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(weekday);
  let n = 0;
  const d = new Date(ny); d.setHours(12, 0, 0, 0);
  const openToday = ny.getHours() * 60 + ny.getMinutes() < 16 * 60;
  for (let i = 0; i < 10; i++) {
    const wd = d.getDay();
    if (wd > 0 && wd < 6 && (i > 0 || openToday)) n++;
    if (i > 0 && wd === want) break;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

const close = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01) : a === b;

function score(c: Fields & { expect: Fields; base?: boolean }, j: Fields, status: number) {
  const e = c.expect;
  const misses: string[] = [];
  const parsed = (j.parsed ?? {}) as { draft?: Fields; missing?: string[]; notes?: string[] };
  const result = j.result as { trade?: Fields; notes?: string[] } | undefined;
  const meta = (j.meta ?? {}) as { question?: { kind?: string; tickers?: string[] } };
  const ask = j.ask as { kind?: string; field?: string } | undefined;
  const trade: Fields = { ...(parsed.draft ?? {}), ...(result?.trade ?? {}) };
  const notes = [...(parsed.notes ?? []), ...(result?.notes ?? [])].join(" ");
  const base = spec.base as Fields;

  if (e.trade) {
    if (j.error) misses.push(`error: ${j.error}`);
    if (ask && !e.ask) misses.push(`asked ${ask.kind} instead`);
    for (const [k, v] of Object.entries(e.trade as Fields)) if (!close(trade[k], v)) misses.push(`${k}: wanted ${v}, got ${trade[k] ?? "nothing"}`);
  }
  if (e.holdUntil) {
    const want = sessionsThrough(String(e.holdUntil));
    if (!close(trade.horizonDays, want)) misses.push(`horizonDays: wanted ${want}, got ${trade.horizonDays ?? "nothing"}`);
  }
  if (e.error && !(j.error || status >= 400)) misses.push("wanted an error, got a normal answer");
  if (e.ask && ask?.kind !== e.ask) misses.push(`wanted ask ${e.ask}, got ${ask?.kind ?? "none"}`);
  if (e.clarify) {
    const ok = (ask?.kind === "conflict" && ask.field === e.clarify) || (parsed.missing ?? []).includes(String(e.clarify));
    if (!ok) misses.push(`wanted a question about ${e.clarify}, got ${ask?.kind ?? (result ? "a verdict" : "nothing")}`);
  }
  if (e.missing) for (const m of e.missing as string[]) if (!(parsed.missing ?? []).includes(m)) misses.push(`should ask for ${m}`);
  if (e.missing && result) misses.push("gave a verdict without the missing values");
  if (e.note && !notes.toLowerCase().includes(String(e.note).toLowerCase())) misses.push(`missing note "${e.note}"`);
  if (e.question) {
    if (meta.question?.kind !== e.question) misses.push(`wanted question ${e.question}, got ${meta.question?.kind ?? "none"}`);
    if (e.tickers) for (const t of e.tickers as string[]) if (!(meta.question?.tickers ?? []).includes(t)) misses.push(`compare should include ${t}`);
  }
  if (e.unchanged && c.base) for (const k of ["ticker", "venue", "side", "sizeUsd", "horizonDays", "lossLimitUsd"]) if (!close(trade[k], base[k])) misses.push(`changed ${k} to ${trade[k]}`);
  return misses;
}

const rows = [];
for (const c of spec.cases) {
  const body = { text: c.text, ...(c.base ? { draft: spec.base } : {}) };
  let j: Fields = {}, status = 0;
  try {
    const r = await fetch(`${BASE}/api/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    status = r.status; j = await r.json();
  } catch (e) { j = { error: `request failed: ${(e as Error).message}` }; }
  if (status === 429) { console.log("rate limited; stop and rerun with a longer PACE_MS"); process.exit(1); }
  const misses = score(c, j, status);
  rows.push({ id: c.id, group: c.group, text: c.text, pass: misses.length === 0, misses });
  console.log(`${misses.length ? "MISS" : "pass"} ${c.id} ${c.text}${misses.length ? "\n       " + misses.join("; ") : ""}`);
  await sleep(PACE_MS);
}
const by = (g?: string) => { const r = rows.filter((x) => !g || x.group === g); return `${r.filter((x) => x.pass).length} of ${r.length}`; };
const summary = { label: LABEL, base: BASE, ranAt: new Date().toISOString(), all: by(), trade: by("trade"), safety: by("safety"), followup: by("followup"), question: by("question") };
console.log(summary);
writeFileSync(new URL(`./results-${LABEL}.json`, import.meta.url), JSON.stringify({ summary, rows }, null, 1));
