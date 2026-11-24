import { useAiOn } from "@/ai/useAi";
import { useDesign, useUi } from "@/app/store";
import { useSnapshot } from "@/examples/store";
import type { Row } from "@/design/types";

import { AnnotationLayer } from "./AnnotationLayer";
import { Spark, trendPath } from "./Spark";
import { StripPath, stripWindow } from "./Strip";

import {
  MIN_LABEL_HEIGHT_PX, gainText, niceTicks, thinTicks, trendRange, trendY, waveTransform,
  type WaveScale,
} from "./traceScale";
import { useSize } from "./useSize";
import { XScaleButton } from "./XScaleButton";
import { xScaleFor } from "./xScale";

const GUTTER = 44;          // room for the axis labels and the calibration bar
const LABEL = 10.5;         // px, the smallest text on a trace

/**
 * The reference marks of a trace, with no signal in them: the dashed baseline, the
 * axis in the trace's units, the 1 mV calibration bar and the one-second bar.
 *
 * Drawn in the row's colour. It fills the trace area under the row's name, so it
 * can never cover the name. M2 draws the waveform or trend INSIDE this frame using
 * `waveTransform` (or `trendY`) from ./traceScale, so the marks and the signal are
 * always at the same scale. Nothing here is data: an empty frame is honest.
 *
 * `mini` is the small form for small modules: the baseline or gridlines only, with no axis,
 * calibration bar, gain or x scale. Bar and event rows have no frame. Which marks show is the design's `traces`
 * section; a row too short for labels still gets the baseline.
 */
