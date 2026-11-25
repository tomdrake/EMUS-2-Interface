import { create } from "zustand";

/**
 * What a nurse records on the ABCDE screen: airway, capillary refill, AVPU or GCS, exposure. Kept on this screen
 * (and in its local storage) with the time, until the recording API exists. None of it feeds the NEWS2 score or
 * any patient record, and the screen says so.
 */
import type { CheckKey } from "./checks";

export type Airway = "patent" | "not-patent" | "not-assessed";
export type Refill = "under-2" | "over-2";
export interface Stamped<T> { value: T; at: string }
export interface Gcs { e: number; v: number; m: number }

interface State {
  airway: Stamped<Airway> | null;
  refill: Stamped<Refill> | null;
  avpu: Stamped<"A" | "C" | "V" | "P" | "U"> | null;
  gcs: Stamped<Gcs> | null;
  exposure: Stamped<string[]> | null;
  /** The look, listen and feel checks of breathing and circulation, by key. */
  checks: Partial<Record<CheckKey, Stamped<string>>>;
  setCheck(key: CheckKey, value: string): void;
  setAirway(v: Airway): void;
  setRefill(v: Refill): void;
  setAvpu(v: "A" | "C" | "V" | "P" | "U"): void;
  setGcs(v: Gcs): void;
  setExposure(v: string[]): void;
  clear(): void;
}

const KEY = "emus.abcde";
type Saved = Pick<State, "airway" | "refill" | "avpu" | "gcs" | "exposure" | "checks">;
const EMPTY: Saved = { airway: null, refill: null, avpu: null, gcs: null, exposure: null, checks: {} };

function read(): Saved {
  try { return { ...EMPTY, ...JSON.parse(window.localStorage.getItem(KEY) ?? "{}") }; } catch { return EMPTY; }
}
function write(s: Saved): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not kept */ }
}

const stamp = <T,>(value: T): Stamped<T> => ({ value, at: new Date().toISOString() });
const keep = (s: State): Saved => ({ airway: s.airway, refill: s.refill, avpu: s.avpu, gcs: s.gcs, exposure: s.exposure, checks: s.checks });

export const useAbcde = create<State>((set, get) => ({
  ...read(),
  setCheck: (key, value) => { set({ checks: { ...get().checks, [key]: stamp(value) } }); write(keep(get())); },
  setAirway: (v) => { set({ airway: stamp(v) }); write(keep(get())); },
  setRefill: (v) => { set({ refill: stamp(v) }); write(keep(get())); },
  setAvpu: (v) => { set({ avpu: stamp(v) }); write(keep(get())); },
  setGcs: (v) => { set({ gcs: stamp(v) }); write(keep(get())); },
  setExposure: (v) => { set({ exposure: stamp(v) }); write(keep(get())); },
  clear: () => { set({ ...EMPTY }); write(EMPTY); },
}));

export const gcsTotal = (g: Gcs): number => g.e + g.v + g.m;
export const OVERDUE_MIN = 60;
export const isOverdue = (s: Stamped<unknown> | null, nowMs = Date.now()): boolean => !s || nowMs - Date.parse(s.at) > OVERDUE_MIN * 60000;
