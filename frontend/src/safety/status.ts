import type { Registry } from "@/app/api";
import type { SignalStatus } from "@/contracts/types.gen";
import type { Design } from "@/design/types";

import type { Link } from "./store";

export type Tone = "normal" | "inactive" | "technical" | "stale";

/** What to draw where a number would go. There is no blank and no "--". */
export interface ValueDisplay {
  /** Signal state id, or 'no-data' when this screen itself is not receiving. */
  kind: string;
  /** The word shown instead of (or, for a poor trace, beside) the number. */
  text: string;
  showValue: boolean;
  /** Value is shown but should be read with caution (poor trace). */
  flagged: boolean;
  tone: Tone;
  /** One line saying what to check; empty when the design hides advice. */
  advice: string;
  /** Last valid value and its age, only when the design asks for it. Never current. */
  last: { value: number | string; age: string } | null;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min ago` : `${h} h ago`;
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Args {
  signal: SignalStatus | undefined;
  value: number | string | null | undefined;
  link: Link;
  now: number;
  safety: Design["safety"];
  registry: Pick<Registry, "signal_states" | "signal_issues">;
}

/**
 * The one place that decides what a numeric shows. Order matters:
 *  1. if this screen is not receiving data, nothing on it can be trusted;
 *  2. otherwise the server's stated signal state decides;
 *  3. a parameter the server has said nothing about is on standby;
 *  4. a value is only ever shown for 'ok' and 'poor-signal'.
 */
export function displayFor({ signal, value, link, now, safety, registry }: Args): ValueDisplay {
  const none = { showValue: false, flagged: false, advice: "", last: null };
  if (link === "connecting") return { kind: "no-data", text: "CONNECTING", tone: "inactive", ...none };
  if (link !== "live") return { kind: "no-data", text: "NO DATA", tone: "stale", ...none };

  const state = signal?.state ?? "standby";
  const meta = registry.signal_states[state];
  const hasValue = value !== null && value !== undefined;

  if (state === "ok") {
    // The server says the signal is fine but sent no number: say so, never a blank.
    return hasValue ? { kind: "ok", text: "", tone: "normal", ...none, showValue: true }
      : { kind: "invalid", text: registry.signal_states.invalid!.text, tone: "technical", ...none };
  }

  const issue = signal?.issue ? registry.signal_issues[signal.issue] : undefined;
  const advice = safety.show_advice ? (signal?.advice || issue?.advice || "") : "";
  const text = state === "standby" ? safety.standby_text : (meta?.text ?? state.toUpperCase());
  const tone = (meta?.tone ?? "technical") as Tone;

  if (state === "poor-signal") {
    return { kind: state, text, tone, advice, last: null, flagged: true, showValue: hasValue };
  }
  const last = safety.stale_values === "dim-with-age" && state === "connection-lost"
    && signal?.last_value != null && signal.last_value_at
    ? { value: signal.last_value, age: ago(now - Date.parse(signal.last_value_at)) } : null;
  return { kind: state, text, tone, advice, last, flagged: false, showValue: false };
}
