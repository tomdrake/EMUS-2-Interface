import { useDesign, useUi } from "@/app/store";
import type { Finding } from "@/contracts/types.gen";
import type { Row } from "@/design/types";
import { useSnapshot } from "@/examples/store";
import { useSafety } from "@/safety/store";

import { titleCase } from "@/design/text";

import { Certainty } from "./Certainty";
import { certaintyView, chipText, findingsForRow, pickCertainty } from "./certainty";
import { useAiOn } from "./useAi";

/** Items the interpretation reads. The others (oxygen flow, activity ...) show no chip unless a finding names them. */
const INTERPRETED = new Set(["hr", "pulse", "spo2", "rr", "bp_sys", "temp", "falls"]);
const NO_SIGNAL = new Set(["standby", "acquiring", "sensor-off", "connection-lost", "invalid"]);

/** What the AI chip of a row says, decided in one place. */
export function useRowAi(row: Row) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const snapshot = useSnapshot();
  const link = useSafety((s) => s.link);
  const signal = useSafety((s) => (row.parameter ? s.signals[row.parameter] : undefined));
  const on = useAiOn(row);
  const cfg = design.forecast.certainty;
  const all = on && snapshot && link === "live" && row.parameter ? findingsForRow(snapshot.findings, row.parameter) : [];
  // A finding about the trace itself (poor trace) is always worth showing; others must clear the design's floor.
  const shown = all.filter((f) => f.code === "poor-trace" || (() => {
    const c = pickCertainty(f.certainty, cfg.finding_metric);
    return !c || c.score >= design.ai.min_confidence;
  })());
  const paused = on && !!snapshot && link === "live" && !!signal && NO_SIGNAL.has(signal.state);
  return { on: on && !!snapshot && link === "live", shown, paused, cfg, registry, design,
           top: shown[0] as Finding | undefined, more: Math.max(0, shown.length - 1) };
}

/**
 * The AI chip of a module: the most important finding about this item and how sure the AI is,
 * "AF - 80% Certainty". Nothing flagged shows nothing, but a module whose signal is missing says the
 * AI is paused, so a gap is never silent. Tapping a finding opens the explanation sheet. Off (master
 * switch or this module's own) draws nothing.
 *
 * The button is a full touch target tall, though the visible chip is smaller; the rest is transparent.
 */
export function AiChip({ row, withCertainty }: { row: Row; withCertainty: boolean }) {
  const { on, top, paused, cfg, registry, design } = useRowAi(row);
  if (!on || !design.ai.show_row_chips) return null;
  const value = top ? pickCertainty(top.certainty, cfg.finding_metric) : null;
  const view = value ? certaintyView(value, cfg, registry) : null;
  const opacity = view && cfg.display === "opacity" ? view.opacity : 1;
  const dash = view && cfg.display === "dash-density" ? view.dash : "";

  if (!top) {
    if (!paused || !row.parameter || !INTERPRETED.has(row.parameter)) return null;
    return (
      <span className="ai-chip ai-quiet" data-testid={`ai-${row.id}`} data-state="paused">
        <span className="ai-chip-pill"><span className="ai-mark">AI</span>AI Paused - No Signal</span>
      </span>
    );
  }
  const technical = top.code === "poor-trace";
  const text = technical ? titleCase(top.label) : chipText(top, value, cfg, registry, design.ai.show_confidence && !withCertainty);
  return (
    <button type="button" className={`ai-chip ai-${top.severity}${technical ? " ai-technical" : ""}`}
            data-testid={`ai-${row.id}`} data-state="finding" data-code={top.code} data-severity={top.severity}
            aria-label={`AI: ${text}. Open the explanation`}
            onClick={(e) => { e.stopPropagation(); useUi.getState().showSheet("finding-explain", top.id); }}>
      <span className="ai-chip-pill" style={{ opacity, borderStyle: dash ? "dashed" : undefined }}>
        <span className="ai-mark">AI</span>
        <span className="ai-text">{text}</span>
      </span>
    </button>
  );
}

/** The detailed certainty of a module's top finding, with the metric named: for sizes with room. */
export function AiCertainty({ row }: { row: Row }) {
  const { on, top, cfg, registry } = useRowAi(row);
  if (!on || !top) return null;
  const value = pickCertainty(top.certainty, cfg.finding_metric);
  if (!value) return null;
  return <div className="ai-certainty" data-testid={`ai-certainty-${row.id}`}><Certainty value={value} cfg={cfg} registry={registry} /></div>;
}

/** One sentence of why, for the largest sizes. The chip above it opens the full explanation. */
export function AiExplain({ row }: { row: Row }) {
  const { on, top } = useRowAi(row);
  if (!on || !top || !top.explanation) return null;
  return (
    <div className="ai-explain" data-testid={`ai-explain-${row.id}`}>
      <span className="ai-explain-text">{top.explanation}</span>
    </div>
  );
}