export function TraceFrame({ row, mini = false }: { row: Row; mini?: boolean }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const pxPerMm = useUi((s) => s.pxPerMm);
  const local = useUi((s) => s.xScale);
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const snapshot = useSnapshot();
  const aiOn = useAiOn(row) && design.ai.show_trace_annotations;
  const cfg = design.traces;
  const wanted = row.trace === "waveform" || row.trace === "trend";
  if (!wanted) return <div className="trace-area" ref={ref} data-testid={`trace-${row.id}`} />;

  const labels = !mini && cfg.show_scale && h >= MIN_LABEL_HEIGHT_PX;
  const gutter = !mini && (labels || (cfg.show_calibration_bar && h >= MIN_LABEL_HEIGHT_PX)) ? GUTTER : 0;
  const right = w - 6;
  // Room the x scale number takes at the bottom right, so the gain sits beside it.
  const xs = mini ? null : xScaleFor(row, design, local);
  const xWidth = (xs?.label.length ?? 0) * 6 + 18;
  const children: React.ReactNode[] = [];
  let meta: Record<string, string | number | boolean> = {};

  if (w > 0 && h > 0) {
    if (row.trace === "waveform" && row.waveform) {
      const wf = registry.waveforms[row.waveform]!;
      const scale = wf.scale as WaveScale;
      const t = waveTransform({ heightPx: h, scale, preferredGain: design.traces.ecg_gain_mm_per_mv, pxPerMm });
      meta = { "data-gain": t.gainMmPerUnit ?? "", "data-px-per-unit": t.pxPerUnit.toFixed(3),
               "data-baseline-y": t.baselineY.toFixed(2), "data-fitted": t.fitted };

      if (cfg.show_baseline) {
        children.push(<line key="base" className="trace-baseline" data-testid={`trace-baseline-${row.id}`}
                            x1={gutter} x2={right} y1={t.baselineY} y2={t.baselineY} />);
      }
      if (labels) {
        const ticks = thinTicks(niceTicks(scale.range[0], scale.range[1], 3), t.pxPerUnit);
        children.push(<text key="unit" className="trace-label trace-unit" x={2} y={LABEL}>{scale.unit}</text>);
        ticks.forEach((v) => {
          const y = t.y(v);
          children.push(<line key={`t${v}`} className="trace-tick" x1={GUTTER - 14} x2={GUTTER - 10} y1={y} y2={y} />);
          if (Math.abs(y - LABEL) > 8) {
            children.push(<text key={`l${v}`} className="trace-label" x={GUTTER - 17} y={y + 3.5} textAnchor="end">{v}</text>);
          }
        });
      }
      if (!mini && cfg.show_calibration_bar && t.unitBarPx != null && h >= MIN_LABEL_HEIGHT_PX) {
        const x = GUTTER - 6;
        const y0 = t.baselineY, y1 = t.baselineY - t.unitBarPx;
        children.push(
          <g key="bar" data-testid={`trace-bar-${row.id}`} data-px={t.unitBarPx.toFixed(3)} className="trace-bar">
            <line x1={x} x2={x} y1={y0} y2={y1} />
            <line x1={x - 3} x2={x + 3} y1={y0} y2={y0} />
            <line x1={x - 3} x2={x + 3} y1={y1} y2={y1} />
            <text className="trace-label" x={x + 5} y={(y0 + y1) / 2 + 3.5}>1 mV</text>
          </g>);
      }
      const gain = gainText(t);
      if (!mini && cfg.show_scale && gain && h >= MIN_LABEL_HEIGHT_PX) {
        // Just the gain, in thin light text, to the left of the x scale number.
        const x = cfg.show_time_scale ? right - xWidth : right;
        children.push(
          <text key="gain" className="trace-label trace-gain" data-testid={`trace-gain-${row.id}`}
                x={x} y={h - 0.5} textAnchor="end">{gain}</text>);
      }
      // The signal itself, at the same vertical scale as the marks above.
      const strip = snapshot?.strips.find((s) => s.waveform === row.waveform);
      if (strip && !mini) {
        const win = stripWindow(strip, { x0: gutter + (cfg.show_calibration_bar && t.unitBarPx != null ? 30 : 2), x1: right, speedMmPerS: xs?.value ?? design.sweep.speed_mm_s, pxPerMm });
        children.push(<StripPath key="signal" strip={strip} w={win} y={t.y} heightPx={h} rowId={row.id} />);
        children.push(<AnnotationLayer key="marks" marks={strip.marks} w={win} height={h} aiOn={aiOn} rowId={row.id} />);
      }
    } else if (row.trace === "trend" && row.parameter) {
      const p = registry.parameters[row.parameter]!;
      const range = trendRange(p);
      meta = { "data-range": range.map((x) => x.toFixed(1)).join(",") };
      const pxPerUnit = (h - 6) / (range[1] - range[0]);
      const ticks = thinTicks(niceTicks(range[0], range[1], 3), pxPerUnit);
      if (labels) {
        children.push(<text key="unit" className="trace-label trace-unit" x={2} y={LABEL}>{p.unit}</text>);
      }
      ticks.forEach((v) => {
        const y = trendY(v, range, h);
        children.push(<line key={`g${v}`} className="trace-grid" x1={gutter} x2={right} y1={y} y2={y} />);
        if (labels && Math.abs(y - LABEL) > 8) {
          children.push(<text key={`l${v}`} className="trace-label" x={GUTTER - 6} y={y + 3.5} textAnchor="end">{v}</text>);
        }
      });
      const series = snapshot?.trends[row.parameter];
      if (series && !mini && series.points.length > 1) {
        const d = trendPath(series.points, gutter + 2, right, xs?.value ?? row.trend_window_min,
                            (v) => trendY(v, range, h));
        if (d) children.push(<path key="trend" className="trace-signal" data-testid={`trace-signal-${row.id}`} d={d} />);
      }
    }
    // Small modules: a spark of the item's trend in place of the full trace.
    const sparkParam = row.parameter;
    const spark = mini && sparkParam ? snapshot?.trends[sparkParam] : undefined;
    if (spark) children.push(<Spark key="spark" points={spark.points} w={w} h={h} windowMin={Math.min(row.trend_window_min, 240)} rowId={row.id} />);
  }

  return (
    <div className={`trace-area${mini ? " trace-mini" : ""}`} ref={ref} data-testid={`trace-${row.id}`}>
      {w > 0 && h > 0 && (
        <svg className="trace-frame" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"
             data-testid={`trace-frame-${row.id}`} {...meta}>
          {children}
        </svg>
      )}
      {!mini && cfg.show_time_scale && <XScaleButton row={row} />}
    </div>
  );
}
