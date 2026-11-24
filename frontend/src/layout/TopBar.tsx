import { useEffect, useState } from "react";

import { useDesign, useUi } from "@/app/store";
import { useSnapshot } from "@/examples/store";
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
  if (link !== "live") return <span className="alarm-status status-strong" data-testid="alarm-status">Alarms: No Data</span>;
  if (left > 0) return <span className="alarm-status tone-silenced" data-testid="alarm-status">Sound Paused {elapsed(left * 1000)}</span>;
  if (sound === "blocked") return <span className="alarm-status status-strong" data-testid="alarm-status">Sound Off</span>;
  // Only claim alarms are audible once this screen has shown it can play sound; until then say nothing rather than claim it.
  if (sound !== "ready") return null;
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
  const snapshot = useSnapshot();
  const registry = useUi((s) => s.registry);

  const clock = now.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: bar.show_seconds ? "2-digit" : undefined,
    hour12: bar.clock_format === "12h",
  });
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const PLACEHOLDER: Partial<Record<Field, string>> = {
    name: "No Patient Feed", dob: "", age: "", sex: "", nhs_number: "", bed: "", ward: "",
    consultant: "", alarm_status: "", oxygen: "", news2: "", allergies: "", weight: "",
  };

  // With example data on, the patient fields come from the scripted patient; without it they say there is no feed.
  const p = snapshot?.patient;
  const ageYears = p?.birth_date ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / 31_557_600_000) : null;
  const fromPatient: Partial<Record<Field, string>> = p ? {
    name: `${p.family_name}, ${p.given_name}`,
    dob: p.birth_date ? `DOB ${new Date(p.birth_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : "",
    age: ageYears != null ? `${ageYears} y` : "", sex: p.sex === "unknown" ? "" : p.sex === "male" ? "M" : p.sex === "female" ? "F" : "Other",
    nhs_number: p.nhs_number ? `NHS ${p.nhs_number}` : "", bed: p.bed ?? "", ward: p.ward ?? "",
    consultant: p.consultant ?? "", allergies: p.allergies.length ? `Allergy: ${p.allergies.join(", ")}` : "",
    weight: p.weight_kg ? `${p.weight_kg} kg` : "",
    oxygen: snapshot ? (snapshot.oxygen.flow_l_min > 0
      ? `O2 ${snapshot.oxygen.flow_l_min} L/min ${registry?.o2_devices[snapshot.oxygen.device] ?? snapshot.oxygen.device}` : "Room air") : "",
    news2: snapshot && snapshot.news2.total != null ? `NEWS2 ${snapshot.news2.total}${snapshot.news2.complete ? "" : " (partial)"}` : "",
  } : {};
  const render = (field: Field) => {
    switch (field) {
      case "clock": return <time className="tb-clock" data-testid="clock">{clock}</time>;
      case "date": return <span className="tb-date">{date}</span>;
      case "devices": return <DeviceChips />;
      case "alarm_status": return <AlarmStatus />;
      case "name": return <strong className="tb-name" data-testid="patient-name">{fromPatient.name || PLACEHOLDER.name}</strong>;
      default: { const t = fromPatient[field] ?? PLACEHOLDER[field]; return t ? <span>{t}</span> : null; }
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
