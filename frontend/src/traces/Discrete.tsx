import type { BpReading, TempReading, TimedValue } from "@/contracts/types.gen";

/**
 * Discrete measurements on a trend. A cuff pressure is a dot at the MAP with a tail from the diastolic to
 * the systolic value; a measured temperature is a dot. Dots are joined by a dashed line. Pure geometry here,
 * drawn by the components below. Times are placed against `now` in minutes, newest at the right.
 */
export interface Frame { x0: number; x1: number; windowMin: number; y: (v: number) => number }
export interface Dot { x: number; y: number; tailTop?: number; tailBottom?: number; at: string; sys?: number; dia?: number }

const minutesBefore = (nowIso: string, atIso: string) => (Date.parse(nowIso) - Date.parse(atIso)) / 60000;
const xAt = (f: Frame, minutes: number) => f.x0 + ((f.windowMin - minutes) / f.windowMin) * (f.x1 - f.x0);

/** Dots (with tails for blood pressure) inside the window, oldest first. */
export function bpDots(readings: readonly BpReading[], nowIso: string, f: Frame): Dot[] {
  return readings
    .map((r) => ({ r, m: minutesBefore(nowIso, r.at) }))
    .filter(({ m }) => m >= -1 && m <= f.windowMin)
    .sort((a, b) => b.m - a.m)
    .map(({ r, m }) => ({ x: xAt(f, Math.max(0, m)), y: f.y(r.map), tailTop: f.y(r.sys), tailBottom: f.y(r.dia), at: r.at, sys: r.sys, dia: r.dia }));
}

export function tempDots(readings: readonly TempReading[], nowIso: string, f: Frame): Dot[] {
  return readings
    .map((r) => ({ r, m: minutesBefore(nowIso, r.at) }))
    .filter(({ m }) => m >= -1 && m <= f.windowMin)
    .sort((a, b) => b.m - a.m)
    .map(({ r, m }) => ({ x: xAt(f, Math.max(0, m)), y: f.y(r.value), at: r.at }));
}

/** The dashed line through the dots in time order. Empty for a single dot. */
export function dotLine(dots: readonly Dot[]): string {
  if (dots.length < 2) return "";
  return dots.map((d, i) => `${i ? "L" : "M"}${d.x.toFixed(1)} ${d.y.toFixed(1)}`).join("");
}

/** `joined`: a plot too short for two numbers one above, one below, writes "sys/dia" once above the tail. */
export interface BpLabel { i: number; x: number; sysY: number; diaY: number; sys: number; dia: number; joined: boolean }
export const JOIN_BELOW_PX = 56;

/**
 * Where the numbers go: the systolic above the top of each tail and the diastolic below the bottom, kept
 * inside the plot, and only as many as will sit side by side (`minGap` px apart) with the newest always kept.
 */
export function bpLabelPlan(dots: readonly Dot[], plotH: number, minGapPx = 26): BpLabel[] {
  const out: BpLabel[] = [];
  const joined = plotH < JOIN_BELOW_PX;
  const minGap = joined ? Math.max(minGapPx, 40) : minGapPx;
  let lastX = Infinity;
  for (let i = dots.length - 1; i >= 0; i--) {
    const d = dots[i]!;
    if (d.tailTop == null || d.tailBottom == null || d.sys == null || d.dia == null) continue;
    if (lastX - d.x < minGap) continue;
    lastX = d.x;
    out.unshift({ i, x: d.x, sys: d.sys, dia: d.dia, joined,
                  sysY: Math.max(10, d.tailTop - 7), diaY: Math.min(plotH - 3, d.tailBottom + 13) });
  }
  return out;
}

/** The range a blood pressure plot must cover so no tail is clipped. */
export function bpExtent(readings: readonly BpReading[]): [number, number] | null {
  if (!readings.length) return null;
  return [Math.min(...readings.map((r) => r.dia)), Math.max(...readings.map((r) => r.sys))];
}

/**
 * The y range for a blood pressure plot: the readings' systolic and diastolic extremes with room for their
 * numbers, in whole tens, never wider than the registry's range and at least 60 mmHg tall so tails read.
 */
export function bpRange(readings: readonly BpReading[], base: readonly [number, number]): [number, number] {
  const ext = bpExtent(readings);
  if (!ext) return [base[0], base[1]];
  let lo = Math.max(base[0], Math.floor((ext[0] - 10) / 10) * 10);
  let hi = Math.min(base[1], Math.ceil((ext[1] + 10) / 10) * 10);
  if (hi - lo < 60) { hi = Math.min(base[1], lo + 60); lo = Math.max(base[0], hi - 60); }
  return [lo, hi];
}

