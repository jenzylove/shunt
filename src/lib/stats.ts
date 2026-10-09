// Small statistics used on the Proof page.

/** 95% Wilson interval for a share observed as `rate` over `n` checks. Returns [low, high] as fractions. */
export function wilson(rate: number, n: number, z = 1.96): [number, number] {
  if (!(n > 0)) return [0, 1];
  const d = 1 + (z * z) / n;
  const centre = (rate + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((rate * (1 - rate)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export function median(xs: number[]): number | null {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
