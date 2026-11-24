import type { TimedValue } from "@/contracts/types.gen";

/**
 * A small trend with no axes, for small modules: a line, and a dot at the latest value.
 * Pure geometry plus a tiny component. The range follows the data with a margin, so the
 * shape reads; the numbers are in the tile beside it.
 */
export function sparkPath(points: readonly TimedValue[], w: number, h: number,
                          windowMin: number, pad = 4): { d: string; last: [number, number] | null } {
  const pts = points.filter((p) => p.t >= -windowMin);
  if (pts.length < 2 || w <= 0 || h <= 0) return { d: "", last: null };
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const m = (hi - lo) * 0.15;
  lo -= m; hi += m;
  const x = (t: number) => pad + ((t + windowMin) / windowMin) * (w - 2 * pad);
  const y = (v: number) => pad + ((hi - v) / (hi - lo)) * (h - 2 * pad);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const end = pts[pts.length - 1]!;
  return { d, last: [x(end.t), y(end.v)] };
}

export function Spark({ points, w, h, windowMin, rowId }: {
  points: readonly TimedValue[]; w: number; h: number; windowMin: number; rowId: string;
}) {
  const { d, last } = sparkPath(points, w, h, windowMin);
  if (!d || !last) return null;
  return (
    <g className="trace-spark" data-testid={`spark-${rowId}`}>
      <path className="trace-signal" d={d} />
      <circle className="trace-dot" cx={last[0]} cy={last[1]} r={3} />
    </g>
  );
}

/** SVG path for a trend over its window, for a full trend trace with a labelled range. */
export function trendPath(points: readonly TimedValue[], x0: number, x1: number,
                          windowMin: number, y: (v: number) => number): string {
  return points.filter((p) => p.t >= -windowMin).map((p, i) => {
    const x = x0 + ((p.t + windowMin) / windowMin) * (x1 - x0);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y(p.v).toFixed(1)}`;
  }).join("");
}
