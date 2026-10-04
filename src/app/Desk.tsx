"use client";
import { useEffect, useRef, useState } from "react";
import type { CheckResult } from "@/lib/check";
import { day, explain, pct, questionText, usd } from "@/lib/explain";
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

type Meta = { readBy: "rules" | "model" | "edit"; intent?: "new" | "change" | "edit"; asked?: string; model: string | null; modelNote?: string };
type Reply = { parsed: Parsed; result?: CheckResult; error?: string; meta?: Meta };

const STATUS: Record<string, string> = { fits: "Fits", "fits-if": "Fits with a change", "does-not-fit": "Doesn't fit", illiquid: "Can't fill" };

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
  const bgRef = useRef<HTMLDivElement>(null);

  // the hero lines drift slower than the page: a quiet sense of depth while you scroll
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (bgRef.current) bgRef.current.style.transform = `translate3d(0, ${Math.min(window.scrollY, 900) * 0.18}px, 0)`; });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  const cache = useRef<Record<number, Reply>>(initial ? { 0: fromResult(initial) } : {});
  const [lastGood, setLastGood] = useState<Reply | null>(initial ? fromResult(initial) : null);

  async function run(body: { text?: string; draft?: Draft }, tab: number | null = null) {
    setBusy(true);
    try {
      const r = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j: Reply = await r.json();
      setReply(j);
      if (j.result) setLastGood(j);
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
      <section className={s.hero}>
        <div ref={bgRef} className={s.bgWrap}><TrackBg /></div>
        <div className={s.heroInner}>
          <p className={`pill ${s.heroPill}`}>For US stocks traded on Bitget</p>
          <h1 className={s.title}>See what could <span className={s.hl}>break</span> your trade before you place it.</h1>
          <p className={s.lede}>
            Earnings reports, Fed decisions and weekends can move a stock far more than a normal day. Shunt measures each one
            for your stock and tells you if your trade still fits the loss you can take.
          </p>
          <div className={s.ctaRow}>
            <button className={s.btnMain} onClick={() => document.getElementById("desk")?.scrollIntoView({ behavior: "smooth", block: "start" })}>See a live example</button>
            <a className={s.btnGhost} href="#how">How it works</a>
          </div>
        </div>
      </section>

      <section className={s.deskSection} id="desk">
        <section className={`${s.panel} reveal`} aria-label="Live trade check">
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
              <Clarify key={JSON.stringify(reply.parsed.draft) + (reply.error ?? "")} reply={reply}
                onSubmit={(d) => { setActive(null); run({ draft: d }); }}
                onBack={lastGood ? () => setReply(lastGood) : undefined} />
            )}
            {r && v && (
              <>
                <div className={s.question} key={"q" + r.trade.ticker + r.trade.sizeUsd + r.trade.horizonDays + r.trade.lossLimitUsd + r.trade.venue}>
                  <span className="eyebrow">Your question</span>
                  <h2 className={s.q}>{questionText(r.trade)}</h2>
                  {reply?.meta?.asked && (
                    <p className={s.asked}>
                      You typed &ldquo;{reply.meta.asked}&rdquo;{reply.meta.readBy === "model" ? ", read by Claude. Every number below is computed by code." : "."}
                      {reply.meta.modelNote && <> The model was not used: {reply.meta.modelNote}.</>}
                    </p>
                  )}
                </div>
                <div className={s.answer} data-tone={v.tone} key={"a" + r.trade.ticker + r.trade.sizeUsd + r.trade.horizonDays + r.trade.lossLimitUsd + r.trade.venue + r.costs?.readAt}>
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
                {r.assessment.verdict.state !== "illiquid" && (
                  <Rail key={`${r.trade.ticker}-${r.trade.sizeUsd}-${r.trade.horizonDays}-${r.trade.lossLimitUsd}-${r.trade.venue}-${r.costs?.readAt}`} r={r} />
                )}
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

const SIZES = [2500, 5000, 10000, 20000];
const HOLDS = [1, 3, 5, 10];

/** When something is missing, ask for it in plain words instead of showing a dead end. */
function Clarify({ reply, onSubmit, onBack }: { reply: Reply; onSubmit: (d: Draft) => void; onBack?: () => void }) {
  const d = reply.parsed.draft;
  const missing = reply.parsed.missing;
  const [ticker, setTicker] = useState(d.ticker ?? "");
  const [size, setSize] = useState(d.sizeUsd ? String(d.sizeUsd) : "");
  const [hold, setHold] = useState(d.horizonDays ? String(d.horizonDays) : "");
  const [limit, setLimit] = useState(d.lossLimitUsd ? String(d.lossLimitUsd) : "");
  const num = (x: string) => Number(x.replace(/[$,\s]/g, "")) || 0;
  const asked = reply.meta?.asked;
  const have = [d.ticker, d.horizonDays ? `${d.horizonDays} trading day${d.horizonDays === 1 ? "" : "s"}` : "", d.sizeUsd ? usd(d.sizeUsd) : "", d.lossLimitUsd ? `max loss ${usd(d.lossLimitUsd)}` : ""].filter(Boolean);

  if (reply.error) {
    return (
      <div className={s.clarify}>
        <span className="eyebrow">I couldn&apos;t check that</span>
        <h2 className={s.q}>{reply.error}</h2>
        {onBack && <button className={s.backBtn} onClick={onBack}>Back to the last answer</button>}
      </div>
    );
  }
  const limitChips = num(size) > 0
    ? [1, 2, 3, 5].map((p) => ({ label: `${p}% of ${usd(num(size))}`, v: Math.round((num(size) * p) / 100) }))
    : [250, 500, 1000].map((v) => ({ label: usd(v), v }));
  const ready = missing.every((m) => (m === "ticker" ? ticker.trim() : m === "sizeUsd" ? num(size) > 0 : m === "horizonDays" ? num(hold) > 0 : num(limit) > 0));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onSubmit({ ...d, ticker: (ticker || d.ticker || "").toUpperCase().trim(), sizeUsd: num(size) || d.sizeUsd, horizonDays: num(hold) || d.horizonDays, lossLimitUsd: num(limit) || d.lossLimitUsd });
  };
  return (
    <form className={s.clarify} onSubmit={submit}>
      <span className="eyebrow">{missing.length === 1 ? "One quick question" : "A few quick questions"}</span>
      <h2 className={s.q}>
        {asked ? <>You asked &ldquo;{asked}&rdquo;. </> : null}
        {have.length ? <>So far I have <b>{have.join(", ")}</b>. </> : null}
        I need {missing.length === 1 ? "one more thing" : `${missing.length} more things`} to check it.
      </h2>
      <div className={s.cfields}>
        {missing.includes("ticker") && (
          <div className={s.cfield}><label htmlFor="c-ticker">Which stock?</label>
            <input id="c-ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="NVDA" autoComplete="off" /></div>
        )}
        {missing.includes("sizeUsd") && (
          <div className={s.cfield}><label htmlFor="c-size">How much do you want to put in?</label>
            <input id="c-size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="$10,000" inputMode="decimal" autoComplete="off" />
            <div className={s.cchips}>{SIZES.map((v) => <button type="button" key={v} onClick={() => setSize(String(v))}>{usd(v)}</button>)}</div></div>
        )}
        {missing.includes("horizonDays") && (
          <div className={s.cfield}><label htmlFor="c-hold">How many trading days will you hold it?</label>
            <input id="c-hold" value={hold} onChange={(e) => setHold(e.target.value)} placeholder="5" inputMode="numeric" autoComplete="off" />
            <div className={s.cchips}>{HOLDS.map((v) => <button type="button" key={v} onClick={() => setHold(String(v))}>{v} day{v === 1 ? "" : "s"}</button>)}</div></div>
        )}
        {missing.includes("lossLimitUsd") && (
          <div className={s.cfield}><label htmlFor="c-limit">What&apos;s the most you can afford to lose?</label>
            <input id="c-limit" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="$600" inputMode="decimal" autoComplete="off" />
            <div className={s.cchips}>{limitChips.map((c) => <button type="button" key={c.label} onClick={() => setLimit(String(c.v))}>{c.label}</button>)}</div></div>
        )}
      </div>
      <p className={s.cassume}>Unless you say otherwise I will treat it as a long position in the rToken. You can change that after.</p>
      <div className={s.cgo}>
        <button className={s.cgoMain} disabled={!ready}>Check it</button>
        {onBack && <button type="button" className={s.backBtn} onClick={onBack}>Back to the last answer</button>}
      </div>
    </form>
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
