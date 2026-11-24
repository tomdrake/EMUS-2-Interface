import type { Forecast, ForecastPoint } from "@/contracts/types.gen";

const range80 = (p: ForecastPoint): [number, number] => p.intervals["80"] as unknown as [number, number];
import { useSize } from "@/traces/useSize";

/** Expected course with and without a change, on one chart: solid for no change, dashed for the what-if,
 *  with the 80% range shaded for the baseline so the gap between them can be judged against it. */
export function WhatIfChart({ baseline, whatIf, now, unit, testId }: {
  baseline: Forecast; whatIf: Forecast; now: number; unit: string; testId: string;
}) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const h = 130, left = 40, right = 8, top = 10, bottom = 20;
  const pts = (f: Forecast) => [{ x: 0, y: now }, ...f.points.map((p) => ({ x: p.horizon_min, y: p.value }))];
  const b = pts(baseline), q = pts(whatIf);
  const lo = [{ x: 0, y: now }, ...baseline.points.map((p) => ({ x: p.horizon_min, y: range80(p)[0] }))];
  const hi = [{ x: 0, y: now }, ...baseline.points.map((p) => ({ x: p.horizon_min, y: range80(p)[1] }))];
  const all = [...b, ...q, ...lo, ...hi].map((p) => p.y);
  const yMin = Math.min(...all), yMax = Math.max(...all, yMin + 1);
  const xMax = Math.max(...b.map((p) => p.x));
  const X = (x: number) => left + (x / xMax) * Math.max(w - left - right, 10);
  const Y = (y: number) => top + ((yMax - y) / (yMax - yMin)) * (h - top - bottom);
  const path = (a: { x: number; y: number }[]) => a.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join("");
  const band = `${path(hi)}${[...lo].reverse().map((p) => `L${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join("")}Z`;
  return (
    <figure className="evidence" data-testid={testId}>
      <figcaption>{`${baseline.scenario_label} (solid) and ${whatIf.scenario_label.toLowerCase()} (dashed)`}</figcaption>
      <div ref={ref} className="evidence-strip" style={{ height: h }}>
        {w > 0 && (
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Expected course with and without the change">
            <path d={band} className="whatif-band" />
            <path d={path(b)} className="trace-signal" data-testid={`${testId}-baseline`} />
            <path d={path(q)} className="trace-signal whatif-line" data-testid={`${testId}-whatif`} />
            <text className="trace-label trace-unit" x={2} y={12}>{unit}</text>
            <text className="trace-label" x={left - 6} y={Y(yMax) + 4} textAnchor="end">{Math.round(yMax * 10) / 10}</text>
            <text className="trace-label" x={left - 6} y={Y(yMin) + 4} textAnchor="end">{Math.round(yMin * 10) / 10}</text>
            <text className="trace-label" x={left} y={h - 4}>now</text>
            <text className="trace-label" x={X(xMax)} y={h - 4} textAnchor="end">{`${xMax / 60} h`}</text>
          </svg>
        )}
      </div>
    </figure>
  );
}
