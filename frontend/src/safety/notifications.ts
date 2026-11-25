import type { Registry } from "@/app/api";
import type { AlarmState, DeviceStatus } from "@/contracts/types.gen";
import { paramVar } from "@/design/theme";
import type { Design } from "@/design/types";

import type { Link, Sound } from "./store";

/** One line in the notification box and feed. */
export interface Notice {
  id: string;
  priority: "high" | "medium" | "low";
  /** 'patient' = something about the patient; 'monitor' = something about the monitoring. */
  about: "patient" | "monitor";
  /** The message, as a sentence. Prose: never title-cased. */
  text: string;
  /** Registry parameter ids this is about, for colouring it like their rows. */
  parameters: string[];
  /** Priority mark for patient alarms ("High", "Medium", "Low"); null for monitoring items. */
  mark: string | null;
  /** When it started (ms), for ordering and "2 min ago". Null for ongoing states. */
  at: number | null;
  action?: { label: string; run: () => void };
}

const RANK = { high: 0, medium: 1, low: 2 } as const;

interface Args {
  link: Link;
  sound: Sound;
  alarms: AlarmState | null;
  devices?: DeviceStatus[];
  order: Design["notifications"]["order"];
  registry: Pick<Registry, "parameters" | "technical_alarms" | "alarm_priority_marks">;
  enableSound?: () => void;
}

/**
 * Everything the clinician should know about right now, in the order the design
 * asks for: most serious first and newest first within a priority, or newest first.
 *
 * Pure, so the ordering rules are tested without a screen. The sound-paused state
 * is not in this list: it is shown on the box and the silence button for as long
 * as it lasts, whatever else is happening.
 */
export function buildNotices({ link, sound, alarms, devices = [], order, registry, enableSound }: Args): Notice[] {
  // Without a feed, what this screen last knew is old. Say only that.
  if (link === "stale" || link === "down") {
    return [{ id: "display-disconnected", priority: "high", about: "monitor", at: null,
              parameters: [], mark: null,
              text: registry.technical_alarms["display-disconnected"]?.message
                ?? "This screen is not updating." }];
  }
  const out: Notice[] = [];
  if (sound === "blocked") {
    out.push({ id: "sound-unavailable", priority: "medium", about: "monitor", at: null,
               parameters: [], mark: null,
               text: registry.technical_alarms["sound-unavailable"]?.message ?? "Alarm sound is off.",
               action: enableSound && { label: "Enable Sound", run: enableSound } });
  }
  const active = alarms?.active ?? [];
  for (const a of active) {
    const patient = a.kind !== "technical";
    const device = devices.find((d) => d.id === a.device_id);
    out.push({ id: a.id, priority: a.priority, about: patient ? "patient" : "monitor",
               text: a.message, at: Date.parse(a.started_at) || null,
               parameters: a.parameter ? [a.parameter] : [...(device?.parameters ?? [])],
               mark: patient ? registry.alarm_priority_marks[a.priority] : null });
  }
  // Named only if no technical alarm already explains it.
  const explained = active.some((a) => a.technical === "connection-lost" || a.technical === "sensor-off");
  const unmonitored = alarms?.unmonitored ?? [];
  if (unmonitored.length && !explained) {
    const names = unmonitored.map((p) => registry.parameters[p]?.short ?? p).join(", ");
    out.push({ id: "unmonitored", priority: "medium", about: "monitor", at: null,
               parameters: [...unmonitored], mark: null, text: `Not monitored: ${names}.` });
  }
  const newest = (a: Notice, b: Notice) => (b.at ?? Infinity) - (a.at ?? Infinity);
  return out.sort(order === "recent-first" ? newest
    : (a, b) => RANK[a.priority] - RANK[b.priority] || newest(a, b));
}

/** Just enough of a design row to say which colour a parameter is drawn in. */
export interface RowColourSource {
  parameter: string | null;
  numerics: readonly string[];
  colour: string | null;
}

/** The colour of the row a parameter appears in: its title and waveform colour. */
export function rowColourFor(parameter: string, rows: readonly RowColourSource[]): string | null {
  const row = rows.find((r) => r.parameter === parameter || r.numerics.includes(parameter));
  if (!row) return null;
  return row.colour ?? paramVar(row.parameter ?? parameter);
}

export const MAX_DOTS = 4;

/**
 * How a notification is coloured. About one row: the text takes that row's colour.
 * About several rows (a sensor that feeds more than one): neutral text with a small
 * dot in each row's colour. About none: neutral text.
 */
export function noticeColour(parameters: readonly string[], rows: readonly RowColourSource[]):
  { colour: string | null; dots: string[] } {
  const colours: string[] = [];
  for (const p of parameters) {
    const c = rowColourFor(p, rows);
    if (c && !colours.includes(c)) colours.push(c);
  }
  if (colours.length === 1) return { colour: colours[0]!, dots: [] };
  return { colour: null, dots: colours.slice(0, MAX_DOTS) };
}
