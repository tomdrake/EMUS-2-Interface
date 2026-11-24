import { Certainty } from "@/ai/Certainty";
import { pickCertainty } from "@/ai/certainty";
import { useDesign, useUi } from "@/app/store";
import type { ExampleSnapshot, Forecast } from "@/contracts/types.gen";
import { fmtTime, useFormats } from "@/design/datetime";
import { paramVar } from "@/design/theme";
import type { Design, WidgetOf } from "@/design/types";
import { useSnapshot } from "@/examples/store";
import { FAN_PAD, TrendFan, axisMarks, markText, type FanPoint } from "@/traces/TrendFan";
import { useSize } from "@/traces/useSize";

import { Toggle, usePredictShow } from "./ForecastPanel";
import { RISK_COLOUR } from "./ModuleDetails";

const OBSERVATIONS = ["hr", "rr", "spo2", "bp_sys", "temp"] as const;
const baseline = (all: readonly Forecast[], parameter: string) => all.find((f) => f.parameter === parameter && f.scenario === "baseline");

/** A forecast's points as the fan draws them (minutes from now, with their intervals). */
export function fanPoints(f: Forecast | undefined, maxMin: number): FanPoint[] {
  const iv = (p: Forecast["points"][number], k: string) => p.intervals[k] as unknown as [number, number];
  return (f?.points ?? []).filter((p) => p.horizon_min <= maxMin).map((p) => ({ t: p.horizon_min, v: p.value, i50: iv(p, "50"), i80: iv(p, "80"), i95: iv(p, "95") }));
}

/** The hours marked under the last chart, on the same scale as every chart above it. */
function TimeAxis({ tMin, tMax, nowIso }: { tMin: number; tMax: number; nowIso: string }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const formats = useFormats();
  const plotL = FAN_PAD.l, plotR = Math.max(plotL + 1, w - FAN_PAD.r);
  const x = (t: number) => plotL + ((t - tMin) / (tMax - tMin)) * (plotR - plotL);
  return (
    <div className="pt-axis" ref={ref} data-testid="pt-axis" data-min={tMin} data-max={tMax}>
      {w > 0 && axisMarks(tMin, tMax).map((t) => (
        <span key={t} className={`pt-mark${t === 0 ? " is-now" : ""}`} style={{ left: x(t) }} data-testid={`pt-mark-${t}`}>
          <b>{markText(t)}</b><small>{fmtTime(new Date(Date.parse(nowIso) + t * 60000), formats)}</small>
        </span>
      ))}
    </div>
  );
}

/**
 * The prediction overlay's right half: the trends with their predicted future, on one time axis from `back_hours`
 * before now to `ahead_hours` (up to 8) after it. The future NEWS over time comes first (charted totals, the predicted
 * total with 50, 80 and 95 % intervals, the risk lines at 5 and 7), then heart rate, respiration, SpO2, systolic blood
 * pressure and temperature, each with its history, prediction, intervals and certainty. The three switches are the
 * Prediction view's own.
 */
export function PredictionTrends({ widget }: { widget: WidgetOf<"prediction-trends"> }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const snapshot = useSnapshot();
  const { show, set } = usePredictShow(widget);
  const cfg = design.forecast.certainty;
  const tMin = -widget.back_hours * 60, tMax = widget.ahead_hours * 60;

  const toggles = (
    <div className="fp-toggles pt-toggles" role="group" aria-label="What the predicted trends show">
      <Toggle id="news" label="Future NEWS" on={show.news} onChange={(v) => set("news", v)} />
      <Toggle id="obs" label="Observation Predictions" on={show.obs} onChange={(v) => set("obs", v)} />
      <Toggle id="certainty" label="Certainty" on={show.certainty} onChange={(v) => set("certainty", v)} />
    </div>
  );
  if (!snapshot) return <div className="prediction-trends" data-testid="prediction-trends">{toggles}<p className="demo-note" data-prose data-testid="pt-empty">No prediction to show. Turn on example data in Demo Controls.</p></div>;
  return <Trends snapshot={snapshot} cfg={cfg} registry={registry} show={show} tMin={tMin} tMax={tMax} toggles={toggles} />;
}

