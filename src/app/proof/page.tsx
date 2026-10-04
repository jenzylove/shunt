import type { Metadata } from "next";
import calData from "../../../public/data/calibration.json";
import journalData from "../../../public/data/journal.json";
import ordersData from "../../../public/data/proof-orders.json";
import s from "../doc.module.css";
import Strip from "./Strip";

export const metadata: Metadata = { title: "Shunt · Proof", description: "Shunt's ranges checked against what actually happened, in history and live." };
// bundled at build time; the daily journal commit triggers a rebuild

type Cal = { asOf: string; types: Record<string, { volScaled?: { rate: number; checked: number }; corrected?: { factor: number; apply: boolean; rateAfter: number; uncorrectedRateAfter: number } }> };
type Journal = { summary: { graded: number; inside: number; rate: number | null; pending: number; updated: string };
  entries: { made: string; for: string; ticker: string; kind: string; band80: number; actual?: number; inside?: boolean }[] };
type Leg = { orderId: string; status: string; avgPrice: number; midBefore: number; fee: number };
type Row = { id: string; at: string; trade: { ticker: string; side: string; sizeUsd: number; lossLimitUsd: number; horizonDays: number };
  verdict: string; sizedAtUsd: number; symbol: string; qty: string;
  predicted: { totalUsd: number; bps: number }; realized: { totalUsd: number; slippageUsd: number; feesUsd: number; bps: number };
  open: Leg & { command: string }; close: Leg };
type Orders = { venue: string; summary?: { roundTrips: number; ordersPlaced: number; symbols: number; filled: number; medianPredictedBps: number | null; medianRealizedBps: number | null;
  realizedAtOrBelowPredicted: number; totalNotionalUsd: number; notTradableOnDemo?: string[] }; earlier?: unknown[]; orders: Row[] };

const NAMES: Record<string, [string, string]> = {
  day: ["Ordinary days", "close to close, last 3 years, outside the stock's own earnings"],
  overnight: ["Overnight gaps", "close to the next open, last 3 years"],
  earnings: ["Own earnings days", "the session that reacts to the report, since 2016"],
  bellwether: ["Bellwether report days", "since 2017, for the 45 stocks with a tested link"],
  fed: ["Fed decision days", "statement days, last 3 years"],
  weekend: ["Weekends", "Friday close to Monday open, last 3 years"],
};
const pc = (x: number | null | undefined, d = 1) => (x == null ? "n/a" : (x * 100).toFixed(d) + "%");
const usd = (x: number) => "$" + Math.round(x).toLocaleString("en-US");

