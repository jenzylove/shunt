// A real batch through Bitget Agent Hub on the DEMO account: for each trade Shunt checks it, sizes it to the user's
// loss limit, then the order is placed with `bgc --paper-trading`, read back, closed, and read back again.
// For every trade we record what Shunt PREDICTED the round trip would cost against what Bitget Demo actually charged.
// Demo fills are simulated matching, not real liquidity: the page says so. Nothing here ever runs without --paper-trading.
// usage: BGC=path/to/bgc npx tsx scripts/proof-batch.mts [tradesPerSymbol]
import { execFileSync } from "child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { checkTrade } from "../src/lib/check.ts";
import type { Trade } from "../src/lib/engine/types.ts";

const BGC = process.env.BGC ?? "bgc";
const LOG = "data/cache/proof-batch.jsonl";
const OUT = "public/data/proof-orders.json";
const PER = Number(process.argv[2] ?? 2);
// none of RESIDUAL's five (NVDA META AMZN AAPL TSLA), so this never touches another project's positions on the shared demo account
const SYMBOLS = (process.env.SYMBOLS ?? ("HOOD COIN MSTR GOOGL MSFT ORCL PLTR AMD AVGO MU TSM NFLX LLY CRM UBER SHOP SNOW CRWD PANW SMCI ARM INTC QCOM JPM XOM WMT COST NKE BA CAT GS UNH V PYPL SOFI ABNB")).split(" ");

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20261004);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function bgc(args: string[]) {
  const all = ["--paper-trading", ...args];
  let out: string;
  try { out = execFileSync(process.execPath, [BGC, ...all], { encoding: "utf8", env: process.env, shell: false, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { const so = String((e as { stdout?: string }).stdout ?? "") || String((e as { stderr?: string }).stderr ?? ""); try { throw new Error(JSON.parse(so).error.message); } catch (x) { throw x instanceof SyntaxError ? e : x; } }
  return { cmd: "bgc " + all.join(" "), json: JSON.parse(out) };
}
const ticker = (sym: string) => { const d = bgc(["market", "--action", "tickers", "--category", "USDT-FUTURES", "--symbol", sym]).json.data[0]; return { bid: Number(d.bid1Price), ask: Number(d.ask1Price), mid: (Number(d.bid1Price) + Number(d.ask1Price)) / 2 }; };
const detail = (id: string) => { const d = bgc(["order", "--action", "detail", "--category", "USDT-FUTURES", "--orderId", id]).json.data; return { status: d.orderStatus as string, avg: Number(d.avgPrice), qty: Number(d.cumExecQty), fee: (d.feeDetail ?? []).reduce((a: number, f: { fee: string }) => a + Math.abs(Number(f.fee)), 0) }; };

const done = new Set<string>(existsSync(LOG) ? readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
let streak = 0;
const stamp = Date.now().toString(36);

const dead = new Set<string>();
for (const sym of SYMBOLS) {
  for (let k = 0; k < PER; k++) {
    const id = `${sym}-${k}`;
    if (done.has(id) || dead.has(sym)) continue;
    const size = pick([2500, 5000, 10000, 15000]);
    const t: Trade = { ticker: sym, venue: "perp", side: rand() < 0.7 ? "long" : "short", sizeUsd: size, horizonDays: pick([1, 3, 5, 10]),
      lossLimitUsd: Math.round((size * pick([0.015, 0.025, 0.04])) / 10) * 10, confidence: 0.8 };
    const rec: Record<string, unknown> = { id, at: new Date().toISOString(), trade: t };
    try {
      const first = await checkTrade(t);
      if ("error" in first) throw new Error(first.error);
      const v = first.assessment.verdict;
      rec.verdict = v.state;
      if (v.state === "illiquid") { rec.skipped = "the book could not take this size"; appendFileSync(LOG, JSON.stringify(rec) + "\n"); continue; }
      const sized = v.state === "fits" ? t.sizeUsd : v.maxSizeUsd;
      const placed = { ...t, sizeUsd: sized };
      const second = sized === t.sizeUsd ? first : await checkTrade(placed);
      if ("error" in second || !second.costs) throw new Error("no costs to compare");
      const c = second.costs;
      const predEntry = (c.entry.impactPct ?? 0) * sized + c.entry.feeUsd, predExit = c.exitCostUsd;
      rec.sizedAtUsd = sized;
      rec.predicted = { entryUsd: predEntry, exitUsd: predExit, totalUsd: predEntry + predExit, bps: ((predEntry + predExit) / sized) * 1e4 };

      const symbol = `${sym}USDT`;
      const t0 = ticker(symbol);
      const qty = (Math.floor((sized / t0.mid) * 100) / 100).toFixed(2);
      if (Number(qty) <= 0) throw new Error("size rounds to zero contracts");
      const buy = t.side === "long";
      const open = bgc(["order", "--action", "place", "--category", "USDT-FUTURES", "--symbol", symbol, "--side", buy ? "buy" : "sell", "--posSide", t.side,
        "--orderType", "market", "--qty", qty, "--clientOid", `shunt-${stamp}-${sym}-${k}-open`]);
      const openId = open.json.data?.orderId as string;
      await sleep(150);
      const od = detail(openId);
      const t1 = ticker(symbol);
      const close = bgc(["order", "--action", "place", "--category", "USDT-FUTURES", "--symbol", symbol, "--side", buy ? "sell" : "buy", "--posSide", t.side,
        "--orderType", "market", "--qty", qty, "--clientOid", `shunt-${stamp}-${sym}-${k}-close`]);
      const closeId = close.json.data?.orderId as string;
      await sleep(150);
      const cd = detail(closeId);

      // slippage is how far the fill was from the mid just before the order, counted as a cost
      const openSlip = (buy ? od.avg - t0.mid : t0.mid - od.avg) * od.qty;
      const closeSlip = (buy ? t1.mid - cd.avg : cd.avg - t1.mid) * cd.qty;
      const realized = openSlip + closeSlip + od.fee + cd.fee;
      rec.symbol = symbol; rec.qty = qty;
      rec.open = { command: open.cmd, orderId: openId, status: od.status, avgPrice: od.avg, midBefore: t0.mid, fee: od.fee };
      rec.close = { orderId: closeId, status: cd.status, avgPrice: cd.avg, midBefore: t1.mid, fee: cd.fee };
      rec.realized = { slippageUsd: openSlip + closeSlip, feesUsd: od.fee + cd.fee, totalUsd: realized, bps: (realized / sized) * 1e4 };
      streak = 0;
      console.log(`${id.padEnd(8)} ${v.state.padEnd(12)} $${String(sized).padEnd(6)} predicted ${((rec.predicted as { bps: number }).bps).toFixed(1)} bps, realized ${((rec.realized as { bps: number }).bps).toFixed(1)} bps  ${od.status}/${cd.status}`);
    } catch (e) {
      rec.error = (e as Error).message.slice(0, 160);
      if (/does not exist/.test(rec.error as string)) { dead.add(sym); rec.notOnDemo = true; } else streak++;
      console.log(`${id.padEnd(8)} ERROR ${rec.error}`);
    }
    appendFileSync(LOG, JSON.stringify(rec) + "\n");
    if (streak >= 6) { console.log("six errors in a row, stopping"); process.exit(1); }
  }
}

// summary
const rows = readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ok = rows.filter((r) => r.realized);
const notOnDemo = [...new Set(rows.filter((r) => r.notOnDemo).map((r) => r.trade.ticker))];
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const earlier = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")).earlier ?? JSON.parse(readFileSync(OUT, "utf8")).orders ?? []) : [];
const summary = {
  tradesTried: rows.length, roundTrips: ok.length, ordersPlaced: ok.length * 2 + earlier.length * 2,
  symbols: new Set(ok.map((r) => r.symbol)).size,
  filled: ok.filter((r) => r.open.status === "filled" && r.close.status === "filled").length,
  notTradableOnDemo: notOnDemo, skipped: rows.filter((r) => r.skipped).length, errors: rows.filter((r) => r.error).length,
  verdicts: ok.reduce((m: Record<string, number>, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {}),
  medianPredictedBps: med(ok.map((r) => r.predicted.bps)), medianRealizedBps: med(ok.map((r) => r.realized.bps)),
  realizedAtOrBelowPredicted: ok.filter((r) => r.realized.totalUsd <= r.predicted.totalUsd).length,
  totalNotionalUsd: ok.reduce((a, r) => a + r.sizedAtUsd * 2, 0),
};
writeFileSync(OUT, JSON.stringify({ venue: "Bitget Demo (paper trading) via Agent Hub bgc", generatedAt: new Date().toISOString(), summary, earlier, orders: ok }, null, 1));
console.log(summary);
