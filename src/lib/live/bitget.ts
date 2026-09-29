// Live Bitget market data (public endpoints, no key). Every value carries the time it was read.
const API = "https://api.bitget.com/api/v2";

async function get<T>(path: string, revalidate = 30): Promise<T> {
  const r = await fetch(API + path, { next: { revalidate } } as RequestInit);
  if (!r.ok) throw new Error(`Bitget ${path} HTTP ${r.status}`);
  const j = await r.json();
  if (j.code !== "00000") throw new Error(`Bitget ${path}: ${j.msg}`);
  return j.data as T;
}

export const rtokenSymbol = (t: string) => `R${t}USDT`;
export const perpSymbol = (t: string) => `${t}USDT`;

type Level = [string, string];
export type Book = { bids: Level[]; asks: Level[]; ts: number };

export async function spotBook(t: string): Promise<Book> {
  const d = await get<{ bids: Level[]; asks: Level[]; ts: string }>(`/spot/market/orderbook?symbol=${rtokenSymbol(t)}&limit=150`, 5);
  return { bids: d.bids, asks: d.asks, ts: Number(d.ts) || Date.now() };
}

export async function perpBook(t: string): Promise<Book> {
  const d = await get<{ bids: Level[]; asks: Level[]; ts: string }>(
    `/mix/market/merge-depth?symbol=${perpSymbol(t)}&productType=USDT-FUTURES&limit=max`, 5);
  return { bids: d.bids, asks: d.asks, ts: Number(d.ts) || Date.now() };
}

export type Fill = { filledUsd: number; avgPrice: number | null; mid: number | null; impactPct: number | null; complete: boolean };

/** Walk one side of the book with a USD amount; impact is the average fill price's distance from mid. */
export function walk(book: Book, usd: number, side: "buy" | "sell"): Fill {
  const levels = side === "buy" ? book.asks : book.bids;
  const bid = Number(book.bids[0]?.[0]), ask = Number(book.asks[0]?.[0]);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : null;
  let filled = 0, qty = 0;
  for (const [p, q] of levels) {
    const price = Number(p), size = Number(q);
    const take = Math.min(price * size, usd - filled);
    filled += take;
    qty += take / price;
    if (filled >= usd - 1e-9) break;
  }
  const avg = qty > 0 ? filled / qty : null;
  const impact = avg != null && mid != null ? Math.abs(avg - mid) / mid : null;
  return { filledUsd: filled, avgPrice: avg, mid, impactPct: impact, complete: filled >= usd - 1e-6 };
}

export type Fees = { maker: number; taker: number };

export async function spotFees(t: string): Promise<Fees> {
  const [s] = await get<{ makerFeeRate: string; takerFeeRate: string }[]>(`/spot/public/symbols?symbol=${rtokenSymbol(t)}`, 3600);
  return { maker: Number(s.makerFeeRate), taker: Number(s.takerFeeRate) };
}

export type PerpInfo = Fees & { fundIntervalHours: number; maxLever: number };

export async function perpInfo(t: string): Promise<PerpInfo> {
  const [c] = await get<{ makerFeeRate: string; takerFeeRate: string; fundInterval: string; maxLever: string }[]>(
    `/mix/market/contracts?productType=USDT-FUTURES&symbol=${perpSymbol(t)}`, 3600);
  return { maker: Number(c.makerFeeRate), taker: Number(c.takerFeeRate), fundIntervalHours: Number(c.fundInterval) || 8, maxLever: Number(c.maxLever) };
}

/** Maintenance margin rate for a position of this notional size (Bitget's tier table). */
export async function maintenanceRate(t: string, notionalUsd: number): Promise<number> {
  const tiers = await get<{ startUnit: string; endUnit: string; keepMarginRate: string }[]>(
    `/mix/market/query-position-lever?symbol=${perpSymbol(t)}&productType=USDT-FUTURES`, 3600);
  const tier = tiers.find((x) => notionalUsd >= Number(x.startUnit) && notionalUsd < Number(x.endUnit)) ?? tiers[tiers.length - 1];
  return Number(tier.keepMarginRate);
}

/** Average funding rate per interval over the last ~30 settlements (positive: longs pay shorts). */
export async function recentFunding(t: string): Promise<{ avgRate: number; n: number }> {
  const d = await get<{ fundingRate: string }[]>(
    `/mix/market/history-fund-rate?symbol=${perpSymbol(t)}&productType=USDT-FUTURES&pageSize=30`, 600);
  const rates = d.map((x) => Number(x.fundingRate)).filter((x) => Number.isFinite(x));
  return { avgRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0, n: rates.length };
}

/** Did this rToken actually trade last weekend? Counts 15 minute bars from Saturday 00:00 to Monday 00:00 UTC. */
export async function tradedLastWeekend(t: string, now = new Date()): Promise<{ traded: boolean; bars: number; weekendOf: string }> {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = (d.getUTCDay() + 1) % 7 || 7;            // days back to the most recent full Saturday
  const sat = new Date(d.getTime() - back * 86_400_000);
  if (now.getTime() - sat.getTime() < 2 * 86_400_000) sat.setUTCDate(sat.getUTCDate() - 7);
  const mon = new Date(sat.getTime() + 2 * 86_400_000);
  const bars = await get<string[][]>(
    `/spot/market/history-candles?symbol=${rtokenSymbol(t)}&granularity=15min&limit=200&endTime=${mon.getTime()}`, 3600);
  const inside = bars.filter((b) => Number(b[0]) >= sat.getTime() && Number(b[0]) < mon.getTime());
  return { traded: inside.length > 0, bars: inside.length, weekendOf: sat.toISOString().slice(0, 10) };
}
