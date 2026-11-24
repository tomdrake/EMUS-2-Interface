import { create } from "zustand";

import { api } from "@/app/api";
import type { ExampleScenarioInfo, ExampleSnapshot } from "@/contracts/types.gen";
import { useSafety } from "@/safety/store";

/**
 * EXAMPLE DATA: a scripted scenario at a chosen minute, from the server. It stands in for
 * the live stream until the simulator (M2) exists; it feeds the same safety store, so the
 * monitor, tiles, ticker and alarms behave as they will with live data. Everything it
 * produces is badged EXAMPLE DATA. Local to this screen, like dark / light.
 */
export const DEFAULT_SCENARIO = "scn-pneumonia";
const KEY = "emus.example";

interface Saved { enabled: boolean; scenario: string; minute: number }
function read(): Saved {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (v && typeof v.scenario === "string" && typeof v.minute === "number") {
      return { enabled: v.enabled !== false, scenario: v.scenario, minute: v.minute };
    }
  } catch { /* not persisted */ }
  return { enabled: true, scenario: DEFAULT_SCENARIO, minute: 0 };
}
function write(s: Saved): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not persisted */ }
}

interface ExampleState extends Saved {
  scenarios: ExampleScenarioInfo[];
  snapshot: ExampleSnapshot | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;

  setEnabled(on: boolean): void;
  setScenario(id: string): void;
  setMinute(minute: number): void;
  /** Fetch the snapshot for the current scenario and minute (the latest request wins). */
  refresh(): Promise<void>;
  loadScenarios(): Promise<void>;
}

let seq = 0;

export const useExample = create<ExampleState>((set, get) => ({
  ...read(),
  scenarios: [], snapshot: null, status: "idle", error: null,

  setEnabled: (enabled) => {
    set({ enabled });
    write({ enabled, scenario: get().scenario, minute: get().minute });
    if (enabled) void get().refresh(); else applyToSafety(null);
  },
  setScenario: (scenario) => {
    const info = get().scenarios.find((s) => s.id === scenario);
    const minute = info ? Math.min(Math.max(get().minute, info.start_min), info.end_min) : 0;
    set({ scenario, minute });
    write({ enabled: get().enabled, scenario, minute });
    void get().refresh();
  },
  setMinute: (minute) => {
    set({ minute });
    write({ enabled: get().enabled, scenario: get().scenario, minute });
    void get().refresh();
  },
  refresh: async () => {
    const { enabled, scenario, minute } = get();
    if (!enabled) return;
    const mine = ++seq;
    set({ status: "loading" });
    try {
      const snapshot = await api.example(scenario, minute);
      if (mine !== seq) return;        // a newer request has been made
      set({ snapshot, status: "ready", error: null });
      applyToSafety(snapshot);
    } catch (e) {
      if (mine !== seq) return;
      set({ status: "error", error: String((e as Error)?.message ?? e) });
    }
  },
  loadScenarios: async () => {
    try { set({ scenarios: await api.examples() }); } catch { /* the picker stays empty */ }
  },
}));

function applyToSafety(s: ExampleSnapshot | null): void {
  const safety = useSafety.getState();
  if (!s) {
    safety.setDevices([], {}, []);
    safety.setAlarms(null);
    safety.setLink("down");
    return;
  }
  safety.setDevices(s.devices, s.signals, s.quality);
  safety.setAlarms({ ...s.alarms, silenced_until: useSafety.getState().alarms?.silenced_until ?? null });
  safety.heartbeat();
}

/** Start example data: load once, and keep the link alive while it is on. Returns a stopper. */
export function startExamples(): () => void {
  void useExample.getState().loadScenarios();
  void useExample.getState().refresh();
  // A frozen screen must never look live, so the heartbeat is only sent while a snapshot is held.
  const id = window.setInterval(() => {
    const { enabled, snapshot } = useExample.getState();
    if (enabled && snapshot) useSafety.getState().heartbeat();
  }, 1000);
  return () => window.clearInterval(id);
}

/** The snapshot while example data is on; otherwise null. */
export function useSnapshot(): ExampleSnapshot | null {
  return useExample((s) => (s.enabled ? s.snapshot : null));
}
