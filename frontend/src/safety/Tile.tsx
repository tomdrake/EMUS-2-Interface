import { useEffect, useState } from "react";

import { useDesign, useUi } from "@/app/store";
import type { DeviceStatus } from "@/contracts/types.gen";

import { useSnapshot } from "@/examples/store";
import { titleCase } from "@/design/text";

import { spanText } from "@/ai/certainty";
import { FallFigure, PositionFigure, breathPeriod, poseMeaning, poseOf, poseWord } from "./PositionFigure";
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

/** How long ago the latest fall was, from the findings: "40 min", or null. */
function fallAge(snapshot: ReturnType<typeof useSnapshot>): string | null {
  const f = snapshot?.findings.find((x) => x.code === "fall");
  return f ? spanText((Date.parse(snapshot!.generated_at) - Date.parse(f.onset)) / 60000) : null;
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

/** One value in a tile. The first is the primary and is drawn largest. */
export interface TileValue {
  parameter: string;
  value?: number | string | null;
  /** Overrides the registry's short name, e.g. "BP". */
  name?: string;
  /** More values written as one, e.g. blood pressure "120/80 (93)". */
  extra?: { separator: string; value?: number | string | null; wrap?: [string, string] }[];
  /** Small lines under the number (the rhythm in words, regular or irregular, the day's extremes). */
  notes?: string[];
}

/** How serious a display state is, for choosing the frame of a tile whose values differ. */
const SEVERITY = ["connection-lost", "sensor-off", "invalid", "poor-signal", "acquiring", "standby", "ok"];
const PROBLEM = new Set(["connection-lost", "sensor-off", "invalid"]);
const worst = (kinds: string[]) => kinds.sort((a, b) => SEVERITY.indexOf(a) - SEVERITY.indexOf(b))[0]!;

/**
 * One tile: the box holding all of a row's values (SpO2 and PR share one), or the
 * word that explains why there is no number, with the battery and link of the
 * device that measures them at the bottom.
 *
 * Every tile on the monitor is the same size and nothing it can show changes that.
 * Text takes the colour of its row (inherited from the row), so a tile is read as
 * part of its row; states are told apart by word, frame and glyph, not colour.
 *
 * If every value in the tile is in the same state with no number (a limb sensor
 * that lost its link takes SpO2 and PR with it) the word is shown once across the
 * tile. If they differ, each value shows its own. A value is shown only while its
 * signal is ok or poor. Every numeric goes through here so the rules in status.ts
 * apply everywhere. M2 passes the live values.
 */
export function Tile({ values }: { values: TileValue[] }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const signals = useSafety((s) => s.signals);
  const devices = useSafety((s) => s.devices);
  const alarms = useSafety((s) => s.alarms);
  const link = useSafety((s) => s.link);
  const now = useTick(1000);
  const snapshot = useSnapshot();

  const cells = values.map((v) => ({
    v,
    p: registry.parameters[v.parameter],
    d: displayFor({ signal: signals[v.parameter], value: v.value, link, now, safety: design.safety, registry }),
    alarmOff: alarms?.alarms_off.includes(v.parameter as never) ?? false,
  }));
  const first = cells[0]!;
  const shared = cells.length > 1 && cells.every((c) => !c.d.showValue && c.d.kind === first.d.kind);
  const shown = shared ? [first] : cells;
  const kind = worst(cells.map((c) => c.d.kind));

  const showDevice = link === "live" && design.safety.device_status !== "top-bar";
  const marks: DeviceStatus[] = [];
  if (showDevice) {
    for (const c of cells) {
      const d = deviceFor(devices, c.v.parameter);
      if (d && !marks.some((m) => m.id === d.id)) marks.push(d);
    }
  }
  const fmt = (c: (typeof cells)[number], v: number | string | null | undefined) =>
    (typeof v === "number" ? v.toFixed(c.p?.decimals ?? 0) : typeof v === "string" ? titleCase(v) : v ?? "");

  return (
    <span className={`tile tile-${kind}${cells.length > 1 ? " tile-multi" : ""}`}
          data-testid={`num-${first.v.parameter}`} data-state={kind}>
      <span className="tile-cells">
        {shown.map((c, i) => {
          const names = shared ? cells.map((x) => x.v.name ?? x.p?.short).join(" · ") : (c.v.name ?? c.p?.short);
          const unit = shared ? "" : c.p?.unit;
          return (
            <span key={c.v.parameter} className={`tile-cell tile-cell-${c.d.kind}${i === 0 ? " tile-primary" : ""}`}
                  data-testid={`cell-${c.v.parameter}`} data-state={c.d.kind}>
              <span className="tile-head">
                <span className="tile-name">{names} {unit && <small>{unit}</small>}</span>
                {c.d.showValue && c.v.notes?.map((n, k) => <span key={k} className="tile-note-head" data-testid={`note-${c.v.parameter}-${k}`}>{n}</span>)}
                {PROBLEM.has(c.d.kind) && <span className="tile-glyph" aria-hidden="true">!</span>}
                {c.alarmOff && <span className="tile-alarm-off" title="Alarm off for this parameter">ALARM OFF</span>}
              </span>
              <span className="tile-body">
                {c.d.showValue && c.v.parameter === "position" ? (
                  <span className="tile-value tile-position" data-testid="position-value">
                    {poseOf(c.v.value) && <PositionFigure pose={poseOf(c.v.value)!} period={breathPeriod(Number(snapshot?.numerics.rr))} />}
                    <span className="position-word">{poseWord(c.v.value)}</span>
                    <span className="position-meaning">{poseMeaning(c.v.value)}</span>
                  </span>
                ) : c.d.showValue && c.v.parameter === "falls" ? (
                  <span className="tile-value tile-position" data-testid="falls-value">
                    <FallFigure fallen={Number(c.v.value) > 0} />
                    <span className="position-word">{Number(c.v.value) > 0 ? "Fall Detected" : "No Falls"}</span>
                    <span className="position-meaning">{Number(c.v.value) > 0 ? (fallAge(snapshot) ? `${fallAge(snapshot)} Ago` : "") : "None Detected"}</span>
                  </span>
                ) : c.d.showValue ? (
                  <span className="tile-value">
                    <span className="tile-main">
                      {fmt(c, c.v.value)}
                      {c.v.extra?.filter((e) => !e.wrap).map((e, j) => (
                        <span key={j} className="tile-extra">{e.separator}{fmt(c, e.value)}</span>
                      ))}
                    </span>
                    {c.v.extra?.filter((e) => e.wrap).map((e, j) => (
                      <span key={`w${j}`} className="tile-extra tile-extra-wrap">{e.wrap![0]}{fmt(c, e.value)}{e.wrap![1]}</span>
                    ))}
                    {c.d.flagged && <span className="tile-flag" aria-label="poor trace">?</span>}
                  </span>
                ) : <span className="tile-state">{c.d.text}</span>}
                {c.d.last && <span className="tile-last">last {c.d.last.value} · {c.d.last.age}</span>}
              </span>
            </span>
          );
        })}
      </span>
      <span className="tile-foot">
        {marks.slice(0, 2).map((d) => <DeviceMark key={d.id} device={d} />)}
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
