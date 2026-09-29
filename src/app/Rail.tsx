"use client";
// The rail: the holding period as a track, scheduled events as signal posts, each post's measured loss as a bar,
// the user's loss limit as a line. Where a bar crosses the line the track switches onto a siding.
import type { CheckResult } from "@/lib/check";
import { day, usd } from "@/lib/explain";
import s from "./rail.module.css";

const W = 1000, H = 380, TRACK = 300, TOP = 40, LEFT = 60, RIGHT = 40;

export default function Rail({ r }: { r: CheckResult }) {
  const t = r.trade, a = r.assessment;
  const days = r.holdDays;
  const n = days.length;
  const x = (i: number) => LEFT + ((W - LEFT - RIGHT) * (i + 0.5)) / Math.max(n, 1);
  const xOf = (iso?: string) => x(Math.max(0, days.indexOf(iso ?? "")));
  const losses = [a.horizon.lossUsd ?? 0, ...a.events.map((e) => e.lossUsd ?? 0)];
  const top = Math.max(t.lossLimitUsd * 1.5, ...losses) * 1.08;
  const y = (usdLoss: number) => TRACK - ((TRACK - TOP) * Math.min(usdLoss, top)) / top;
  const limitY = y(t.lossLimitUsd);

  // ordinary moves grow with time held: the ramp is the whole hold band scaled by sqrt(days so far)
  const hz = a.horizon.lossUsd != null ? a.horizon.lossUsd - a.exitCostUsd : null;
  const ramp = hz == null ? "" : [`${LEFT - 30},${y(a.exitCostUsd)}`,
    ...days.map((_, i) => `${x(i)},${y(a.exitCostUsd + hz * Math.sqrt((i + 1) / n))}`)].join(" ");
  const exit = a.verdict.state === "fits-if" ? a.verdict.exitBefore : null;
  const exitX = exit ? xOf(exit.date) - (W - LEFT - RIGHT) / Math.max(n, 1) / 2 : null;

  return (
    <figure className={s.rail} aria-label="Your holding period with scheduled events and your loss limit">
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {/* limit line */}
        <line x1={LEFT - 20} x2={W - RIGHT} y1={limitY} y2={limitY} className={s.limit} />
        <text x={LEFT - 20} y={limitY - 10} className={s.limitLabel}>your limit {usd(t.lossLimitUsd)}</text>

        {/* ordinary moves ramp */}
        {ramp && (
          <polygon points={`${LEFT - 30},${TRACK} ${ramp} ${x(n - 1)},${TRACK}`}
            className={a.horizon.breaches ? s.rampBreach : s.ramp} />
        )}

        {/* track and sleepers */}
        {days.map((d, i) => <line key={d} x1={x(i)} x2={x(i)} y1={TRACK - 6} y2={TRACK + 6} className={s.sleeper} />)}
        <path d={`M ${LEFT - 30} ${TRACK} H ${exitX ?? W - RIGHT + 10}`} className={s.track} />
        {exitX != null ? (
          <>
            <path d={`M ${exitX} ${TRACK} H ${W - RIGHT + 10}`} className={s.trackAhead} />
            <path d={`M ${exitX - 40} ${TRACK} C ${exitX} ${TRACK}, ${exitX} ${TRACK + 44}, ${exitX + 40} ${TRACK + 44} H ${exitX + 120}`} className={s.siding} />
            <text x={exitX + 46} y={TRACK + 64} className={s.sidingLabel}>out before {day(exit!.date)}</text>
          </>
        ) : null}
        <circle r="7" className={s.train}>
          <animateMotion dur="1.6s" fill="freeze" path={`M ${LEFT - 30} ${TRACK} H ${exitX ?? W - RIGHT}`} />
        </circle>

        {/* scheduled events */}
        {a.events.map((e, i) => {
          const cx = xOf(e.band.date);
          const h = y(e.lossUsd ?? 0);
          return (
            <g key={i} className={s.post} style={{ animationDelay: `${0.3 + i * 0.12}s` }}>
              <rect x={cx - 11} y={h} width={22} height={TRACK - h} className={e.breaches ? s.barBreach : s.bar} rx={2} />
              <text x={cx} y={h - 10} textAnchor="middle" className={s.barValue}>{usd(e.lossUsd)}</text>
            </g>
          );
        })}
        {a.unmeasured.map((b, i) => (
          <g key={"u" + i}>
            <rect x={xOf(b.date) - 11} y={TRACK - 60} width={22} height={60} className={s.unknown} rx={2} />
            <text x={xOf(b.date)} y={TRACK - 70} textAnchor="middle" className={s.barValue}>?</text>
          </g>
        ))}

        {/* day labels */}
        {days.map((d, i) =>
          n <= 10 || i % Math.ceil(n / 10) === 0 || i === n - 1 ? (
            <text key={"l" + d} x={x(i)} y={TRACK + 28} textAnchor="middle" className={s.dayLabel}>{day(d)}</text>
          ) : null,
        )}
      </svg>
      <figcaption className={s.legend}>
        <span><i className={s.keyBar} /> scheduled event, loss at its measured size</span>
        <span><i className={s.keyRamp} /> ordinary moves, growing with time held</span>
        <span><i className={s.keyBreach} /> over your limit</span>
      </figcaption>
    </figure>
  );
}
