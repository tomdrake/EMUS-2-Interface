import { useUi } from "@/app/store";
import type { ExampleStrip, TimedValue } from "@/contracts/types.gen";
import { AnnotationLayer } from "@/traces/AnnotationLayer";
import { sparkPath } from "@/traces/Spark";
import { StripPath, stripWindow, xAtSec } from "@/traces/Strip";
import { gainText, waveTransform, type WaveScale } from "@/traces/traceScale";
import { useSize } from "@/traces/useSize";

const H = 128;
const GUTTER = 64;

/**
 * An ECG strip with its marks, at the same scale as the monitor's trace (the calibration bar is
 * exactly 1 mV at the gain drawn). Used for what the AI saw and for the patient's own normal
 * rhythm beside it. The sweep is fixed at 25 mm/s so two strips are directly comparable.
 */
export function EvidenceStrip({ strip, caption, testId }: { strip: ExampleStrip; caption: string; testId: string }) {
  const registry = useUi((s) => s.registry)!;
  const pxPerMm = useUi((s) => s.pxPerMm);
  const [ref, { w }] = useSize<HTMLDivElement>();
  const scale = registry.waveforms[strip.waveform]!.scale as WaveScale;
  const t = waveTransform({ heightPx: H, scale, preferredGain: 10, pxPerMm });
  const win = stripWindow(strip, { x0: GUTTER, x1: Math.max(w - 6, GUTTER + 10), speedMmPerS: 25, pxPerMm });
  const gain = gainText(t);
  return (
    <figure className="evidence" data-testid={testId}>
      <figcaption>{caption}</figcaption>
      <div ref={ref} className="evidence-strip" style={{ height: H }}>
        {w > 0 && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={caption}>
            <line className="trace-baseline" x1={GUTTER} x2={Math.min(w - 6, xAtSec(win, strip.seconds))} y1={t.baselineY} y2={t.baselineY} />
            {t.unitBarPx != null && (
              <g className="trace-bar" data-px={t.unitBarPx.toFixed(2)} data-testid={`${testId}-bar`}>
                <line x1={GUTTER - 12} x2={GUTTER - 12} y1={t.baselineY} y2={t.baselineY - t.unitBarPx} />
                <line x1={GUTTER - 15} x2={GUTTER - 9} y1={t.baselineY} y2={t.baselineY} />
                <line x1={GUTTER - 15} x2={GUTTER - 9} y1={t.baselineY - t.unitBarPx} y2={t.baselineY - t.unitBarPx} />
                <text className="trace-label" x={GUTTER - 18} y={t.baselineY - t.unitBarPx / 2 + 3.5} textAnchor="end">1 mV</text>
              </g>
            )}
            <StripPath strip={strip} w={win} y={t.y} heightPx={H} rowId={testId} />
            <AnnotationLayer marks={strip.marks} w={win} height={H} aiOn interactive={false} rowId={testId} />
            <text className="trace-label trace-gain" x={w - 6} y={H - 2} textAnchor="end">{gain ? `${gain}  25 mm/s` : "25 mm/s"}</text>
          </svg>
        )}
      </div>
    </figure>
  );
}

/** A trend or lab series with its range written on the axis; the last value is the dot. */
export function SeriesChart({ points, unit, caption, testId, windowMin }: {
  points: readonly TimedValue[]; unit: string; caption: string; testId: string; windowMin?: number;
}) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const h = 110;
  const span = windowMin ?? Math.max(30, Math.ceil(-Math.min(0, ...points.map((p) => p.t)) / 10) * 10);
  const left = 44;
  const inner = Math.max(w - left - 6, 10);
  const { d, last } = sparkPath(points, inner, h, span);
  const vs = points.filter((p) => p.t >= -span).map((p) => p.v);
  const label = (n: number) => String(Math.round(n * 10) / 10);
  return (
    <figure className="evidence" data-testid={testId}>
      <figcaption>{caption}</figcaption>
      <div ref={ref} className="evidence-strip" style={{ height: h }}>
        {w > 0 && d && (
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={caption}>
            <g transform={`translate(${left} 0)`}>
              <path className="trace-signal" d={d} />
              {last && <circle className="trace-dot" cx={last[0]} cy={last[1]} r={3.5} />}
            </g>
            <text className="trace-label" x={left - 6} y={12} textAnchor="end">{label(Math.max(...vs))}</text>
            <text className="trace-label" x={left - 6} y={h - 6} textAnchor="end">{label(Math.min(...vs))}</text>
            <text className="trace-label trace-unit" x={2} y={12}>{unit}</text>
            <text className="trace-label" x={left} y={h - 1}>{`${span >= 120 ? `${Math.round(span / 60)} h` : `${span} min`} ago`}</text>
            <text className="trace-label" x={w - 6} y={h - 1} textAnchor="end">now</text>
          </svg>
        )}
      </div>
    </figure>
  );
}
