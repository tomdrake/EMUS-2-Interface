import { create } from "zustand";

import { api } from "@/app/api";
import { useUi } from "@/app/store";

import { useExample } from "./store";

/**
 * Measure BP and Measure Temp. One touch starts a measurement, the next cancels it; nothing opens. While it
 * runs the module for that measurement pulses, and when it finishes the reading is in the list, the trend and
 * the tile. There is no live cuff or thermometer yet, so the reading is simulated: the value the example
 * patient has at the chosen time. It is kept on this screen only and cleared when the scenario or minute changes.
 */
export type MeasureKind = "bp" | "temp";
/** How long each takes: a cuff inflates and deflates; a thermometer is quick. */
export const MEASURE_SECONDS: Record<MeasureKind, number> = { bp: 8, temp: 4 };

interface MeasureState {
  /** When each running measurement started (ms), or null. */
  running: Record<MeasureKind, number | null>;
  /** Start it, or cancel it if it is running. */
  toggle(kind: MeasureKind): void;
  cancel(kind: MeasureKind): void;
  cancelAll(): void;
}

const timers: Partial<Record<MeasureKind, number>> = {};
const tokens: Record<MeasureKind, number> = { bp: 0, temp: 0 };

export const useMeasure = create<MeasureState>((set, get) => ({
  running: { bp: null, temp: null },
  cancel: (kind) => {
    tokens[kind]++;                                   // a reading still on its way is ignored
    if (timers[kind] != null) window.clearTimeout(timers[kind]);
    delete timers[kind];
    if (get().running[kind] != null) set((s) => ({ running: { ...s.running, [kind]: null } }));
  },
  cancelAll: () => { get().cancel("bp"); get().cancel("temp"); },
  toggle: (kind) => {
    if (get().running[kind] != null) { get().cancel(kind); return; }
    const { enabled, scenario, minute } = useExample.getState();
    if (!enabled) { useUi.getState().setNotice("Turn on example data in Demo Controls to run a simulated measurement."); return; }
    const mine = ++tokens[kind];
    set((s) => ({ running: { ...s.running, [kind]: Date.now() } }));
    const request = api.measure(scenario, kind, minute);
    timers[kind] = window.setTimeout(() => {
      delete timers[kind];
      request.then((r) => {
        if (mine !== tokens[kind]) return;            // cancelled meanwhile
        useExample.getState().addTaken({ bp: r.bp, temp: r.temp });
        set((s) => ({ running: { ...s.running, [kind]: null } }));
      }).catch(() => {
        if (mine === tokens[kind]) set((s) => ({ running: { ...s.running, [kind]: null } }));
        useUi.getState().setNotice("The simulated measurement could not be taken. Try again.");
      });
    }, MEASURE_SECONDS[kind] * 1000);
  },
}));

// A measurement belongs to one moment of one scenario: when either changes, it stops.
useExample.subscribe((s, prev) => {
  if (s.scenario !== prev.scenario || s.minute !== prev.minute || (!s.enabled && prev.enabled)) useMeasure.getState().cancelAll();
});
