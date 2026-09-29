import { promises as fs } from "fs";
import path from "path";

export type IndexEntry = { t: string; n: string; perp: boolean };
let cache: { asOf: string; stocks: IndexEntry[]; set: Set<string> } | null = null;

/** The stocks Shunt has measured (US stocks listed on Bitget as rTokens). */
export async function universe() {
  if (cache) return cache;
  const j = JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "data", "index.json"), "utf8"));
  cache = { asOf: j.asOf, stocks: j.stocks, set: new Set(j.stocks.map((s: IndexEntry) => s.t)) };
  return cache;
}
