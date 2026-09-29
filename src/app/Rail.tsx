"use client";
// The rail: the holding period as a track, scheduled events as signal posts, each post's measured loss as a bar,
// the user's loss limit as a line. Where a bar crosses the line the track switches onto a siding.
import type { CheckResult } from "@/lib/check";
import { day, pct, usd } from "@/lib/explain";
import s from "./rail.module.css";

const W = 1000, H = 400, TRACK = 310, TOP = 50, LEFT = 70, RIGHT = 50;

export default function Rail({ r }: { r: CheckResult }) {
  const t = r.trade, a = r.assessment;
  const days = r.holdDays;
  const n = Math.max(days.length, 1);
  const span = W - LEFT - RIGHT;
  const x = (i: number) => LEFT + (span * (i + 1)) / n;          // close of trading day i
  const xOf = (iso?: string) => x(Math.max(0, days.indexOf(iso ?? "")));
  const liqUsd = a.liquidationPct != null ? a.liquidationPct * t.sizeUsd : null;
  const losses = [a.horizon.lossUsd ?? 0, ...a.events.map((e) => e.lossUsd ?? 0)];
  const top = Math.max(t.lossLimitUsd * 1.5, ...losses) * 1.1;
  const y = (v: number) => TRACK - ((TRACK - TOP) * Math.min(Math.max(v, 0), top)) / top;
  const limitY = y(t.lossLimitUsd);

  // ordinary moves grow with the square root of time held
  const hz = a.horizon.lossUsd != null ? a.horizon.lossUsd - a.exitCostUsd : null;
  const curve = hz == null ? [] : Array.from({ length: 41 }, (_, k) => {
    const f = k / 40;
    return `${LEFT + span * f},${y(a.exitCostUsd + hz * Math.sqrt(f))}`;
  });
  const exit = a.verdict.state === "fits-if" ? a.verdict.exitBefore : null;
  const exitX = exit ? xOf(exit.date) - span / n / 2 : null;
  const end = W - RIGHT;

  return (
    <figure className={s.rail} aria-label="Your holding period with scheduled events and your loss limit">
      <div className={s.scroll}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img">
          <text x={LEFT - 40} y={TOP - 18} className={s.axis}>possible loss</text>
          <line x1={LEFT - 40} x2={end + 20} y1={limitY} y2={limitY} className={s.limit} />
          <text x={end + 20} y={limitY - 10} textAnchor="end" className={s.limitLabel}>your limit {usd(t.lossLimitUsd)}</text>
          {liqUsd != null && liqUsd < top && (
            <>
              <line x1={LEFT - 40} x2={end + 20} y1={y(liqUsd)} y2={y(liqUsd)} className={s.liq} />
              <text x={end + 20} y={y(liqUsd) - 10} textAnchor="end" className={s.liqLabel}>liquidated at {t.leverage}x ({pct(a.liquidationPct)})</text>
            </>
          )}

          {curve.length > 0 && (
            <>
              <polygon points={`${LEFT},${TRACK} ${curve.join(" ")} ${end},${TRACK}`} className={a.horizon.breaches ? s.rampBreach : s.ramp} />
              <polyline points={curve.join(" ")} className={a.horizon.breaches ? s.curveBreach : s.curve} />
            </>
          )}

          {days.map((d, i) => <line key={d} x1={x(i)} x2={x(i)} y1={TRACK - 7} y2={TRACK + 7} className={s.sleeper} />)}
          <path d={`M ${LEFT - 40} ${TRACK} H ${exitX ?? end + 20}`} className={s.track} />
          <circle cx={LEFT} cy={TRACK} r="6" className={s.start} />
          <text x={LEFT} y={TRACK + 30} textAnchor="middle" className={s.dayLabel}>you buy</text>
          {exitX != null && (
            <>
              <path d={`M ${exitX} ${TRACK} H ${end + 20}`} className={s.trackAhead} />
              <path d={`M ${exitX - 50} ${TRACK} C ${exitX - 10} ${TRACK}, ${exitX - 10} ${TRACK + 50}, ${exitX + 30} ${TRACK + 50} H ${exitX + 110}`} className={s.siding} />
              <text x={exitX + 36} y={TRACK + 72} className={s.sidingLabel}>out before {day(exit!.date)}</text>
            </>
          )}
          <circle r="7" className={s.train}>
            <animateMotion dur="1.6s" fill="freeze" path={exitX != null
              ? `M ${LEFT} ${TRACK} H ${exitX - 50} C ${exitX - 10} ${TRACK}, ${exitX - 10} ${TRACK + 50}, ${exitX + 30} ${TRACK + 50}`
              : `M ${LEFT} ${TRACK} H ${end}`} />
          </circle>

          {a.events.map((e, i) => {
            const cx = xOf(e.band.date), h = y(e.lossUsd ?? 0);
            return (
              <g key={i} className={s.post} style={{ animationDelay: `${0.35 + i * 0.12}s` }}>
                <rect x={cx - 12} y={h} width={24} height={TRACK - h} className={e.breaches ? s.barBreach : s.bar} rx={2} />
                <text x={cx} y={h - 10} textAnchor="middle" className={s.barValue}>{usd(e.lossUsd)}</text>
              </g>
            );
          })}
          {a.unmeasured.map((b, i) => (
            <g key={"u" + i}>
              <rect x={xOf(b.date) - 12} y={TRACK - 70} width={24} height={70} className={s.unknown} rx={2} />
              <text x={xOf(b.date)} y={TRACK - 80} textAnchor="middle" className={s.barValue}>?</text>
            </g>
          ))}
          {days.map((d, i) =>
            n <= 8 || i % Math.ceil(n / 8) === n % Math.ceil(n / 8) || i === n - 1 ? (
              <text key={"l" + d} x={x(i)} y={TRACK + 30} textAnchor="middle" className={s.dayLabel}>{day(d)}</text>
            ) : null,
          )}
          {hz != null && (
            <text x={end} y={y(a.horizon.lossUsd ?? 0) - 10} textAnchor="end" className={s.curveLabel}>
              ordinary moves {usd(a.horizon.lossUsd)}
            </text>
          )}
        </svg>
      </div>
      <figcaption className={s.legend}>
        <span><i className={s.keyBar} /> scheduled event, loss at its measured size</span>
        <span><i className={s.keyRamp} /> ordinary moves, growing with time held</span>
        <span><i className={s.keyBreach} /> over your limit</span>
      </figcaption>
    </figure>
  );
}
