import { niceTicks } from "./traceScale";
import { useSize } from "./useSize";

/** A prediction at a time (minutes from now): the value and its 50, 80 and 95 % intervals. */
export interface FanPoint { t: number; v: number; i50?: [number, number]; i80: [number, number]; i95: [number, number] }
export interface FanSeries {
  /** Recent history, minutes from now (negative), solid. */
  past: { t: number; v: number }[];
  /** The value now, where the prediction starts. */
  now: number | null;
  /** The prediction, dashed, with its intervals. */
  future: FanPoint[];
}
export interface FanOptions {
  /** The time window, minutes from now: left edge (negative) and right edge. */
  tMin: number; tMax: number;
  w: number; h: number;
  padL?: number; padR?: number; padT?: number; padB?: number;
  /** Values that must stay in view and are drawn as reference lines (NEWS2 5 and 7). */
  lines?: number[];
  /** Keep this range in view whatever the data does. */
  yFloor?: number; yCeil?: number;
}
export const FAN_PAD = { l: 40, r: 74, t: 6, b: 6 } as const;

export interface FanGeometry {
  x(t: number): number; y(v: number): number;
  yMin: number; yMax: number; ticks: number[];
  past: string; future: string; band80: string; band95: string;
  now: { x: number; y: number } | null; end: { x: number; y: number } | null;
  plot: { l: number; r: number; t: number; b: number };
}

const line = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("");

/**
 * The drawing of one trend and its prediction, as numbers: one time scale shared by every chart (so a
 * column of them lines up), a value scale padded over the history and the 95 % band, ticks, and the paths.
 * Pure, so it is tested without a screen.
 */
export function fanGeometry(s: FanSeries, o: FanOptions): FanGeometry {
  const l = o.padL ?? FAN_PAD.l, r = o.padR ?? FAN_PAD.r, t0 = o.padT ?? FAN_PAD.t, b0 = o.padB ?? FAN_PAD.b;
  const plot = { l, r: Math.max(l + 1, o.w - r), t: t0, b: Math.max(t0 + 1, o.h - b0) };
  const past = s.past.filter((p) => p.t >= o.tMin && p.t <= 0);
  const fut = s.future.filter((f) => f.t >= 0 && f.t <= o.tMax);
  const vals = [...past.map((p) => p.v), ...(s.now != null ? [s.now] : []), ...fut.flatMap((f) => [f.i95[0], f.i95[1], f.v]),
                ...(o.lines ?? [])];
  if (o.yFloor != null) vals.push(o.yFloor);
  if (o.yCeil != null) vals.push(o.yCeil);
  let lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1;
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.06;
  const yMin = o.yFloor != null ? Math.min(lo, o.yFloor) : lo - pad, yMax = o.yCeil != null ? Math.max(hi, o.yCeil) : hi + pad;
  const x = (t: number) => plot.l + ((t - o.tMin) / (o.tMax - o.tMin)) * (plot.r - plot.l);
  const y = (v: number) => plot.t + (1 - (v - yMin) / (yMax - yMin)) * (plot.b - plot.t);
  const nowPt = s.now != null ? { x: x(0), y: y(s.now) } : null;
  const start = nowPt ? [nowPt] : [];
  const edge = (pick: (f: FanPoint) => [number, number]) => {
    const up = fut.map((f) => ({ x: x(f.t), y: y(pick(f)[1]) }));
    const down = [...fut].reverse().map((f) => ({ x: x(f.t), y: y(pick(f)[0]) }));
    if (!up.length) return "";
    const first = nowPt ?? up[0]!;
    return `M${first.x.toFixed(1)} ${first.y.toFixed(1)}` + up.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("")
      + down.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("") + "Z";
  };
  const endF = fut[fut.length - 1];
  return {
    x, y, yMin, yMax, plot,
    ticks: niceTicks(yMin, yMax, Math.max(2, Math.floor((plot.b - plot.t) / 22))),
    past: line([...past.map((p) => ({ x: x(p.t), y: y(p.v) })), ...start]),
    future: line([...start, ...fut.map((f) => ({ x: x(f.t), y: y(f.v) }))]),
    band80: edge((f) => f.i80), band95: edge((f) => f.i95),
    now: nowPt, end: endF ? { x: x(endF.t), y: y(endF.v) } : null,
  };
}

/** The hours marked on the shared time axis, minutes from now: every `every` hours from the left edge to the right. */
export function axisMarks(tMin: number, tMax: number, everyHours = 2): number[] {
  const step = everyHours * 60;
  const out: number[] = [];
  for (let t = Math.ceil(tMin / step) * step; t <= tMax; t += step) out.push(t);
  return out;
}

/** "Now", "+2 H" or "-4 H": how far from now a mark on the axis is. */
export const markText = (min: number): string => (min === 0 ? "Now" : `${min > 0 ? "+" : "-"}${Math.abs(min) / 60} H`);

