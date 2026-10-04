"use client";
import { useEffect, useRef, useState } from "react";
import type { CheckResult } from "@/lib/check";
import { day, explain, pct, usd } from "@/lib/explain";
import type { Draft, Parsed } from "@/lib/parse";
import Rail from "./Rail";
import TrackBg from "./TrackBg";
import s from "./page.module.css";

// The way in is examples first: pick a trade and the answer swaps in place. Your own trade is the fields row and one line of words.
const EXAMPLES = [
  { label: "$20k rNVDA, 5 days", text: "buy $20k rNVDA, holding 5 days, max loss $600" },
  { label: "5x TSLA perp, weekend", text: "long 5x TSLA perp $10k over the weekend, can lose $400" },
  { label: "$8k rHOOD, 2 weeks", text: "$8k rHOOD for 2 weeks, max loss $500" },
  { label: "$5k rAAPL, overnight", text: "$5k rAAPL overnight, stop at -$150" },
];

type Meta = { readBy: "rules" | "model" | "edit"; model: string | null; modelNote?: string };
type Reply = { parsed: Parsed; result?: CheckResult; error?: string; meta?: Meta };

const STATUS: Record<string, string> = { fits: "Fits", "fits-if": "Fits with a change", "does-not-fit": "Doesn't fit", illiquid: "Can't fill" };
const LABEL: Record<string, string> = { ticker: "which stock", sizeUsd: "how much", horizonDays: "how long you'll hold", lossLimitUsd: "the most you're willing to lose" };

const fromResult = (r: CheckResult): Reply => ({
  parsed: { trade: r.trade, draft: { ...r.trade }, missing: [], notes: [] },
  result: r,
  meta: { readBy: "rules", model: null },
});

