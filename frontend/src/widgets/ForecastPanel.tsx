import { Certainty } from "@/ai/Certainty";
import { pickCertainty } from "@/ai/certainty";
import { useDesign, useUi, type PredictBlock } from "@/app/store";
import type { Forecast } from "@/contracts/types.gen";
import { fmtTime, useFormats } from "@/design/datetime";
import type { WidgetOf } from "@/design/types";
import { useSnapshot } from "@/examples/store";
import { useSize } from "@/traces/useSize";

import { RISK_COLOUR } from "./ModuleDetails";

/** "+1 H", "+90 Min": how far ahead a prediction is. */
export const horizonText = (min: number): string => (min % 60 === 0 ? `+${min / 60} H` : `+${min} Min`);

/** The risk a predicted NEWS2 total falls in (the chart's thresholds: 5 or more medium, 7 or more high). */
export const riskOfTotal = (v: number): "low" | "medium" | "high" => (v >= 7 ? "high" : v >= 5 ? "medium" : "low");

const OBSERVATIONS = ["hr", "rr", "spo2", "bp_sys", "temp"] as const;
const baseline = (all: readonly Forecast[], parameter: string): Forecast | undefined =>
  all.find((f) => f.parameter === parameter && f.scenario === "baseline");
const range80 = (p: { intervals: Record<string, unknown> }): [number, number] => p.intervals["80"] as unknown as [number, number];

interface Past { t: number; v: number }
interface Future { t: number; v: number; lo: number; hi: number }

/** Recent values (solid) then the prediction (dashed) with its 80 % band. Time runs left to right; "now" is a dot. */
export function FanChart({ past, now, future, colour, testId }: { past: Past[]; now: number | null; future: Future[]; colour: string; testId: string }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const pts = [...past.map((p) => p.t), 0, ...future.map((f) => f.t)];
  const t0 = Math.min(...pts), t1 = Math.max(...pts);
  const vals = [...past.map((p) => p.v), ...(now != null ? [now] : []), ...future.flatMap((f) => [f.lo, f.hi])];
  const v0 = Math.min(...vals), v1 = Math.max(...vals);
  const padY = 4, padX = 4;
  const x = (t: number) => padX + ((t - t0) / Math.max(1e-6, t1 - t0)) * Math.max(1, w - 2 * padX);
  const y = (v: number) => padY + (1 - (v - v0) / Math.max(1e-6, v1 - v0)) * Math.max(1, h - 2 * padY);
  const line = (a: { t: number; v: number }[]) => a.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const start = now != null ? [{ t: 0, v: now }] : [];
  const band = future.length
    ? `M${x(0).toFixed(1)} ${y(now ?? future[0]!.v).toFixed(1)}` + future.map((f) => `L${x(f.t).toFixed(1)} ${y(f.hi).toFixed(1)}`).join("")
      + [...future].reverse().map((f) => `L${x(f.t).toFixed(1)} ${y(f.lo).toFixed(1)}`).join("") + "Z"
    : "";
  return (
    <div className="fan" ref={ref} data-testid={testId}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ color: colour }}>
          {band && <path className="fan-band" d={band} />}
          {past.length > 0 && <path className="fan-past" d={line([...past, ...start])} />}
          {future.length > 0 && <path className="fan-future" d={line([...start, ...future])} />}
          {now != null && <circle className="fan-now" cx={x(0)} cy={y(now)} r={3} />}
        </svg>
      )}
    </div>
  );
}

function Toggle({ id, label, on, onChange }: { id: PredictBlock; label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`fp-toggle${on ? " is-on" : ""}`} data-testid={`fp-toggle-${id}`}
            onClick={() => onChange(!on)}>
      <span className="fp-toggle-track" aria-hidden="true"><i /></span>
      <span className="fp-toggle-label">{label}</span>
    </button>
  );
}

/**
 * The Prediction view. Future NEWS (a cell for each horizon with its range, and a chart of the charted totals
 * running into the prediction), and the future observations (a row each for heart rate, respiration, SpO2, blood
 * pressure and temperature). Three switches turn the future NEWS, the observation predictions and the certainty on
 * and off; they are this screen's choice and start as the design says. With certainty off the numbers stand alone;
 * a prediction whose certainty is below the design's limit is not shown, and says so.
 *
 * Everything here is a prediction from example data until the causal model is connected (M7).
 */
