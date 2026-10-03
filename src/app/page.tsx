"use client";
import { useRef, useState } from "react";
import type { CheckResult } from "@/lib/check";
import { day, explain, pct, usd } from "@/lib/explain";
import type { Draft, Parsed } from "@/lib/parse";
import Rail from "./Rail";
import s from "./page.module.css";

const EXAMPLES = [
  { text: "buy $20k rNVDA, holding 5 days, max loss $600", note: "a big name, a normal week" },
  { text: "long 5x TSLA perp $10k over the weekend, can lose $400", note: "leverage while Wall Street is shut" },
  { text: "$8k rHOOD for 2 weeks, max loss $500", note: "a jumpy stock, a longer hold" },
  { text: "$5k rAAPL overnight, stop at -$150", note: "one night, a tight stop" },
];

type Reply = { parsed: Parsed; result?: CheckResult; error?: string; meta?: { readBy: "rules" | "model" | "edit"; model: string | null; modelNote?: string } };

export default function Desk() {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  async function run(body: { text?: string; draft?: Draft }) {
    setBusy(true);
    try {
      const r = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j: Reply = await r.json();
      setReply(j);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setReply({ parsed: { trade: null, draft: {}, missing: [], notes: [] }, error: "Could not reach Shunt. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const edit = (patch: Partial<Draft>) => reply && run({ draft: { ...reply.parsed.draft, ...patch } });
  const r = reply?.result;
  const v = r ? explain(r) : null;

  return (
    <main className={s.main}>
      <section className={s.hero}>
        <p className="eyebrow">For US stocks on Bitget, rTokens and stock perps</p>
        <h1 className={s.title}>Will your trade survive what&apos;s&nbsp;scheduled?</h1>
        <p className={s.lede}>
          Type it the way you&apos;d say it. Shunt reads the calendar, measures every event for that exact stock from its own
          history, and shows where your trade stops fitting your loss limit.
        </p>
        <form className={s.ask} onSubmit={(e) => { e.preventDefault(); if (text.trim()) run({ text }); }}>
          <label htmlFor="trade" className={s.srOnly}>Your trade</label>
          <input id="trade" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off"
            placeholder="buy $20k rNVDA, holding 5 days, max loss $600" className={s.input} />
          <button className={s.go} disabled={busy || !text.trim()}>{busy ? "Checking" : "Check it"}</button>
        </form>
        <div className={s.board} role="list" aria-label="Example trades">
          <p className="eyebrow">Or try one</p>
          {EXAMPLES.map((ex) => (
            <button key={ex.text} role="listitem" className={s.row} disabled={busy}
              onClick={() => { setText(ex.text); run({ text: ex.text }); }}>
              <span className={s.rowText}>{ex.text}</span>
              <span className={s.rowNote}>{ex.note}</span>
              <span className={s.rowGo} aria-hidden>→</span>
            </button>
          ))}
        </div>
      </section>

      <div ref={resultRef} className={s.result} aria-live="polite">
        {busy && <p className={s.status}>Reading the calendar, the stock&apos;s history and Bitget&apos;s order book…</p>}
        {!busy && reply && !r && (
          <div className={s.need}>
            {reply.error ? <p>{reply.error}</p> : (
              <p>To check it, Shunt still needs: {reply.parsed.missing.map((m) => LABEL[m]).join(", ")}.
                Try something like <em>buy $20k rNVDA, holding 5 days, max loss $600</em>.</p>
            )}
          </div>
        )}
        {!busy && r && v && (
          <>
            <Chips r={r} onEdit={edit} notes={reply!.parsed.notes} />
            <ReadBy meta={reply!.meta} />
            <section className={`${s.verdict} ${s[TONE[v.tone]]}`}>
              <h2>{v.headline}</h2>
              <p>{v.detail}</p>
            </section>
            <FollowUp busy={busy} onAsk={(q) => run({ text: q, draft: reply!.parsed.draft })} />
            <Rail r={r} />
            <Events r={r} />
            <Costs r={r} />
            <Ticket r={r} />
            <Sources r={r} />
          </>
        )}
      </div>
    </main>
  );
}

function ReadBy({ meta }: { meta?: Reply["meta"] }) {
  if (!meta || meta.readBy === "edit") return null;
  return (
    <p className={s.readBy}>
      {meta.readBy === "model" ? <>Read by Claude ({meta.model}). Every number below is computed by code, not the model.</> : <>Read by Shunt&apos;s rules.</>}
      {meta.modelNote && <> The model was not used: {meta.modelNote}.</>}
    </p>
  );
}

function FollowUp({ busy, onAsk }: { busy: boolean; onAsk: (q: string) => void }) {
  const [q, setQ] = useState("");
  const tries = ["what if I hold till Friday?", "make it $10k", "what about the perp at 3x?", "use the worst case"];
  return (
    <form className={s.follow} onSubmit={(e) => { e.preventDefault(); if (q.trim()) { onAsk(q); setQ(""); } }}>
      <label htmlFor="follow" className="eyebrow">Change anything</label>
      <div className={s.followRow}>
        <input id="follow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="what if I hold till Friday?" autoComplete="off" />
        <button disabled={busy || !q.trim()}>Ask</button>
      </div>
      <div className={s.tries}>{tries.map((t) => <button type="button" key={t} disabled={busy} onClick={() => onAsk(t)}>{t}</button>)}</div>
    </form>
  );
}

const TONE = { go: "toneGo", caution: "toneCaution", stop: "toneStop" } as const;
const LABEL: Record<string, string> = { ticker: "which stock", sizeUsd: "how much", horizonDays: "how long you'll hold", lossLimitUsd: "the most you're willing to lose" };

function Chips({ r, onEdit, notes }: { r: CheckResult; onEdit: (p: Partial<Draft>) => void; notes: string[] }) {
  const t = r.trade;
  const num = (k: keyof Draft, value: number, prefix = "", suffix = "") => (
    <label className={s.chip}>
      <span className="eyebrow">{CHIP[k as string]}</span>
      <span className={s.chipVal}>{prefix}
        <input className="num" defaultValue={value} inputMode="decimal" size={Math.max(3, String(value).length)}
          onBlur={(e) => { const n = Number(e.target.value.replace(/[$,]/g, "")); if (n > 0 && n !== value) onEdit({ [k]: n }); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />{suffix}
      </span>
    </label>
  );
  return (
    <section className={s.chips} aria-label="What Shunt understood; edit any value">
      <div className={s.chip}><span className="eyebrow">Stock</span><span className={s.chipVal}>{r.profile.ticker}<small>{r.profile.name}</small></span></div>
      <div className={s.chip}>
        <span className="eyebrow">On</span>
        <span className={s.toggle}>
          <button aria-pressed={t.venue === "rtoken"} onClick={() => onEdit({ venue: "rtoken" })}>rToken</button>
          <button aria-pressed={t.venue === "perp"} disabled={!r.profile.perp} onClick={() => onEdit({ venue: "perp" })}>Perp</button>
        </span>
      </div>
      <div className={s.chip}>
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
      <div className={s.chip}>
        <span className="eyebrow">Measured at</span>
        <span className={s.toggle}>
          <button aria-pressed={t.confidence === 0.8} onClick={() => onEdit({ confidence: 0.8 })}>4 in 5</button>
          <button aria-pressed={t.confidence === 0.95} onClick={() => onEdit({ confidence: 0.95 })}>19 in 20</button>
        </span>
      </div>
      {notes.map((n) => <p key={n} className={s.note}>{n}</p>)}
    </section>
  );
}
const CHIP: Record<string, string> = { sizeUsd: "Size", horizonDays: "Hold", lossLimitUsd: "Max loss", leverage: "Leverage" };

function Events({ r }: { r: CheckResult }) {
  const a = r.assessment;
  const rows = [...a.events].sort((x, y) => (x.band.date! < y.band.date! ? -1 : 1));
  return (
    <section className={s.table}>
      <h3>What&apos;s scheduled while you hold</h3>
      {rows.length === 0 && a.unmeasured.length === 0 && <p className={s.muted}>No earnings, bellwether reports, Fed decisions or weekends fall inside this hold.</p>}
      <table>
        <thead><tr><th>When</th><th>What</th><th className={s.r}>Measured move</th><th className={s.r}>Past times</th><th className={s.r}>Your loss</th></tr></thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i} className={e.breaches ? s.breachRow : undefined}>
              <td className="num">{day(e.band.date)}</td>
              <td>{e.band.label}{e.band.corrected ? <span className={s.tag}>calibrated ×{e.band.corrected}</span> : null}</td>
              <td className={`num ${s.r}`}>{pct(e.band.pct)}</td>
              <td className={`num ${s.r}`}>{e.band.n}</td>
              <td className={`num ${s.r}`}>{usd(e.lossUsd)}</td>
            </tr>
          ))}
          {a.unmeasured.map((b, i) => (
            <tr key={"u" + i}>
              <td className="num">{day(b.date)}</td><td>{b.label}</td>
              <td className={s.r} colSpan={3}>cannot measure: only {b.n} past</td>
            </tr>
          ))}
          <tr className={a.horizon.breaches ? s.breachRow : undefined}>
            <td className="num">whole hold</td><td>{a.horizon.band.label}</td>
            <td className={`num ${s.r}`}>{pct(a.horizon.band.pct)}</td><td className={`num ${s.r}`}>{a.horizon.band.n}</td>
            <td className={`num ${s.r}`}>{usd(a.horizon.lossUsd)}</td>
          </tr>
        </tbody>
      </table>
      <p className={s.muted}>Each move is the size {r.profile.ticker} stayed within {r.trade.confidence === 0.8 ? "4 in 5" : "19 in 20"} times on past events of that kind, scaled to how volatile it is now. Losses include the cost to get out at your size.</p>
    </section>
  );
}

function Costs({ r }: { r: CheckResult }) {
  const c = r.costs;
  if (!c) return null;
  return (
    <section className={s.costs}>
      <h3>On Bitget right now</h3>
      <dl>
        <div><dt>Cost to get in</dt><dd className="num">{usd((c.entry.impactPct ?? 0) * r.trade.sizeUsd + c.entry.feeUsd)}</dd></div>
        <div><dt>Cost to get out</dt><dd className="num">{usd(c.exitCostUsd)}</dd></div>
        {c.fundingUsd != null && <div><dt>Funding over the hold</dt><dd className="num">{usd(c.fundingUsd)}</dd></div>}
        {r.assessment.liquidationPct != null && <div><dt>Liquidated by a move of</dt><dd className="num">{pct(r.assessment.liquidationPct)}</dd></div>}
        {r.weekendTrading && <div><dt>rToken traded last weekend</dt><dd>{r.weekendTrading.traded ? "yes" : "no"}</dd></div>}
      </dl>
      <p className={s.muted}>Walked through the live {c.venue === "perp" ? "perp" : "rToken"} order book at your size, with Bitget&apos;s live fee rate. Read {new Date(c.readAt).toLocaleTimeString()}.</p>
    </section>
  );
}

function Ticket({ r }: { r: CheckResult }) {
  const [copied, setCopied] = useState("");
  const t = r.trade, v = r.assessment.verdict;
  const price = r.costs?.entry.mid ?? r.profile.lastClose;
  if (!price) return null;
  const size = v.state === "fits" ? t.sizeUsd : v.maxSizeUsd;
  const perp = t.venue === "perp";
  const qty = perp ? (Math.floor((size / price) * 100) / 100).toFixed(2) : (Math.floor((size / price) * 1e4) / 1e4).toFixed(4);
  const cmd = perp
    ? `bgc order --action place --category USDT-FUTURES --symbol ${t.ticker}USDT --side ${t.side === "long" ? "buy" : "sell"} --posSide ${t.side} --orderType market --qty ${qty} --clientOid shunt-${t.ticker.toLowerCase()}`
    : `bgc order --action place --category SPOT --symbol R${t.ticker}USDT --side ${t.side === "long" ? "buy" : "sell"} --orderType market --qty ${qty} --clientOid shunt-${t.ticker.toLowerCase()}`;
  const demo = cmd.replace("bgc ", "bgc --paper-trading ");
  const copy = (txt: string, k: string) => { navigator.clipboard?.writeText(txt); setCopied(k); setTimeout(() => setCopied(""), 1500); };
  return (
    <section className={s.ticket}>
      <h3>If you decide to go ahead</h3>
      <p className={s.muted}>
        {v.state === "fits" ? `Your size fits. ` : `Sized to fit your limit: ${usd(size)} instead of ${usd(t.sizeUsd)}. `}
        Run it from your own machine with Bitget&apos;s Agent Hub CLI (<span className="num">npm i -g @bitget-ai/bitget-agent-cli</span>) and your own API key.
        Shunt never holds a key and never places an order.
      </p>
      <div className={s.cmd}><code className="num">{demo}</code><button onClick={() => copy(demo, "demo")}>{copied === "demo" ? "Copied" : "Copy, Demo first"}</button></div>
      <div className={s.cmd}><code className="num">{cmd}</code><button onClick={() => copy(cmd, "live")}>{copied === "live" ? "Copied" : "Copy"}</button></div>
      <p className={s.muted}>{perp ? `${qty} ${t.ticker} perp contracts` : `${qty} r${t.ticker}`} at about {usd(price)} each, from the live Bitget mid price.</p>
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