function Trends({ snapshot, cfg, registry, show, tMin, tMax, toggles }: {
  snapshot: ExampleSnapshot; cfg: Design["forecast"]["certainty"]; registry: NonNullable<ReturnType<typeof useUi.getState>["registry"]>;
  show: { news: boolean; obs: boolean; certainty: boolean }; tMin: number; tMax: number; toggles: React.ReactNode;
}) {
  const formats = useFormats();
  const nowMs = Date.parse(snapshot.generated_at);
  const fc = snapshot.forecast.forecasts;
  const certaintyOf = (f?: Forecast) => (f ? pickCertainty(f.certainty, cfg.metric) : null);
  const tooUncertain = (f?: Forecast) => { const c = certaintyOf(f); return !!c && c.score < cfg.min_to_show; };
  const mark = (f: Forecast | undefined, id: string) => {
    const c = certaintyOf(f);
    return show.certainty && c ? <span className="fp-certainty" data-testid={`pt-certainty-${id}`}><Certainty value={c} cfg={cfg} registry={registry} showName={false} /></span> : null;
  };
  const maxMin = tMax;

  const news = baseline(fc, "news2");
  const newsFuture = fanPoints(news, maxMin);
  const newsPast = snapshot.obs_sets.map((s) => ({ t: (Date.parse(s.at) - nowMs) / 60000, v: s.news2_total ?? 0 })).filter((p) => p.t >= tMin && p.t <= 0);
  const endNews = newsFuture[newsFuture.length - 1];

  const header = (name: string, unit: string, now: string | number | null | undefined, end: FanPoint | undefined, dec: number, f: Forecast | undefined, id: string, hiddenNote: boolean) => (
    <header className="pt-head">
      <span className="pt-name">{name} <small>{unit}</small></span>
      <span className="pt-values" data-testid={`pt-values-${id}`}>
        Now <b>{now == null || now === "" ? "-" : typeof now === "number" ? now.toFixed(dec) : now}</b>
        {end && !hiddenNote && <> <span aria-hidden="true">to</span> {markText(end.t)} <b>{end.v.toFixed(dec)}</b></>}
        {hiddenNote && <span className="pt-hidden" data-testid={`pt-hidden-${id}`}> Prediction Hidden</span>}
      </span>
      {mark(f, id)}
    </header>
  );

  return (
    <div className="prediction-trends" data-testid="prediction-trends" data-ahead={tMax / 60} data-back={-tMin / 60}>
      {toggles}
      <p className="fp-note" data-prose>Predictions from example data, shaded 80 % and 95 % intervals; not measurements.</p>
      <div className="pt-stack">
        {show.news && (
          <section className="pt-chart pt-news" data-testid="pt-news" style={{ flexGrow: 1.5 }}>
            {header("Future NEWS", "total", snapshot.news2.total, endNews, 0, news, "news", tooUncertain(news))}
            <TrendFan testId="pt-news-chart" series={{ past: newsPast, now: snapshot.news2.total, future: newsFuture }} tMin={tMin} tMax={tMax}
                      colour={RISK_COLOUR[snapshot.news2.risk ?? "low"] === "currentColor" ? "var(--c-accent)" : RISK_COLOUR[snapshot.news2.risk ?? "low"]!}
                      lines={[5, 7]} yFloor={0} yCeil={8} hidden={tooUncertain(news)} label="NEWS2 over time with its prediction" />
          </section>
        )}
        {show.obs && OBSERVATIONS.map((pid) => {
          const p = registry.parameters[pid];
          const f = baseline(fc, pid);
          if (!p) return null;
          const dec = p.decimals ?? 0;
          const future = fanPoints(f, maxMin);
          const trend = snapshot.trends[pid as keyof typeof snapshot.trends];
          const now = (snapshot.numerics as Record<string, number | string | null>)[pid];
          const hidden = tooUncertain(f);
          return (
            <section key={pid} className="pt-chart" data-testid={`pt-${pid}`} data-hidden={hidden || undefined}>
              {header(p.short, p.unit, typeof now === "number" ? now : null, future[future.length - 1], dec, f, pid, hidden)}
              <TrendFan testId={`pt-${pid}-chart`} series={{ past: (trend?.points ?? []).filter((q) => q.t >= tMin).map((q) => ({ t: q.t, v: q.v })), now: typeof now === "number" ? now : null, future }}
                        tMin={tMin} tMax={tMax} colour={paramVar(pid)} unit={p.unit} decimals={dec} hidden={hidden} label={`${p.label} with its prediction`} />
            </section>
          );
        })}
        {!show.news && !show.obs && <p className="demo-note" data-prose data-testid="pt-nothing">Nothing selected. Turn on Future NEWS or Observation Predictions.</p>}
      </div>
      <TimeAxis tMin={tMin} tMax={tMax} nowIso={snapshot.generated_at} />
      <span className="sr-only" aria-hidden="true">{fmtTime(snapshot.generated_at, formats)}</span>
    </div>
  );
}
