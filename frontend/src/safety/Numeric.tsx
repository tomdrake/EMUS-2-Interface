import { useEffect, useState } from "react";

import { useDesign, useUi } from "@/app/store";
import type { DeviceStatus } from "@/contracts/types.gen";

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

/** The device that supplies a parameter, whether or not it is connected. */
export function deviceFor(devices: DeviceStatus[], parameter: string): DeviceStatus | undefined {
  return devices.find((d) => (d.parameters as string[]).includes(parameter));
}

function Battery({ pct, state }: { pct: number | null; state: string }) {
  const fill = pct == null ? 0 : Math.max(0, Math.min(1, pct / 100));
  return (
    <svg className={`battery battery-${state}`} width="24" height="13" viewBox="0 0 26 14" aria-hidden="true">
      <rect x="0.75" y="0.75" width="21.5" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="23" y="4" width="2.5" height="6" rx="1" fill="currentColor" />
      <rect x="2.5" y="2.5" width={18 * fill} height="9" rx="1" fill="currentColor" />
    </svg>
  );
}

function LinkBars({ connection, quality }: { connection: string; quality: number | null }) {
  const bars = connection !== "connected" ? 0 : quality == null ? 3 : Math.max(1, Math.round(quality * 3));
  return (
    <svg className={`link link-${connection}`} width="16" height="13" viewBox="0 0 16 13" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 6} y={9 - i * 4} width="4" height={4 + i * 4} rx="1"
              fill={i < bars ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1" />
      ))}
      {connection === "lost" && <path d="M1 1l14 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

/**
 * Battery and wireless state of the device behind a value, shown in that value's
 * own tile. Symbols plus a short word, so neither colour nor shape is relied on alone.
 */
export function DeviceMark({ device }: { device: DeviceStatus }) {
  const design = useDesign()!;
  const paired = device.connection === "connected" || device.connection === "lost";
  const pct = device.battery_pct != null ? `${Math.round(device.battery_pct)}%` : "";
  const word = device.connection === "lost" ? "NO LINK"
    : device.connection === "not-paired" ? ""
      : device.battery === "critical" ? `BATT ${pct}`
        : device.battery === "low" ? `LOW ${pct}`
          : design.safety.show_battery_percent ? pct : "";
  const tone = device.connection === "lost" ? "lost" : paired ? device.battery : "inactive";
  return (
    <span className={`device-mark device-${tone}`} data-testid={`mark-${device.id}`}
          title={`${device.label}: ${device.connection}${pct ? `, battery ${pct}` : ""}`}>
      {word && <span className="device-word">{word}</span>}
      {paired && <Battery pct={device.battery_pct} state={device.battery} />}
      <LinkBars connection={device.connection} quality={device.link_quality} />
    </span>
  );
}

interface TileProps {
  parameter: string;
  value?: number | string | null;
  main?: boolean;
  /** Second and third values for a combined tile, e.g. blood pressure "120/80 (93)". */
  extra?: { separator: string; value?: number | string | null; wrap?: [string, string] }[];
  /** Overrides the registry's short name, e.g. "BP". */
  name?: string;
}

/**
 * One tile: a square holding one number, or the word that explains why there is
 * no number, with the supplying device's battery and link in its corner.
 *
 * Every tile on the monitor is the same width and fills its row; nothing it can
 * show changes its size. Every numeric goes through this component so the rules
 * in status.ts apply everywhere. M2 passes the live value.
 */
export function Numeric({ parameter, value, main = false, extra, name }: TileProps) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const signal = useSafety((s) => s.signals[parameter]);
  const link = useSafety((s) => s.link);
  const device = useSafety((s) => deviceFor(s.devices, parameter));
  const alarmOff = useSafety((s) => s.alarms?.alarms_off.includes(parameter as never) ?? false);
  const now = useTick(1000);
  const p = registry.parameters[parameter];
  const d = displayFor({ signal, value, link, now, safety: design.safety, registry });
  const fmt = (v: number | string | null | undefined) =>
    (typeof v === "number" ? v.toFixed(p?.decimals ?? 0) : v ?? "");
  const showDevice = device && link === "live" && design.safety.device_status !== "top-bar";

  return (
    <span className={`tile${main ? " tile-main" : ""} tile-${d.kind} tone-${d.tone}`}
          data-testid={`num-${parameter}`} data-state={d.kind}>
      <span className="tile-head">
        <span className="tile-name">{name ?? p?.short} <small>{p?.unit}</small></span>
        {alarmOff && <span className="tile-alarm-off" title="Alarm off for this parameter">ALARM OFF</span>}
      </span>
      <span className="tile-body">
        {d.showValue ? (
          <span className="tile-value">
            {fmt(value)}
            {extra?.map((e, i) => (
              <span key={i} className="tile-extra">{e.wrap?.[0] ?? e.separator}{fmt(e.value)}{e.wrap?.[1]}</span>
            ))}
            {d.flagged && <span className="tile-flag" aria-label="poor trace">?</span>}
          </span>
        ) : <span className="tile-state">{d.text}</span>}
      </span>
      <span className="tile-foot">
        {d.last && <span className="tile-last">last {d.last.value} · {d.last.age}</span>}
        {showDevice && <DeviceMark device={device} />}
      </span>
    </span>
  );
}

/** The status line in a row's trace area: state word and what to check. Empty when all is well. */
export function RowStatus({ parameter }: { parameter: string }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const signal = useSafety((s) => s.signals[parameter]);
  const link = useSafety((s) => s.link);
  const now = useTick(1000);
  const d = displayFor({ signal, value: 0, link, now, safety: design.safety, registry });
  if (d.kind === "ok" || d.kind === "standby" || d.kind === "no-data") return null;
  const since = signal && d.kind === "connection-lost"
    ? ` ${elapsed(Math.max(0, now - Date.parse(signal.since)))}` : "";
  return (
    <span className={`row-status tone-${d.tone}`} data-testid={`row-status-${parameter}`} role="status">
      <strong>{d.text}{since}</strong>
      {d.advice && <span className="row-advice">{d.advice}</span>}
    </span>
  );
}
