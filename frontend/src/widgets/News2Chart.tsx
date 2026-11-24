import { useTheme, useUi } from "@/app/store";
import type { ExampleSnapshot } from "@/contracts/types.gen";
import { useSnapshot } from "@/examples/store";
import type { WidgetOf } from "@/design/types";

/** Black or white, whichever reads better on a colour: so a score cell is readable in any theme. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "inherit";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.4 ? "#000000" : "#ffffff";
}

export type ChartRow = { key: string; label: string; unit?: string; component: string };
export const CHART_ROWS: ChartRow[] = [
  { key: "rr", label: "Respiration Rate", unit: "/min", component: "rr" },
  { key: "spo2", label: "SpO2", unit: "%", component: "spo2" },
  { key: "o2_flow", label: "Air or Oxygen", component: "o2_flow" },
  { key: "bp_sys", label: "Systolic BP", unit: "mmHg", component: "bp_sys" },
  { key: "hr", label: "Pulse", unit: "/min", component: "hr" },
  { key: "acvpu", label: "Consciousness", component: "acvpu" },
  { key: "temp", label: "Temperature", unit: "°C", component: "temp" },
];

const RISK_SCORE: Record<string, number> = { low: 0, "low-medium": 1, medium: 2, high: 3 };
const RESPONSE: Record<string, string> = { low: "Low", "low-medium": "Low-Medium", medium: "Medium", high: "High" };

export const frequencyText = (hours: number | null | undefined): string =>
  hours == null ? "" : hours === 0 ? "Continuous" : hours < 1 ? `${Math.round(hours * 60)} min` : `${hours} h`;

type ObsSet = ExampleSnapshot["obs_sets"][number];

export function cellText(set: ObsSet, key: string, _devices?: Record<string, string>): string {
  const v = (set.values as Record<string, unknown>)[key];
  if (v == null) return "";
  // As on the RCP chart: the delivery device's code and the flow, or Air.
  if (key === "o2_flow") return Number(v) > 0 ? `${set.oxygen?.device ?? ""} ${v}`.trim() : "Air";
  return String(v);
}

/** The observation sets inside the chart's window, oldest first. */
export function visibleSets(sets: readonly ObsSet[], nowIso: string, hours: number): ObsSet[] {
  const from = Date.parse(nowIso) - hours * 3600_000;
  return sets.filter((s) => Date.parse(s.at) >= from);
}

/**
 * The NEWS2 chart: one column per charted observation set, oldest to newest, one row per observation, each
 * cell coloured by its score as on the RCP chart, then the total, the monitoring frequency and the clinical
 * response. Predicted totals (with their range) follow in dashed columns when the design asks for them.
 */
export function News2Chart({ widget }: { widget: WidgetOf<"news2-chart"> }) {
  const snapshot = useSnapshot();
  const theme = useTheme();
  const registry = useUi((s) => s.registry);
  if (!snapshot || !theme || !registry) {
    return <div className="news2-empty" data-testid="news2-empty">No observations to chart. Turn on example data in Demo Controls.</div>;
  }
  const sets = visibleSets(snapshot.obs_sets, snapshot.generated_at, widget.hours_visible);
  const b = theme.news_bands as unknown as Record<string, string>;
  const bg = (score: number) => b[`score_${Math.min(3, score)}`] ?? "transparent";
  const news = snapshot.forecast.forecasts.find((f) => f.parameter === "news2" && f.scenario === "baseline");
  const future = widget.show_future && news ? news.points : [];
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const range80 = (p: (typeof future)[number]) => p.intervals["80"] as unknown as [number, number];

  return (
    <div className={`news2-chart news2-${widget.variant}`} data-testid="news2-chart" data-variant={widget.variant}
         style={{ ["--news-header" as string]: b.header, ["--news-header-text" as string]: b.header_text, ["--news-grid" as string]: b.grid }}>
      <table>
        <thead>
          <tr>
            <th scope="col" className="n2-label">Observation</th>
            {sets.map((s, i) => (
              <th key={s.at} scope="col" data-testid={`news-col-${i}`}><span>{time(s.at)}</span><small>{date(s.at)}</small></th>
            ))}
            {future.map((p) => (
              <th key={p.horizon_min} scope="col" className="n2-future" title="Predicted"><span>+{p.horizon_min / 60} h</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CHART_ROWS.map((r) => (
            <tr key={r.key} data-row={r.key}>
              <th scope="row" className="n2-label">{r.label}{r.unit && <small> {r.unit}</small>}</th>
              {sets.map((s, i) => {
                const score = s.news2_components[r.component] ?? 0;
                return (
                  <td key={s.at} data-testid={`news-cell-${r.key}-${i}`} data-score={score}
                      style={{ background: bg(score), color: readableOn(bg(score)) }}>
                    {cellText(s, r.key, registry.o2_devices)}
                  </td>
                );
              })}
              {future.map((p) => <td key={p.horizon_min} className="n2-future" />)}
            </tr>
          ))}
          {widget.show_total_row && (
            <tr className="n2-total" data-row="total">
              <th scope="row" className="n2-label">NEWS2 Total</th>
              {sets.map((s, i) => (
                <td key={s.at} data-testid={`news-total-${i}`} data-total={s.news2_total ?? ""} data-risk={s.news2_risk ?? ""}
                    style={{ background: bg(RISK_SCORE[s.news2_risk ?? "low"] ?? 0), color: readableOn(bg(RISK_SCORE[s.news2_risk ?? "low"] ?? 0)) }}>
                  <strong>{s.news2_total}</strong>
                </td>
              ))}
              {future.map((p) => {
                const [lo, hi] = range80(p);
                return (
                  <td key={p.horizon_min} className="n2-future" data-testid={`news-future-${p.horizon_min}`} data-value={p.value}>
                    <strong>{Math.round(p.value)}</strong><small>{Math.round(lo)}-{Math.round(hi)}</small>
                  </td>
                );
              })}
            </tr>
          )}
          {widget.show_escalation_rows && (
            <>
              <tr data-row="frequency">
                <th scope="row" className="n2-label">Monitoring</th>
                {sets.map((s) => <td key={s.at}>{frequencyText(s.monitoring_hours)}</td>)}
                {future.map((p) => <td key={p.horizon_min} className="n2-future" />)}
              </tr>
              <tr data-row="response">
                <th scope="row" className="n2-label">Clinical Risk</th>
                {sets.map((s, i) => <td key={s.at} data-testid={`news-risk-${i}`}>{s.news2_risk ? RESPONSE[s.news2_risk] : ""}</td>)}
                {future.map((p) => <td key={p.horizon_min} className="n2-future" />)}
              </tr>
            </>
          )}
        </tbody>
      </table>
      <p className="n2-foot">Charted observations, scored by NEWS2. Oxygen shows the device code then litres a minute (N is a nasal cannula). Dashed columns are predicted totals from the placeholder forecast, with their 80% range under each.</p>
    </div>
  );
}
