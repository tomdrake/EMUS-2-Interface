import { useSnapshot } from "@/examples/store";

import { RISK_COLOUR } from "@/widgets/ModuleDetails";

const ACVPU: Record<string, string> = { A: "Alert", C: "New Confusion", V: "Voice", P: "Pain", U: "Unresponsive" };
const RISK_WORD: Record<string, string> = { low: "Low", "low-medium": "Low Medium", medium: "Medium", high: "High" };

/**
 * How the NEWS2 total was made: each parameter with the value that was scored, where it came from and its points, so the
 * total can be checked against the numbers on screen. The live total scores the continuous temperature the monitor
 * shows; consciousness and oxygen come from the chart. Reads the same snapshot as the NEWS2 box.
 */
export function News2Breakdown() {
  const s = useSnapshot();
  if (!s) return <p className="why-empty">No observations to score. Turn on example data in Demo Controls.</p>;
  const n = s.news2;
  const i = n.inputs as Record<string, number | string | null | undefined>;
  const c = n.components as Record<string, number>;
  const rows: { key: string; name: string; shown: string; source: string }[] = [
    { key: "rr", name: "Respiratory Rate", shown: `${i.rr ?? "-"} /min`, source: "Monitor" },
    { key: "spo2", name: `SpO2 (Scale ${s.spo2_scale})`, shown: `${i.spo2 ?? "-"} %`, source: "Monitor" },
    { key: "o2_flow", name: "Air Or Oxygen", shown: Number(i.o2_flow) > 0 ? `Oxygen ${i.o2_flow} L/min` : "Air", source: "Chart" },
    { key: "bp_sys", name: "Systolic BP", shown: `${i.bp_sys ?? "-"} mmHg`, source: "Monitor" },
    { key: "hr", name: "Pulse", shown: `${i.hr ?? "-"} /min`, source: "Monitor" },
    { key: "acvpu", name: "Consciousness", shown: ACVPU[String(i.acvpu ?? "").toUpperCase()] ?? String(i.acvpu ?? "-"), source: "Chart" },
    { key: "temp", name: "Temperature", shown: `${i.temp ?? "-"} \u00B0C`, source: "Skin Sensor" },
  ];
  return (
    <div className="settings news2-breakdown" data-testid="news2-breakdown">
      <p className="demo-note" data-prose>The total scores the values shown on the monitor. Consciousness and oxygen come from the chart.</p>
      <table className="n2b-table">
        <thead><tr><th scope="col">Parameter</th><th scope="col">Scored</th><th scope="col">Source</th><th scope="col">Points</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-testid={`n2b-${r.key}`} data-points={c[r.key] ?? ""}>
              <th scope="row">{r.name}</th><td>{r.shown}</td><td>{r.source}</td>
              <td><b className={`n2b-points score-${Math.min(3, c[r.key] ?? 0)}`}>{c[r.key] ?? "-"}</b></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr data-testid="n2b-total" data-total={n.total ?? ""}>
            <th scope="row" colSpan={3}>Total</th>
            <td><b className="n2b-total" style={{ color: RISK_COLOUR[n.risk ?? "low"] }}>{n.total ?? "-"}</b></td>
          </tr>
        </tfoot>
      </table>
      <p className="n2b-risk" data-testid="n2b-risk"><strong>{n.risk ? `${RISK_WORD[n.risk]} Risk` : "No Risk Band"}</strong>
        {n.monitoring_hours != null && <span> - Observe {n.monitoring_hours === 0 ? "Continuously" : `At Least Every ${n.monitoring_hours} H`}</span>}</p>
      {n.response && <p className="demo-note" data-prose data-testid="n2b-response">{n.response}</p>}
      {!n.complete && <p className="demo-note" data-prose>Some parameters are missing, so this is a partial score.</p>}
    </div>
  );
}