/**
 * One trend with its predicted future: the history solid, the prediction dashed and its 80 % interval
 * (stronger) and 95 % interval (fainter), a "Now" line, gridlines on the shared hours, a value scale at the
 * left and the predicted end value written at the right. Reference lines (the NEWS2 5 and 7) are dashed.
 * `hidden` keeps the history and drops the prediction, for a prediction below the certainty limit.
 */
export function TrendFan({ series, tMin, tMax, colour, unit, decimals = 0, lines = [], hidden = false, yFloor, yCeil, testId, label }: {
  series: FanSeries; tMin: number; tMax: number; colour: string; unit?: string; decimals?: number; lines?: number[];
  hidden?: boolean; yFloor?: number; yCeil?: number; testId: string; label?: string;
}) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const s = hidden ? { ...series, future: [] } : series;
  const g = w > 0 && h > 0 ? fanGeometry(s, { tMin, tMax, w, h, lines, yFloor, yCeil }) : null;
  const last = s.future[s.future.length - 1];
  return (
    <div className="trend-fan" ref={ref} data-testid={testId} data-bands={g && g.band80 ? "true" : undefined}>
      {g && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={{ color: colour }}>
          {axisMarks(tMin, tMax).map((t) => <line key={t} className={`tf-grid${t === 0 ? " is-now" : ""}`} x1={g.x(t)} x2={g.x(t)} y1={g.plot.t} y2={g.plot.b} />)}
          <rect className="tf-future" x={g.x(0)} y={g.plot.t} width={Math.max(0, g.plot.r - g.x(0))} height={g.plot.b - g.plot.t} />
          {g.ticks.map((v) => (
            <g key={v}>
              <line className="tf-tick" x1={g.plot.l - 4} x2={g.plot.l} y1={g.y(v)} y2={g.y(v)} />
              <text className="tf-label" x={g.plot.l - 6} y={g.y(v) + 3.5} textAnchor="end">{v.toFixed(Math.min(1, decimals))}</text>
            </g>
          ))}
          {lines.map((v) => <line key={`l${v}`} className="tf-ref" x1={g.plot.l} x2={g.plot.r} y1={g.y(v)} y2={g.y(v)} data-testid={`${testId}-ref-${v}`} />)}
          {g.band95 && <path className="tf-band95" d={g.band95} data-testid={`${testId}-band95`} />}
          {g.band80 && <path className="tf-band80" d={g.band80} data-testid={`${testId}-band80`} />}
          {g.past && <path className="tf-past" d={g.past} data-testid={`${testId}-past`} />}
          {g.future && s.future.length > 0 && <path className="tf-line" d={g.future} data-testid={`${testId}-future`} />}
          {g.now && <circle className="tf-now" cx={g.now.x} cy={g.now.y} r={3.2} />}
          {g.end && last && (
            <g data-testid={`${testId}-end`} data-value={last.v}>
              <circle className="tf-end" cx={g.end.x} cy={g.end.y} r={2.6} />
              <text className="tf-end-value" x={g.plot.r + 5} y={Math.min(g.plot.b - 12, Math.max(g.plot.t + 8, g.end.y - 1))}>{last.v.toFixed(decimals)}{unit ? ` ${unit}` : ""}</text>
              <text className="tf-end-range" x={g.plot.r + 5} y={Math.min(g.plot.b - 1, Math.max(g.plot.t + 19, g.end.y + 10))}>{last.i80[0].toFixed(decimals)}-{last.i80[1].toFixed(decimals)}</text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}

/** One of the three blood pressures of the BP chart: its measured readings, its prediction and the marker that tells it apart. */
export interface BpLine {
  key: "bp_sys" | "bp_mean" | "bp_dia";
  /** Marker, as on the monitor's BP trend: ▼ systolic, ✕ MAP, ▲ diastolic. */
  marker: "down" | "x" | "up";
  name: string;
  series: FanSeries;
}

/** Spread labels at the right edge so none touches the next: each needs `gap` px, they keep their order and stay inside [min, max]. */
export function spreadLabels(ys: number[], gap: number, min: number, max: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = order.map((o) => Math.min(max, Math.max(min, o.y)));
  for (let k = 1; k < out.length; k++) if (out[k]! - out[k - 1]! < gap) out[k] = out[k - 1]! + gap;
  for (let k = out.length - 1; k >= 0; k--) {
    if (out[k]! > max) out[k] = max;
    if (k + 1 < out.length && out[k + 1]! - out[k]! < gap) out[k] = out[k + 1]! - gap;
  }
  const res = new Array<number>(ys.length);
  order.forEach((o, k) => { res[o.i] = out[k]!; });
  return res;
}

function Marker({ kind, x, y }: { kind: BpLine["marker"]; x: number; y: number }) {
  if (kind === "x") return <g className="tf-bpx"><line x1={x - 3.4} x2={x + 3.4} y1={y - 3.4} y2={y + 3.4} /><line x1={x - 3.4} x2={x + 3.4} y1={y + 3.4} y2={y - 3.4} /></g>;
  const d = kind === "down" ? `${x - 4.2},${y - 3.6} ${x + 4.2},${y - 3.6} ${x},${y + 3.8}` : `${x - 4.2},${y + 3.6} ${x + 4.2},${y + 3.6} ${x},${y - 3.8}`;
  return <polygon className="tf-bpmark" points={d} />;
}

/**
 * Blood pressure as the monitor draws it, continued into the future: systolic (▼), MAP (✕) and diastolic (▲) on one value scale,
 * their measured readings as markers joined by dotted lines, then each prediction dashed with its 80 % and 95 % intervals, markers at
 * the predicted times and the three end values written at the right (spread so they never touch). Shares the time scale of every
 * other chart.
 */
export function BpTrendFan({ lines, tMin, tMax, colour, hidden = false, testId, label, markersAt = [] }: {
  lines: BpLine[]; tMin: number; tMax: number; colour: string; hidden?: boolean; testId: string; label?: string; markersAt?: number[];
}) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const shown = lines.map((l) => (hidden ? { ...l, series: { ...l.series, future: [] } } : l));
  // one value scale over all three, so the lines keep their order and the bands line up
  const all = shown.flatMap((l) => [...l.series.past.filter((p) => p.t >= tMin).map((p) => p.v), ...(l.series.now != null ? [l.series.now] : []),
    ...l.series.future.filter((f) => f.t <= tMax).flatMap((f) => [f.i95[0], f.i95[1]])]);
  const lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1, pad = Math.max(1, (hi - lo) * 0.06);
  const geo = w > 0 && h > 0 ? shown.map((l) => fanGeometry(l.series, { tMin, tMax, w, h, yFloor: lo - pad, yCeil: hi + pad })) : null;
  const g0 = geo?.[0];
  const ends = shown.map((l) => l.series.future.filter((f) => f.t <= tMax).slice(-1)[0]);
  const labelY = geo && g0 ? spreadLabels(geo.map((g, i) => (g.end && ends[i] ? g.end.y : g0.plot.b)), 24, g0.plot.t + 8, g0.plot.b - 14) : [];
  return (
    <div className="trend-fan trend-fan-bp" ref={ref} data-testid={testId} data-bands={geo?.some((g) => g.band80) ? "true" : undefined}>
      {geo && g0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={{ color: colour }}>
          {axisMarks(tMin, tMax).map((t) => <line key={t} className={`tf-grid${t === 0 ? " is-now" : ""}`} x1={g0.x(t)} x2={g0.x(t)} y1={g0.plot.t} y2={g0.plot.b} />)}
          <rect className="tf-future" x={g0.x(0)} y={g0.plot.t} width={Math.max(0, g0.plot.r - g0.x(0))} height={g0.plot.b - g0.plot.t} />
          {g0.ticks.map((v) => (
            <g key={v}>
              <line className="tf-tick" x1={g0.plot.l - 4} x2={g0.plot.l} y1={g0.y(v)} y2={g0.y(v)} />
              <text className="tf-label" x={g0.plot.l - 6} y={g0.y(v) + 3.5} textAnchor="end">{v.toFixed(0)}</text>
            </g>
          ))}
          {shown.map((l, i) => {
            const g = geo[i]!, id = `pt-${l.key}-chart`, last = ends[i];
            return (
              <g key={l.key} data-testid={`${id}-line`}>
                {g.band95 && <path className="tf-band95" d={g.band95} data-testid={`${id}-band95`} />}
                {g.band80 && <path className="tf-band80" d={g.band80} data-testid={`${id}-band80`} />}
                {g.past && <path className="tf-bppast" d={g.past} data-testid={`${id}-past`} />}
                {g.future && l.series.future.length > 0 && <path className="tf-line" d={g.future} data-testid={`${id}-future`} />}
                {l.series.past.filter((p) => p.t >= tMin && p.t <= 0).map((p) => <Marker key={`m${p.t}`} kind={l.marker} x={g.x(p.t)} y={g.y(p.v)} />)}
                {l.series.future.filter((f) => markersAt.includes(f.t) && f.t <= tMax).map((f) => <Marker key={`f${f.t}`} kind={l.marker} x={g.x(f.t)} y={g.y(f.v)} />)}
                {g.end && last && (
                  <g data-testid={`${id}-end`} data-value={last.v}>
                    <text className="tf-end-value" x={g.plot.r + 5} y={labelY[i]! + 3}>{l.name} {last.v.toFixed(0)}</text>
                    <text className="tf-end-range" x={g.plot.r + 5} y={labelY[i]! + 13}>{last.i80[0].toFixed(0)}-{last.i80[1].toFixed(0)}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
