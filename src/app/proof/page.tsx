import { promises as fs } from "fs";
import path from "path";
import type { Metadata } from "next";
import s from "../doc.module.css";

export const metadata: Metadata = { title: "Shunt · Proof", description: "Shunt's ranges checked against what actually happened, in history and live." };
export const dynamic = "force-dynamic";

const DATA = path.join(process.cwd(), "public", "data");
const read = async <T,>(f: string): Promise<T | null> => {
  try { return JSON.parse(await fs.readFile(path.join(DATA, f), "utf8")); } catch { return null; }
};

type Cal = { asOf: string; types: Record<string, { volScaled?: { rate: number; checked: number }; corrected?: { factor: number; apply: boolean; rateAfter: number; uncorrectedRateAfter: number } }> };
type Journal = { summary: { graded: number; inside: number; rate: number | null; pending: number; updated: string };
  entries: { made: string; for: string; ticker: string; kind: string; band80: number; actual?: number; inside?: boolean }[] };
type Orders = { venue: string; orders: { at: string; trade: { ticker: string; side: string; sizeUsd: number; lossLimitUsd: number; horizonDays: number; leverage?: number };
  verdict: { state: string; maxSizeUsd?: number }; sizedAtUsd: number; symbol: string; qty: string;
  open: { command: string; orderId: string; status: string; avgPrice?: string }; close: { orderId: string; status: string; avgPrice?: string } }[] };

const NAMES: Record<string, [string, string]> = {
  day: ["Ordinary days", "close to close, outside the stock's own earnings"],
  overnight: ["Overnight gaps", "close to the next open"],
  earnings: ["Own earnings days", "the session that reacts to the report"],
  bellwether: ["Bellwether report days", "for the 45 stocks with a tested link"],
  fed: ["Fed decision days", "statement days since 2023"],
  weekend: ["Weekends", "Friday close to Monday open"],
};
const pc = (x: number | null | undefined, d = 1) => (x == null ? "n/a" : (x * 100).toFixed(d) + "%");
const usd = (x: number) => "$" + Math.round(x).toLocaleString("en-US");

export default async function Proof() {
  const [cal, journal, orders] = await Promise.all([read<Cal>("calibration.json"), read<Journal>("journal.json"), read<Orders>("proof-orders.json")]);
  const recent = journal ? [...journal.entries].sort((a, b) => (a.for < b.for ? 1 : -1)).slice(0, 60) : [];
  return (
    <main className={s.main}>
      <section className={s.hero}>
        <p className="eyebrow">Proof</p>
        <h1 className={s.title}>Does &ldquo;4 in 5&rdquo; actually mean 4 in 5?</h1>
        <p className={s.lede}>
          Every range Shunt shows is the size a stock stayed within 4 times in 5 on past events of that kind. That only means
          something if it holds on days the range never saw. Here is the check, on history and live.
        </p>
      </section>

      {(!cal || !journal || !orders) && (
        <p className={s.muted} style={{ color: "var(--stop)" }}>
          Some proof data could not be read on this server: {[!cal && "calibration", !journal && "journal", !orders && "orders"].filter(Boolean).join(", ")}.
        </p>
      )}

      {cal && (
        <section className={s.section}>
          <h2>On ten years of history</h2>
          <p>For every stock, the range was built only from events before each day, then checked against that day. The amber line is the 80% target.</p>
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
            <div><dt>Inside the range</dt><dd>{journal.summary.graded ? pc(journal.summary.rate) : "first grades after the next close"}</dd></div>
            <div><dt>Waiting for their session</dt><dd>{journal.summary.pending}</dd></div>
          </dl>
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
          <p className={s.muted}>Updated {new Date(journal.summary.updated).toUTCString()}. Script: scripts/journal.mts, run by a scheduled GitHub Action.</p>
        </section>
      )}

      {orders && orders.orders.length > 0 && (
        <section className={s.section}>
          <h2>Orders through Bitget Agent Hub</h2>
          <p>Shunt checked each trade, sized it to fit the loss limit, then the order went to Bitget Demo through Agent Hub&apos;s CLI (<code>bgc --paper-trading</code>), tagged with a <code>shunt</code> client id, and was closed straight after.</p>
          <div className={s.scroll}>
            <table className={s.table}>
              <thead><tr><th>Trade asked</th><th>Shunt said</th><th className={s.r}>Placed at</th><th>Open order id</th><th>Close order id</th></tr></thead>
              <tbody>
                {orders.orders.map((o) => (
                  <tr key={o.open.orderId}>
                    <td>{o.trade.side} {usd(o.trade.sizeUsd)} {o.symbol}{o.trade.leverage ? ` ${o.trade.leverage}x` : ""}, {o.trade.horizonDays} days, max loss {usd(o.trade.lossLimitUsd)}</td>
                    <td>{o.verdict.state === "fits" ? "fits" : `fits at ${usd(o.sizedAtUsd)}`}</td>
                    <td className={`num ${s.r}`}>{o.qty} @ {o.open.avgPrice ?? "market"}</td>
                    <td className="num">{o.open.orderId} <span className={s.in}>{o.open.status}</span></td>
                    <td className="num">{o.close.orderId} <span className={s.in}>{o.close.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <code className={`${s.cmd}`}>{orders.orders[0].open.command}</code>
          <p className={s.muted}>{orders.venue}. The public site never holds an exchange key; these were placed from the builder&apos;s machine.</p>
        </section>
      )}
    </main>
  );
}
