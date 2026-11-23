import { useEffect, useState } from "react";

import { useDesign } from "@/app/store";
import type { DeviceStatus } from "@/contracts/types.gen";

import { elapsed } from "./status";
import { useSafety } from "./store";

/** Words for a device's state. Always text as well as colour and shape. */
export function deviceSummary(d: DeviceStatus, now: number, showPercent: boolean): { text: string; tone: string } {
  if (d.connection === "not-paired") return { text: "standby", tone: "inactive" };
  if (d.connection === "connecting") return { text: "connecting", tone: "inactive" };
  if (d.connection === "lost") {
    const since = d.last_seen ? ` ${elapsed(now - Date.parse(d.last_seen))}` : "";
    return { text: `no signal${since}`, tone: "lost" };
  }
  const pct = d.battery_pct != null && showPercent ? ` ${Math.round(d.battery_pct)}%` : "";
  if (d.battery === "critical") return { text: `battery critical${pct}`, tone: "critical" };
  if (d.battery === "low") return { text: `battery low${pct}`, tone: "low" };
  if (d.battery === "charging") return { text: `charging${pct}`, tone: "ok" };
  return { text: pct.trim() || "connected", tone: "ok" };
}

function Battery({ pct, state }: { pct: number | null; state: string }) {
  const fill = pct == null ? 0 : Math.max(0, Math.min(1, pct / 100));
  return (
    <svg className={`battery battery-${state}`} width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">
      <rect x="0.75" y="0.75" width="21.5" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="23" y="4" width="2.5" height="6" rx="1" fill="currentColor" />
      <rect x="2.5" y="2.5" width={18 * fill} height="9" rx="1" fill="currentColor" />
    </svg>
  );
}

/** Battery and wireless state of each device, for the top bar's 'devices' field. */
export function DeviceChips() {
  const design = useDesign()!;
  const devices = useSafety((s) => s.devices);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!devices.length) return null;
  // Problems first, so they are the last thing to be squeezed out on a narrow screen.
  const rank = (d: DeviceStatus) => (d.connection === "lost" ? 0 : d.battery === "critical" ? 1
    : d.battery === "low" ? 2 : d.connection === "connected" ? 3 : 4);
  const ordered = [...devices].sort((a, b) => rank(a) - rank(b));
  return (
    <span className="devices" data-testid="devices">
      {ordered.map((d) => {
        const s = deviceSummary(d, now, design.safety.show_battery_percent);
        return (
          <span key={d.id} className={`device device-${s.tone}`} data-testid={`device-${d.id}`}
                title={`${d.label}: ${s.text}`}>
            {d.connection === "connected" && <Battery pct={d.battery_pct} state={d.battery} />}
            <span className="device-label">{d.label}</span>
            <span className="device-text">{s.text}</span>
          </span>
        );
      })}
    </span>
  );
}
