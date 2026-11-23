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

/**
 * Optional summary of every device, for the top bar's 'devices' field. By default
 * device state lives in the tiles (design.safety.device_status = 'tiles'); this is
 * for designs that also want it in one place.
 */
export function DeviceChips() {
  const design = useDesign()!;
  const devices = useSafety((s) => s.devices);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!devices.length || design.safety.device_status === "tiles") return null;
  // Problems first, so they are the last thing to be squeezed out on a narrow screen.
  const rank = (d: DeviceStatus) => (d.connection === "lost" ? 0 : d.battery === "critical" ? 1
    : d.battery === "low" ? 2 : d.connection === "connected" ? 3 : 4);
  return (
    <span className="devices" data-testid="devices">
      {[...devices].sort((a, b) => rank(a) - rank(b)).map((d) => {
        const s = deviceSummary(d, now, design.safety.show_battery_percent);
        return (
          <span key={d.id} className={`device device-${s.tone}`} data-testid={`device-${d.id}`}>
            <span className="device-label">{d.label}</span>
            <span className="device-text">{s.text}</span>
          </span>
        );
      })}
    </span>
  );
}
