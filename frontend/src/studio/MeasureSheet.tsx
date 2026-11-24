import { useEffect, useRef, useState } from "react";

import { api } from "@/app/api";
import { useUi } from "@/app/store";
import type { MeasuredReading } from "@/contracts/types.gen";
import { useExample, useSnapshot } from "@/examples/store";

/** How long the simulated measurement takes, in seconds: a cuff inflates and deflates; a thermometer is quick. */
const SECONDS = { bp: 8, temp: 4 } as const;
const WORDS = {
  bp: { start: "Start Cuff", again: "Measure Again", doing: "Cuff Measuring", what: "Blood Pressure", added: "Added To The BP List And Trend" },
  temp: { start: "Take Temperature", again: "Measure Again", doing: "Thermometer Reading", what: "Temperature", added: "Added To The Temperature Points" },
} as const;

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Measure BP and Measure Temp. There is no live cuff or thermometer yet, so this runs a simulated reading: Start,
 * a few seconds of "Measuring", then the reading the scenario gives, with its time. The reading is added to this
 * screen's list, trend and tile (cleared when the scenario or minute changes) and is marked simulated. It
 * reaches no record.
 */
export function MeasureSheet({ kind }: { kind: "bp" | "temp" }) {
  const scenario = useExample((s) => s.scenario);
  const minute = useExample((s) => s.minute);
  const enabled = useExample((s) => s.enabled);
  const snapshot = useSnapshot();
  const [phase, setPhase] = useState<"idle" | "measuring" | "done" | "error">("idle");
  const [result, setResult] = useState<MeasuredReading | null>(null);
  const [left, setLeft] = useState(0);
  const timer = useRef<number | null>(null);
  const w = WORDS[kind];
  const total = SECONDS[kind];

  useEffect(() => () => { if (timer.current != null) window.clearInterval(timer.current); }, []);

  const start = () => {
    if (!enabled) return;
    setPhase("measuring");
    setResult(null);
    setLeft(total);
    const request = api.measure(scenario, kind, minute);
    let remaining = total;
    timer.current = window.setInterval(() => {
      remaining -= 1;
      setLeft(Math.max(0, remaining));
      if (remaining > 0) return;
      window.clearInterval(timer.current!);
      timer.current = null;
      request.then((r) => {
        useExample.getState().addTaken({ bp: r.bp, temp: r.temp });
        setResult(r);
        setPhase("done");
      }).catch(() => setPhase("error"));
    }, 1000);
  };
  const stop = () => {
    if (timer.current != null) window.clearInterval(timer.current);
    timer.current = null;
    setPhase("idle");
  };

  const value = result?.bp ? `${result.bp.sys}/${result.bp.dia} (${result.bp.map})` : result?.temp ? result.temp.value.toFixed(1) : "";
  const unit = kind === "bp" ? "mmHg" : "\u00B0C";
  const at = result?.bp?.at ?? result?.temp?.at;

  return (
    <div className="measure" data-testid={`measure-${kind}`} data-phase={phase}>
      <p className="demo-note">
        This prototype has no live {kind === "bp" ? "cuff" : "thermometer"}. The button runs a simulated reading: the value the example
        patient has at the chosen time. It is marked simulated and is not recorded anywhere.
      </p>
      {!enabled && <p className="demo-note" data-testid="measure-off">Turn on example data in Demo Controls to run a simulated reading.</p>}
      {phase === "idle" && <button type="button" className="btn btn-primary measure-go" data-testid="measure-start" onClick={start} disabled={!enabled}>{w.start}</button>}
      {phase === "measuring" && (
        <div className="measure-run" data-testid="measure-running" role="status">
          <strong>{w.doing}</strong>
          <div className="measure-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={total - left}>
            <span style={{ width: `${((total - left) / total) * 100}%` }} />
          </div>
          <span className="measure-left">{left} s</span>
          <button type="button" className="btn" data-testid="measure-stop" onClick={stop}>Stop</button>
        </div>
      )}
      {phase === "done" && result && (
        <div className="measure-result" data-testid="measure-result" role="status">
          <span className="measure-kind">{w.what}</span>
          <span className="measure-value" data-testid="measure-value">{value} <small>{unit}</small></span>
          <span className="measure-time">Taken {at ? clock(at) : ""} - Simulated Reading</span>
          <span className="measure-added">{w.added}</span>
          <div className="panel-buttons">
            <button type="button" className="btn" data-testid="measure-again" onClick={() => setPhase("idle")}>{w.again}</button>
            <button type="button" className="btn btn-primary" data-testid="measure-done" onClick={() => useUi.getState().showSheet(null)}>Done</button>
          </div>
        </div>
      )}
      {phase === "error" && <p className="demo-note" data-testid="measure-error">The simulated reading could not be taken. Try again.</p>}
      {snapshot && phase !== "measuring" && (
        <p className="measure-last" data-testid="measure-last">
          {kind === "bp"
            ? (snapshot.bp_readings[0] ? `Latest on this screen: ${snapshot.bp_readings[0].sys}/${snapshot.bp_readings[0].dia} (${snapshot.bp_readings[0].map})` : "No blood pressure yet")
            : (snapshot.temp_readings[0] ? `Latest on this screen: ${snapshot.temp_readings[0].value.toFixed(1)} \u00B0C` : "No measured temperature yet")}
        </p>
      )}
    </div>
  );
}
