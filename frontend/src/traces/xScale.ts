import type { Design, Row } from "@/design/types";

/** Sweep speeds a waveform can be set to (mm/s). The same four the design allows. */
export const SPEEDS_MM_S = [6.25, 12.5, 25, 50] as const;
/** Time windows a trend can be set to (minutes). */
export const WINDOWS_MIN = [15, 60, 240, 720, 1440] as const;

export type XKind = "speed" | "window";

export const speedLabel = (mmPerS: number): string => `${mmPerS} mm/s`;

/** 15 -> "15 min", 60 -> "1 h", 240 -> "4 h", 90 -> "1.5 h". */
export function windowLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return `${Number.isInteger(h) ? h : Number(h.toFixed(1))} h`;
}

export interface XScale {
  kind: XKind;
  value: number;
  label: string;
  options: { value: number; label: string }[];
  /** True when this screen has changed it from the design's value. */
  overridden: boolean;
}

/**
 * The x scale of one trace: a sweep speed for a waveform, a time window for a trend.
 * This screen's choice (a local preference, like dark / light) wins over the design's.
 * The M2 canvas must read the same value so the number and the trace always agree.
 */
export function xScaleFor(row: Pick<Row, "trace" | "trend_window_min" | "id">,
                          design: Pick<Design, "sweep">, local: Record<string, number>): XScale | null {
  const waveform = row.trace === "waveform";
  if (!waveform && row.trace !== "trend") return null;
  const base = waveform ? design.sweep.speed_mm_s : row.trend_window_min;
  const value = local[row.id] ?? base;
  const list: readonly number[] = waveform ? SPEEDS_MM_S : WINDOWS_MIN;
  // The design may use a value that is not in the usual list: keep it available.
  const values = [...new Set([...list, base, value])].sort((a, b) => a - b);
  const label = waveform ? speedLabel : windowLabel;
  return {
    kind: waveform ? "speed" : "window", value, label: label(value),
    options: values.map((v) => ({ value: v, label: label(v) })),
    overridden: local[row.id] !== undefined && local[row.id] !== base,
  };
}
