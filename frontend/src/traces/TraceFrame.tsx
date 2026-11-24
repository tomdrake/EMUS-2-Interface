import { useAiOn } from "@/ai/useAi";
import { useDesign, useUi } from "@/app/store";
import { useSnapshot } from "@/examples/store";
import type { Row } from "@/design/types";

import { AnnotationLayer } from "./AnnotationLayer";
import { BpLayer, TempKey, bpExtent, bpRange, keySize, TempLayer, bpDots, keyCorner, lineSamples, tempDots } from "./Discrete";
import { Spark, trendPath } from "./Spark";
import { StripPath, fullWindow, stripWindow, sweepMotion } from "./Strip";
import {
  MIN_LABEL_HEIGHT_PX, gainText, niceTicks, thinTicks, trendRange, trendY, waveTransform,
  type WaveScale,
} from "./traceScale";
import { useSize } from "./useSize";
import { XScaleButton } from "./XScaleButton";
import { windowLabel, xScaleFor } from "./xScale";

const GUTTER = 44;          // room for the axis labels and the calibration bar
const AXIS_RIGHT = 52;      // room for a right-hand axis (the SpO2 % trend over the pleth)
const LABEL = 10.5;         // px, the smallest text on a trace
const TREND_PAD = 16;       // keeps the top and bottom tick labels clear of the unit
const padFor = (h: number) => (h >= 90 ? TREND_PAD : 7);
const MIN_X_PX = 30;        // a trace area shorter than this has no room for the x scale number
const X_STRIP = 14;         // room under the plot for the x scale number, so no line ever runs under it

/**
 * The marks of a trace and, when the screen has data, the signal in them.
 *
 * Reference marks, in the row's colour: the dashed baseline, the axis in the trace's units, the 1 mV
 * calibration bar and the x scale as a number. The signal is drawn at the same vertical scale, so the
 * marks and the signal agree by construction.
 *
 * A waveform sweeps: the whole strip is drawn once and slid across at the sweep speed (a looping CSS
 * animation, so the page does no work per frame), with the AI overview's boxes in the same group so they
 * travel with the beats. It holds still with reduced motion and while the layout is being edited.
 *
 * A pleth row also draws the SpO2 trend against a right-hand axis of 50 to 100 %. Blood pressure is a dot
 * at each MAP with a tail to the systolic and diastolic values, joined by a dashed line; measured
 * temperatures are dots on a dashed line, drawn with the continuous skin trace and a small key.
 *
 * `mini` is the small form for small modules: a spark, no axes, calibration bar or gain.
 */