export function ForecastPanel({ widget }: { widget: WidgetOf<"forecast-panel"> }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const local = useUi((s) => s.predictShow);
  const set = useUi((s) => s.setPredictShow);
  const snapshot = useSnapshot();
  const formats = useFormats();
  const cfg = design.forecast.certainty;
  const show = {
    news: local.news ?? widget.show_news_number,
    obs: local.obs ?? widget.show_observations,
    certainty: local.certainty ?? widget.show_certainty,
  };

  const toggles = (
    <div className="fp-toggles" role="group" aria-label="What the prediction view shows">
      <Toggle id="news" label="Future NEWS" on={show.news} onChange={(v) => set("news", v)} />
      <Toggle id="obs" label="Observation Predictions" on={show.obs} onChange={(v) => set("obs", v)} />
      <Toggle id="certainty" label="Certainty" on={show.certainty} onChange={(v) => set("certainty", v)} />
    </div>
  );
  if (!snapshot) {
    return <div className="forecast-panel" data-testid="forecast-panel">{toggles}<p className="demo-note" data-prose data-testid="fp-empty">No prediction to show. Turn on example data in Demo Controls.</p></div>;
  }

  const fc = snapshot.forecast;
  const horizons: number[] = design.forecast.horizons_min.filter((h) => fc.forecasts.some((f) => f.points.some((p) => p.horizon_min === h)));
  const certaintyOf = (f: Forecast | undefined) => (f ? pickCertainty(f.certainty, cfg.metric) : null);
  const tooUncertain = (f: Forecast | undefined) => { const c = certaintyOf(f); return !!c && c.score < cfg.min_to_show; };
  const certaintyMark = (f: Forecast | undefined, id: string, showName = false) => {
    const c = certaintyOf(f);
    return show.certainty && c ? <span className="fp-certainty" data-testid={`fp-certainty-${id}`}><Certainty value={c} cfg={cfg} registry={registry} showName={showName} /></span> : null;
  };

  // ---- future NEWS
  const news = baseline(fc.forecasts, "news2");
  const nowTotal = snapshot.news2.total;
  const sets = snapshot.obs_sets.slice(-6);
  const style = design.forecast.news_number;
  const minutesTo = fc.minutes_to_news_threshold[String(design.forecast.news_threshold)] ?? null;
  const newsBlock = show.news && (
    <section className="fp-section fp-news" data-testid="fp-news" aria-label="Future NEWS">
      <header className="fp-head"><h3>Future NEWS</h3>{certaintyMark(news, "news", true)}</header>
      {!news ? <p className="demo-note" data-prose>No NEWS prediction for this patient.</p> : tooUncertain(news)
        ? <p className="demo-note" data-prose data-testid="fp-news-hidden">Below the certainty limit, so not shown.</p> : (
        <>
          <div className="fp-cells">
            <div className="fp-cell fp-now" data-testid="fp-news-now" data-value={nowTotal ?? ""}>
              <span className="fp-when">Now</span>
              <b className="fp-big" style={{ color: RISK_COLOUR[snapshot.news2.risk ?? "low"] }}>{nowTotal ?? "-"}</b>
            </div>
            {horizons.map((hz) => {
              const p = news.points.find((x) => x.horizon_min === hz);
              if (!p) return null;
              const [lo, hi] = range80(p);
              const bands = fc.news_bands.find((b) => b.horizon_min === hz);
              return (
                <div key={hz} className="fp-cell" data-testid={`fp-news-${hz}`} data-value={p.value}>
                  <span className="fp-when">{horizonText(hz)}</span>
                  <b className="fp-big" style={{ color: RISK_COLOUR[riskOfTotal(p.value)] }}>{Math.round(p.value)}</b>
                  <span className="fp-range">{Math.round(lo)}-{Math.round(hi)}</span>
                  {style === "band-probabilities" && bands && (
                    <span className="fp-bands" data-testid={`fp-news-bands-${hz}`}>L {Math.round(bands.low * 100)}% M {Math.round(bands.medium * 100)}% H {Math.round(bands.high * 100)}%</span>
                  )}
                </div>
              );
            })}
          </div>
          {style === "time-to-threshold" && (
            <p className="fp-threshold" data-testid="fp-news-threshold">
              {minutesTo == null ? `NEWS2 ${design.forecast.news_threshold} or more is not expected in the next 6 hours.`
                : minutesTo <= 0 ? `NEWS2 is already ${design.forecast.news_threshold} or more.` : `NEWS2 ${design.forecast.news_threshold} or more is expected in about ${minutesTo} min.`}
            </p>
          )}
          <FanChart testId="fp-news-chart" colour="var(--c-accent)" now={nowTotal}
                    past={sets.map((s) => ({ t: (Date.parse(s.at) - Date.parse(snapshot.generated_at)) / 60000, v: s.news2_total ?? 0 }))}
                    future={news.points.filter((p) => horizons.includes(p.horizon_min)).map((p) => { const [lo, hi] = range80(p); return { t: p.horizon_min, v: p.value, lo, hi }; })} />
        </>
      )}
    </section>
  );

  // ---- future observations
  const obsBlock = show.obs && (
    <section className="fp-section fp-obs" data-testid="fp-obs" aria-label="Observation Predictions">
      <header className="fp-head"><h3>Observation Predictions</h3></header>
      <table className="fp-table">
        <thead>
          <tr><th scope="col">Observation</th><th scope="col">Now</th>{horizons.map((hz) => <th key={hz} scope="col">{horizonText(hz)}</th>)}{show.certainty && <th scope="col">Certainty</th>}<th scope="col" className="fp-col-chart">Trend</th></tr>
        </thead>
        <tbody>
          {OBSERVATIONS.map((pid) => {
            const f = baseline(fc.forecasts, pid);
            const p = registry.parameters[pid];
            if (!p) return null;
            const dec = p.decimals ?? 0;
            const hidden = tooUncertain(f);
            const now = (snapshot.numerics as Record<string, number | string | null>)[pid];
            const trend = snapshot.trends[pid as keyof typeof snapshot.trends];
            return (
              <tr key={pid} data-testid={`fp-obs-${pid}`} data-hidden={hidden || undefined}>
                <th scope="row"><span className="fp-name">{p.short}</span> <small>{p.unit}</small></th>
                <td className="fp-now-value" data-testid={`fp-obs-${pid}-now`}>{typeof now === "number" ? now.toFixed(dec) : "-"}</td>
                {horizons.map((hz) => {
                  const pt = f?.points.find((x) => x.horizon_min === hz);
                  if (!f) return <td key={hz} className="fp-none">No Prediction</td>;
                  if (hidden || !pt) return <td key={hz} className="fp-none" data-testid={`fp-obs-${pid}-${hz}`}>{hidden ? "Hidden" : "-"}</td>;
                  const [lo, hi] = range80(pt);
                  return (
                    <td key={hz} data-testid={`fp-obs-${pid}-${hz}`} data-value={pt.value}>
                      <b>{pt.value.toFixed(dec)}</b>
                      <span className="fp-range">{lo.toFixed(dec)}-{hi.toFixed(dec)}</span>
                    </td>
                  );
                })}
                {show.certainty && <td className="fp-cert-cell">{certaintyMark(f, pid) ?? "-"}</td>}
                <td className="fp-col-chart">
                  {f && !hidden && (
                    <FanChart testId={`fp-obs-${pid}-chart`} colour={`var(--p-${pid}, currentColor)`} now={typeof now === "number" ? now : null}
                              past={(trend?.points ?? []).filter((q) => q.t >= -180).map((q) => ({ t: q.t, v: q.v }))}
                              future={f.points.filter((x) => horizons.includes(x.horizon_min)).map((x) => { const [lo, hi] = range80(x); return { t: x.horizon_min, v: x.value, lo, hi }; })} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="fp-hint" data-prose>Ranges are 80 % intervals. Hidden: certainty below {Math.round(cfg.min_to_show * 100)}%.</p>
    </section>
  );

  return (
    <div className="forecast-panel" data-testid="forecast-panel" data-show={Object.entries(show).filter(([, v]) => v).map(([k]) => k).join(" ")}>
      {toggles}
      <p className="fp-note" data-prose data-testid="fp-note">
        Predictions from example data at {fmtTime(snapshot.generated_at, formats)}, not measurements.
      </p>
      {newsBlock}
      {obsBlock}
      {!show.news && !show.obs && <p className="demo-note" data-prose data-testid="fp-nothing">Nothing selected. Turn on Future NEWS or Observation Predictions.</p>}
    </div>
  );
}
