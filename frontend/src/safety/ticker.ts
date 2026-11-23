import type { Notice } from "./notifications";

export interface TickerView {
  /** The item on show, or null when there is nothing to report. */
  current: Notice | null;
  /** 1-based place of `current` in the list, and the list length. */
  position: number;
  total: number;
  /** True when the ticker has stopped on a high-priority patient alarm. */
  held: boolean;
}

/**
 * What the ticker shows at step `tick`.
 *
 * Items are in the order the design asked for (severity, then newest). They take
 * turns, one per step. The exception is deliberate: while any high-priority
 * PATIENT alarm is active the ticker stops on the most recent one and holds it
 * still until it clears, so a serious alarm is never off screen between turns.
 * Monitoring problems and lower-priority alarms never hold the ticker.
 *
 * Pure so the rule can be tested without a clock.
 */
export function tickerView(notices: readonly Notice[], tick: number): TickerView {
  const total = notices.length;
  if (!total) return { current: null, position: 0, total: 0, held: false };
  const urgent = notices.filter((n) => n.about === "patient" && n.priority === "high");
  if (urgent.length) {
    const newest = urgent.reduce((a, b) => ((b.at ?? Infinity) > (a.at ?? Infinity) ? b : a));
    return { current: newest, position: notices.indexOf(newest) + 1, total, held: true };
  }
  const i = ((tick % total) + total) % total;
  return { current: notices[i]!, position: i + 1, total, held: false };
}

/** Scrolling speed for the horizontal ticker, in characters per second. */
export const CHARS_PER_S = { slow: 5, medium: 8, fast: 12 } as const;

/** Seconds one pass of a horizontal ticker takes for `chars` characters of text. */
export function marqueeSeconds(chars: number, speed: keyof typeof CHARS_PER_S): number {
  return Math.max(6, Math.round(chars / CHARS_PER_S[speed]) + 4);
}

/** A list of ids as one comparable string; the ticker restarts at the top when it changes. */
export const noticeKey = (notices: readonly Notice[]): string => notices.map((n) => n.id).join("|");
