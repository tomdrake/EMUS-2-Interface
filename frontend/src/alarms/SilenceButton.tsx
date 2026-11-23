import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/app/api";
import { useDesign, useUi } from "@/app/store";
import { label } from "@/design/text";
import type { Tab } from "@/design/types";
import { Icon } from "@/layout/Icon";
import { elapsed } from "@/safety/status";
import { useSafety } from "@/safety/store";

/** Seconds of sound pause remaining, re-evaluated four times a second. */
export function useSilenceRemaining(): number {
  const until = useSafety((s) => s.alarms?.silenced_until ?? null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) { setLeft(0); return; }
    const tick = () => setLeft(Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [until]);
  return left;
}

/** Pause and resume alarm sound. Shared by the button and the banner. */
export function useSilenceActions() {
  const patientId = useUi((s) => s.patientId);
  const fail = (e: unknown, what: string) => useUi.getState().setNotice(
    e instanceof ApiError && e.notBuilt ? "Alarms are not connected yet (milestone M2)." : what);
  const pause = useCallback(async () => {
    try { useSafety.getState().setSilencedUntil((await api.silence(patientId)).silenced_until); }
    catch (e) { fail(e, "Could not pause alarm sound."); }
  }, [patientId]);
  const resume = useCallback(async () => {
    try { useSafety.getState().setSilencedUntil((await api.unsilence(patientId)).silenced_until); }
    catch (e) { fail(e, "Could not resume alarm sound."); }
  }, [patientId]);
  return { pause, resume };
}

/**
 * The alarm-silence button.
 *
 *  Ready:   yellow outline and icon, so it is found without reading.
 *  Paused:  solid yellow, pulsing, with the time left; the notification box shows
 *           SOUND PAUSED with the same countdown.
 *
 * One touch pauses sound for the fixed two minutes (the duration comes from the
 * server, never from the design). Pressing again while paused resumes sound:
 * a mistaken second press fails in the safe direction.
 */
export function SilenceButton({ tab, showLabel, where = "tab" }:
  { tab: Tab; showLabel: boolean; where?: "tab" | "top" }) {
  const design = useDesign()!;
  const { pause, resume } = useSilenceActions();
  const left = useSilenceRemaining();
  const paused = left > 0;
  return (
    <button type="button"
            className={`${where === "tab" ? "tab" : "topbtn"} tab-silence${paused ? " is-silenced" : ""}`}
            data-testid="silence" aria-pressed={paused}
            aria-label={paused ? `Alarm sound paused, ${left} seconds left. Press to resume.` : tab.label}
            onClick={paused ? resume : pause}>
      <Icon id={tab.icon === "none" ? "alarm-off" : tab.icon} />
      {showLabel && (
        <span className="tab-label">{paused ? `Paused ${elapsed(left * 1000)}` : label(tab.label, design)}</span>
      )}
    </button>
  );
}
