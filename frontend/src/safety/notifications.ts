import type { Registry } from "@/app/api";
import type { AlarmState } from "@/contracts/types.gen";
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
  /** When it started (ms), for ordering and "2 min ago". Null for ongoing states. */
  at: number | null;
  action?: { label: string; run: () => void };
}

const RANK = { high: 0, medium: 1, low: 2 } as const;

interface Args {
  link: Link;
  sound: Sound;
  alarms: AlarmState | null;
  order: Design["notifications"]["order"];
  registry: Pick<Registry, "parameters" | "technical_alarms">;
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
export function buildNotices({ link, sound, alarms, order, registry, enableSound }: Args): Notice[] {
  // Without a feed, what this screen last knew is old. Say only that.
  if (link === "stale" || link === "down") {
    return [{ id: "display-disconnected", priority: "high", about: "monitor", at: null,
              text: registry.technical_alarms["display-disconnected"]?.message
                ?? "This screen is not updating." }];
  }
  const out: Notice[] = [];
  if (sound === "blocked") {
    out.push({ id: "sound-unavailable", priority: "medium", about: "monitor", at: null,
               text: registry.technical_alarms["sound-unavailable"]?.message ?? "Alarm sound is off.",
               action: enableSound && { label: "Enable Sound", run: enableSound } });
  }
  const active = alarms?.active ?? [];
  for (const a of active) {
    out.push({ id: a.id, priority: a.priority, about: a.kind === "technical" ? "monitor" : "patient",
               text: a.message, at: Date.parse(a.started_at) || null });
  }
  // Named only if no technical alarm already explains it.
  const explained = active.some((a) => a.technical === "connection-lost" || a.technical === "sensor-off");
  const unmonitored = alarms?.unmonitored ?? [];
  if (unmonitored.length && !explained) {
    const names = unmonitored.map((p) => registry.parameters[p]?.short ?? p).join(", ");
    out.push({ id: "unmonitored", priority: "medium", about: "monitor", at: null,
               text: `Not monitored: ${names}.` });
  }
  const newest = (a: Notice, b: Notice) => (b.at ?? Infinity) - (a.at ?? Infinity);
  return out.sort(order === "recent-first" ? newest
    : (a, b) => RANK[a.priority] - RANK[b.priority] || newest(a, b));
}
