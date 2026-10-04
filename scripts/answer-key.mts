// Answer key: 24 sentences a trader might type, each with the trade a careful person would read from it.
// Scores the rule parser alone, then rules plus Claude (the way the live route combines them), field by field.
// Writes public/data/answer-key.json, misses included. usage: npx tsx scripts/answer-key.mts
import { readdirSync, writeFileSync, readFileSync } from "fs";
import { ruleParse, type Draft } from "../src/lib/parse.ts";
import { modelParse, MODEL } from "../src/lib/llm.ts";

try { for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch {}
const NOW = new Date("2026-10-05T16:00:00Z"); // a Monday at the open: "till Friday" is five sessions counting today
const known = new Set(readdirSync("public/data/stocks").map((f) => f.replace(".json", "")));
const isKnown = (t: string) => known.has(t);

type K = Partial<Pick<Draft, "ticker" | "sizeUsd" | "horizonDays" | "lossLimitUsd" | "venue" | "side">>;
const KEY: [string, K][] = [
  ["buy $10k rNVDA, holding 5 days, max loss $600", { ticker: "NVDA", venue: "rtoken", side: "long", sizeUsd: 10000, horizonDays: 5, lossLimitUsd: 600 }],
  ["What happens if I hold 20k NVDA for 5 days with 600 limit?", { ticker: "NVDA", sizeUsd: 20000, horizonDays: 5, lossLimitUsd: 600 }],
  ["buy aapl for 5 days", { ticker: "AAPL", side: "long", horizonDays: 5 }],
  ["long $5,000 of TSLA for 3 days, I can lose 250", { ticker: "TSLA", side: "long", sizeUsd: 5000, horizonDays: 3, lossLimitUsd: 250 }],
  ["short 8k AMD until Friday, stop me at 400", { ticker: "AMD", side: "short", sizeUsd: 8000, horizonDays: 5, lossLimitUsd: 400 }],
  ["NVDAUSDT perp 3x long 15000 hold 2 days risk 500", { ticker: "NVDA", venue: "perp", side: "long", sizeUsd: 15000, horizonDays: 2, lossLimitUsd: 500 }],
  ["is $3k of Microsoft ok over the weekend if I can only lose $100", { ticker: "MSFT", sizeUsd: 3000, lossLimitUsd: 100 }],
  ["go long meta 12k, 1 week, max loss 3%", { ticker: "META", side: "long", sizeUsd: 12000, horizonDays: 5, lossLimitUsd: 360 }],
  ["bet against Tesla with 4000 for 10 days, 5% max loss", { ticker: "TSLA", side: "short", sizeUsd: 4000, horizonDays: 10, lossLimitUsd: 200 }],
  ["buying 2.5k of coinbase tomorrow, 1 day, 80 max loss", { ticker: "COIN", sizeUsd: 2500, horizonDays: 1, lossLimitUsd: 80 }],
  ["rAMZN 7500 two days limit 300", { ticker: "AMZN", venue: "rtoken", sizeUsd: 7500, horizonDays: 2, lossLimitUsd: 300 }],
  ["hold googl perp 25k 3 days, cap loss at $900", { ticker: "GOOGL", venue: "perp", sizeUsd: 25000, horizonDays: 3, lossLimitUsd: 900 }],
  ["$10k long Apple for a week, 2% limit", { ticker: "AAPL", side: "long", sizeUsd: 10000, horizonDays: 5, lossLimitUsd: 200 }],
  ["short MSTR 6000 for 4 days max loss $350", { ticker: "MSTR", side: "short", sizeUsd: 6000, horizonDays: 4, lossLimitUsd: 350 }],
  ["what if I put 50k in nvidia for 2 days and can take 1,500 loss", { ticker: "NVDA", sizeUsd: 50000, horizonDays: 2, lossLimitUsd: 1500 }],
  ["HOOD 1,500 dollars 1 day risk $60", { ticker: "HOOD", sizeUsd: 1500, horizonDays: 1, lossLimitUsd: 60 }],
  ["long NVDA", { ticker: "NVDA", side: "long" }],
  ["10k tesla", { ticker: "TSLA", sizeUsd: 10000 }],
  ["can I hold 30k of nvda through earnings with a 1k stop, 10 days", { ticker: "NVDA", sizeUsd: 30000, horizonDays: 10, lossLimitUsd: 1000 }],
  ["buy 100 shares of AAPL for 3 days, I can lose $150", { ticker: "AAPL", horizonDays: 3, lossLimitUsd: 150 }],
  ["sell short $9k of META perp at 2x, 5 days, risk 400", { ticker: "META", venue: "perp", side: "short", sizeUsd: 9000, horizonDays: 5, lossLimitUsd: 400 }],
  ["thinking about a big nvda position for a while", { ticker: "NVDA" }],
  ["$12k rtsla three days, worst case matters, 500 limit", { ticker: "TSLA", venue: "rtoken", sizeUsd: 12000, horizonDays: 3, lossLimitUsd: 500 }],
  ["swap my 5k into amazon and hold until the 9th, max loss $200", { ticker: "AMZN", sizeUsd: 5000, horizonDays: 5, lossLimitUsd: 200 }],
];

const FIELDS = ["ticker", "side", "venue", "sizeUsd", "horizonDays", "lossLimitUsd"] as const;
const resolve = (d: Draft): K => {
  const o: K = { ...d };
  const pct = (d as { lossLimitPct?: number }).lossLimitPct;
  if (o.lossLimitUsd == null && pct != null && d.sizeUsd) o.lossLimitUsd = Math.round(d.sizeUsd * pct / 100);
  return o;
};
const score = (got: K, want: K) => {
  const miss: string[] = [];
  for (const f of FIELDS) {
    if (want[f] === undefined) continue;
    const g = got[f];
    const ok = f === "lossLimitUsd" || f === "sizeUsd" ? typeof g === "number" && Math.abs(g - (want[f] as number)) <= Math.max(1, Math.abs(want[f] as number) * 0.01) : g === want[f];
    if (!ok) miss.push(`${f}: wanted ${want[f]}, read ${g ?? "nothing"}`);
  }
  return miss;
};

const rows = [];
for (const [text, want] of KEY) {
  const rules = ruleParse(text, isKnown, NOW);
  const rm = score(resolve(rules), want);
  const m = await modelParse(text, null, NOW);
  const merged: Draft = { ...(m.draft ?? {}), ...Object.fromEntries(Object.entries(rules).filter(([k, v]) => v != null && !(k === "venue" || k === "side") || (k in rules && text))) };
  // the live route: rules read first, the model only fills what rules left empty
  const combo: Draft = { ...(m.draft ?? {}) };
  for (const [k, v] of Object.entries(rules)) if (v != null && (combo as Record<string, unknown>)[k] == null) (combo as Record<string, unknown>)[k] = v;
  void merged;
  const cm = score(resolve(combo), want);
  const modelOnly = score(resolve(m.draft ?? {}), want);
  rows.push({ text, rulesMisses: rm, modelMisses: modelOnly, bothMisses: cm, modelError: m.error });
  console.log(`${rm.length ? "R-" : "R+"} ${modelOnly.length ? "M-" : "M+"} ${cm.length ? "B-" : "B+"}  ${text}${m.error ? "  [" + m.error + "]" : ""}`);
  for (const x of [...new Set([...rm, ...modelOnly])]) console.log("      ", x);
}
const n = rows.length;
const sum = { sentences: n, model: MODEL, ranAt: new Date().toISOString(),
  rulesOnlyAllRight: rows.filter((r) => !r.rulesMisses.length).length,
  modelAllRight: rows.filter((r) => !r.modelMisses.length).length,
  rulesPlusModelAllRight: rows.filter((r) => !r.bothMisses.length).length };
console.log(sum);
writeFileSync("public/data/answer-key.json", JSON.stringify({ summary: sum, rows }, null, 1));