/** Points along the dashed line between the dots, about every `every` px, for placing a key clear of it. */
export function lineSamples(dots: readonly { x: number; y: number }[], every = 12): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 1; i < dots.length; i++) {
    const a = dots[i - 1]!, b = dots[i]!;
    const n = Math.max(1, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / every));
    for (let k = 1; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** "strip" is the band under the plot, beside the x scale number: free of data by construction. */
export type Corner = "tl" | "tr" | "bl" | "br" | "strip";

/** A corner of the plot where a key of this size covers no point, preferring the top left. */
export function keyCorner(points: readonly { x: number; y: number }[], plot: { x0: number; x1: number; h: number },
                          key: { w: number; h: number }, pad = 4): Corner {
  const box = (c: Corner) => {
    const left = c === "tl" || c === "bl" ? plot.x0 + pad : plot.x1 - key.w - pad;
    const top = c === "tl" || c === "tr" ? pad : plot.h - key.h - pad;
    return { l: left, r: left + key.w, t: top, b: top + key.h };
  };
  for (const c of ["tl", "tr", "bl", "br"] as Corner[]) {
    const b = box(c);
    if (!points.some((p) => p.x >= b.l - 3 && p.x <= b.r + 3 && p.y >= b.t - 3 && p.y <= b.b + 3)) return c;
  }
  return "tl";
}

export const KEY_W = 128;
export const KEY_H = 32;
/** On a short plot the key is one line, so it never fills the plot. */
export const KEY_W_COMPACT = 218;
export const KEY_H_COMPACT = 14;
export const keySize = (plotH: number) => (plotH < 72 ? { w: KEY_W_COMPACT, h: KEY_H_COMPACT, compact: true } : { w: KEY_W, h: KEY_H, compact: false });

/** The dashed line through one series of a blood pressure plot, in time order. */
const seriesLine = (dots: readonly Dot[], y: (d: Dot) => number | undefined): string => {
  const pts = dots.map((d) => ({ x: d.x, y: y(d) })).filter((p): p is { x: number; y: number } => p.y != null);
  return pts.length < 2 ? "" : pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");
};

/** The markers are the NEWS chart's: a down arrow for systolic, an up arrow for diastolic, an X for the MAP. */
export const ARROW = 4.5;
export const arrowDown = (x: number, y: number) => `${x - ARROW},${y - 4} ${x + ARROW},${y - 4} ${x},${y + 3.5}`;
export const arrowUp = (x: number, y: number) => `${x - ARROW},${y + 4} ${x + ARROW},${y + 4} ${x},${y - 3.5}`;

/**
 * Blood pressure over time: the MAP as an X, the systolic as a down-facing arrow and the diastolic as an
 * up-facing arrow, each series joined by a dashed line, with the systolic number above its arrow and the
 * diastolic below its own. Without room for the arrows (`tails` false) only the X and its dashed line are drawn.
 */
export function BpLayer({ dots, rowId, tails = true, plotH }: { dots: readonly Dot[]; rowId: string; tails?: boolean; plotH?: number }) {
  if (!dots.length) return null;
  const labels = tails && plotH ? bpLabelPlan(dots, plotH) : [];
  return (
    <g className="discrete bp-layer" data-testid={`bp-layer-${rowId}`}>
      <path className="discrete-line" d={dotLine(dots)} data-testid={`bp-line-${rowId}`} />
      {tails && <path className="discrete-line" d={seriesLine(dots, (d) => d.tailTop)} data-testid={`bp-line-sys-${rowId}`} />}
      {tails && <path className="discrete-line" d={seriesLine(dots, (d) => d.tailBottom)} data-testid={`bp-line-dia-${rowId}`} />}
      {dots.map((d, i) => (
        <g key={d.at} data-testid={`bp-dot-${rowId}-${i}`} data-x={d.x.toFixed(1)} data-y={d.y.toFixed(1)}
           data-top={d.tailTop?.toFixed(1)} data-bottom={d.tailBottom?.toFixed(1)}>
          {tails && d.tailTop != null && <polygon className="discrete-arrow" data-testid={`bp-sysmark-${rowId}-${i}`} points={arrowDown(d.x, d.tailTop)} />}
          {tails && d.tailBottom != null && <polygon className="discrete-arrow" data-testid={`bp-diamark-${rowId}-${i}`} points={arrowUp(d.x, d.tailBottom)} />}
          <g className="discrete-x" data-testid={`bp-mapmark-${rowId}-${i}`}>
            <line x1={d.x - 3.6} x2={d.x + 3.6} y1={d.y - 3.6} y2={d.y + 3.6} />
            <line x1={d.x - 3.6} x2={d.x + 3.6} y1={d.y + 3.6} y2={d.y - 3.6} />
          </g>
        </g>
      ))}
      {labels.map((l) => (
        <g key={l.i} data-testid={`bp-num-${rowId}-${l.i}`} data-sys-y={l.sysY.toFixed(1)} data-dia-y={l.diaY.toFixed(1)}>
          <text className="discrete-num" x={l.x} y={l.sysY} textAnchor="middle" data-testid={`bp-sys-${rowId}-${l.i}`}>{l.joined ? `${l.sys}/${l.dia}` : l.sys}</text>
          {!l.joined && <text className="discrete-num" x={l.x} y={l.diaY} textAnchor="middle" data-testid={`bp-dia-${rowId}-${l.i}`}>{l.dia}</text>}
        </g>
      ))}
    </g>
  );
}

/** What the three markers mean, in the strip under the plot. */
export function BpKey({ x, y }: { x: number; y: number }) {
  return (
    <g className="bp-key" data-testid="bp-key" transform={`translate(${x} ${y})`}>
      <polygon className="discrete-arrow" points={arrowDown(5, 0)} />
      <text className="key-text" x={13} y={3.5}>Systolic</text>
      <polygon className="discrete-arrow" points={arrowUp(66, 0)} />
      <text className="key-text" x={74} y={3.5}>Diastolic</text>
      <g className="discrete-x"><line x1={128} x2={135.2} y1={-3.6} y2={3.6} /><line x1={128} x2={135.2} y1={3.6} y2={-3.6} /></g>
      <text className="key-text" x={140} y={3.5}>MAP</text>
    </g>
  );
}

/** Measured temperatures: dots and a dashed line. */
export function TempLayer({ dots, rowId }: { dots: readonly Dot[]; rowId: string }) {
  if (!dots.length) return null;
  return (
    <g className="discrete temp-layer" data-testid={`temp-layer-${rowId}`}>
      <path className="discrete-line" d={dotLine(dots)} />
      {dots.map((d, i) => <circle key={d.at} className="discrete-dot" cx={d.x} cy={d.y} r={3.6} data-testid={`temp-dot-${rowId}-${i}`} data-x={d.x.toFixed(1)} data-y={d.y.toFixed(1)} />)}
    </g>
  );
}

/** The key for a plot with both the continuous skin trace and measured readings. */
export function TempKey({ corner, plot, rowId }: { corner: Corner; plot: { x0: number; x1: number; h: number }; rowId: string }) {
  const k = keySize(plot.h);
  const x = corner === "tl" || corner === "bl" || corner === "strip" ? plot.x0 + 4 : plot.x1 - k.w - 4;
  const y = corner === "strip" ? plot.h : corner === "tl" || corner === "tr" ? 4 : plot.h - k.h - 4;
  return (
    <g className="temp-key" data-testid={`temp-key-${rowId}`} data-corner={corner} data-w={k.w} data-h={k.h}
       data-x={x} data-y={y} transform={`translate(${x} ${y})`}>
      <rect className="key-bg" width={k.w} height={k.h} rx={3} />
      {k.compact ? (
        <>
          <line className="trace-signal key-line" x1={5} x2={20} y1={7} y2={7} />
          <text className="key-text" x={24} y={10.5}>Skin Sensor</text>
          <line className="discrete-line" x1={102} x2={118} y1={7} y2={7} />
          <circle className="discrete-dot" cx={110} cy={7} r={2.8} />
          <text className="key-text" x={122} y={10.5}>Thermometer</text>
        </>
      ) : (
        <>
          <line className="trace-signal key-line" x1={6} x2={24} y1={9} y2={9} />
          <text className="key-text" x={30} y={12}>Skin Sensor</text>
          <line className="discrete-line" x1={6} x2={24} y1={23} y2={23} />
          <circle className="discrete-dot" cx={15} cy={23} r={3} />
          <text className="key-text" x={30} y={26}>Thermometer</text>
        </>
      )}
    </g>
  );
}

/** Series of {t, v} as dots only (a spark of an intermittent value). */
export function tVDots(points: readonly TimedValue[], f: Frame): Dot[] {
  return points.filter((p) => p.t >= -f.windowMin).map((p) => ({ x: f.x0 + ((p.t + f.windowMin) / f.windowMin) * (f.x1 - f.x0), y: f.y(p.v), at: String(p.t) }));
}
