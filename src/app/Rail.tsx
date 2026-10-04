"use client";
// The rail: how much a trade could lose while you hold it, day by day, against the user's own loss limit.
// The curve is a bad but ordinary stretch for this stock (4 in 5, or 19 in 20 if chosen). Red is above the limit.
// Scheduled events stand on the track as flags with their measured size. Hover reads off any day.
import { useEffect, useId, useRef, useState } from "react";
import type { CheckResult } from "@/lib/check";
import { day, usd } from "@/lib/explain";
import s from "./rail.module.css";

const L = 74, R = 44, T = 34, B = 92;

function niceStep(max: number) {
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

const shortLabel = (e: { kind: string; label: string }, ticker: string) =>
  e.kind === "weekend" ? "Weekend" : e.kind === "fed" ? "Fed decision" : e.kind === "earnings" ? `${ticker} earnings` : `${e.label.split(" ")[0]} report`;

export default function Rail({ r }: { r: CheckResult }) {
  const uid = useId().replace(/:/g, "");
  const t = r.trade, a = r.assessment, days = r.holdDays;
  const n = Math.max(days.length, 1);
  const wrap = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  // the chart is drawn at the size it is shown, so text stays readable on a phone as well as a wide screen
  const [W, setW] = useState(1000);
  const H = W < 640 ? 400 : 440;
  const X0 = L, X1 = W - R, Y0 = T, Y1 = H - B;

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => { const w = Math.round(es[0].contentRect.width); if (w > 240) setW(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // draw the chart in when it scrolls into view
  useEffect(() => {
    const el = wrap.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const exit = a.exitCostUsd;
  const hz = a.horizon.lossUsd != null ? Math.max(a.horizon.lossUsd - exit, 0) : null;
  const loss = (u: number) => exit + (hz ?? 0) * Math.sqrt(u);            // u: 0 at the buy, 1 at the end of the hold
  const limit = t.lossLimitUsd;
  const liqUsd = a.liquidationPct != null ? a.liquidationPct * t.sizeUsd : null;
  const evs = a.events.filter((e) => e.band.date && days.includes(e.band.date));
  const top = Math.max(limit * 1.4, a.horizon.lossUsd ?? 0, ...evs.map((e) => e.lossUsd ?? 0)) * 1.06;
  const step = niceStep(top), ymax = step * Math.ceil(top / step);
  const ticks = Array.from({ length: Math.round(ymax / step) + 1 }, (_, i) => i * step);
  const xOf = (u: number) => X0 + (X1 - X0) * u;
  const yOf = (v: number) => Y1 - (Y1 - Y0) * Math.min(Math.max(v, 0), ymax) / ymax;
  const limitY = yOf(limit);

  const pts = hz == null ? [] : Array.from({ length: 81 }, (_, k) => { const u = k / 80; return [xOf(u), yOf(loss(u))] as const; });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${X1} ${Y1} L${X0} ${Y1} Z` : "";

  // where the curve first passes the limit
  const uStar = hz && hz > 0 && limit > exit ? Math.pow((limit - exit) / hz, 2) : exit >= limit ? 0 : null;
  const crosses = uStar != null && uStar < 1;
  const crossDay = crosses ? days[Math.min(n - 1, Math.max(0, Math.ceil(uStar * n) - 1))] : null;

  const ev = evs.map((e, i) => {
    const j = days.indexOf(e.band.date!);
    return { x: xOf((j + 1) / n), loss: e.lossUsd ?? 0, breach: e.breaches, text: shortLabel(e.band, t.ticker), i };
  });
  const labelEvery = Math.ceil(n / Math.max(2, Math.floor((X1 - X0) / 92)));

  const onMove = (ev2: React.PointerEvent<SVGRectElement>) => {
    const b = ev2.currentTarget.getBoundingClientRect();
    setHover(Math.min(1, Math.max(0, (ev2.clientX - b.left) / b.width)));
  };
  const hoverDay = hover == null ? null : days[Math.min(n - 1, Math.max(0, Math.ceil(hover * n) - 1))];
  const tip = hover != null && hoverDay ? `by ${day(hoverDay)}: about ${usd(loss(hover))}` : "";
  const tipW = tip.length * 7.7 + 28;

  return (
    <figure ref={wrap} className={`${s.rail} ${seen ? s.seen : ""}`} aria-label="How much this trade could lose while you hold it">
      <div className={s.head}>
        <h3>How much could this trade lose while you hold it?</h3>
        <p>
          The line is a bad but ordinary stretch for {t.ticker}: it holds {t.confidence === 0.8 ? "4 times in 5" : "19 times in 20"}.
          Everything above your limit is red.
        </p>
      </div>
      <p className={s.hint}>Scroll sideways to see the whole chart</p>
      <div className={s.scroll}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={crosses ? `Passes your ${usd(limit)} limit around ${crossDay}` : `Stays under your ${usd(limit)} limit`}>
          <defs>
            <linearGradient id={`${uid}fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--ink)" stopOpacity="0.20" /><stop offset="1" stopColor="var(--ink)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`${uid}red`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--stop)" stopOpacity="0.55" /><stop offset="1" stopColor="var(--stop)" stopOpacity="0.12" />
            </linearGradient>
            <clipPath id={`${uid}above`}><rect x={X0} y={Y0} width={X1 - X0} height={Math.max(limitY - Y0, 0)} /></clipPath>
            <clipPath id={`${uid}below`}><rect x={X0} y={limitY} width={X1 - X0} height={Y1 - limitY} /></clipPath>
          </defs>

          {/* dollars */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={X0} x2={X1} y1={yOf(v)} y2={yOf(v)} className={s.grid} />
              <text x={X0 - 12} y={yOf(v) + 4} textAnchor="end" className={s.tick}>{usd(v)}</text>
            </g>
          ))}

          {/* the curve: calm below the limit, red above it */}
          {area && (
            <>
              <path d={area} fill={`url(#${uid}fill)`} clipPath={`url(#${uid}below)`} className={s.areaIn} />
              <path d={area} fill={`url(#${uid}red)`} clipPath={`url(#${uid}above)`} className={s.areaIn} />
              <path d={line} className={s.curve} clipPath={`url(#${uid}below)`} pathLength={1} />
              <path d={line} className={s.curveRed} clipPath={`url(#${uid}above)`} pathLength={1} />
            </>
          )}

          {/* your limit */}
          <line x1={X0} x2={X1} y1={limitY} y2={limitY} className={s.limit} />
          <g transform={`translate(${X1} ${limitY})`}>
            <rect x={-132} y={-13} width={132} height={26} rx={13} className={s.limitPill} />
            <text x={-66} y={5} textAnchor="middle" className={s.limitText}>Your limit {usd(limit)}</text>
          </g>

          {liqUsd != null && liqUsd < ymax && (
            <g>
              <line x1={X0} x2={X1} y1={yOf(liqUsd)} y2={yOf(liqUsd)} className={s.liq} />
              <text x={X0 + 8} y={yOf(liqUsd) - 8} className={s.liqText}>Liquidated at {t.leverage}x: {usd(liqUsd)}</text>
            </g>
          )}

          {/* where you pass the limit */}
          {crosses && uStar! > 0 && (
            <g className={s.cross}>
              <line x1={xOf(uStar!)} x2={xOf(uStar!)} y1={limitY} y2={Y1} className={s.crossLine} />
              <circle cx={xOf(uStar!)} cy={limitY} r={7} className={s.crossDot} />
              <circle cx={xOf(uStar!)} cy={limitY} r={14} className={s.crossRing} />
            </g>
          )}

          {/* scheduled events: flags on the track */}
          {ev.map((e) => {
            const fy = Y0 + 8 + (e.i % 3) * 34;
            const w = Math.max(110, e.text.length * 7.6 + 80);
            const fx = Math.min(Math.max(e.x - w / 2, X0 + 4), X1 - w - 4);
            return (
              <g key={e.i} className={s.flag} style={{ animationDelay: `${0.5 + e.i * 0.15}s` }}>
                <line x1={e.x} x2={e.x} y1={fy + 28} y2={Y1} className={s.flagLine} />
                <circle cx={e.x} cy={Y1} r={5} className={e.breach ? s.flagDotBad : s.flagDot} />
                <rect x={fx} y={fy} width={w} height={28} rx={14} className={e.breach ? s.flagBad : s.flagBox} />
                <text x={fx + 14} y={fy + 18} className={s.flagText}>{e.text}</text>
                <text x={fx + w - 14} y={fy + 18} textAnchor="end" className={s.flagVal}>{usd(e.loss)}</text>
              </g>
            );
          })}
          {a.unmeasured.filter((b) => b.date && days.includes(b.date)).map((b, i) => (
            <g key={"u" + i}>
              <circle cx={xOf((days.indexOf(b.date!) + 1) / n)} cy={Y1} r={5} className={s.unknownDot} />
              <text x={xOf((days.indexOf(b.date!) + 1) / n)} y={Y1 + 44} textAnchor="middle" className={s.tick}>cannot measure</text>
            </g>
          ))}

          {/* the track under it all, with a stop for each day */}
          <line x1={X0} x2={X1} y1={Y1} y2={Y1} className={s.track} />
          <circle cx={X0} cy={Y1} r={6} className={s.start} />
          <text x={X0} y={Y1 + 30} textAnchor="middle" className={s.tick}>buy</text>
          {days.map((d, i) => (
            <g key={d}>
              <line x1={xOf((i + 1) / n)} x2={xOf((i + 1) / n)} y1={Y1 - 5} y2={Y1 + 5} className={s.sleeper} />
              {(i % labelEvery === labelEvery - 1 || i === n - 1) && <text x={xOf((i + 1) / n)} y={Y1 + 30} textAnchor={i === n - 1 ? "end" : "middle"} className={s.tick}>{day(d)}</text>}
            </g>
          ))}

          {/* hover: read any day */}
          {hover != null && hz != null && (
            <g pointerEvents="none">
              <line x1={xOf(hover)} x2={xOf(hover)} y1={Y0} y2={Y1} className={s.hoverLine} />
              <circle cx={xOf(hover)} cy={yOf(loss(hover))} r={6} className={s.hoverDot} />
              <g transform={`translate(${Math.min(Math.max(xOf(hover), X0 + tipW / 2), X1 - tipW / 2)} ${Math.max(yOf(loss(hover)) - 46, Y0 + 4)})`}>
                <rect x={-tipW / 2} width={tipW} height={32} rx={9} className={s.tipBox} />
                <text x={0} y={21} textAnchor="middle" className={s.tipText}>{tip}</text>
              </g>
            </g>
          )}
          <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      </div>
      <figcaption className={s.caption}>
        {crosses
          ? uStar === 0
            ? <>Even getting out costs more than your <b>{usd(limit)}</b> limit.</>
            : <>At this pace you pass your <b>{usd(limit)}</b> limit around <b>{crossDay ? day(crossDay) : "the end"}</b>.</>
          : <>This stretch stays under your <b>{usd(limit)}</b> limit for the whole hold. Events are shown as flags with their own measured size.</>}
      </figcaption>
    </figure>
  );
}
