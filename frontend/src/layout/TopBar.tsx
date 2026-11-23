import { useEffect, useState } from "react";

import { useDesign, useUi } from "@/app/store";
import { NotificationBox } from "@/safety/NotificationBox";

import { ActionButton } from "./ActionButton";
import { useSilenceRemaining } from "@/alarms/SilenceButton";
import type { Design } from "@/design/types";
import { DeviceChips } from "@/safety/DeviceChips";
import { elapsed } from "@/safety/status";
import { useSafety } from "@/safety/store";

type Field = Design["top_bar"]["fields"][number];

function useNow(showSeconds: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), showSeconds ? 1000 : 10_000);
    return () => window.clearInterval(id);
  }, [showSeconds]);
  return now;
}

/** Whether alarms can currently be heard, in words. Never an icon alone. */
function AlarmStatus() {
  const left = useSilenceRemaining();
  const sound = useSafety((s) => s.sound);
  const link = useSafety((s) => s.link);
  const active = useSafety((s) => s.alarms?.active.filter((a) => a.kind !== "technical").length ?? 0);
  if (link !== "live") return <span className="alarm-status tone-stale" data-testid="alarm-status">Alarms: No Data</span>;
  if (left > 0) return <span className="alarm-status tone-silenced" data-testid="alarm-status">Sound Paused {elapsed(left * 1000)}</span>;
  if (sound === "blocked") return <span className="alarm-status tone-technical" data-testid="alarm-status">Sound Off</span>;
  // Only claim alarms are audible once this screen has shown it can play sound.
  if (sound !== "ready") return <span className="alarm-status tone-technical" data-testid="alarm-status">Sound Not Confirmed</span>;
  return <span className="alarm-status" data-testid="alarm-status">{active ? `${active} Alarm${active > 1 ? "s" : ""}` : "Alarms On"}</span>;
}

/**
 * Patient identity, time and status. The design chooses which fields and their order;
 * 'name' and 'clock' are always present (enforced by the backend schema).
 *
 * M2: replace PLACEHOLDER with the patient from GET /api/patients/{id} and wire
 * alarm_status / oxygen / news2 to the live stores.
 */
export function TopBar() {
  const design = useDesign()!;
  const patientId = useUi((s) => s.patientId);
  const bar = design.top_bar;
  const now = useNow(bar.show_seconds);

  const clock = now.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: bar.show_seconds ? "2-digit" : undefined,
    hour12: bar.clock_format === "12h",
  });
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const PLACEHOLDER: Partial<Record<Field, string>> = {
    name: "No Patient Feed", dob: "", age: "", sex: "", nhs_number: "", bed: "", ward: "",
    consultant: "", alarm_status: "", oxygen: "", news2: "", allergies: "", weight: "",
  };

  const render = (field: Field) => {
    switch (field) {
      case "clock": return <time className="tb-clock" data-testid="clock">{clock}</time>;
      case "date": return <span className="tb-date">{date}</span>;
      case "devices": return <DeviceChips />;
      case "alarm_status": return <AlarmStatus />;
      case "name": return <strong className="tb-name" data-testid="patient-name">{PLACEHOLDER.name}</strong>;
      default: return PLACEHOLDER[field] ? <span>{PLACEHOLDER[field]}</span> : null;
    }
  };

  return (
    <header className="topbar" style={{ height: bar.height_px }} data-patient={patientId}>
      {/* One baseline for every field, whatever its text size. */}
      <div className="tb-fields">
        <div className="tb-line">
          {bar.fields.map((f) => {
            const node = render(f);
            return node ? <div key={f} className={`tb-field tb-${f.replace(/_/g, "-")}`}>{node}</div> : null;
          })}
          <span className="badge badge-proto" title="Co-design prototype. Not a medical device.">
            PROTOTYPE
          </span>
        </div>
      </div>
      {design.notifications.position === "top-bar" && <NotificationBox placement="bar" />}
      <div className="topbtns" data-testid="top-buttons">
        {bar.buttons.map((b) => (
          <ActionButton key={b.id} button={b} where="top" showLabel={bar.show_button_labels} />
        ))}
      </div>
    </header>
  );
}
