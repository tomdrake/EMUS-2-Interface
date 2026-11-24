import { create } from "zustand";

import { api } from "@/app/api";
import { useMemo } from "react";

import type { BpReading, ExampleScenarioInfo, ExampleSnapshot, TempReading } from "@/contracts/types.gen";
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

/** Readings taken on this screen with the Measure BP and Measure Temp buttons (simulated), newest first. */
export interface Taken { bp: BpReading[]; temp: TempReading[] }
const NONE: Taken = { bp: [], temp: [] };

/**
 * The snapshot with this screen's taken readings in it: the list, the trend, the tile number and the
 * thermometer points then all show them. Each takes the time of the snapshot (a little apart, so each
 * stays distinct and the order holds); nothing is stored beyond the screen.
 */
export function mergeTaken(s: ExampleSnapshot, taken: Taken): ExampleSnapshot {
  if (!taken.bp.length && !taken.temp.length) return s;
  const at = (i: number) => new Date(Date.parse(s.generated_at) - i * 30_000).toISOString();
  const bp = taken.bp.map((r, i) => ({ ...r, at: at(i) }));
  const temp = taken.temp.map((r, i) => ({ ...r, at: at(i) }));
  const numerics = bp[0] ? { ...s.numerics, bp_sys: bp[0].sys, bp_dia: bp[0].dia, bp_mean: bp[0].map } : s.numerics;
  return { ...s, numerics, bp_readings: [...bp, ...s.bp_readings], temp_readings: [...temp, ...s.temp_readings] };
}

interface ExampleState extends Saved {
  taken: Taken;
  /** Keep a simulated reading from the Measure sheets. Cleared when the scenario or the minute changes. */
  addTaken(r: { bp?: BpReading | null; temp?: TempReading | null }): void;
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
  scenarios: [], snapshot: null, status: "idle", error: null, taken: NONE,
  addTaken: (r) => set((s) => ({ taken: { bp: r.bp ? [r.bp, ...s.taken.bp] : s.taken.bp, temp: r.temp ? [r.temp, ...s.taken.temp] : s.taken.temp } })),

  setEnabled: (enabled) => {
    set({ enabled });
    write({ enabled, scenario: get().scenario, minute: get().minute });
    if (enabled) void get().refresh(); else applyToSafety(null);
  },
  setScenario: (scenario) => {
    const info = get().scenarios.find((s) => s.id === scenario);
    const minute = info ? Math.min(Math.max(get().minute, info.start_min), info.end_min) : 0;
    set({ scenario, minute, taken: NONE });
    write({ enabled: get().enabled, scenario, minute });
    void get().refresh();
  },
  setMinute: (minute) => {
    set({ minute, taken: NONE });
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
  const snapshot = useExample((s) => (s.enabled ? s.snapshot : null));
  const taken = useExample((s) => s.taken);
  return useMemo(() => (snapshot ? mergeTaken(snapshot, taken) : null), [snapshot, taken]);
}
