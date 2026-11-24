import { useState } from "react";

import { useUi } from "@/app/store";
import type { ExampleSnapshot } from "@/contracts/types.gen";
import { useSnapshot } from "@/examples/store";
import { BpLayer, TempKey, TempLayer, bpDots, keyCorner, keySize, tempDots } from "@/traces/Discrete";
import { trendPath } from "@/traces/Spark";
import { niceTicks, trendRange, trendY } from "@/traces/traceScale";
import { useSize } from "@/traces/useSize";

import { Choice } from "./controls";

const WINDOWS = [{ value: "60", label: "1 h" }, { value: "240", label: "4 h" }, { value: "720", label: "12 h" }, { value: "1440", label: "24 h" }] as const;
const H = 120, LEFT = 44, PAD = 10;

/** One small chart: a continuous trend, and/or a cuff pressure as dots with tails, and/or measured points. */
function Plot({ param, windowMin, snapshot }: { param: string; windowMin: number; snapshot: ExampleSnapshot }) {
  const registry = useUi((s) => s.registry)!;
  const p = registry.parameters[param === "bp" ? "bp_sys" : param]!;
  const [ref, { w }] = useSize<HTMLDivElement>();
  const range = trendRange(p);
  const y = (v: number) => trendY(v, range, H, PAD);
  const x1 = Math.max(w - 8, LEFT + 10);
  const frame = { x0: LEFT, x1, windowMin, y };
  const series = param === "bp" ? null : snapshot.trends[param as keyof typeof snapshot.trends];
  const bp = param === "bp" ? bpDots(snapshot.bp_readings, snapshot.generated_at, frame) : [];
  const temp = param === "temp" ? tempDots(snapshot.temp_readings, snapshot.generated_at, frame) : [];
  const ticks = niceTicks(range[0], range[1], 3);
  const label = param === "bp" ? "Blood Pressure" : p.label;
  const pts = [...bp, ...temp, ...(series?.points ?? []).filter((q) => q.t >= -windowMin).map((q) => ({ x: LEFT + ((q.t + windowMin) / windowMin) * (x1 - LEFT), y: y(q.v) }))];
  const plot = { x0: LEFT, x1, h: H };
  return (
    <figure className="evidence" data-testid={`trend-${param}`}>
      <figcaption>{label} <small>{param === "bp" ? "dots are the mean, tails run diastolic to systolic" : p.unit}</small></figcaption>
      <div ref={ref} className="evidence-strip" style={{ height: H }}>
        {w > 0 && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`${label} trend`}>
            {ticks.map((v) => (
              <g key={v}><line className="trace-grid" x1={LEFT} x2={x1} y1={y(v)} y2={y(v)} />
                <text className="trace-label" x={LEFT - 6} y={y(v) + 3.5} textAnchor="end">{v}</text></g>
            ))}
            {series && series.points.length > 1 && <path className="trace-signal" d={trendPath(series.points, LEFT, x1, windowMin, y)} />}
            {param === "bp" && <BpLayer dots={bp} rowId="trends" />}
            {param === "temp" && <TempLayer dots={temp} rowId="trends" />}
            {param === "temp" && temp.length > 0 && <TempKey corner={keyCorner(pts, plot, keySize(H))} plot={plot} rowId="trends" />}
            {param === "bp" && bp.length === 0 && <text className="trace-label" x={(LEFT + x1) / 2} y={H / 2} textAnchor="middle">No Reading</text>}
            <text className="trace-label" x={LEFT} y={H - 4}>{windowMin >= 120 ? `${windowMin / 60} h` : `${windowMin} min`} Ago</text>
            <text className="trace-label" x={x1} y={H - 4} textAnchor="end">Now</text>
          </svg>
        )}
      </div>
    </figure>
  );
}

/** The main observations side by side over a chosen window: 1, 4, 12 or 24 hours. */
export function TrendsSheet() {
  const snapshot = useSnapshot();
  const [win, setWin] = useState<string>("240");
  if (!snapshot) return <p className="why-empty">No observations to show. Turn on example data in Demo Controls.</p>;
  return (
    <div className="settings" data-testid="trends-sheet">
      <Choice testId="trend-window" label="Window" value={win} options={[...WINDOWS]} onChange={setWin} />
      {["hr", "rr", "spo2", "bp", "temp"].map((p) => <Plot key={p} param={p} windowMin={Number(win)} snapshot={snapshot} />)}
    </div>
  );
}
