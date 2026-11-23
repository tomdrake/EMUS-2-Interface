import { useUi } from "@/app/store";
import type { AlarmEvent } from "@/contracts/types.gen";
import { Icon } from "@/layout/Icon";

import { useSafety } from "./store";

export interface Condition {
  id: string;
  priority: "high" | "medium" | "low";
  text: string;
  action?: { label: string; run: () => void };
}

const RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_SHOWN = 2;

/**
 * Everything currently wrong with the monitoring (not the patient), most serious
 * first. Pure so it can be tested; SystemBanner just draws the result.
 */
export function conditions(args: {
  link: string; sound: string; technical: AlarmEvent[]; unmonitored: string[];
  label: (parameter: string) => string; message: (id: string) => string; enableSound?: () => void;
}): Condition[] {
  const out: Condition[] = [];
  if (args.link === "stale" || args.link === "down") {
    out.push({ id: "display-disconnected", priority: "high", text: args.message("display-disconnected") });
  }
  if (args.sound === "blocked") {
    out.push({ id: "sound-unavailable", priority: "medium", text: args.message("sound-unavailable"),
               action: args.enableSound && { label: "Enable sound", run: args.enableSound } });
  }
  // Without a feed, what this screen last knew about devices is old news: say only
  // that the screen is not updating, so nothing stale is read as current.
  if (args.link !== "live") return out.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
  for (const a of args.technical) {
    out.push({ id: a.id, priority: a.priority, text: a.message });
  }
  // Named only if no technical alarm already explains it.
  const explained = args.technical.some((a) => a.technical === "connection-lost" || a.technical === "sensor-off");
  if (args.unmonitored.length && !explained) {
    out.push({ id: "unmonitored", priority: "medium",
               text: `Not monitored: ${args.unmonitored.map(args.label).join(", ")}` });
  }
  return out.sort((a, b) => RANK[a.priority] - RANK[b.priority]);
}

/** Technical problems, in their own colour and wording, never styled as patient alarms. */
export function SystemBanner() {
  const registry = useUi((s) => s.registry)!;
  const { link, sound, alarms, enableSound } = useSafety();
  const list = conditions({
    link, sound,
    technical: (alarms?.active ?? []).filter((a) => a.kind === "technical"),
    unmonitored: alarms?.unmonitored ?? [],
    label: (p) => registry.parameters[p]?.short ?? p,
    message: (id) => registry.technical_alarms[id]?.message ?? id,
    enableSound: enableSound ? () => void enableSound() : undefined,
  });
  if (!list.length) return null;
  const shown = list.slice(0, MAX_SHOWN);
  const more = list.length - shown.length;
  return (
    <div className="system-banner" role="alert" data-testid="system-banner">
      {shown.map((c) => (
        <div key={c.id} className={`system-line system-${c.priority}`} data-condition={c.id}>
          <Icon id="info" size={22} />
          <span className="system-tag">MONITOR</span>
          <span className="system-text">{c.text}</span>
          {c.action && <button type="button" className="btn" onClick={c.action.run}>{c.action.label}</button>}
        </div>
      ))}
      {more > 0 && <div className="system-more">+{more} more monitoring {more === 1 ? "problem" : "problems"}</div>}
    </div>
  );
}
