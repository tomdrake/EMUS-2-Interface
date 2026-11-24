import { useState } from "react";

import { useUi } from "@/app/store";
import { titleCase } from "@/design/text";
import type { ExampleSnapshot } from "@/contracts/types.gen";
import { useSnapshot } from "@/examples/store";

/** The values behind a module as CSV: time (minutes before now), value, unit, device, quality. Pure. */
export function toCsv(snapshot: ExampleSnapshot, parameter: string, unit: string): string {
  const t = snapshot.trends[parameter as keyof ExampleSnapshot["trends"]];
  if (!t) return "";
  const device = t.device_id ?? "";
  const q = t.quality == null ? "" : t.quality.toFixed(2);
  const lines = ["minutes_before_now,value,unit,device,quality,example_data"];
  for (const p of t.points) lines.push(`${-p.t},${p.v},${unit},${device},${q},true`);
  return lines.join("\n");
}

/**
 * The numbers behind any module: the current value, which device supplied it and in what state, the
 * limits, the values over time, and the raw evidence of any finding about it. Copy as CSV puts the series
 * on the clipboard. All example data until live data is connected.
 */
export function UnderlyingData() {
  const context = useUi((s) => s.sheetContext);
  const registry = useUi((s) => s.registry)!;
  const snapshot = useSnapshot();
  const [copied, setCopied] = useState<string | null>(null);
  if (!snapshot) return <p className="why-empty">Example data is off, so there is nothing to show. Turn it on in Demo Controls.</p>;

  const options = Object.keys(snapshot.trends);
  const parameter = context && options.includes(context) ? context : null;
  if (!parameter) {
    return (
      <div className="ud" data-testid="ud-pick">
        <p>Choose an item to see the numbers behind it.</p>
        <div className="demo-jumps">
          {options.map((p) => (
            <button key={p} type="button" className="demo-jump" data-testid={`ud-option-${p}`}
                    onClick={() => useUi.getState().showSheet("underlying-data", p)}>
              {registry.parameters[p]?.label ?? p}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const p = registry.parameters[parameter]!;
  const trend = snapshot.trends[parameter as keyof ExampleSnapshot["trends"]]!;
  const signal = snapshot.signals[parameter as keyof ExampleSnapshot["signals"]];
  const device = snapshot.devices.find((d) => d.id === trend.device_id);
  const value = (snapshot.numerics as Record<string, number | string | null>)[parameter];
  const findings = snapshot.findings.filter((f) => f.parameter === parameter);
  const csv = toCsv(snapshot, parameter, p.unit);
  const copy = async () => {
    try { await navigator.clipboard.writeText(csv); setCopied("Copied"); }
    catch { setCopied("Could not copy: select the text below instead"); }
  };
  const recent = [...trend.points].reverse();
  return (
    <div className="ud" data-testid="ud-sheet" data-parameter={parameter}>
      <p className="why-sub">{snapshot.title}</p>
      <dl className="why-measured" data-testid="ud-summary">
        <div><dt>Item</dt><dd>{p.label} ({p.unit || "no unit"})</dd></div>
        <div><dt>Current Value</dt><dd data-testid="ud-value">{value ?? "none"}</dd></div>
        <div><dt>Signal</dt><dd data-testid="ud-signal">{registry.signal_states[signal?.state ?? "standby"]?.text || "OK"}
          {signal?.quality != null && ` · quality ${signal.quality.toFixed(2)}`}{signal?.issue && ` · ${registry.signal_issues[signal.issue]?.label}`}</dd></div>
        <div><dt>Source</dt><dd data-testid="ud-device">{device ? `${device.label}, ${device.connection}${device.battery_pct != null ? `, battery ${device.battery_pct}%` : ""}` : p.method || "manual"}</dd></div>
        <div><dt>Alarm Limits</dt><dd data-testid="ud-limits">{p.default_low ?? "none"} to {p.default_high ?? "none"} {p.unit}</dd></div>
      </dl>

      {findings.length > 0 && (
        <section aria-label="Evidence behind findings">
          <h4>What the AI Measured</h4>
          {findings.map((f) => {
            const d = snapshot.finding_data[f.id];
            return (
              <div key={f.id} className="ud-finding" data-testid={`ud-finding-${f.code}`}>
                <strong>{f.summary}</strong>
                <dl className="why-measured">
                  {d && Object.entries(d.features).map(([k, v]) => (<div key={k}><dt>{titleCase(k)}</dt><dd>{v}</dd></div>))}
                </dl>
                {d && d.rr_intervals_s.length > 0 && <p className="why-note">R-R intervals (s): {d.rr_intervals_s.map((x) => x.toFixed(2)).join(", ")}</p>}
              </div>
            );
          })}
        </section>
      )}

      <section aria-label="Values Over Time">
        <h4>Values Over Time</h4>
        <div className="ud-actions">
          <button type="button" className="btn" onClick={copy} data-testid="ud-copy">Copy as CSV</button>
          <span role="status" data-testid="ud-copied">{copied}</span>
        </div>
        <div className="ud-table-wrap">
          <table className="ud-table" data-testid="ud-table">
            <thead><tr><th>Time</th><th>{p.unit || "Value"}</th></tr></thead>
            <tbody>
              {recent.map((pt) => (
                <tr key={pt.t}><td>{pt.t === 0 ? "Now" : `${-pt.t} min ago`}</td><td>{pt.v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
