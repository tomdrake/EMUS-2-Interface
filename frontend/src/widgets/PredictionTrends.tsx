import { Certainty } from "@/ai/Certainty";
import { pickCertainty } from "@/ai/certainty";
import { useDesign, useUi } from "@/app/store";
import type { ExampleSnapshot, Forecast } from "@/contracts/types.gen";
import { fmtTime, useFormats } from "@/design/datetime";
import { paramVar } from "@/design/theme";
import type { Design, WidgetOf } from "@/design/types";
import { useSnapshot } from "@/examples/store";
import { BpTrendFan, FAN_PAD, TrendFan, axisMarks, markText, type BpLine, type FanPoint } from "@/traces/TrendFan";
import { useSize } from "@/traces/useSize";

import { Toggle, riskOfTotal, usePredictShow } from "./ForecastPanel";
import { RISK_COLOUR } from "./ModuleDetails";

const baseline = (all: readonly Forecast[], parameter: string) => all.find((f) => f.parameter === parameter && f.scenario === "baseline");

/** A forecast's points as the fan draws them (minutes from now, with their intervals). */
export function fanPoints(f: Forecast | undefined, maxMin: number): FanPoint[] {
  const iv = (p: Forecast["points"][number], k: string) => p.intervals[k] as unknown as [number, number];
  return (f?.points ?? []).filter((p) => p.horizon_min <= maxMin).map((p) => ({ t: p.horizon_min, v: p.value, i50: iv(p, "50"), i80: iv(p, "80"), i95: iv(p, "95") }));
}

/** The rows of the monitor on the left, in order, with the observation each one predicts: the charts here are the same height as those rows. */
const ALIGNED = [{ row: "ecg", pid: "hr" }, { row: "spo2", pid: "spo2" }, { row: "resp", pid: "rr" }, { row: "bp", pid: "bp_sys" }, { row: "temp", pid: "temp" }] as const;
/** A box of the NEWS2 strip: a total at a time (minutes from now), charted, now or predicted. */
interface NewsBox { t: number; total: number; kind: "past" | "now" | "future"; range?: [number, number]; confidence?: number }

/**
 * The bottom of the predicted trends, level with the NEWS2 row of the monitor: the NEWS2 total in a box at each time it was
 * charted or is predicted (a dashed box is a prediction), and under the boxes the hours of the shared time axis. Boxes and
 * hours use the same x scale as every chart above them, so a box sits under the same moment as the traces.
 */
