// Command line check of one trade against live sources.
// usage: npx tsx scripts/check.ts AAPL rtoken long 20000 5 600 [leverage]
import { checkTrade } from "../src/lib/check.ts";

const [ticker = "AAPL", venue = "rtoken", side = "long", size = "20000", days = "5", limit = "600", lev] = process.argv.slice(2);
const res = await checkTrade({
  ticker: ticker.toUpperCase(), venue: venue as "rtoken" | "perp", side: side as "long" | "short",
  sizeUsd: Number(size), horizonDays: Number(days), lossLimitUsd: Number(limit),
  leverage: lev ? Number(lev) : undefined, confidence: 0.8,
});
if ("error" in res) {
  console.log("ERROR", res.error);
} else {
  const usd = (x: number | null | undefined) => (x == null ? "n/a" : "$" + Math.round(x).toLocaleString());
  const pc = (x: number | null) => (x == null ? "n/a" : (x * 100).toFixed(2) + "%");
  console.log(`${res.profile.name} (${res.profile.ticker}), data as of ${res.profile.asOf}, vol now ${pc(res.profile.volNow)}/day`);
  console.log(`Hold: ${res.holdDays[0]} .. ${res.holdDays.at(-1)}`);
  console.log("Scheduled:", res.events.length ? "" : "nothing");
  for (const r of res.assessment.events) console.log(`  ${r.band.date} ${r.band.label}: ${pc(r.band.pct)} (n=${r.band.n}, ${r.band.method}${r.band.corrected ? " x" + r.band.corrected : ""}) -> loss ${usd(r.lossUsd)}${r.breaches ? "  BREACH" : ""}`);
  for (const b of res.assessment.unmeasured) console.log(`  ${b.date} ${b.label}: cannot measure (n=${b.n})`);
  const a = res.assessment;
  console.log(`One ordinary day: ${pc(a.day.band.pct)} -> ${usd(a.day.lossUsd)}`);
  console.log(`Whole hold, ordinary moves: ${pc(a.horizon.band.pct)} -> ${usd(a.horizon.lossUsd)}`);
  if (res.costs) console.log(`Exit cost now on ${res.costs.venue}: ${usd(res.costs.exitCostUsd)} (impact ${pc(res.costs.exit.impactPct)} + fee ${usd(res.costs.exit.feeUsd)})` +
    (res.costs.fundingUsd != null ? `; funding over hold ${usd(res.costs.fundingUsd)}` : ""));
  if (res.weekendTrading) console.log(`rToken traded last weekend (${res.weekendTrading.weekendOf}): ${res.weekendTrading.traded} (${res.weekendTrading.bars} bars)`);
  if (a.liquidationPct != null) console.log(`Liquidation at a ${pc(a.liquidationPct)} move`);
  console.log("VERDICT:", JSON.stringify(a.verdict));
  if (res.problems.length) console.log("Problems:", res.problems);
}
