import type { LabResult } from "@/contracts/types.gen";

/**
 * How recent a result is, in the words the ABCDE screen uses. Within an hour is "Current"; within four hours,
 * within 24 hours; older is "No Recent Bloods", with the most recent from the last 72 hours one tap away.
 */
export type RecencyKind = "current" | "within4" | "within24" | "none";
export interface Recency { kind: RecencyKind; label: string; ageMin: number }

export const CURRENT_MIN = 60;
export const FOUR_HOURS_MIN = 4 * 60;
export const DAY_MIN = 24 * 60;
export const WINDOW_MIN = 72 * 60;

export function recency(collectedAt: string, nowIso: string): Recency {
  const ageMin = (Date.parse(nowIso) - Date.parse(collectedAt)) / 60000;
  if (ageMin <= CURRENT_MIN) return { kind: "current", label: "Current", ageMin };
  if (ageMin <= FOUR_HOURS_MIN) return { kind: "within4", label: "Within 4 Hours", ageMin };
  if (ageMin <= DAY_MIN) return { kind: "within24", label: "Within 24 Hours", ageMin };
  return { kind: "none", label: "No Recent Bloods", ageMin };
}

export const inWindow = (r: Recency): boolean => r.ageMin <= WINDOW_MIN;

/** "24 Nov 09:12": the date and the time a sample was taken, always shown. */
export function takenAt(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export type BloodSet = { key: "gas" | "bloods" | "glucose"; title: string; taken: string | null; results: LabResult[] };

/**
 * The newest collection of each kind: the blood gas, the other bloods (without glucose), and glucose.
 * Each is every result that shares its newest collection time, so a set is one sample, not a mixture.
 */
export function latestSets(labs: readonly LabResult[], groupOf: (test: string) => string): BloodSet[] {
  const pick = (key: BloodSet["key"], title: string, match: (t: string) => boolean): BloodSet => {
    const mine = labs.filter((l) => match(l.test));
    const newest = mine.reduce<string | null>((m, l) => (m === null || l.collected_at > m ? l.collected_at : m), null);
    return { key, title, taken: newest, results: newest ? mine.filter((l) => l.collected_at === newest) : [] };
  };
  const g = (t: string) => groupOf(t);
  return [
    pick("gas", "Latest Blood Gas", (t) => g(t) === "gas"),
    pick("bloods", "Latest Bloods", (t) => g(t) !== "gas" && t !== "glucose"),
    pick("glucose", "Glucose", (t) => t === "glucose"),
  ];
}

export const flagWord = (flag: string): string =>
  flag === "critical-high" ? "Critical High" : flag === "critical-low" ? "Critical Low" : flag === "high" ? "High" : flag === "low" ? "Low" : "";