export function TraceFrame({ row, mini = false }: { row: Row; mini?: boolean }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const pxPerMm = useUi((s) => s.pxPerMm);
  const local = useUi((s) => s.xScale);
  const overlay = useUi((s) => s.aiOverlay);
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const snapshot = useSnapshot();
  const aiOn = useAiOn(row) && design.ai.show_trace_annotations;
  const cfg = design.traces;
  const wanted = row.trace === "waveform" || row.trace === "trend";
  if (!wanted) return <div className="trace-area" ref={ref} data-testid={`trace-${row.id}`} />;

  const wf = row.trace === "waveform" && row.waveform ? registry.waveforms[row.waveform] : undefined;
  const overlayParam = !mini && wf?.overlay_parameter ? registry.parameters[wf.overlay_parameter] : undefined;
  const labels = !mini && cfg.show_scale && h >= MIN_LABEL_HEIGHT_PX;
  const gutter = !mini && (labels || (cfg.show_calibration_bar && h >= MIN_LABEL_HEIGHT_PX)) ? GUTTER : 0;
  const right = w - 6;
  const plotRight = right - (overlayParam ? AXIS_RIGHT : 0);
  // Room the x scale number takes at the bottom right, so the gain sits beside it.
  const xs = xScaleFor(row, design, local, mini);
  // The plot stops above the x scale number: every line and box is drawn inside it.
  const plotH = cfg.show_time_scale && h >= MIN_X_PX ? h - X_STRIP : h;
  const xWidth = (xs?.label.length ?? 0) * 6 + 18;
  const children: React.ReactNode[] = [];
  let meta: Record<string, string | number | boolean> = {};
  const now = snapshot?.generated_at;

  if (w > 0 && h > 0) {
    if (wf && row.waveform) {
      const scale = wf.scale as WaveScale;
      // An uncalibrated trace fills its height, so its end labels need room inside it.
      const t = waveTransform({ heightPx: plotH, scale, preferredGain: design.traces.ecg_gain_mm_per_mv, pxPerMm, padPx: scale.calibrated ? 3 : 10 });
      meta = { "data-gain": t.gainMmPerUnit ?? "", "data-px-per-unit": t.pxPerUnit.toFixed(3),
               "data-baseline-y": t.baselineY.toFixed(2), "data-fitted": t.fitted };

      if (cfg.show_baseline) {
        children.push(<line key="base" className="trace-baseline" data-testid={`trace-baseline-${row.id}`}
                            x1={gutter} x2={plotRight} y1={t.baselineY} y2={t.baselineY} />);
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
        const x = cfg.show_time_scale ? plotRight - xWidth : plotRight;
        children.push(
          <text key="gain" className="trace-label trace-gain" data-testid={`trace-gain-${row.id}`}
                x={x} y={h - 3} textAnchor="end">{gain}</text>);
      }

      // The signal: the whole strip, swept across the plot, with the AI's boxes travelling with it.
      const strip = snapshot?.strips.find((s) => s.waveform === row.waveform);
      if (strip && !mini) {
        const x0 = gutter + (cfg.show_calibration_bar && t.unitBarPx != null ? 30 : 2);
        const speed = xs?.value ?? design.sweep.speed_mm_s;
        const full = fullWindow(strip, { x0, speedMmPerS: speed, pxPerMm });
        const motion = sweepMotion(strip, plotRight - x0, full.pxPerSec);
        const still = stripWindow(strip, { x0, x1: plotRight, speedMmPerS: speed, pxPerMm });
        const style = motion ? ({ "--travel": `${-motion.travelPx}px`, animationDuration: `${motion.seconds.toFixed(2)}s` } as React.CSSProperties) : undefined;
        children.push(
          <clipPath key="clip" id={`clip-${row.id}`}><rect x={x0} y={0} width={Math.max(0, plotRight - x0)} height={plotH} /></clipPath>,
          <g key="sweep-clip" clipPath={`url(#clip-${row.id})`}>
            <g key={now} className={`sweep${motion ? " is-sweeping" : ""}`} style={style} data-testid={`sweep-${row.id}`}
               data-travel={motion ? motion.travelPx.toFixed(1) : "0"} data-seconds={motion ? motion.seconds.toFixed(2) : "0"}>
              <StripPath strip={strip} w={full} y={t.y} heightPx={plotH} rowId={row.id} />
              <AnnotationLayer marks={strip.marks} w={full} height={plotH} aiOn={aiOn && overlay} rowId={row.id} interactive={false} kinds="finding" />
            </g>
          </g>,
          <AnnotationLayer key="tech" marks={strip.marks} w={still} height={plotH} aiOn={false} rowId={row.id} kinds="technical" />,
        );
      }

      // The trend of a related measurement on a right-hand axis (SpO2 % over the pleth).
      if (overlayParam && wf?.overlay_parameter) {
        const range = trendRange(overlayParam);
        // A short row has no room for a title above the ticks: the unit goes on the ticks instead.
        const roomy = plotH >= 70;
        const showAxis = h >= 34;          // a very short plot keeps the line and drops the labels
        // On a short row the axis may use the strip too, but its lowest point stays clear of the x scale number.
        const short = plotH < 34 && h >= 34;
        const y = short
          ? (v: number) => 8 + ((range[1] - v) / (range[1] - range[0])) * (h - 16)
          : (v: number) => trendY(v, range, plotH, roomy ? 20 : 9);
        // Two ticks on a short row, three on a tall one, so the labels never touch.
        const ticks = plotH >= 100 ? [range[0], (range[0] + range[1]) / 2, range[1]] : [range[0], range[1]];
        const series = snapshot?.trends[wf.overlay_parameter as keyof typeof snapshot.trends];
        children.push(
          <g key="overlay" className="overlay-axis" data-testid={`overlay-axis-${row.id}`} data-range={range.join(",")}>
            {showAxis && roomy && <text className="trace-label trace-unit" x={right} y={LABEL} textAnchor="end">{overlayParam.short} {overlayParam.unit}</text>}
            {showAxis && ticks.map((v) => (
              <g key={v}>
                <line className="trace-tick" x1={plotRight} x2={plotRight + 4} y1={y(v)} y2={y(v)} />
                <text className="trace-label" x={right} y={y(v) + 3.5} textAnchor="end" data-testid={`overlay-tick-${v}`}>{roomy ? v : `${v}${overlayParam.unit}`}</text>
              </g>
            ))}
            {series && series.points.length > 1 && (
              <path className="overlay-trend" data-testid={`overlay-trend-${row.id}`}
                    d={trendPath(series.points, gutter + 2, plotRight, row.trend_window_min, y)} />
            )}
            {showAxis && plotRight - gutter > 300 && <text className="trace-label trace-gain" data-testid={`overlay-window-${row.id}`} x={plotRight - xWidth - 16} y={h - 3} textAnchor="end">
              {overlayParam.short} Trend {windowLabel(row.trend_window_min)}</text>}
          </g>);
      }
    } else if (row.trace === "trend" && row.parameter) {
      const p = registry.parameters[row.parameter]!;
      const base = trendRange(p);
      const range = row.parameter === "bp_sys" && snapshot ? bpRange(snapshot.bp_readings, base) : base;
      meta = { "data-range": range.map((x) => x.toFixed(1)).join(",") };
      const pxPerUnit = (plotH - 2 * padFor(plotH)) / (range[1] - range[0]);
      const all = niceTicks(range[0], range[1], 3);
      let ticks = thinTicks(all, pxPerUnit);
      // Always keep the bottom and top tick when they fit, so the scale is never a single number.
      if (ticks.length < 2 && all.length >= 2 && (all[all.length - 1]! - all[0]!) * pxPerUnit >= 14) ticks = [all[0]!, all[all.length - 1]!];
      const y = (v: number) => trendY(v, range, plotH, padFor(plotH));
      if (labels) {
        children.push(<text key="unit" className="trace-label trace-unit" x={2} y={LABEL}>{p.unit}</text>);
      }
      ticks.forEach((v) => {
        children.push(<line key={`g${v}`} className="trace-grid" x1={gutter} x2={right} y1={y(v)} y2={y(v)} />);
        if (labels && Math.abs(y(v) - LABEL) > 8) {
          children.push(<text key={`l${v}`} className="trace-label" x={GUTTER - 6} y={y(v) + 3.5} textAnchor="end">{v}</text>);
        }
      });
      const windowMin = xs?.value ?? row.trend_window_min;
      // Discrete marks keep clear of the edges so their numbers are never cut off.
      const frame = { x0: gutter + 24, x1: right - 24, windowMin, y };
      if (!mini && snapshot && now) {
        if (row.parameter === "bp_sys") {
          const dots = bpDots(snapshot.bp_readings, now, frame);
          children.push(<BpLayer key="bp" dots={dots} rowId={row.id} plotH={plotH} />);
          if (!dots.length) children.push(<text key="none" className="trace-label" x={(frame.x0 + frame.x1) / 2} y={plotH / 2} textAnchor="middle">No Reading</text>);
        } else {
          const series = snapshot.trends[row.parameter as keyof typeof snapshot.trends];
          if (series && series.points.length > 1) {
            const d = trendPath(series.points, gutter + 2, right, windowMin, y);
            if (d) children.push(<path key="trend" className="trace-signal" data-testid={`trace-signal-${row.id}`} d={d} />);
          }
          if (row.parameter === "temp") {
            const dots = tempDots(snapshot.temp_readings, now, frame);
            children.push(<TempLayer key="temp" dots={dots} rowId={row.id} />);
            if (dots.length && series && series.points.length > 1) {
              // Points along the dashed line count too, so the key never sits on a segment.
              const pts = [...dots, ...lineSamples(dots), ...series.points.filter((q) => q.t >= -windowMin).map((q) => ({ x: gutter + 2 + ((q.t + windowMin) / windowMin) * (right - gutter - 2), y: y(q.v) }))];
              const plot = { x0: frame.x0, x1: frame.x1, h: plotH };
              children.push(<TempKey key="key" corner={keySize(plotH).compact && plotH < h ? "strip" : keyCorner(pts, plot, keySize(plotH))} plot={plot} rowId={row.id} />);
            }
          }
        }
      }
    }
    // Small modules: a spark of the item's trend in place of the full trace, over the same window as its x scale.
    // Blood pressure is dots at the MAP with tails and numbers when the module is tall enough, dots and a dashed line when not.
    const sparkParam = row.parameter;
    if (mini && sparkParam && snapshot && now) {
      const windowMin = xs?.value ?? Math.min(row.trend_window_min, 240);
      if (sparkParam === "bp_sys") {
        const roomy = plotH >= 56 && w >= 110;
        const ext = bpExtent(snapshot.bp_readings.filter((r) => (Date.parse(now) - Date.parse(r.at)) / 60000 <= windowMin));
        const lo = ext ? ext[0] : 60, hi = ext ? ext[1] : 140;
        const top = roomy ? 14 : 4, bottom = roomy ? 16 : 4;
        const span = Math.max(hi - lo, 10);
        const y = (v: number) => top + ((hi - v) / span) * (plotH - top - bottom);
        const padX = roomy ? 24 : 6;
        const dots = bpDots(snapshot.bp_readings, now, { x0: padX, x1: w - padX, windowMin, y });
        children.push(<BpLayer key="spark-bp" dots={dots} rowId={row.id} tails={roomy} plotH={plotH} />);
      } else {
        const spark = snapshot.trends[sparkParam as keyof typeof snapshot.trends];
        if (spark) children.push(<Spark key="spark" points={spark.points} w={w} h={plotH} windowMin={windowMin} rowId={row.id} />);
      }
    }
  }

  return (
    <div className={`trace-area${mini ? " trace-mini" : ""}${overlayParam ? " has-axis" : ""}`} ref={ref} data-testid={`trace-${row.id}`}>
      {w > 0 && h > 0 && (
        <svg className="trace-frame" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"
             data-testid={`trace-frame-${row.id}`} {...meta}>
          {children}
        </svg>
      )}
      {cfg.show_time_scale && (!mini || h >= MIN_X_PX) && <XScaleButton row={row} spark={mini} />}
    </div>
  );
}
