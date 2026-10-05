// Two layers. A per instance limiter always runs: it slows a casual burst and a runaway loop, but serverless instances do
// not share memory, so it is not a hard cap. When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, the same
// limits are counted in one shared store, which is the durable cap, including a global daily budget for model calls.
const hits = new Map<string, number[]>();

export function limited(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return false;
}

const storeUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const storeToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const sharedStore = () => Boolean(storeUrl() && storeToken());

/** Count one hit in the shared store. Returns the count in the current window, or null if the store is unavailable. */
async function bump(key: string, windowSec: number): Promise<number | null> {
  if (!sharedStore()) return null;
  try {
    const r = await fetch(`${storeUrl()}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${storeToken()}`, "content-type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, String(windowSec), "NX"]]),
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: number }[];
    return typeof j[0]?.result === "number" ? j[0].result : null;
  } catch {
    return null;
  }
}

/** Per client limit, shared across instances when a store is configured. */
export async function limitedShared(key: string, max: number, windowMs: number): Promise<boolean> {
  if (limited(key, max, windowMs)) return true;
  const n = await bump(`shunt:${key}:${Math.floor(Date.now() / windowMs)}`, Math.ceil(windowMs / 1000) * 2);
  return n != null && n > max;
}

/** The hard stop on model spend: one global count per day. Without a shared store this is per instance. */
export async function modelBudgetSpent(): Promise<boolean> {
  const cap = Number(process.env.MODEL_DAILY_CALLS) || 1500;
  const day = new Date().toISOString().slice(0, 10);
  if (limited("model:global:" + day, Math.ceil(cap / 4), 86_400_000)) return true;   // per instance guard
  const n = await bump(`shunt:model:day:${day}`, 90_000);
  return n != null && n > cap;
}

let inFlight = 0;
/** At most a few model calls at once per instance, so a burst cannot fan out. */
export async function withModelSlot<T>(fn: () => Promise<T>, fallback: T, max = 4): Promise<T> {
  if (inFlight >= max) return fallback;
  inFlight++;
  try { return await fn(); } finally { inFlight--; }
}

/** Vercel sets these from the connection itself, so they cannot be spoofed by a request header. */
export function clientKey(req: Request): string {
  return req.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",").pop()?.trim()
    || "unknown";
}
