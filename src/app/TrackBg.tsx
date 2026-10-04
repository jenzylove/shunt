// The hero backdrop, after pin 39: thin routed lines with rounded corners, and named stations where an event
// sits on the track. No boxes, no icons. One runner travels the left line. Purely decorative.
type Pt = [number, number];

/** Orthogonal polyline with rounded corners. */
function route(pts: Pt[], r = 22): string {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const a = Math.min(r, Math.hypot(cx - px, cy - py) / 2), b = Math.min(r, Math.hypot(nx - cx, ny - cy) / 2);
    const sx = cx - Math.sign(cx - px) * a, sy = cy - Math.sign(cy - py) * a;
    const ex = cx + Math.sign(nx - cx) * b, ey = cy + Math.sign(ny - cy) * b;
    d += ` L ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + ` L ${lx} ${ly}`;
}

const LINES: Pt[][] = [
  [[-20, 230], [64, 230], [64, 110]],
  [[-20, 520], [112, 520], [112, 380]],
  [[112, 520], [112, 760], [44, 760], [44, 900]],
  [[1460, 200], [1376, 200], [1376, 100]],
  [[1460, 470], [1328, 470], [1328, 340]],
  [[1328, 470], [1328, 720], [1396, 720], [1396, 880]],
];
const RUN: Pt[] = [[-20, 520], [112, 520], [112, 760], [44, 760], [44, 900]];

const STATIONS: { x: number; y: number; label: string; side: "r" | "l" }[] = [
  { x: 64, y: 110, label: "FED DECISION", side: "r" },
  { x: 112, y: 380, label: "EARNINGS", side: "r" },
  { x: 44, y: 900, label: "WEEKEND", side: "r" },
  { x: 1376, y: 100, label: "OTHER REPORTS", side: "l" },
  { x: 1328, y: 340, label: "BITGET COSTS", side: "l" },
  { x: 1396, y: 880, label: "YOUR LIMIT", side: "l" },
];

export default function TrackBg() {
  return (
    <svg className="trackbg" viewBox="0 0 1440 1100" aria-hidden="true">
      <g fill="none" stroke="var(--route)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {LINES.map((l, i) => <path key={i} d={route(l)} />)}
      </g>
      {STATIONS.map((t, i) => (
        <g key={t.label} className="station" style={{ animationDelay: `${0.2 + i * 0.12}s` }}>
          <circle cx={t.x} cy={t.y} r="12" fill="var(--bg)" stroke="var(--route)" strokeWidth="2.4" />
          <circle cx={t.x} cy={t.y} r="5" fill="var(--ink)" />
          <text x={t.x + (t.side === "r" ? 24 : -24)} y={t.y + 4} textAnchor={t.side === "r" ? "start" : "end"}
            fontFamily="var(--font-num)" fontSize="12" letterSpacing="1.4" fill="var(--muted)">{t.label}</text>
        </g>
      ))}
      <circle r="6" fill="var(--accent)" className="runner">
        <animateMotion dur="9s" repeatCount="indefinite" path={route(RUN)} />
      </circle>
    </svg>
  );
}