function NewsStrip({ boxes, tMin, tMax, nowIso, showBoxes, hidden, showConfidence }: {
  boxes: NewsBox[]; tMin: number; tMax: number; nowIso: string; showBoxes: boolean; hidden: boolean; showConfidence: boolean;
}) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const formats = useFormats();
  const plotL = FAN_PAD.l, plotR = Math.max(plotL + 1, w - FAN_PAD.r);
  const x = (t: number) => plotL + ((t - tMin) / (tMax - tMin)) * (plotR - plotL);
  const perHour = (plotR - plotL) / ((tMax - tMin) / 60);
  const boxW = Math.max(26, Math.min(44, Math.floor(perHour * 0.9)));
  const showRange = boxW >= 38;
  // the box for now is always drawn; the others are dropped where they would sit on one already drawn
  const kept: NewsBox[] = [];
  for (const b of [...boxes].sort((p, q) => Math.abs(p.t) - Math.abs(q.t))) if (kept.every((k) => Math.abs(x(k.t) - x(b.t)) >= boxW + 2)) kept.push(b);
  return (
    <div className="pt-newsstrip" ref={ref} data-testid="pt-newsstrip">
      <div className="pt-boxes" data-testid="pt-boxes">
        <span className="pt-boxname">NEWS2</span>
        {w > 0 && showBoxes && kept.map((b) => {
          const risk = riskOfTotal(b.total);
          const left = x(b.t) - boxW / 2;
          return (
            <span key={`${b.kind}-${b.t}`} className="pt-boxcol" style={{ left, width: boxW }}>
              <span className={`pt-box is-${b.kind}`} data-testid={`pt-box-${b.t}`} data-value={b.total} data-kind={b.kind} data-risk={risk} style={{ color: RISK_COLOUR[risk] }}
                    title={`NEWS2 ${b.total}${b.range ? `, range ${b.range[0]} to ${b.range[1]}` : ""}${b.kind === "future" ? ", predicted from example data" : ""}`}>
                <b>{b.total}</b>
                {showRange && b.range && <small>{b.range[0]}-{b.range[1]}</small>}
              </span>
              {showConfidence && b.confidence != null && (
                <span className="pt-conf" data-testid={`pt-conf-${b.t}`} data-value={b.confidence} title="Confidence in this prediction">{Math.round(b.confidence * 100)}%</span>
              )}
            </span>
          );
        })}
        {showBoxes && hidden && <span className="pt-hidden pt-boxnote" data-testid="pt-hidden-news">Prediction Hidden</span>}
        {!showBoxes && <span className="demo-note pt-boxnote" data-prose data-testid="pt-news-off">Future NEWS is off.</span>}
        {showBoxes && showConfidence && !hidden && <span className="pt-confcap" data-testid="pt-confcap">Confidence</span>}
      </div>
      <div className="pt-axis" data-testid="pt-axis" data-min={tMin} data-max={tMax}>
        {w > 0 && axisMarks(tMin, tMax).map((t) => (
          <span key={t} className={`pt-mark${t === 0 ? " is-now" : ""}`} style={{ left: x(t) }} data-testid={`pt-mark-${t}`}>
            <b>{markText(t)}</b><small>{fmtTime(new Date(Date.parse(nowIso) + t * 60000), formats)}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The three switches of the prediction views, as a strip of their own (above the predicted trends on the overlay). */
export function PredictionSwitches({ widget }: { widget: WidgetOf<"prediction-switches"> }) {
  const { show, set } = usePredictShow(widget);
  return (
    <div className="fp-toggles pt-toggles pt-switches" role="group" aria-label="What the predicted trends show" data-testid="prediction-switches">
      <Toggle id="news" label="Future NEWS" on={show.news} onChange={(v) => set("news", v)} />
      <Toggle id="obs" label="Observation Predictions" on={show.obs} onChange={(v) => set("obs", v)} />
      <Toggle id="certainty" label="Certainty" on={show.certainty} onChange={(v) => set("certainty", v)} />
    </div>
  );
}

/**
 * The prediction overlay's right half. It lines up with the monitor on its left: one chart for each monitor row (heart rate by
 * the ECG, SpO2, respiration, blood pressure, temperature), the same height as that row, then the NEWS2 total in boxes over time
 * level with the monitor's NEWS2 row. All share one time axis from `back_hours` before now to `ahead_hours` (up to 8) after,
 * drawn along the bottom. Each chart has its history, its prediction and the 80 and 95 % intervals, and its certainty. The three
 * switches are the Prediction view's own, in a strip above (`prediction-switches`).
 */
export function PredictionTrends({ widget }: { widget: WidgetOf<"prediction-trends"> }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const snapshot = useSnapshot();
  const { show } = usePredictShow(widget);
  const cfg = design.forecast.certainty;
  const tMin = -widget.back_hours * 60, tMax = widget.ahead_hours * 60;
  if (!snapshot) return <div className="prediction-trends" data-testid="prediction-trends"><p className="demo-note" data-prose data-testid="pt-empty">No prediction to show. Turn on example data in Demo Controls.</p></div>;
  return <Trends snapshot={snapshot} cfg={cfg} registry={registry} show={show} tMin={tMin} tMax={tMax} />;
}

function Trends({ snapshot, cfg, registry, show, tMin, tMax }: {
  snapshot: ExampleSnapshot; cfg: Design["forecast"]["certainty"]; registry: NonNullable<ReturnType<typeof useUi.getState>["registry"]>;
  show: { news: boolean; obs: boolean; certainty: boolean }; tMin: number; tMax: number;
}) {
  const design = useDesign()!;
  const nowMs = Date.parse(snapshot.generated_at);
  const fc = snapshot.forecast.forecasts;
  const certaintyOf = (f?: Forecast) => (f ? pickCertainty(f.certainty, cfg.metric) : null);
  const tooUncertain = (f?: Forecast) => { const c = certaintyOf(f); return !!c && c.score < cfg.min_to_show; };
  const mark = (f: Forecast | undefined, id: string) => {
    const c = certaintyOf(f);
    return show.certainty && c ? <span className="fp-certainty" data-testid={`pt-certainty-${id}`}><Certainty value={c} cfg={cfg} registry={registry} showName={false} /></span> : null;
  };
  // each chart takes the share of height its monitor row takes, so the two halves line up
  const weight = (rowId: string) => design.rows.find((r) => r.id === rowId)?.height_scale ?? 1;

  const news = baseline(fc, "news2");
  // the certainty of this forecast at one horizon, in the design's chosen metric (the forecast's own figure for a metric that does not change with the horizon)
  const confidenceAt = (f: Forecast | undefined, t: number): number | undefined => {
    const pt = f?.points.find((q) => q.horizon_min === t);
    const c = pickCertainty(pt?.certainty?.length ? pt.certainty : (f?.certainty ?? []), cfg.metric);
    return c ? Math.min(1, Math.max(0, c.score)) : undefined;
  };
  const newsHidden = tooUncertain(news);
  const horizons = design.forecast.horizons_min as readonly number[];
  const boxes: NewsBox[] = [
    { t: 0, total: snapshot.news2.total ?? 0, kind: "now" },
    ...snapshot.obs_sets.filter((s) => s.news2_total != null).map((s) => ({ t: Math.round((Date.parse(s.at) - nowMs) / 60000), total: s.news2_total as number, kind: "past" as const }))
      .filter((b) => b.t >= tMin && b.t < 0),
    ...(newsHidden ? [] : fanPoints(news, tMax).filter((p) => horizons.includes(p.t)).map((p) => ({ t: p.t, total: Math.round(p.v), kind: "future" as const, range: [Math.round(p.i80[0]), Math.round(p.i80[1])] as [number, number],
                                                                    confidence: confidenceAt(news, p.t) }))),
  ];

  const header = (name: string, unit: string, now: string | number | null | undefined, end: FanPoint | undefined, dec: number, id: string, hiddenNote: boolean) => (
    <span className="pt-values" data-testid={`pt-values-${id}`}>
      <span className="pt-name">{name} <small>{unit}</small></span>{" "}Now <b>{now == null || now === "" ? "-" : typeof now === "number" ? now.toFixed(dec) : now}</b>
      {end && !hiddenNote && <> <span aria-hidden="true">to</span> {markText(end.t)} <b>{end.v.toFixed(dec)}</b></>}
      {hiddenNote && <span className="pt-hidden" data-testid={`pt-hidden-${id}`}> Prediction Hidden</span>}
    </span>
  );

  return (
    <div className="prediction-trends" data-testid="prediction-trends" data-ahead={tMax / 60} data-back={-tMin / 60}>
      <div className="pt-stack">
        {show.obs ? ALIGNED.map(({ row, pid }) => {
          const p = registry.parameters[pid];
          const f = baseline(fc, pid);
          if (!p) return null;
          const dec = p.decimals ?? 0;
          const future = fanPoints(f, tMax);
          const trend = snapshot.trends[pid as keyof typeof snapshot.trends];
          const now = (snapshot.numerics as Record<string, number | string | null>)[pid];
          const hidden = tooUncertain(f);
          if (pid === "bp_sys") {
            // blood pressure is drawn as on the monitor: systolic, MAP and diastolic together
            const reading = (pick: (r: ExampleSnapshot["bp_readings"][number]) => number) => snapshot.bp_readings.map((r) => ({ t: (Date.parse(r.at) - nowMs) / 60000, v: pick(r) })).filter((q) => q.t >= tMin && q.t <= 0);
            const fut = (id: string) => fanPoints(baseline(fc, id), tMax);
            const num = (id: string) => { const v = (snapshot.numerics as Record<string, number | string | null>)[id]; return typeof v === "number" ? v : null; };
            const lines: BpLine[] = [
              { key: "bp_sys", marker: "down", name: "SYS", series: { past: reading((r) => r.sys), now: num("bp_sys"), future: fut("bp_sys") } },
              { key: "bp_mean", marker: "x", name: "MAP", series: { past: reading((r) => r.map), now: num("bp_mean"), future: fut("bp_mean") } },
              { key: "bp_dia", marker: "up", name: "DIA", series: { past: reading((r) => r.dia), now: num("bp_dia"), future: fut("bp_dia") } },
            ];
            const end = (id: string) => fut(id)[fut(id).length - 1];
            const nowTxt = `${num("bp_sys") ?? "-"}/${num("bp_dia") ?? "-"} (${num("bp_mean") ?? "-"})`;
            const endTxt = end("bp_sys") && end("bp_dia") && end("bp_mean") ? `${end("bp_sys")!.v.toFixed(0)}/${end("bp_dia")!.v.toFixed(0)} (${end("bp_mean")!.v.toFixed(0)})` : null;
            return (
              <section key={pid} className="pt-chart" data-testid={`pt-${pid}`} data-row={row} data-hidden={hidden || undefined} style={{ flexGrow: weight(row) }}>
                <header className="pt-head">
                  <span className="pt-values" data-testid={`pt-values-${pid}`}>
                    <span className="pt-name">SYS/DIA (MAP) <small>{p.unit}</small></span>{" "}Now <b>{nowTxt}</b>
                    {endTxt && !hidden && <> <span aria-hidden="true">to</span> {markText(tMax)} <b>{endTxt}</b></>}
                    {hidden && <span className="pt-hidden" data-testid={`pt-hidden-${pid}`}> Prediction Hidden</span>}
                  </span>
                  {mark(f, pid)}
                </header>
                <BpTrendFan testId={`pt-${pid}-chart`} lines={lines} tMin={tMin} tMax={tMax} colour={paramVar(pid)} hidden={hidden} markersAt={[...horizons]} label="Blood pressure with its prediction: systolic, mean and diastolic" />
              </section>
            );
          }
          return (
            <section key={pid} className="pt-chart" data-testid={`pt-${pid}`} data-row={row} data-hidden={hidden || undefined} style={{ flexGrow: weight(row) }}>
              <header className="pt-head">{header(p.short, p.unit, typeof now === "number" ? now : null, future[future.length - 1], dec, pid, hidden)}{mark(f, pid)}</header>
              <TrendFan testId={`pt-${pid}-chart`} series={{ past: (trend?.points ?? []).filter((q) => q.t >= tMin).map((q) => ({ t: q.t, v: q.v })), now: typeof now === "number" ? now : null, future }}
                        tMin={tMin} tMax={tMax} colour={paramVar(pid)} unit={p.unit} decimals={dec} hidden={hidden} label={`${p.label} with its prediction`} />
            </section>
          );
        }) : (
          <p className="demo-note pt-off" data-prose data-testid="pt-nothing" style={{ flexGrow: ALIGNED.reduce((a, r) => a + weight(r.row), 0) }}>
            {show.news ? "Observation Predictions are off." : "Nothing selected. Turn on Future NEWS or Observation Predictions."}
          </p>
        )}
        <section className="pt-chart pt-news" data-testid="pt-news" style={{ flexGrow: weight("news") }}>
          <NewsStrip boxes={boxes} tMin={tMin} tMax={tMax} nowIso={snapshot.generated_at} showBoxes={show.news} hidden={newsHidden} showConfidence={show.certainty} />
        </section>
      </div>
    </div>
  );
}
