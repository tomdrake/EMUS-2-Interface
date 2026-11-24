import type { BpReading, TempReading, TimedValue } from "@/contracts/types.gen";

/**
 * Discrete measurements on a trend. A cuff pressure is a dot at the MAP with a tail from the diastolic to
 * the systolic value; a measured temperature is a dot. Dots are joined by a dashed line. Pure geometry here,
 * drawn by the components below. Times are placed against `now` in minutes, newest at the right.
 */
export interface Frame { x0: number; x1: number; windowMin: number; y: (v: number) => number }
export interface Dot { x: number; y: number; tailTop?: number; tailBottom?: number; at: string }

const minutesBefore = (nowIso: string, atIso: string) => (Date.parse(nowIso) - Date.parse(atIso)) / 60000;
const xAt = (f: Frame, minutes: number) => f.x0 + ((f.windowMin - minutes) / f.windowMin) * (f.x1 - f.x0);

/** Dots (with tails for blood pressure) inside the window, oldest first. */
export function bpDots(readings: readonly BpReading[], nowIso: string, f: Frame): Dot[] {
  return readings
    .map((r) => ({ r, m: minutesBefore(nowIso, r.at) }))
    .filter(({ m }) => m >= -1 && m <= f.windowMin)
    .sort((a, b) => b.m - a.m)
    .map(({ r, m }) => ({ x: xAt(f, Math.max(0, m)), y: f.y(r.map), tailTop: f.y(r.sys), tailBottom: f.y(r.dia), at: r.at }));
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

/** The range a blood pressure plot must cover so no tail is clipped. */
export function bpExtent(readings: readonly BpReading[]): [number, number] | null {
  if (!readings.length) return null;
  return [Math.min(...readings.map((r) => r.dia)), Math.max(...readings.map((r) => r.sys))];
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

export type Corner = "tl" | "tr" | "bl" | "br";

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
export const KEY_W_COMPACT = 204;
export const KEY_H_COMPACT = 15;
export const keySize = (plotH: number) => (plotH < 72 ? { w: KEY_W_COMPACT, h: KEY_H_COMPACT, compact: true } : { w: KEY_W, h: KEY_H, compact: false });

/** MAP dots with tails and the dashed line, for the blood pressure trend. */
export function BpLayer({ dots, rowId, tails = true }: { dots: readonly Dot[]; rowId: string; tails?: boolean }) {
  if (!dots.length) return null;
  return (
    <g className="discrete bp-layer" data-testid={`bp-layer-${rowId}`}>
      <path className="discrete-line" d={dotLine(dots)} data-testid={`bp-line-${rowId}`} />
      {dots.map((d, i) => (
        <g key={d.at} data-testid={`bp-dot-${rowId}-${i}`} data-x={d.x.toFixed(1)} data-y={d.y.toFixed(1)}
           data-top={d.tailTop?.toFixed(1)} data-bottom={d.tailBottom?.toFixed(1)}>
          {tails && d.tailTop != null && <line className="discrete-tail" x1={d.x} x2={d.x} y1={d.tailTop} y2={d.tailBottom} />}
          {tails && d.tailTop != null && <line className="discrete-cap" x1={d.x - 3} x2={d.x + 3} y1={d.tailTop} y2={d.tailTop} />}
          {tails && d.tailBottom != null && <line className="discrete-cap" x1={d.x - 3} x2={d.x + 3} y1={d.tailBottom} y2={d.tailBottom} />}
          <circle className="discrete-dot" cx={d.x} cy={d.y} r={3.6} />
        </g>
      ))}
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
  const x = corner === "tl" || corner === "bl" ? plot.x0 + 4 : plot.x1 - k.w - 4;
  const y = corner === "tl" || corner === "tr" ? 4 : plot.h - k.h - 4;
  return (
    <g className="temp-key" data-testid={`temp-key-${rowId}`} data-corner={corner} data-w={k.w} data-h={k.h}
       data-x={x} data-y={y} transform={`translate(${x} ${y})`}>
      <rect className="key-bg" width={k.w} height={k.h} rx={3} />
      {k.compact ? (
        <>
          <line className="trace-signal key-line" x1={5} x2={20} y1={7.5} y2={7.5} />
          <text className="key-text" x={24} y={11}>Skin Sensor</text>
          <line className="discrete-line" x1={102} x2={118} y1={7.5} y2={7.5} />
          <circle className="discrete-dot" cx={110} cy={7.5} r={2.8} />
          <text className="key-text" x={122} y={11}>Measured</text>
        </>
      ) : (
        <>
          <line className="trace-signal key-line" x1={6} x2={24} y1={9} y2={9} />
          <text className="key-text" x={30} y={12}>Skin Sensor</text>
          <line className="discrete-line" x1={6} x2={24} y1={23} y2={23} />
          <circle className="discrete-dot" cx={15} cy={23} r={3} />
          <text className="key-text" x={30} y={26}>Measured</text>
        </>
      )}
    </g>
  );
}

/** Series of {t, v} as dots only (a spark of an intermittent value). */
export function tVDots(points: readonly TimedValue[], f: Frame): Dot[] {
  return points.filter((p) => p.t >= -f.windowMin).map((p) => ({ x: f.x0 + ((p.t + f.windowMin) / f.windowMin) * (f.x1 - f.x0), y: f.y(p.v), at: String(p.t) }));
}
