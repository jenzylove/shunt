"use client";
import { useEffect, useRef, useState } from "react";
import type { CheckResult } from "@/lib/check";
import { day, explain, pct, questionText, usd } from "@/lib/explain";
import type { Draft, Parsed } from "@/lib/parse";
import type { Answer } from "@/lib/questions";
import Rail from "./Rail";
import TrackBg from "./TrackBg";
import s from "./page.module.css";

// The way in is examples first: pick a trade and the answer swaps in place. Your own trade is the fields row and one line of words.
const EXAMPLES = [
  { label: "$20k rNVDA, 5 days", text: "buy $20k rNVDA, holding 5 days, max loss $600" },
  { label: "5x TSLA perp, weekend", text: "long 5x TSLA perp, $10k position, over the weekend, can lose $400" },
  { label: "$8k rHOOD, 2 weeks", text: "$8k rHOOD for 2 weeks, max loss $500" },
  { label: "$5k rAAPL, overnight", text: "$5k rAAPL overnight, stop at -$150" },
];

type Meta = { readBy: "rules" | "model" | "edit"; intent?: "new" | "change" | "edit" | "question"; asked?: string; model: string | null; modelNote?: string; unread?: boolean };
type Ask = { kind: "sizeMeaning"; sizeUsd: number; leverage: number };
type Conflict = { kind: "conflict"; field: "lossLimitUsd"; options: [number, number] };
type Reply = { parsed: Parsed; result?: CheckResult; error?: string; meta?: Meta; ask?: Ask | Conflict; answer?: Answer };

const failureText = (status: number) =>
  status === 429 ? "Too many checks from one place in a short time. Wait a few minutes and try again."
  : status === 413 ? "That request is too large."
  : status >= 500 ? "Shunt hit a problem on its side. Try again in a moment."
  : "Shunt could not use that. Check the values and try again.";

