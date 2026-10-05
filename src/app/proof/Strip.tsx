import stripData from "../../../public/data/strip.json";
import s from "../doc.module.css";

type Day = { d: string; band: number; move: number };
type Strip = { stocks: Record<string, { days: Day[]; inside: number; checked: number }> };

const W = 1000, H = 190, L = 44, R = 8, T = 10, B = 24;

/** One stock, one year: the shaded lane is the range drawn the evening before, each dot is the move that followed. */
function One({ t, v }: { t: string; v: Strip["stocks"][string] }) {
  const n = v.days.length;
  const m = Math.max(...v.days.map((x) => Math.max(x.band, Math.abs(x.move)))) * 1.05;
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (p: number) => T + ((m - p) / (2 * m)) * (H - T - B);
  const up = v.days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.band).toFixed(1)}`).join(" ");
  const down = [...v.days].reverse().map((d, i) => `L${x(n - 1 - i).toFixed(1)} ${y(-d.band).toFixed(1)}`).join(" ");
  const out = v.days.filter((d) => Math.abs(d.move) > d.band).length;
  return (
    <figure className={s.stripFig}>
      <figcaption><b>{t}</b> <span className="num">{v.inside} of {v.checked} days inside ({((v.inside / v.checked) * 100).toFixed(0)}%)</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t}: ${v.inside} of ${v.checked} daily moves stayed inside the range drawn the evening before`}>
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className={s.stripZero} />
        <path d={`${up} ${down} Z`} className={s.stripBand} />
        {v.days.map((d, i) => {
          const bad = Math.abs(d.move) > d.band;
          return <circle key={d.d} cx={x(i)} cy={y(d.move)} r={bad ? 3.4 : 2.2} className={bad ? s.stripOut : s.stripIn} />;
        })}
        <text x={L - 8} y={y(m * 0.8)} textAnchor="end" className={s.stripTick}>+{(m * 80).toFixed(0)}%</text>
        <text x={L - 8} y={y(-m * 0.8)} textAnchor="end" className={s.stripTick}>-{(m * 80).toFixed(0)}%</text>
        <text x={L} y={H - 4} className={s.stripTick}>{v.days[0].d}</text>
        <text x={W - R} y={H - 4} textAnchor="end" className={s.stripTick}>{v.days[n - 1].d}</text>
      </svg>
      <p className={s.stripNote}>{out} red dots broke out. This picture includes earnings days, which the ordinary day range deliberately leaves out, so it reads a little under 80%.</p>
    </figure>
  );
}

export default function Strip() {
  const d = stripData as unknown as Strip;
  return <div className={s.strips}>{Object.entries(d.stocks).map(([t, v]) => <One key={t} t={t} v={v} />)}</div>;
}