export default function Desk({ initial }: { initial: CheckResult | null }) {
  const [reply, setReply] = useState<Reply | null>(initial ? fromResult(initial) : null);
  const [active, setActive] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState("");
  const cache = useRef<Record<number, Reply>>(initial ? { 0: fromResult(initial) } : {});

  async function run(body: { text?: string; draft?: Draft }, tab: number | null = null) {
    setBusy(true);
    try {
      const r = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j: Reply = await r.json();
      setReply(j);
      if (tab != null && j.result) cache.current[tab] = j;
    } catch {
      setReply({ parsed: { trade: null, draft: {}, missing: [], notes: [] }, error: "Could not reach Shunt. Try again." });
    } finally {
      setBusy(false);
    }
  }

  // if the server could not read the first example, fetch it here so the panel is never empty
  useEffect(() => {
    if (initial) return;
    const t = setTimeout(() => run({ text: EXAMPLES[0].text }, 0), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (i: number) => {
    setActive(i);
    if (cache.current[i]) setReply(cache.current[i]);
    else run({ text: EXAMPLES[i].text }, i);
  };
  const edit = (patch: Partial<Draft>) => { if (reply) { setActive(null); run({ draft: { ...reply.parsed.draft, ...patch } }); } };
  const say = (q: string) => { setActive(null); run(reply ? { text: q, draft: reply.parsed.draft } : { text: q }); };
  const r = reply?.result;
  const v = r ? explain(r) : null;

  return (
    <main>
      <section className={s.hero} id="desk">
        <TrackBg />
        <div className={s.heroInner}>
          <p className={`pill ${s.heroPill}`}>US stocks on Bitget, as rTokens and stock perps</p>
          <h1 className={s.title}>Will your trade survive what&apos;s <span className={s.hl}>scheduled?</span></h1>
          <p className={s.lede}>Every earnings report, Fed decision and weekend inside your hold, measured for that exact stock. Pick a trade, or build your own.</p>
        </div>

        <section className={s.panel} aria-label="Live trade check">
          <header className={s.panelTop}>
            <span className={s.live}><i />Live check<ReadAt iso={r?.costs?.readAt} /></span>
            <div className={s.tabs} role="tablist" aria-label="Example trades">
              {EXAMPLES.map((ex, i) => (
                <button key={ex.text} role="tab" aria-selected={active === i} className={s.tab} disabled={busy} title={ex.text} onClick={() => pick(i)}>{ex.label}</button>
              ))}
            </div>
          </header>

          <div className={s.panelBody} aria-live="polite" data-busy={busy || undefined}>
            {!reply && <p className={s.working}>Reading the calendar, the stock&apos;s history and Bitget&apos;s order book…</p>}
            {reply && !r && (
              <p className={s.need}>
                {reply.error ?? <>To check it, Shunt still needs: {reply.parsed.missing.map((m) => LABEL[m]).join(", ")}. Try <em>buy $20k rNVDA, holding 5 days, max loss $600</em>.</>}
              </p>
            )}
            {r && v && (
              <>
                <div className={s.answer} data-tone={v.tone}>
                  <div className={s.answerText}>
                    <span className={s.status}><i />{STATUS[r.assessment.verdict.state]}</span>
                    <h2 className={s.vh}>{v.headline}</h2>
                    <p className={s.vd}>{v.detail}</p>
                  </div>
                  <dl className={s.keys}>
                    <div><dt>Your limit</dt><dd className="num">{usd(r.trade.lossLimitUsd)}</dd></div>
                    <div><dt>Worst measured</dt><dd className="num">{usd(r.assessment.worst?.lossUsd)}</dd></div>
                    <div><dt>Cost to get out</dt><dd className="num">{r.costs ? fillText(r.costs.exit, r.trade.sizeUsd, r.costs.exitCostUsd) : "n/a"}</dd></div>
                  </dl>
                </div>
                {r.assessment.verdict.state !== "illiquid" && <Rail r={r} />}
              </>
            )}
          </div>

          <footer className={s.panelFoot}>
            {r ? <Fields r={r} onEdit={edit} notes={reply!.parsed.notes} /> : <span />}
            <form className={s.say} onSubmit={(e) => { e.preventDefault(); if (words.trim()) { say(words); setWords(""); } }}>
              <label htmlFor="words" className="eyebrow">Or say it in words</label>
              <div className={s.sayRow}>
                <input id="words" value={words} onChange={(e) => setWords(e.target.value)} autoComplete="off"
                  placeholder={r ? "what if I hold till Friday?" : "buy $20k rNVDA, 5 days, max loss $600"} />
                <button disabled={busy || !words.trim()}>{busy ? "Checking" : "Ask"}</button>
              </div>
              <ReadBy meta={reply?.meta} />
            </form>
          </footer>
        </section>

        {r && (
          <details className={s.full}>
            <summary><span>See the full check</span><em>every scheduled event, the Bitget costs, the order ticket</em></summary>
            <Events r={r} />
            <Costs r={r} />
            <Ticket r={r} />
            <Sources r={r} />
          </details>
        )}
      </section>
    </main>
  );
}

/** When the live read happened, in UTC so it is the same on the server and in the browser. */
function ReadAt({ iso }: { iso?: string }) {
  if (!iso) return null;
  return <time className={s.readAt} dateTime={iso}>read {iso.slice(11, 16)} UTC</time>;
}

function ReadBy({ meta }: { meta?: Meta }) {
  if (!meta || meta.readBy === "edit") return null;
  if (meta.readBy === "rules") return null;
  return (
    <p className={s.readBy}>
      Read by Claude ({meta.model}). Every number is computed by code, not the model.
      {meta.modelNote && <> The model was not used: {meta.modelNote}.</>}
    </p>
  );
}

const FIELD: Record<string, string> = { sizeUsd: "Size", horizonDays: "Hold", lossLimitUsd: "Max loss", leverage: "Leverage" };

/** What Shunt understood, as a compact row of editable fields. */
function Fields({ r, onEdit, notes }: { r: CheckResult; onEdit: (p: Partial<Draft>) => void; notes: string[] }) {
  const t = r.trade;
  const num = (k: keyof Draft, value: number, prefix = "", suffix = "") => (
    <label className={s.field} key={String(k) + value}>
      <span className="eyebrow">{FIELD[k as string]}</span>
      <span className={s.fieldVal}>{prefix}
        <input className="num" defaultValue={value} inputMode="decimal" size={Math.max(3, String(value).length)}
          onBlur={(e) => { const n = Number(e.target.value.replace(/[$,]/g, "")); if (n > 0 && n !== value) onEdit({ [k]: n }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />{suffix}
      </span>
    </label>
  );
  return (
    <div className={s.fields} role="group" aria-label="What Shunt understood; edit any value">
      <div className={s.field}><span className="eyebrow">Stock</span><span className={s.fieldVal}>{r.profile.ticker}</span></div>
      <div className={s.field}>
        <span className="eyebrow">On</span>
        <span className={s.toggle}>
          <button aria-pressed={t.venue === "rtoken"} onClick={() => onEdit({ venue: "rtoken" })}>rToken</button>
          <button aria-pressed={t.venue === "perp"} disabled={!r.profile.perp} onClick={() => onEdit({ venue: "perp" })}>Perp</button>
        </span>
      </div>
      <div className={s.field}>
        <span className="eyebrow">Side</span>
        <span className={s.toggle}>
          <button aria-pressed={t.side === "long"} onClick={() => onEdit({ side: "long" })}>Long</button>
          <button aria-pressed={t.side === "short"} onClick={() => onEdit({ side: "short" })}>Short</button>
        </span>
      </div>
      {num("sizeUsd", t.sizeUsd, "$")}
      {num("horizonDays", t.horizonDays, "", " days")}
      {num("lossLimitUsd", t.lossLimitUsd, "$")}
      {t.venue === "perp" && num("leverage", t.leverage ?? 1, "", "x")}
      <div className={s.field}>
        <span className="eyebrow">Measured at</span>
        <span className={s.toggle}>
          <button aria-pressed={t.confidence === 0.8} onClick={() => onEdit({ confidence: 0.8 })}>4 in 5</button>
          <button aria-pressed={t.confidence === 0.95} onClick={() => onEdit({ confidence: 0.95 })}>19 in 20</button>
        </span>
      </div>
      {notes.map((n) => <p key={n} className={s.note}>{n}</p>)}
    </div>
  );
}

function Events({ r }: { r: CheckResult }) {
  const a = r.assessment;
  const rows = [...a.events].sort((x, y) => (x.band.date! < y.band.date! ? -1 : 1));
  return (
    <section className={s.block}>
      <h3 className={s.h3}>What&apos;s scheduled while you hold</h3>
      {rows.length === 0 && a.unmeasured.length === 0 && <p className={s.muted}>No earnings, bellwether reports, Fed decisions or weekends fall inside this hold.</p>}
      <div className={s.scroll}>
        <table className={s.table}>
          <thead><tr><th>When</th><th>What</th><th className={s.r}>Measured move</th><th className={s.r}>Past times</th><th className={s.r}>Your loss</th></tr></thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i} className={e.breaches ? s.breachRow : undefined}>
                <td className="num">{day(e.band.date)}</td>
                <td>{e.band.label}{e.band.corrected ? <span className={s.tag}>calibrated ×{e.band.corrected}</span> : null}</td>
                <td className={`num ${s.r}`} data-label="Measured move">{pct(e.band.pct)}</td>
                <td className={`num ${s.r}`} data-label="Past times">{e.band.n}</td>
                <td className={`num ${s.r}`} data-label="Your loss">{usd(e.lossUsd)}</td>
              </tr>
            ))}
            {a.unmeasured.map((b, i) => (
              <tr key={"u" + i}>
                <td className="num">{day(b.date)}</td><td>{b.label}</td>
                <td className={`${s.r} ${s.span}`} colSpan={3}>cannot measure: only {b.n} past</td>
              </tr>
            ))}
            <tr className={a.horizon.breaches ? s.breachRow : undefined}>
              <td className="num">whole hold</td><td>{a.horizon.band.label}</td>
              <td className={`num ${s.r}`} data-label="Measured move">{pct(a.horizon.band.pct)}</td><td className={`num ${s.r}`} data-label="Past times">{a.horizon.band.n}</td>
              <td className={`num ${s.r}`} data-label="Your loss">{usd(a.horizon.lossUsd)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={s.muted}>Each move is the size {r.profile.ticker} stayed within {r.trade.confidence === 0.8 ? "4 in 5" : "19 in 20"} times on past events of that kind, scaled to how volatile it is now. Losses include the cost to get out at your size.</p>
    </section>
  );
}

function fillText(f: { filledUsd: number; complete: boolean }, size: number, cost: number) {
  if (f.complete) return usd(cost);
  return f.filledUsd <= 0 ? "no book" : `only ${usd(f.filledUsd)} of ${usd(size)} fills`;
}

function Costs({ r }: { r: CheckResult }) {
  const c = r.costs;
  if (!c) return null;
  return (
    <section className={s.block}>
      <h3 className={s.h3}>On Bitget right now</h3>
      <dl className={s.stats}>
        <div><dt>Cost to get in</dt><dd className="num">{fillText(c.entry, r.trade.sizeUsd, (c.entry.impactPct ?? 0) * r.trade.sizeUsd + c.entry.feeUsd)}</dd></div>
        <div><dt>Cost to get out</dt><dd className="num">{fillText(c.exit, r.trade.sizeUsd, c.exitCostUsd)}</dd></div>
        {c.fundingUsd != null && <div><dt>Funding over the hold</dt><dd className="num">{usd(c.fundingUsd)}</dd></div>}
        {r.assessment.liquidationPct != null && <div><dt>Liquidated by a move of</dt><dd className="num">{pct(r.assessment.liquidationPct)}</dd></div>}
        {r.weekendTrading && <div><dt>rToken traded last weekend</dt><dd>{r.weekendTrading.traded ? "yes" : "no"}</dd></div>}
      </dl>
      <p className={s.muted}>Walked through the live {c.venue === "perp" ? "perp" : "rToken"} order book at your size, with Bitget&apos;s live fee rate.</p>
    </section>
  );
}

function Ticket({ r }: { r: CheckResult }) {
  const [copied, setCopied] = useState("");
  const t = r.trade, v = r.assessment.verdict;
  const price = r.costs?.entry.mid ?? r.profile.lastClose;
  if (!price || v.state === "illiquid") return null;
  const size = v.state === "fits" ? t.sizeUsd : v.maxSizeUsd;
  const perp = t.venue === "perp";
  const qty = perp ? (Math.floor((size / price) * 100) / 100).toFixed(2) : (Math.floor((size / price) * 1e4) / 1e4).toFixed(4);
  const cmd = perp
    ? `bgc order --action place --category USDT-FUTURES --symbol ${t.ticker}USDT --side ${t.side === "long" ? "buy" : "sell"} --posSide ${t.side} --orderType market --qty ${qty} --clientOid shunt-${t.ticker.toLowerCase()}`
    : `bgc order --action place --category SPOT --symbol R${t.ticker}USDT --side ${t.side === "long" ? "buy" : "sell"} --orderType market --qty ${qty} --clientOid shunt-${t.ticker.toLowerCase()}`;
  const demo = cmd.replace("bgc ", "bgc --paper-trading ");
  const copy = (txt: string, k: string) => { navigator.clipboard?.writeText(txt); setCopied(k); setTimeout(() => setCopied(""), 1500); };
  return (
    <section className={s.block}>
      <h3 className={s.h3}>If you decide to go ahead</h3>
      <p className={s.muted}>
        {v.state === "fits" ? `Your size fits. ` : `Sized to fit your limit: ${usd(size)} instead of ${usd(t.sizeUsd)}. `}
        Run it from your own machine with Bitget&apos;s Agent Hub CLI (<span className="num">npm i -g @bitget-ai/bitget-agent-cli</span>) and your own API key.
        Shunt never holds a key and never places an order.
      </p>
      <div className={s.cmd}><code className="num">{demo}</code><button onClick={() => copy(demo, "demo")}>{copied === "demo" ? "Copied" : "Copy, Demo first"}</button></div>
      <div className={s.cmd}><code className="num">{cmd}</code><button onClick={() => copy(cmd, "live")}>{copied === "live" ? "Copied" : "Copy"}</button></div>
      <p className={s.muted}>{perp ? `${qty} ${t.ticker} perp contracts` : `${qty} r${t.ticker}`} at about {usd(price)} each, from the live Bitget mid price.{perp && t.leverage ? ` This order does not set leverage: set ${t.leverage}x on Bitget first, because the check above assumed it.` : ""}</p>
    </section>
  );
}

function Sources({ r }: { r: CheckResult }) {
  return (
    <section className={s.sources}>
      <p className="eyebrow">Sources</p>
      <p>Earnings dates: Nasdaq earnings calendar, live. Past earnings: SEC 8-K Item 2.02 filing times. Fed decisions: federalreserve.gov. Prices: {r.profile.ticker} daily history to {r.profile.asOf}. Order book, fees, funding: Bitget, live.</p>
      {r.problems.map((p) => <p key={p} className={s.problem}>{p}</p>)}
    </section>
  );
}