export default function Proof() {
  const cal = calData as unknown as Cal | null, journal = journalData as unknown as Journal | null, orders = ordersData as unknown as Orders | null;
  const recent = journal ? [...journal.entries].sort((a, b) => (a.for < b.for ? 1 : -1)).slice(0, 60) : [];
  return (
    <main className={s.main}>
      <section className={s.hero}>
        <p className="pill">Proof</p>
        <h1 className={s.title}>Does &ldquo;4 in 5&rdquo; actually mean <span className={s.hl}>4 in 5</span>?</h1>
        <p className={s.lede}>
          Every range Shunt shows is the size a stock stayed within 4 times in 5 on past events of that kind. That only means
          something if it holds on days the range never saw. Here is the check, on history and live.
        </p>
      </section>

      {(!cal || !journal || !orders) && (
        <p className={`${s.muted} ${s.alert}`}>
          Some proof data could not be read on this server: {[!cal && "calibration", !journal && "journal", !orders && "orders"].filter(Boolean).join(", ")}.
        </p>
      )}

      {cal && (
        <section className={s.section}>
          <h2>What &ldquo;4 in 5&rdquo; looks like on a real stock</h2>
          <p>Each evening Shunt draws the range for the next day, using only what had happened by then. The shaded lane is that range. Each dot is the move that followed. If &ldquo;4 in 5&rdquo; is honest, about one dot in five lands outside the lane, and that is what you see.</p>
          <Strip />
        </section>
      )}

      {cal && (
        <section className={s.section}>
          <h2>The same test on every stock</h2>
          <p>For every stock, the range was built only from events before each day, then checked against that day. Price history reaches back ten years; each row below says which window it uses. Each bar is the share of moves that stayed inside the range. The dark tick marks the 80% target, so a bar that reaches it means the range was honest.</p>
          <div className={s.bars}>
            {Object.entries(NAMES).map(([k, [name, note]]) => {
              const t = cal.types[k];
              const rate = t?.volScaled?.rate;
              if (rate == null) return null;
              const low = rate < 0.75;
              return (
                <div key={k} className={s.bar}>
                  <span className={s.barName}>{name}<small>{note} · {t.volScaled!.checked.toLocaleString("en-US")} checks</small></span>
                  <span className={s.track}><span className={`${s.fill} ${low ? s.fillLow : ""}`} style={{ width: `${rate * 100}%` }} /><span className={s.target} style={{ left: "80%" }} /></span>
                  <span className={s.val}>{pc(rate)}</span>
                </div>
              );
            })}
          </div>
          <p className={s.muted}>
            Weekends fall short: 71% overall, 78% in the most recent half. A correction learned on older weekends
            overshot on newer ones (90%), so it is not applied; Shunt shows the weekend number as it is.
            Ranges are scaled by each stock&apos;s volatility now, refreshed after every US close. Data as of {cal.asOf}.
          </p>
        </section>
      )}

      {journal && (
        <section className={s.section}>
          <h2>Live, written before the outcome</h2>
          <p>After every US close, Shunt locks in tomorrow&apos;s 4 in 5 range for 30 stocks (the earnings range if one reports). After that session closes, each one is graded. Entries are never edited once written.</p>
          <dl className={s.stats}>
            <div><dt>Graded</dt><dd>{journal.summary.graded}</dd></div>
            <div><dt>Inside the range</dt><dd>{journal.summary.graded ? pc(journal.summary.rate) : "not yet"}</dd></div>
            <div><dt>Waiting for their session</dt><dd>{journal.summary.pending}</dd></div>
          </dl>
          <details className={s.more}>
            <summary>Show the {recent.length} locked ranges</summary>
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th>Session</th><th>Stock</th><th>Kind</th><th className={s.r}>Range</th><th className={s.r}>Actual move</th><th className={s.r}>Result</th></tr></thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.for + e.ticker}>
                    <td className="num">{e.for}</td><td>{e.ticker}</td><td>{e.kind === "earnings" ? "earnings" : "ordinary"}</td>
                    <td className={`num ${s.r}`}>±{pc(e.band80)}</td>
                    <td className={`num ${s.r}`}>{e.actual == null ? "pending" : (e.actual > 0 ? "+" : "") + pc(e.actual, 2)}</td>
                    <td className={`${s.r} ${e.inside == null ? "" : e.inside ? s.in : s.out}`}>{e.inside == null ? "" : e.inside ? "inside" : "outside"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </details>
          <p className={s.muted}>Updated {new Date(journal.summary.updated).toUTCString()}. Script: scripts/journal.mts, run by a scheduled GitHub Action.</p>
        </section>
      )}

      {orders && orders.orders.length > 0 && (() => {
        const sm = orders.summary;
        const rows = orders.orders;
        const within = rows.filter((o) => Math.abs(o.realized.bps - o.predicted.bps) <= 5).length;
        return (
        <section className={s.section}>
          <h2>Orders through Bitget Agent Hub</h2>
          <p>
            Shunt predicts what getting in and out will cost: the fee plus how far your size walks through the order book. To test that, each
            trade below was checked, sized to its loss limit, sent to Bitget Demo through Agent Hub&apos;s CLI (<code>bgc --paper-trading</code>),
            then closed straight away. The fill was compared with the price on the screen just before the order.
          </p>
          <dl className={s.stats}>
            <div><dt>Orders placed</dt><dd>{sm?.ordersPlaced ?? rows.length * 2}</dd></div>
            <div><dt>Round trips</dt><dd>{rows.length}</dd></div>
            <div><dt>Stocks</dt><dd>{new Set(rows.map((o) => o.symbol)).size}</dd></div>
            <div><dt>Median cost predicted</dt><dd>{sm?.medianPredictedBps?.toFixed(1)} bps</dd></div>
            <div><dt>Median cost charged</dt><dd>{sm?.medianRealizedBps?.toFixed(1)} bps</dd></div>
            <div><dt>Within 5 bps of the call</dt><dd>{within} of {rows.length}</dd></div>
          </dl>
          <p className={s.muted}>One bps is one hundredth of one percent of the trade. 18 bps on a $5,000 trade is $9. Demo fills are simulated matching on Bitget&apos;s paper account, not live liquidity, so this tests the fee and book arithmetic, not the real market.</p>
          <details className={s.more}>
            <summary>Show all {rows.length} round trips ({rows.length * 2} order ids)</summary>
            <div className={s.scroll}>
              <table className={s.table}>
                <thead><tr><th>Trade asked</th><th>Shunt said</th><th className={s.r}>Placed</th><th className={s.r}>Predicted</th><th className={s.r}>Charged</th><th>Open order</th><th>Close order</th></tr></thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.open.orderId}>
                      <td>{o.trade.side} {usd(o.trade.sizeUsd)} {o.symbol}, {o.trade.horizonDays} days, max loss {usd(o.trade.lossLimitUsd)}</td>
                      <td>{o.verdict === "fits" ? "fits" : `fits at ${usd(o.sizedAtUsd)}`}</td>
                      <td className={`num ${s.r}`}>{o.qty} @ {o.open.avgPrice}</td>
                      <td className={`num ${s.r}`}>{o.predicted.bps.toFixed(1)} bps</td>
                      <td className={`num ${s.r}`}>{o.realized.bps.toFixed(1)} bps</td>
                      <td className="num">{o.open.orderId} <span className={s.in}>{o.open.status}</span></td>
                      <td className="num">{o.close.orderId} <span className={s.in}>{o.close.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <code className={`${s.cmd}`}>{rows[0].open.command}</code>
          <p className={s.muted}>
            {orders.venue}.{sm?.notTradableOnDemo?.length ? ` Demo does not list ${sm.notTradableOnDemo.length} other stock perps Shunt checks, so those could not be ordered.` : ""} The public site never holds an exchange key; these were placed from the builder&apos;s machine.
          </p>
        </section>
        );
      })()}
    </main>
  );
}
