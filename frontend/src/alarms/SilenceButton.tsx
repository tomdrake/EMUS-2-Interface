import { useEffect, useState } from "react";

import { api, ApiError } from "@/app/api";
import { useUi } from "@/app/store";
import type { Tab } from "@/design/types";
import { Icon } from "@/layout/Icon";

/** Seconds of silence remaining, re-evaluated every 250 ms. */
export function useSilenceRemaining(): number {
  const until = useUi((s) => s.silencedUntil);
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

/**
 * The alarm-silence button. One touch silences audio for the fixed two minutes
 * (duration comes from the server, never from the design) and shows the countdown.
 *
 * M2: the server is the source of truth for `silenced_until`; mirror AlarmMessage
 * from the stream into the store and stop audio in alarms/audio.ts.
 */
export function SilenceButton({ tab, showLabel }: { tab: Tab; showLabel: boolean }) {
  const patientId = useUi((s) => s.patientId);
  const setSilencedUntil = useUi((s) => s.setSilencedUntil);
  const setNotice = useUi((s) => s.setNotice);
  const left = useSilenceRemaining();
  const silenced = left > 0;

  const onPress = async () => {
    try {
      const state = await api.silence(patientId);
      setSilencedUntil(state.silenced_until);
    } catch (e) {
      setNotice(e instanceof ApiError && e.notBuilt
        ? "Alarms are not connected yet (milestone M2)." : "Could not silence alarms.");
    }
  };

  const mm = String(Math.floor(left / 60));
  const ss = String(left % 60).padStart(2, "0");
  return (
    <button type="button" className={`tab tab-silence${silenced ? " is-silenced" : ""}`}
            data-testid="silence" aria-pressed={silenced} onClick={onPress}
            style={tab.colour ? { color: tab.colour } : undefined}>
      <Icon id={tab.icon ?? "alarm-off"} />
      {showLabel && <span className="tab-label">{silenced ? `Silenced ${mm}:${ss}` : tab.label}</span>}
    </button>
  );
}
