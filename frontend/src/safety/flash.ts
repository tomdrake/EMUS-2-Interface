import { useSyncExternalStore } from "react";

import type { AlarmEvent } from "@/contracts/types.gen";

export type Priority = AlarmEvent["priority"];

/** How long each half of the flash lasts, by priority: a highlighted number and a normal one alternate at no more than one flash a second. */
export const FLASH_HALF_MS: Record<Priority, number> = { high: 500, medium: 1000, low: 2000 };
/** The smallest step of any half-period; one timer ticks at this rate for the whole screen. */
const STEP_MS = 250;

let tick = Math.floor(Date.now() / STEP_MS);
const listeners = new Set<() => void>();
let timer: number | null = null;

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (timer === null) {
    timer = window.setInterval(() => { tick = Math.floor(Date.now() / STEP_MS); listeners.forEach((l) => l()); }, STEP_MS);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer !== null) { window.clearInterval(timer); timer = null; }
  };
}

/** The reduced-motion preference: no flashing, the highlight is held. */
export function reducedMotion(): boolean {
  try { return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/**
 * Whether the highlighted half of the flash is showing, for an alarm of this priority. It comes from the clock, not from when a
 * number appeared, so every alarming number on the screen (systolic, diastolic and MAP, the monitor and the overlay) is in step.
 * With reduced motion it is always on, so the number is highlighted steadily instead of flashing.
 */
export function flashOn(priority: Priority, nowMs: number): boolean {
  if (reducedMotion()) return true;
  return Math.floor(nowMs / FLASH_HALF_MS[priority]) % 2 === 0;
}

/** Re-renders the caller at every step of the shared flash clock; returns that clock's time. */
export function useFlashClock(active: boolean): number {
  return useSyncExternalStore(active ? subscribe : () => () => {}, () => (active ? tick : 0), () => 0) * STEP_MS;
}

const ORDER: Priority[] = ["high", "medium", "low"];

/** The alarm on one parameter that decides how it flashes: the most serious active one (low or high limit), none if its alarm is off. */
export function alarmOn(alarms: { active: AlarmEvent[]; alarms_off: readonly string[] } | null | undefined, parameter: string): Priority | null {
  if (!alarms || alarms.alarms_off.includes(parameter)) return null;
  const hits = alarms.active.filter((a) => a.kind !== "technical" && a.parameter === parameter).map((a) => a.priority);
  return ORDER.find((p) => hits.includes(p)) ?? null;
}
