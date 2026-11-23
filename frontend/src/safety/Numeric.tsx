import { useEffect, useState } from "react";

import { useDesign, useUi } from "@/app/store";

import { displayFor, elapsed } from "./status";
import { useSafety } from "./store";

function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * One number on a monitor row, or the word that explains why there is no number.
 * Every numeric on the monitor goes through this component so the rules in
 * status.ts apply everywhere. M2 passes the live value.
 */
export function Numeric({ parameter, value, main = false }:
  { parameter: string; value?: number | string | null; main?: boolean }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const signal = useSafety((s) => s.signals[parameter]);
  const link = useSafety((s) => s.link);
  const alarmOff = useSafety((s) => s.alarms?.alarms_off.includes(parameter as never) ?? false);
  const now = useTick(1000);
  const p = registry.parameters[parameter];
  const d = displayFor({ signal, value, link, now, safety: design.safety, registry });

  const shown = d.showValue && typeof value === "number" ? value.toFixed(p?.decimals ?? 0) : value;
  return (
    <span className={`num${main ? " num-main" : ""} num-${d.kind} tone-${d.tone}`}
          data-testid={`num-${parameter}`} data-state={d.kind}>
      {d.showValue
        ? <span className="num-value">{shown}{d.flagged && <span className="num-flag" aria-label="poor trace">?</span>}</span>
        : <span className="num-state">{d.text}</span>}
      {d.last && <span className="num-last">last {d.last.value} · {d.last.age}</span>}
      <span className="num-unit">
        {p?.short} {p?.unit}
        {alarmOff && <span className="num-alarm-off" title="Alarm off for this parameter"> · ALARM OFF</span>}
      </span>
    </span>
  );
}

/** The status line for a row: state word and what to check. Empty when all is well. */
export function RowStatus({ parameter }: { parameter: string }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const signal = useSafety((s) => s.signals[parameter]);
  const link = useSafety((s) => s.link);
  const device = useSafety((s) => s.devices.find((x) => x.id === signal?.device_id));
  const now = useTick(1000);
  const d = displayFor({ signal, value: 0, link, now, safety: design.safety, registry });
  const onRows = design.safety.device_status === "top-bar-and-rows";
  // Device details are only as fresh as the feed: say nothing about them without one.
  const battery = link === "live" && onRows && device && (device.battery === "low" || device.battery === "critical")
    ? `${device.label} battery ${device.battery_pct != null ? `${Math.round(device.battery_pct)}%` : device.battery}` : "";
  if (d.kind === "ok" && !battery) return null;
  const since = signal && d.kind === "connection-lost"
    ? ` ${elapsed(Math.max(0, now - Date.parse(signal.since)))}` : "";
  return (
    <span className={`row-status tone-${d.tone}`} data-testid={`row-status-${parameter}`} role="status">
      {d.kind !== "ok" && <strong>{d.text}{since}</strong>}
      {d.advice && <span className="row-advice">{d.advice}</span>}
      {battery && <span className={`row-battery battery-${device!.battery}`}>{battery}</span>}
    </span>
  );
}
