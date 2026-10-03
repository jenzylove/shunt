// Proof of the Agent Hub order path: run a real Shunt check, size an order at Shunt's answer, place it on
// Bitget DEMO through Agent Hub's CLI (bgc --paper-trading), confirm it, close it, and publish the order ids.
// Keys come from the environment (BITGET_API_KEY / BITGET_SECRET_KEY / BITGET_PASSPHRASE of a DEMO account);
// nothing here runs without --paper-trading. Every order carries a clientOid starting with "shunt".
// usage: BGC=path/to/bgc npx tsx scripts/proof-orders.mts
import { execFileSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { checkTrade } from "../src/lib/check.ts";
import type { Trade } from "../src/lib/engine/types.ts";

const BGC = process.env.BGC ?? "bgc";
const OUT = "public/data/proof-orders.json";

function bgc(args: string[]) {
  const all = ["--paper-trading", ...args];          // demo only, always
  const out = execFileSync(process.execPath, [BGC, ...all], { encoding: "utf8", env: process.env, shell: false });
  return { cmd: "bgc " + all.join(" "), json: JSON.parse(out) };
}

// stocks RESIDUAL never trades on the shared demo account
const TRADES: (Trade & { thesis: string })[] = [
  { ticker: "HOOD", venue: "perp", side: "long", sizeUsd: 5000, horizonDays: 5, lossLimitUsd: 250, leverage: 2, confidence: 0.8, thesis: "a jumpy stock through a weekend" },
  { ticker: "COIN", venue: "perp", side: "short", sizeUsd: 4000, horizonDays: 3, lossLimitUsd: 200, leverage: 2, confidence: 0.8, thesis: "short into a quiet stretch" },
];

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { orders: [] };
const stamp = Date.now().toString(36);

for (const t of TRADES) {
  const res = await checkTrade(t);
  if ("error" in res) { console.log(t.ticker, res.error); continue; }
  const v = res.assessment.verdict;
  const sizeUsd = v.state === "fits" ? t.sizeUsd : v.maxSizeUsd;
  const symbol = `${t.ticker}USDT`;
  const tick = bgc(["market", "--action", "tickers", "--category", "USDT-FUTURES", "--symbol", symbol]).json.data[0];
  const price = Number(tick.lastPrice);
  const qty = (Math.floor((sizeUsd / price) * 100) / 100).toFixed(2);
  const open = bgc(["order", "--action", "place", "--category", "USDT-FUTURES", "--symbol", symbol,
    "--side", t.side === "long" ? "buy" : "sell", "--posSide", t.side, "--orderType", "market", "--qty", qty,
    "--clientOid", `shunt-${stamp}-${t.ticker}-open`]);
  const openId = open.json.data?.orderId;
  const openDetail = bgc(["order", "--action", "detail", "--category", "USDT-FUTURES", "--orderId", openId]).json.data;
  const close = bgc(["order", "--action", "place", "--category", "USDT-FUTURES", "--symbol", symbol,
    "--side", t.side === "long" ? "sell" : "buy", "--posSide", t.side, "--orderType", "market", "--qty", qty,
    "--clientOid", `shunt-${stamp}-${t.ticker}-close`]);
  const closeId = close.json.data?.orderId;
  const closeDetail = bgc(["order", "--action", "detail", "--category", "USDT-FUTURES", "--orderId", closeId]).json.data;
  const rec = {
    at: new Date().toISOString(), trade: t, verdict: v, sizedAtUsd: sizeUsd, symbol, qty, price,
    open: { command: open.cmd, orderId: openId, status: openDetail?.orderStatus, avgPrice: openDetail?.avgPrice },
    close: { command: close.cmd, orderId: closeId, status: closeDetail?.orderStatus, avgPrice: closeDetail?.avgPrice },
  };
  prev.orders.push(rec);
  console.log(t.ticker, v.state, "sized", Math.round(sizeUsd), "open", openId, openDetail?.orderStatus, "close", closeId, closeDetail?.orderStatus);
}
writeFileSync(OUT, JSON.stringify({ venue: "Bitget Demo (paper trading) via Agent Hub bgc", ...prev }, null, 1));
