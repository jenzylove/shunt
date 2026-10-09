// How wide Shunt's 4 in 5 ranges are today, per kind of event, across every stock profile.
// Coverage alone can't show a range is useful (a very wide range always covers); width shows what it costs to be right.
// Uses the app's own band functions, so the widths are exactly what a check would show today.
// usage: npx tsx scripts/usefulness.mts    writes public/data/usefulness.json
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { dayBand, eventBand, sizeFrom } from "../src/lib/engine/bands.ts";
import type { Calibration, Profile } from "../src/lib/engine/types.ts";
import { median } from "../src/lib/stats.ts";

const DIR = "public/data/stocks";
const cal = JSON.parse(readFileSync("public/data/calibration.json", "utf8")) as Calibration;
const widths: Record<string, number[]> = { day: [], overnight: [], earnings: [], bellwether: [], fed: [], weekend: [] };
for (const f of readdirSync(DIR)) {
  const p = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) as Profile;
  const push = (k: string, pct: number | null, ok = true) => { if (ok && pct != null && Number.isFinite(pct)) widths[k].push(pct); };
  push("day", dayBand(p, 0.8, cal).pct);
  push("overnight", sizeFrom(p.overnight, p.volNow, 0.8).pct, p.overnight.n >= 8);   // same method; checks do not use overnight on its own
  for (const k of ["earnings", "fed", "weekend"] as const) { const b = eventBand(p, k, 0.8, cal, { label: k }); push(k, b.pct, b.measurable); }
  if (p.bellwethers.length) { const b = eventBand(p, "bellwether", 0.8, cal, { label: "b", hub: p.bellwethers[0].hub }); push("bellwether", b.pct, b.measurable); }
}
const kinds = Object.fromEntries(Object.entries(widths).map(([k, v]) => [k, { medianWidth: median(v), stocks: v.length }]));
writeFileSync("public/data/usefulness.json", JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), kinds }, null, 1));
console.log(kinds);
