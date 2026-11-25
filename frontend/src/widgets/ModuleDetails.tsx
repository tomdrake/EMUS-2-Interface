import { useUi } from "@/app/store";
import { fmtDate, fmtTime, useFormats } from "@/design/datetime";
import { titleCase } from "@/design/text";
import { useSnapshot } from "@/examples/store";
import { useSize } from "@/traces/useSize";

/** Colours for a NEWS2 risk, readable on the dark and the light theme. */
export const RISK_COLOUR: Record<string, string> = {
  low: "currentColor", "low-medium": "#f2cf3f", medium: "#ff9f43", high: "#ff6b6b",
};
const RISK_WORD: Record<string, string> = { low: "Low", "low-medium": "Low Medium", medium: "Medium", high: "High" };

/** "Falls In Last 24 Hours": the count over the window, in a big number. */
export function FallsDetail() {
  const s = useSnapshot();
  if (!s) return null;
  const w = s.activity_24h.window_min;
  const span = w >= 1440 ? "Last 24 Hours" : w > 0 ? `Last ${Math.max(1, Math.round(w / 60))} H` : "Now";
  return (
    <div className="detail-falls" data-testid="falls-24h" data-count={s.falls_24h}>
      <span className="detail-big">{s.falls_24h}</span>
      <span className="detail-caption">{s.falls_24h === 1 ? "Fall" : "Falls"} In {span}</span>
    </div>
  );
}

/** "13 h", "13 h 30 min", "40 min" or "None". */
export function duration(min: number): string {
  if (min <= 0) return "None";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h} h`) : `${m} min`;
}

/** How long the patient spent standing, walking and moving over the last day: a label and time, with a short bar. */
export function ActivityDetail() {
  const s = useSnapshot();
  if (!s) return null;
  const a = s.activity_24h;
  const w = Math.max(1, a.window_min);
  const rows: [string, string, string, number][] = [["Standing", "Stand", "standing", a.standing_min], ["Walking", "Walk", "walking", a.walking_min], ["Movement", "Move", "movement", a.movement_min]];
  return (
    <div className="detail-activity" data-testid="activity-24h">
      <span className="detail-caption">{a.window_min >= 1440 ? "Last 24 Hours" : `Last ${Math.max(1, Math.round(a.window_min / 60))} H`}</span>
      {rows.map(([label, short, key, min]) => (
        <div key={key} className="detail-bar" data-testid={`activity-${key}`} data-minutes={min}>
          <span className="detail-bar-line"><span className="detail-bar-label"><span className="lbl-full">{label}</span><span className="lbl-short">{short}</span></span><span className="detail-bar-value">{duration(min)}</span></span>
          <span className="detail-bar-track"><span style={{ width: `${Math.min(100, (min / w) * 100)}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

/** The oxygen delivery device, in words, beside the flow number. */
export function OxygenDetail() {
  const s = useSnapshot();
  const devices = useUi((u) => u.registry?.o2_devices);
  if (!s) return null;
  const on = s.oxygen.flow_l_min > 0;
  return (
    <div className="detail-oxygen" data-testid="oxygen-detail">
      <span className="detail-caption">Delivery</span>
      <span className="detail-device">{on ? titleCase(devices?.[s.oxygen.device] ?? s.oxygen.device) : "Room Air"}</span>
    </div>
  );
}

/**
 * The NEWS2 total over time and by date and time: a small trend of the totals (a dot per set, coloured by
 * risk) above a strip with each set's time, date and total. The newest sets that fit are shown.
 */
export function NewsTrend() {
  const s = useSnapshot();
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const formats = useFormats();
  if (!s || !s.obs_sets.length) return <div className="detail-news" ref={ref} data-testid="news-trend" />;
  const CELL = 68;
  const fit = Math.max(2, Math.floor(Math.max(w - 14, 100) / CELL));
  // The charted sets, then the current total as the last cell.
  const now = s.news2.total != null ? [{ at: s.generated_at, news2_total: s.news2.total, news2_risk: s.news2.risk, now: true }] : [];
  const sets = [...s.obs_sets.map((x) => ({ at: x.at, news2_total: x.news2_total, news2_risk: x.news2_risk, now: false })), ...now].slice(-fit);
  const stripH = 48;
  const plotH = Math.max(0, h - stripH - 2);
  const top = Math.max(9, ...sets.map((x) => x.news2_total ?? 0));
  const cell = Math.max(w - 14, 100) / sets.length;
  const pt = (x: (typeof sets)[number], i: number) => ({ x: cell * i + cell / 2, y: 4 + (1 - (x.news2_total ?? 0) / top) * Math.max(1, plotH - 8) });
  const pts = sets.map(pt);
  const time = (iso: string) => fmtTime(iso, formats);
  const date = (iso: string) => fmtDate(iso, formats, { short: true });
  return (
    <div className="detail-news" ref={ref} data-testid="news-trend">
      {plotH >= 18 && w > 0 && (
        <svg className="news-trend-plot" width={w} height={plotH} viewBox={`0 0 ${w} ${plotH}`} aria-hidden="true">
          {[5, 7].filter((t) => t < top).map((t) => <line key={t} className="trace-grid" x1={0} x2={w} y1={4 + (1 - t / top) * Math.max(1, plotH - 8)} y2={4 + (1 - t / top) * Math.max(1, plotH - 8)} />)}
          <polyline className="news-trend-line" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />
          {sets.map((x, i) => <circle key={`${i}-${x.at}`} className="news-trend-dot" cx={pts[i]!.x} cy={pts[i]!.y} r={3.4} data-testid={`news-trend-dot-${i}`}
                                     style={{ fill: RISK_COLOUR[x.news2_risk ?? "low"] }} />)}
        </svg>
      )}
      <div className="news-strip" data-testid="news-strip" style={{ height: stripH }}>
        {sets.map((x, i) => (
          <div key={`${i}-${x.at}`} className="news-strip-cell" data-testid={`news-strip-${i}`} data-total={x.news2_total ?? ""} data-risk={x.news2_risk ?? ""}
               title={x.news2_risk ? `NEWS2 ${x.news2_total}, ${RISK_WORD[x.news2_risk]} risk` : undefined}>
            <span className="news-strip-time">{x.now ? "Now" : time(x.at)}</span>
            <span className="news-strip-date">{x.now ? "Current" : date(x.at)}</span>
            <b className="news-strip-total" style={{ color: RISK_COLOUR[x.news2_risk ?? "low"] }}>{x.news2_total ?? "-"}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
