import { Certainty } from "@/ai/Certainty";
import { pickCertainty, spanText } from "@/ai/certainty";
import { useDesign, useUi } from "@/app/store";
import type { Finding } from "@/contracts/types.gen";
import { fmtDateTime, useFormats } from "@/design/datetime";
import type { WidgetOf } from "@/design/types";
import { useSnapshot } from "@/examples/store";

const SEVERITY: Record<Finding["severity"], string> = { critical: "Critical", warning: "Warning", info: "Info" };

/**
 * What the AI sees now: the interpretation's findings, active first, each with how serious it is, a one-sentence summary,
 * how sure the AI is (in the design's style) and when it began. A tap opens the Why sheet for that finding. Nothing found
 * says so in words, and with the AI turned off it says that instead.
 */
export function AiSummary({ widget }: { widget: WidgetOf<"ai-summary"> }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const aiOn = useUi((s) => s.aiOverride) ?? design.ai.enabled;
  const snapshot = useSnapshot();
  const formats = useFormats();
  const cfg = design.forecast.certainty;
  if (!snapshot) return <p className="demo-note" data-prose data-testid="ais-empty">No findings to show. Turn on example data in Demo Controls.</p>;
  if (!aiOn) return <p className="demo-note" data-prose data-testid="ais-off">The AI is turned off, so there is no interpretation to show.</p>;
  const nowMs = Date.parse(snapshot.generated_at);
  const list = snapshot.findings.filter((f) => widget.include_resolved || f.status === "active").slice(0, widget.max_items);
  if (!list.length) return <p className="demo-note" data-prose data-testid="ais-none">The AI sees nothing to flag.</p>;
  return (
    <ul className="ai-summary" data-testid="ai-summary" data-count={list.length}>
      {list.map((f) => {
        const c = pickCertainty(f.certainty, cfg.finding_metric);
        const age = Math.max(0, Math.round((nowMs - Date.parse(f.onset)) / 60000));
        return (
          <li key={f.id}>
            <button type="button" className={`ais-item sev-${f.severity}${f.status === "resolved" ? " is-resolved" : ""}`} data-testid={`ais-${f.id}`} data-status={f.status}
                    onClick={() => useUi.getState().showSheet("finding-explain", f.id)}>
              <span className="ais-top">
                <span className="ais-sev" data-testid={`ais-sev-${f.id}`}>{SEVERITY[f.severity]}</span>
                <strong className="ais-label">{f.label}</strong>
                <span className="ais-status">{f.status === "active" ? "Active" : "Resolved"}</span>
                {c && <span className="ais-cert"><Certainty value={c} cfg={cfg} registry={registry} showName={false} /></span>}
              </span>
              <span className="ais-summary" data-prose>{f.summary}</span>
              <span className="ais-when">Began {fmtDateTime(f.onset, formats, { short: true })} ({age < 1 ? "Now" : `${spanText(age)} Ago`})</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
