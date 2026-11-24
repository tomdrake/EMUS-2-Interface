import type { ExampleStrip } from "@/contracts/types.gen";

import { NOMINAL_PX_PER_MM } from "./traceScale";

/**
 * Geometry for drawing a strip of samples inside a trace frame. Pure.
 *
 * The strip is drawn with the same vertical transform (`waveTransform`) as the reference
 * marks, so the 1 mV bar and the trace share one scale by construction. Horizontally the
 * sweep speed (mm/s, the row's x scale) sets how many seconds fit: pixels per second =
 * speed x pixels per mm. The most recent seconds are shown; a strip shorter than the
 * window starts at the left edge.
 */
export interface StripWindow {
  /** Seconds from the start of the strip at the left edge of the drawing. */
  startSec: number;
  pxPerSec: number;
  x0: number;
  x1: number;
}

export function stripWindow(strip: Pick<ExampleStrip, "seconds">, args: {
  x0: number; x1: number; speedMmPerS: number; pxPerMm?: number;
}): StripWindow {
  const pxPerSec = args.speedMmPerS * (args.pxPerMm ?? NOMINAL_PX_PER_MM);
  const visible = Math.max(0, (args.x1 - args.x0) / pxPerSec);
  return { startSec: Math.max(0, strip.seconds - visible), pxPerSec, x0: args.x0, x1: args.x1 };
}

export const xAtSec = (w: StripWindow, sec: number): number => w.x0 + (sec - w.startSec) * w.pxPerSec;

/** SVG path for the visible part of a strip. `y` maps a sample value to pixels. */
export function stripPath(strip: Pick<ExampleStrip, "samples" | "hz" | "seconds">, w: StripWindow,
                          y: (v: number) => number, heightPx: number): string {
  const first = Math.max(0, Math.floor(w.startSec * strip.hz));
  // More samples than pixels is wasted work: keep about two per pixel.
  const step = Math.max(1, Math.floor(strip.hz / (w.pxPerSec * 2)));
  const clamp = (v: number) => Math.min(heightPx, Math.max(0, v));
  const parts: string[] = [];
  for (let i = first; i < strip.samples.length; i += step) {
    const x = xAtSec(w, i / strip.hz);
    if (x > w.x1 + 0.5) break;
    parts.push(`${parts.length ? "L" : "M"}${x.toFixed(1)} ${clamp(y(strip.samples[i]!)).toFixed(1)}`);
  }
  return parts.join("");
}

/** The drawn strip, in the row's colour. */
export function StripPath({ strip, w, y, heightPx, rowId }: {
  strip: ExampleStrip; w: StripWindow; y: (v: number) => number; heightPx: number; rowId: string;
}) {
  const d = stripPath(strip, w, y, heightPx);
  if (!d) return null;
  return <path className="trace-signal" data-testid={`trace-signal-${rowId}`}
               data-quality={strip.quality.grade} d={d} />;
}

/** The whole strip, from its first sample at x0, for a trace that sweeps (see TraceFrame). */
export function fullWindow(strip: Pick<ExampleStrip, "seconds">, args: { x0: number; speedMmPerS: number; pxPerMm?: number }): StripWindow {
  const pxPerSec = args.speedMmPerS * (args.pxPerMm ?? NOMINAL_PX_PER_MM);
  return { startSec: 0, pxPerSec, x0: args.x0, x1: args.x0 + strip.seconds * pxPerSec };
}

/** How the sweep moves: how far the strip travels and how long that takes, so it moves at the sweep speed. */
export function sweepMotion(strip: Pick<ExampleStrip, "seconds">, plotWidth: number, pxPerSec: number): { travelPx: number; seconds: number } | null {
  const travelPx = strip.seconds * pxPerSec - plotWidth;
  return travelPx > 1 ? { travelPx, seconds: travelPx / pxPerSec } : null;
}