const STATUS: Record<string, string> = { fits: "Fits", "fits-if": "Fits with a change", "does-not-fit": "Doesn't fit", illiquid: "Can't fill", incomplete: "No verdict yet" };

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
  const [rulesOnly, setRulesOnly] = useState(false);
  const bgRef = useRef<HTMLDivElement>(null);

  // the hero lines drift slower than the page: a quiet sense of depth while you scroll
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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

  async function run(body: { text?: string; draft?: Draft; sizeConfirmed?: boolean }, tab: number | null = null) {
    setBusy(true);
    try {
      const r = await fetch("/api/check", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, rulesOnly: rulesOnly || undefined }), signal: AbortSignal.timeout(30_000),
      });
      let j: Partial<Reply> = {};
      try { j = await r.json(); } catch { /* not JSON: handled below */ }
      const j2: Reply = {
        parsed: j.parsed ?? { trade: null, draft: reply?.parsed.draft ?? {}, missing: [], notes: [] },
        result: j.result, meta: j.meta, ask: j.ask, answer: j.answer,
        error: j.error ?? (r.ok ? undefined : failureText(r.status)),
      };
      setReply(j2);
      if (j2.result) setLastGood(j2);
      if (tab != null && j2.result) cache.current[tab] = j2;
    } catch (e) {
      const timedOut = (e as Error)?.name === "TimeoutError";
      setReply({ parsed: { trade: null, draft: reply?.parsed.draft ?? {}, missing: [], notes: [] }, error: timedOut ? "That took too long. Try again." : "Could not reach Shunt. Check your connection and try again." });
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
            <span className={s.live}><i />Live check<ReadAt iso={r?.costs?.bookAt} /></span>
            <div className={s.tabs} role="group" aria-label="Example trades">
              {EXAMPLES.map((ex, i) => (
                <button key={ex.text} aria-pressed={active === i} className={s.tab} disabled={busy} title={ex.text} onClick={() => pick(i)}>{ex.label}</button>
              ))}
            </div>
          </header>

          <div className={s.panelBody} aria-live="polite" aria-busy={busy} data-busy={busy || undefined}>
            {!reply && <p className={s.working}>Reading the calendar, the stock&apos;s history and Bitget&apos;s order book…</p>}
            {reply && !r && reply.ask?.kind === "conflict" && (
              <ConflictAsk ask={reply.ask} asked={reply.meta?.asked}
                onPick={(limit) => { setActive(null); const d = { ...reply.parsed.draft, lossLimitUsd: limit }; delete d.lossConflict; run({ draft: d }); }} />
            )}
            {reply && !r && reply.answer && <AnswerBlock a={reply.answer} />}
            {reply && !r && reply.ask?.kind === "sizeMeaning" && (
              <SizeMeaning ask={reply.ask} asked={reply.meta?.asked}
                onPick={(size) => { setActive(null); run({ draft: { ...reply.parsed.draft, sizeUsd: size }, sizeConfirmed: true }); }} />
            )}
            {reply && !r && !reply.ask && (
              <Clarify key={JSON.stringify(reply.parsed.draft) + (reply.error ?? "")} reply={reply}
                onSubmit={(d) => { setActive(null); run({ draft: d }); }}
                onBack={lastGood ? () => setReply(lastGood) : undefined} />
            )}
            {r && v && (
              <>
                <div className={s.question} key={"q" + r.trade.ticker + r.trade.sizeUsd + r.trade.horizonDays + r.trade.lossLimitUsd + r.trade.venue}>
                  <span className="eyebrow">Your question</span>
                  <h2 className={s.q}>{questionText(r.trade)}</h2>
                  <p className={s.asked}>
                    Hold covers {r.holdDays.length} trading session{r.holdDays.length === 1 ? "" : "s"}, {day(r.holdDays[0])} to the close on {day(r.holdDays[r.holdDays.length - 1])}.
                  </p>
                  {r.notes.map((n) => <p key={n} className={s.asked}>{n}</p>)}
                  {reply?.meta?.asked && !reply.meta.unread && (
                    <p className={s.asked}>
                      You typed &ldquo;{reply.meta.asked}&rdquo;{reply.meta.readBy === "model" ? ", read by Claude. Every number below is computed by code." : "."}
                      {reply.meta.modelNote && <> {reply.meta.modelNote[0].toUpperCase() + reply.meta.modelNote.slice(1)}.</>}
                    </p>
                  )}
                  {reply?.meta?.unread && (
                    <p className={s.unread} role="status">
                      I couldn&apos;t read &ldquo;{reply.meta.asked}&rdquo; as a change or a question, so the answer below is unchanged.
                      You can change the size, hold, limit, venue or leverage, or ask about the upside, the worst case, why, what size fits,
                      the next earnings, or compare two stocks.{reply.meta.modelNote ? ` (${reply.meta.modelNote}.)` : ""}
                    </p>
                  )}
                </div>
                {reply?.answer && <AnswerBlock a={reply.answer} />}
                <div className={s.answer} data-tone={v.tone} key={"a" + r.trade.ticker + r.trade.sizeUsd + r.trade.horizonDays + r.trade.lossLimitUsd + r.trade.venue + r.costs?.readAt}>
                  <div className={s.answerText}>
                    <span className={s.status}><i />{STATUS[r.assessment.verdict.state]}</span>
                    <h2 className={s.vh}>{v.headline}</h2>
                    <p className={s.vd}>{v.detail}</p>
                  </div>
                  <dl className={s.keys}>
                    <div><dt>Your limit</dt><dd className="num">{usd(r.trade.lossLimitUsd)}</dd></div>
                    <div><dt>Worst measured</dt><dd className="num">{usd(r.assessment.worst?.lossUsd)}</dd></div>
                    <div><dt>{r.trade.venue === "perp" ? "Fees, slippage, funding" : "Fees and slippage"}</dt><dd className="num">{r.costs ? (r.costs.entry.complete && r.costs.exit.complete ? usd(r.costs.totalUsd) : "book too thin") : "n/a"}</dd></div>
                  </dl>
                </div>
                {r.assessment.verdict.state !== "illiquid" && r.assessment.verdict.state !== "incomplete" && (
                  <Rail key={`${r.trade.ticker}-${r.trade.sizeUsd}-${r.trade.horizonDays}-${r.trade.lossLimitUsd}-${r.trade.venue}-${r.costs?.readAt}`} r={r} />
                )}
                <Thesis r={r} thesis={reply?.parsed.draft.thesis} />
                <Past r={r} />
                <Scenarios key={`sc-${r.trade.ticker}-${r.trade.sizeUsd}-${r.trade.horizonDays}-${r.trade.lossLimitUsd}-${r.trade.venue}-${r.trade.leverage}-${r.trade.confidence}`} r={r} />
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
              <p className={s.sayNote}>
                <label><input type="checkbox" checked={rulesOnly} onChange={(e) => setRulesOnly(e.target.checked)} /> Rules only</label>
                {" "}Ordinary sentences are read on Shunt. If they cannot be, your sentence and current trade go to Anthropic&apos;s Claude. Rules only never sends them. <a href="/privacy">Privacy</a>
              </p>
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

/** When Bitget stamped the order book, in UTC so it is the same on the server and in the browser. */
function ReadAt({ iso }: { iso?: string }) {
  if (!iso) return null;
  return <time className={s.readAt} dateTime={iso}>book at {iso.slice(11, 19)} UTC</time>;
}

/** A question about the trade, answered from the same numbers as the check. */
function AnswerBlock({ a }: { a: Answer }) {
  return (
    <section className={s.reply} aria-label="Answer to your question">
      <span className="eyebrow">Answer</span>
      <h3 className={s.replyTitle}>{a.title}</h3>
      {a.lines.map((l) => <p key={l}>{l}</p>)}
    </section>
  );
}

/** Two loss limits in one sentence: ask which one is meant, never pick one. */
function ConflictAsk({ ask, asked, onPick }: { ask: Conflict; asked?: string; onPick: (limit: number) => void }) {
  const [a, b] = ask.options;
  return (
    <div className={s.clarify}>
      <span className="eyebrow">One quick question</span>
      <h2 className={s.q}>{asked ? <>You asked &ldquo;{asked}&rdquo;. </> : null}That gives two different loss limits. Which one is yours?</h2>
      <div className={s.cgo}>
        <button className={s.cgoMain} onClick={() => onPick(a)}>{usd(a)}</button>
        <button className={s.cgoMain} onClick={() => onPick(b)}>{usd(b)}</button>
      </div>
    </div>
  );
}

/** Past situations like this one: every stored event of the kinds inside the hold, priced for this exact trade. */
function Past({ r }: { r: CheckResult }) {
  const h = r.history?.[0];
  if (!h) return null;
  const inHold = r.events.some((e) => e.kind === h.kind);
  const t = r.trade;
  const worst = Math.min(...h.events.map((e) => e.pnlUsd));
  const over = h.events.filter((e) => -e.pnlUsd > t.lossLimitUsd).length;
  return (
    <section className={s.past} aria-label="Past situations like this one">
      <span className="eyebrow">{inHold ? "Past situations like this one" : "For reference: not inside this hold"}</span>
      <h3 className={s.replyTitle}>What {usd(t.sizeUsd)} {t.side === "long" ? "long" : "short"} would have done on {h.label}</h3>
      <div className={s.pastRow}>
        {h.events.map((e) => (
          <div key={e.d} className={s.pastCell} data-bad={-e.pnlUsd > t.lossLimitUsd || undefined} title={`${e.d}: ${(e.move * 100).toFixed(1)}%`}>
            <span className="num">{e.pnlUsd >= 0 ? "+" : "-"}{usd(Math.abs(e.pnlUsd))}</span>
            <small className="num">{day(e.d).split(" ").slice(1).join(" ")} {e.d.slice(2, 4)}</small>
          </div>
        ))}
      </div>
      <p className={s.asked}>
        Went your way {h.withYou} of {h.n} times. {over ? `${over} of ${h.n} would have cost more than your ${usd(t.lossLimitUsd)} limit; ` : `None would have cost more than your ${usd(t.lossLimitUsd)} limit; `}
        the worst was {worst >= 0 ? "a gain of " : ""}{usd(Math.abs(worst))}. Each day&apos;s real move, times your size, minus today&apos;s round trip cost. History, not a forecast.
      </p>
    </section>
  );
}

/** The same trade changed one way at a time, each checked for real, so you can see which change makes it fit and why. */
function Scenarios({ r }: { r: CheckResult }) {
  type Row = { name: string; change: string; result?: CheckResult; error?: string };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const t = r.trade, a = r.assessment, v = a.verdict;
  if (v.state === "illiquid" || v.state === "incomplete") return null;

  const variants: { name: string; change: string; draft: Partial<Draft> }[] = [];
  if (a.largestFitUsd != null && Math.abs(a.largestFitUsd - t.sizeUsd) > 1) variants.push({ name: "Largest size that fits", change: `${usd(t.sizeUsd)} to ${usd(a.largestFitUsd)}`, draft: { sizeUsd: a.largestFitUsd } });
  const exitBefore = v.state === "fits-if" ? v.exitBefore : null;
  const firstBreach = exitBefore ? r.holdDays.indexOf(exitBefore.date) : -1;
  const shorter = firstBreach > 0 ? firstBreach : Math.max(1, Math.floor(t.horizonDays / 2));
  if (shorter < t.horizonDays) variants.push({ name: "Shorter hold", change: `${t.horizonDays} to ${shorter} day${shorter === 1 ? "" : "s"}${firstBreach > 0 ? `, out before ${day(exitBefore!.date)}` : ""}`, draft: { horizonDays: shorter } });
  if (t.venue === "perp" && (t.leverage ?? 1) > 1) variants.push({ name: "No leverage", change: `${t.leverage}x to 1x`, draft: { leverage: 1 } });
  if (t.confidence === 0.8) variants.push({ name: "Worse case", change: "4 in 5 to 19 in 20", draft: { confidence: 0.95 } });

  const runAll = async () => {
    setBusy(true);
    const base: Draft = { ticker: t.ticker, venue: t.venue, side: t.side, sizeUsd: t.sizeUsd, horizonDays: t.horizonDays, lossLimitUsd: t.lossLimitUsd, leverage: t.leverage, confidence: t.confidence };
    const out = await Promise.all(variants.map(async (x): Promise<Row> => {
      try {
        const res = await fetch("/api/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft: { ...base, ...x.draft }, rulesOnly: true }) });
        const j = await res.json();
        return j.result ? { name: x.name, change: x.change, result: j.result } : { name: x.name, change: x.change, error: j.error ?? "could not run" };
      } catch { return { name: x.name, change: x.change, error: "could not reach Shunt" }; }
    }));
    setRows(out); setBusy(false);
  };
  if (!variants.length) return null;
  const line = (c: CheckResult) => ({ head: explain(c).headline, worst: (c.assessment.worst ?? c.assessment.horizon).lossUsd, cost: c.assessment.costUsd });
  const now = line(r);
  return (
    <section className={s.past} aria-label="The same trade, changed one way at a time">
      <span className="eyebrow">What would make it fit</span>
      <h3 className={s.replyTitle}>The same trade, changed one way at a time</h3>
      {!rows ? (
        <button className={s.scBtn} onClick={runAll} disabled={busy}>{busy ? "Checking each one" : `Check ${variants.map((x) => x.name.toLowerCase()).join(", ")}`}</button>
      ) : (
        <div className={s.scroll}>
          <table className={s.table}>
            <thead><tr><th>Scenario</th><th>Change</th><th>Verdict</th><th className={s.r}>Worst measured</th><th className={s.r}>Costs</th></tr></thead>
            <tbody>
              <tr><td>As you asked</td><td>none</td><td>{now.head}</td><td className={`num ${s.r}`} data-label="Worst measured">{usd(now.worst)}</td><td className={`num ${s.r}`} data-label="Costs">{usd(now.cost)}</td></tr>
              {rows.map((x) => {
                if (!x.result) return <tr key={x.name}><td>{x.name}</td><td>{x.change}</td><td colSpan={3}>{x.error}</td></tr>;
                const l = line(x.result);
                return <tr key={x.name}><td>{x.name}</td><td>{x.change}</td><td>{l.head}</td><td className={`num ${s.r}`} data-label="Worst measured">{usd(l.worst)}</td><td className={`num ${s.r}`} data-label="Costs">{usd(l.cost)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={s.asked}>Each row is a full check of its own, against the same {usd(t.lossLimitUsd)} limit, with costs priced live at that size.</p>
    </section>
  );
}

/** The reason you gave, held up against this stock's own record. It never says whether you are right. */
function Thesis({ r, thesis }: { r: CheckResult; thesis?: string }) {
  if (!thesis) return null;
  const t = r.trade;
  const mentions = (re: RegExp) => re.test(thesis.toLowerCase());
  const lines: string[] = [];
  if (mentions(/earnings|report|beat|miss|guidance|quarter/) && !r.events.some((e) => e.kind === "earnings")) {
    lines.push(`Your reason is about earnings, but ${t.ticker} does not report inside this ${t.horizonDays} day hold, so the hold carries the risk without the event you are betting on.`);
  }
  if (mentions(/\bfed\b|rate|powell|fomc|cut|hike/) && !r.events.some((e) => e.kind === "fed")) {
    lines.push(`Your reason is about the Fed, but there is no Fed decision inside this hold.`);
  }
  const h = r.history?.find((x) => (mentions(/\bfed\b|rate|powell|fomc/) ? x.kind === "fed" : x.kind === "earnings")) ?? r.history?.[0];
  if (h) {
    const against = h.events.filter((e) => e.move * (t.side === "long" ? 1 : -1) < 0).map((e) => Math.abs(e.move)).sort((a, b) => a - b);
    const med = against.length ? against[Math.floor(against.length / 2)] : null;
    lines.push(`On ${h.label}, ${t.ticker} went your way ${h.withYou} of ${h.n} times.${med != null ? ` When it went against you, the median move was ${(med * 100).toFixed(1)}%, about ${usd(med * t.sizeUsd + r.assessment.costUsd)} at your size.` : ""}`);
  }
  if (!lines.length) return null;
  return (
    <section className={s.reply} aria-label="Your reason, against the record">
      <span className="eyebrow">Your reason</span>
      <h3 className={s.replyTitle}>&ldquo;{thesis.length > 120 ? thesis.slice(0, 117) + "..." : thesis}&rdquo;</h3>
      {lines.map((l) => <p key={l}>{l}</p>)}
      <p className={s.asked}>Shunt does not judge whether your reason is right. This is what the record says about the bet it implies.</p>
    </section>
  );
}

/** "$10k at 5x" means two different trades. Ask which, with both read back in dollars. */
function SizeMeaning({ ask, asked, onPick }: { ask: Ask; asked?: string; onPick: (sizeUsd: number) => void }) {
  const { sizeUsd: v, leverage: l } = ask;
  return (
    <div className={s.clarify}>
      <span className="eyebrow">One quick question</span>
      <h2 className={s.q}>{asked ? <>You asked &ldquo;{asked}&rdquo;. </> : null}Is {usd(v)} the size of the position, or your own money at {l}x?</h2>
      <div className={s.cgo}>
        <button className={s.cgoMain} onClick={() => onPick(v)}>Position of {usd(v)} (my money about {usd(v / l)})</button>
        <button className={s.cgoMain} onClick={() => onPick(v * l)}>My money {usd(v)} (position {usd(v * l)})</button>
      </div>
      <p className={s.cassume}>Losses, costs and funding all scale with the position, so this changes the answer by {l} times.</p>
    </div>
  );
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
  // people type "2.5k", "$1,500", "2 weeks", "a week", "3%": read all of it instead of only plain digits
  const num = (x: string) => {
    const m = x.toLowerCase().replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)(k|m)?(usd|usdt|dollars?)?$/);
    return m ? Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1) : 0;
  };
  const days = (x: string) => {
    const t = x.toLowerCase().trim();
    const W: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const m = t.match(/^(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*(day|days|d|week|weeks|w|wk|wks|month|months)?$/);
    if (!m) return 0;
    const n = W[m[1]] ?? Number(m[1]);
    const unit = m[2] ?? "day";
    return Math.round(n * (unit.startsWith("w") ? 5 : unit.startsWith("m") ? 20 : 1));
  };
  const lossOf = (x: string) => {
    const t = x.trim();
    const pc = t.match(/^(\d+(?:\.\d+)?)\s*%$/);
    return pc ? Math.round((Number(pc[1]) / 100) * num(size)) : num(t);
  };
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
  const ready = missing.every((m) => (m === "ticker" ? ticker.trim() : m === "sizeUsd" ? num(size) > 0 : m === "horizonDays" ? days(hold) > 0 : lossOf(limit) > 0));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onSubmit({ ...d, ticker: (ticker || d.ticker || "").toUpperCase().trim(), sizeUsd: num(size) || d.sizeUsd, horizonDays: days(hold) || d.horizonDays, lossLimitUsd: lossOf(limit) || d.lossLimitUsd });
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
            <input id="c-size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="$10,000 or 10k" inputMode="text" autoComplete="off" />
            <div className={s.cchips}>{SIZES.map((v) => <button type="button" key={v} onClick={() => setSize(String(v))}>{usd(v)}</button>)}</div></div>
        )}
        {missing.includes("horizonDays") && (
          <div className={s.cfield}><label htmlFor="c-hold">How many trading days will you hold it?</label>
            <input id="c-hold" value={hold} onChange={(e) => setHold(e.target.value)} placeholder="5, or 2 weeks" inputMode="text" autoComplete="off" />
            <div className={s.cchips}>{HOLDS.map((v) => <button type="button" key={v} onClick={() => setHold(String(v))}>{v} day{v === 1 ? "" : "s"}</button>)}</div></div>
        )}
        {missing.includes("lossLimitUsd") && (
          <div className={s.cfield}><label htmlFor="c-limit">What&apos;s the most you can afford to lose?</label>
            <input id="c-limit" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="$600, or 3%" inputMode="text" autoComplete="off" />
            <div className={s.cchips}>{limitChips.map((c) => <button type="button" key={c.label} onClick={() => setLimit(String(c.v))}>{c.label}</button>)}</div></div>
        )}
      </div>
      <p className={s.cassume}>Unless you say otherwise I will treat it as a long position in the rToken. You can change that after.</p>
      <div className={s.cgo}>
        <button className={s.cgoMain} disabled={!ready}>Check it</button>
        {!ready && <span className={s.cassume}>Still needed: {missing.filter((m) => (m === "ticker" ? !ticker.trim() : m === "sizeUsd" ? !num(size) : m === "horizonDays" ? !days(hold) : !lossOf(limit))).map((m) => ({ ticker: "the stock", sizeUsd: "the amount (like 5000 or 5k)", horizonDays: "the days (like 5 or 2 weeks)", lossLimitUsd: "the loss limit (like 500 or 3%)" } as Record<string, string>)[m]).join(", ")}</span>}
        {onBack && <button type="button" className={s.backBtn} onClick={onBack}>Back to the last answer</button>}
      </div>
    </form>
  );
}

const FIELD: Record<string, string> = { sizeUsd: "Size", horizonDays: "Hold", lossLimitUsd: "Max loss", leverage: "Leverage" };

/** What Shunt understood, as a compact row of editable fields. */
function Fields({ r, onEdit, notes }: { r: CheckResult; onEdit: (p: Partial<Draft>) => void; notes: string[] }) {
  const t = r.trade;
  const [bad, setBad] = useState("");
  const num = (k: keyof Draft, value: number, prefix = "", suffix = "") => (
    <label className={s.field} key={String(k) + value}>
      <span className="eyebrow">{FIELD[k as string]}</span>
      <span className={s.fieldVal}>{prefix}
        <input className="num" defaultValue={value} inputMode="decimal" size={Math.max(3, String(value).length)}
          onBlur={(e) => {
            const n = Number(e.target.value.replace(/[$,\s]/g, ""));
            if (!(n > 0) || !Number.isFinite(n)) { e.target.value = String(value); setBad(`${FIELD[k as string]} needs a number above 0, so it stays at ${prefix}${value}${suffix}.`); return; }
            setBad("");
            if (n !== value) onEdit({ [k]: n });
          }}
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
          <button aria-pressed={t.venue === "rtoken"} onClick={() => onEdit({ venue: "rtoken", side: "long" })} title="rTokens are spot: they can only be bought long">rToken</button>
          <button aria-pressed={t.venue === "perp"} disabled={!r.profile.perp} onClick={() => onEdit({ venue: "perp" })}>Perp</button>
        </span>
      </div>
      <div className={s.field}>
        <span className="eyebrow">Side</span>
        <span className={s.toggle}>
          <button aria-pressed={t.side === "long"} onClick={() => onEdit({ side: "long" })}>Long</button>
          <button aria-pressed={t.side === "short"} onClick={() => onEdit({ side: "short", venue: "perp" })} title="A short needs the perp">Short</button>
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
      {bad && <p className={s.note} role="alert">{bad}</p>}
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
        <div><dt>Cost to get in</dt><dd className="num">{fillText(c.entry, r.trade.sizeUsd, c.entryCostUsd)}</dd></div>
        <div><dt>Cost to get out</dt><dd className="num">{fillText(c.exit, r.trade.sizeUsd, c.exitCostUsd)}</dd></div>
        {c.fundingUsd != null && <div><dt>Funding counted over the hold</dt><dd className="num">{usd(c.fundingUsd)}</dd></div>}
        {r.assessment.liquidationPct != null && <div><dt>Liquidated by about a move of</dt><dd className="num">{pct(r.assessment.liquidationPct)}</dd></div>}
        {r.weekendTrading && <div><dt>rToken traded last weekend</dt><dd>{r.weekendTrading.traded ? "yes" : "no"}</dd></div>}
      </dl>
      <p className={s.muted}>
        Walked through the live {c.venue === "perp" ? "perp" : "rToken"} order book at your size, with Bitget&apos;s live fee rate. Bitget stamped the book at {c.bookAt.slice(11, 19)} UTC.
        Your loss limit is counted as everything the round trip can cost you: the market move plus fees and slippage in and out{c.fundingUsd != null ? ", plus funding" : ""}.
        {c.fundingUsd != null && <> Funding uses the recent average rate over the {c.fundingRuns} settlement{c.fundingRuns === 1 ? "" : "s"} between now and the close of your last day, and only when it costs you; a credit is never counted. At that rate it would be {usd(c.fundingExpectedUsd)}.</>}
        {r.assessment.liquidationPct != null && <> The liquidation distance is an estimate for isolated margin before fees: Bitget&apos;s own figure depends on your account.</>}
      </p>
    </section>
  );
}

function Ticket({ r }: { r: CheckResult }) {
  const [copied, setCopied] = useState("");
  const t = r.trade, v = r.assessment.verdict;
  const price = r.costs?.entry.mid ?? r.profile.lastClose;
  if (!price || v.state === "illiquid" || v.state === "incomplete") return null;
  // a ticket is only shown for a trade the command can really open: an rToken is spot, so only a long
  if (t.venue === "rtoken" && t.side === "short") return null;
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
      <div className={s.cmd}><code className="num" tabIndex={0}>{demo}</code><button onClick={() => copy(demo, "demo")}>{copied === "demo" ? "Copied" : "Copy, Demo first"}</button></div>
      <div className={s.cmd}><code className="num" tabIndex={0}>{cmd}</code><button onClick={() => copy(cmd, "live")}>{copied === "live" ? "Copied" : "Copy"}</button></div>
      <p className={s.muted}>{perp ? `${qty} ${t.ticker} perp contracts` : `${qty} r${t.ticker}`} at about {usd(price)} each, from the live Bitget mid price.{perp && t.leverage ? ` This order does not set leverage: set ${t.leverage}x on Bitget first, because the check above assumed it.` : ""}</p>
    </section>
  );
}

function Sources({ r }: { r: CheckResult }) {
  return (
    <section className={s.sources}>
      <p className="eyebrow">Sources</p>
      <p>
        When each was read: order book {r.costs ? r.costs.bookAt.slice(11, 19) + " UTC" : "not read"}
        {r.costs?.fundingRateAt ? `; newest funding rate settled ${r.costs.fundingRateAt.slice(0, 16).replace("T", " ")} UTC; next settlement ${r.costs.fundingNextAt?.slice(0, 16).replace("T", " ")} UTC` : ""}
        ; earnings calendar {r.calendarAt ? r.calendarAt.slice(0, 16).replace("T", " ") + " UTC (cached up to 6 hours)" : "not read"}; price history to {r.profile.asOf}.
      </p>
      <p>Earnings dates: Nasdaq earnings calendar, live. Past earnings: SEC 8-K Item 2.02 filing times. Fed decisions: federalreserve.gov. Prices: {r.profile.ticker} daily history to {r.profile.asOf}. Order book, fees, funding: Bitget, live.</p>
      {r.problems.map((p) => <p key={p} className={s.problem}>{p}</p>)}
    </section>
  );
}
