// The hero backdrop, after pin 39: thin routed lines with rounded corners, small embossed tiles at the nodes.
// Each tile is one of the things Shunt measures. One dot runs the main line, like a train. Purely decorative.
import { ICON, type IconName } from "./Icon";

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
  [[-20, 330], [90, 330], [90, 150]],
  [[-20, 520], [170, 520], [170, 400]],
  [[170, 520], [170, 650], [400, 650], [400, 715]],
  [[1460, 250], [1350, 250], [1350, 120]],
  [[1460, 500], [1280, 500], [1280, 340]],
  [[1280, 500], [1280, 640], [1040, 640], [1040, 715]],
  [[400, 715], [1040, 715]],
];
// the dot follows one continuous route along the bottom and up the right side
const RUN: Pt[] = [[-20, 520], [170, 520], [170, 650], [400, 650], [400, 715], [1040, 715], [1040, 640], [1280, 640], [1280, 500], [1460, 500]];

const TILES: { x: number; y: number; icon: IconName }[] = [
  { x: 90, y: 150, icon: "fed" },
  { x: 170, y: 400, icon: "earnings" },
  { x: 400, y: 715, icon: "weekend" },
  { x: 1350, y: 120, icon: "liquidity" },
  { x: 1280, y: 340, icon: "bellwether" },
  { x: 1040, y: 715, icon: "limit" },
];

export default function TrackBg() {
  return (
    <svg className="trackbg" viewBox="0 0 1440 780" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <g fill="none" stroke="var(--route)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {LINES.map((l, i) => <path key={i} d={route(l)} />)}
      </g>
      {TILES.map((t, i) => (
        <g key={i} transform={`translate(${t.x - 28} ${t.y - 28})`} className="tile" style={{ animationDelay: `${0.15 + i * 0.1}s` }}>
          <rect width="56" height="56" rx="15" fill="var(--tile)" stroke="var(--line)" />
          <g transform="translate(16 16)" fill="none" stroke="var(--muted)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICON[t.icon]} transform="scale(1)" />
          </g>
        </g>
      ))}
      {/* the hub: where the track switches */}
      <g transform="translate(720 715)" className="tile" style={{ animationDelay: "0.9s" }}>
        <circle r="19" fill="var(--accent)" />
        <g transform="translate(-12 -12)" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h6 M9 12l6-5 M9 12l6 5 M15 7h3 M15 17h3" />
        </g>
      </g>
      <circle r="6" fill="var(--accent)" className="runner">
        <animateMotion dur="16s" repeatCount="indefinite" path={route(RUN)} />
      </circle>
    </svg>
  );
}
