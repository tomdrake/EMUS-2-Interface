import { Certainty } from "@/ai/Certainty";
import { pickCertainty, spanText } from "@/ai/certainty";
import { useDesign, useUi } from "@/app/store";
import type { EventPrediction, Finding } from "@/contracts/types.gen";
import { fmtTime, useFormats } from "@/design/datetime";
import type { WidgetOf } from "@/design/types";
import { useSnapshot } from "@/examples/store";
import { FAN_PAD, axisMarks, markText } from "@/traces/TrendFan";
import { useSize } from "@/traces/useSize";

const LANE = 18;
const PAD_L = 124, PAD_R = 20;          // the left margin holds each lane's name
const MAX_PAST = 5;

/** Minutes from now for a time. */
const rel = (iso: string, nowMs: number): number => (Date.parse(iso) - nowMs) / 60000;

/**
 * Events on one time axis from `hours_back` before now to `hours_ahead` after it. What the AI found already is a bar from its
 * start to now (or its end); what it predicts is a marker at the expected time with whiskers for the earliest and latest, labelled with the
 * probability. Beneath it the same events in words: when, how likely, how sure, and for NEWS2 5 or more the minutes to it.
 */
export function EventsTimeline({ widget }: { widget: WidgetOf<"events-timeline"> }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const snapshot = useSnapshot();
  const formats = useFormats();
  const [ref, { w }] = useSize<HTMLDivElement>();
  const cfg = design.forecast.certainty;
  if (!snapshot) return <p className="demo-note" data-prose data-testid="evt-empty">No events to show. Turn on example data in Demo Controls.</p>;
  const nowMs = Date.parse(snapshot.generated_at);
  const tMin = -widget.hours_back * 60, tMax = widget.hours_ahead * 60;
  const past: Finding[] = snapshot.findings.filter((f) => rel(f.offset ?? snapshot.generated_at, nowMs) >= tMin).slice(0, MAX_PAST);
  const future: EventPrediction[] = [...snapshot.forecast.events].sort((a, b) => Date.parse(a.expected_at ?? snapshot.generated_at) - Date.parse(b.expected_at ?? snapshot.generated_at));
  const lanes = past.length + future.length;
  const x = (t: number) => PAD_L + ((Math.min(tMax, Math.max(tMin, t)) - tMin) / (tMax - tMin)) * Math.max(1, w - PAD_L - PAD_R);
  const toThreshold = snapshot.forecast.minutes_to_news_threshold[String(design.forecast.news_threshold)] ?? null;
  const at = (iso: string) => fmtTime(iso, formats);
  return (
    <div className="events-timeline" data-testid="events-timeline" data-past={past.length} data-future={future.length}>
      <div className="evt-chart" ref={ref}>
        {w > 0 && (
          <svg width={w} height={Math.max(1, lanes) * LANE + 22} viewBox={`0 0 ${w} ${Math.max(1, lanes) * LANE + 22}`} role="img" aria-label="Events before and after now">
            {axisMarks(tMin, tMax, 2).map((t) => (
              <g key={t}>
                <line className={`tf-grid${t === 0 ? " is-now" : ""}`} x1={x(t)} x2={x(t)} y1={0} y2={Math.max(1, lanes) * LANE} />
                <text className="tf-label" x={x(t)} y={Math.max(1, lanes) * LANE + 14} textAnchor="middle">{markText(t)}</text>
              </g>
            ))}
            {[...past.map((f) => f.label), ...future.map((e) => e.label)].map((name, i) => (
              <text key={i} className="evt-lane" x={PAD_L - 8} y={i * LANE + LANE / 2 + 3.5} textAnchor="end">{name.length > 18 ? `${name.slice(0, 17)}...` : name}</text>
            ))}
            {past.map((f, i) => {
              const a = x(rel(f.onset, nowMs)), b = x(rel(f.offset ?? snapshot.generated_at, nowMs));
              return (
                <g key={f.id} data-testid={`evt-past-${f.id}`}>
                  <rect className={`evt-bar sev-${f.severity}`} x={Math.min(a, b)} y={i * LANE + 4} width={Math.max(4, Math.abs(b - a))} height={LANE - 8} rx={3} />
                </g>
              );
            })}
            {future.map((e, k) => {
              const i = past.length + k;
              const m = x(rel(e.expected_at ?? snapshot.generated_at, nowMs));
              const lo = x(rel(e.earliest_at ?? e.expected_at ?? snapshot.generated_at, nowMs)), hi = x(rel(e.latest_at ?? e.expected_at ?? snapshot.generated_at, nowMs));
              const cy = i * LANE + LANE / 2;
              return (
                <g key={e.id} data-testid={`evt-future-${e.event}`} data-probability={e.probability}>
                  <line className="evt-whisker" x1={lo} x2={hi} y1={cy} y2={cy} />
                  <line className="evt-whisker" x1={lo} x2={lo} y1={cy - 3} y2={cy + 3} />
                  <line className="evt-whisker" x1={hi} x2={hi} y1={cy - 3} y2={cy + 3} />
                  <path className="evt-marker" d={`M${m} ${cy - 5}L${m + 5} ${cy}L${m} ${cy + 5}L${m - 5} ${cy}Z`} style={{ opacity: 0.45 + 0.55 * e.probability }} />
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <h4 className="evt-head" data-testid="evt-head">Predicted</h4>
      <ul className="evt-list" data-testid="evt-list">
        {future.map((e) => {
          const c = pickCertainty(e.certainty, cfg.event_metric);
          const mins = Math.round(rel(e.expected_at ?? snapshot.generated_at, nowMs));
          return (
            <li key={e.id} data-testid={`evt-row-${e.event}`} className="evt-row" data-probability={e.probability}>
              <strong>{e.label}</strong>
              <span className="evt-when">About {at(e.expected_at ?? snapshot.generated_at)} ({mins <= 0 ? "Now" : `In ${spanText(mins)}`})</span>
              <span className="evt-prob">{Math.round(e.probability * 100)}% Likely</span>
              {c && <span className="evt-cert"><Certainty value={c} cfg={cfg} registry={registry} showName={false} /></span>}
            </li>
          );
        })}
        {!future.length && <li className="demo-note" data-prose data-testid="evt-none">No events predicted in this window.</li>}
      </ul>
      {toThreshold != null && <p className="fp-threshold" data-testid="evt-threshold">{toThreshold <= 0 ? `NEWS2 is already ${design.forecast.news_threshold} or more.` : `NEWS2 ${design.forecast.news_threshold} or more is expected in about ${spanText(toThreshold)}.`}</p>}
    </div>
  );
}

export const TIMELINE_PAD = FAN_PAD;
