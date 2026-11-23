import { create } from "zustand";

import type { AlarmState, DeviceStatus, SignalQuality, SignalStatus } from "@/contracts/types.gen";

/**
 * Health of the monitoring itself, as opposed to the patient's values.
 *
 *  link     is this screen receiving data from the server?
 *  sound    can this screen actually play an alarm tone?
 *  devices  battery and wireless state of each device on the patient
 *  signals  why each parameter does or does not have a number (from the server;
 *           the display never guesses this from a missing value)
 *  alarms   active alarms, sound-paused state, alarms switched off, unmonitored
 *
 * M2's stream client feeds this store: call heartbeat() for every message,
 * setDevices() for DevicesMessage, setAlarms() for AlarmMessage, setLink('down')
 * when the socket closes.
 */
export type Link = "connecting" | "live" | "stale" | "down";
export type Sound = "unknown" | "ready" | "blocked";

interface SafetyState {
  link: Link;
  lastMessageAt: number | null;
  sound: Sound;
  /** Set by alarms/audio.ts (M2): unlocks audio after a user gesture. */
  enableSound: (() => Promise<void>) | null;
  devices: DeviceStatus[];
  signals: Record<string, SignalStatus>;
  quality: SignalQuality[];
  alarms: AlarmState | null;

  heartbeat(now?: number): void;
  setLink(link: Link): void;
  setSound(sound: Sound): void;
  setDevices(devices: DeviceStatus[], signals: Record<string, SignalStatus>, quality?: SignalQuality[]): void;
  setAlarms(alarms: AlarmState | null): void;
  setSilencedUntil(iso: string | null): void;
}

export const useSafety = create<SafetyState>((set) => ({
  link: "connecting", lastMessageAt: null, sound: "unknown", enableSound: null,
  devices: [], signals: {}, quality: [], alarms: null,

  heartbeat: (now = Date.now()) => set({ link: "live", lastMessageAt: now }),
  setLink: (link) => set({ link }),
  setSound: (sound) => set({ sound }),
  setDevices: (devices, signals, quality = []) => set({ devices, signals, quality }),
  setAlarms: (alarms) => set({ alarms }),
  setSilencedUntil: (iso) => set((s) => ({
    alarms: { active: [], silence_seconds: 120, alarms_off: [], unmonitored: [],
              ...(s.alarms ?? {}), silenced_until: iso } as AlarmState,
  })),
}));

/** How long the screen may wait for its first message before saying so. */
export const CONNECT_GRACE_MS = 10_000;

/**
 * Watchdog for a frozen or disconnected display. Runs for the life of the app.
 * A screen that has stopped updating must never look live: after `staleAfterMs`
 * without a message everything on it is marked NO DATA.
 */
export function startLinkWatchdog(staleAfterMs: number, startedAt = Date.now()): () => void {
  const id = window.setInterval(() => {
    const { link, lastMessageAt, setLink } = useSafety.getState();
    const now = Date.now();
    if (link === "live" && lastMessageAt !== null && now - lastMessageAt > staleAfterMs) setLink("stale");
    if (link === "connecting" && now - startedAt > CONNECT_GRACE_MS) setLink("down");
  }, 500);
  return () => window.clearInterval(id);
}
