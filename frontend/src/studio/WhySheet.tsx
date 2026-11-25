import { fmtTime, useFormats } from "@/design/datetime";
import { titleCase } from "@/design/text";
import { CertaintyTable, ExampleNote, ReasonBars } from "@/explain/parts";
import { EvidenceStrip, SeriesChart } from "@/explain/EvidenceStrip";
import { pickCertainty } from "@/ai/certainty";
import { useDesign, useUi } from "@/app/store";
import { useSnapshot } from "@/examples/store";

/**
 * Why the AI says this: what it looked at, the rule, what it measured, the reasons with their
 * weights, and how sure it is by every measure it carries. Nothing here is drawn from anywhere but the
 * finding itself, so what is explained is exactly what was shown. A question to the language model
 * waits for an API token (milestone M5) and says so.
 */
export function WhySheet() {
  const id = useUi((s) => s.sheetContext);
  const registry = useUi((s) => s.registry)!;
  const design = useDesign()!;
  const snapshot = useSnapshot();
  const formats = useFormats();
  const f = snapshot?.findings.find((x) => x.id === id);
  const data = id && snapshot ? snapshot.finding_data[id] : undefined;
  if (!snapshot) {
    return <p className="why-empty" data-testid="why-empty">Example data is off, so there is nothing to explain. Turn it on in Demo Controls.</p>;
  }
  if (!f) {
    return <p className="why-empty" data-testid="why-empty">This finding is not current at this moment of the scenario. Close this and look at the monitor.</p>;
  }
  const cfg = design.forecast.certainty;
  const shown = pickCertainty(f.certainty, cfg.finding_metric)?.metric ?? "";
  const param = f.parameter ? registry.parameters[f.parameter] : null;
  return (
    <div className="why" data-testid="why-sheet" data-finding={f.id}>
      <header className="why-head">
        <h3 data-testid="why-summary" data-prose>{f.summary}</h3>
        <p className="why-sub">
          {f.label} · {f.status === "active" ? "happening now" : "earlier"} · severity {f.severity}
          {" · read at "}{fmtTime(f.generated_at, formats)}
        </p>
      </header>

      {data?.strip && (
        <section aria-label="What the AI looked at">
          <h4>What It Looked at</h4>
          <EvidenceStrip strip={data.strip} testId="why-evidence"
                         caption={`${registry.waveforms[data.strip.waveform]?.label ?? "Trace"}, the marked part is what the rule read`} />
          {data.baseline_strip && (
            <EvidenceStrip strip={data.baseline_strip} testId="why-baseline"
                           caption="For comparison: this patient's own sinus rhythm earlier" />
          )}
        </section>
      )}
      {!data?.strip && data && data.values.length > 1 && f.parameter && (
        <section aria-label="What the AI looked at">
          <h4>What It Looked at</h4>
          <SeriesChart points={data.values} unit={param?.unit ?? ""} testId="why-evidence" caption={f.label} />
        </section>
      )}
      {f.evidence.some((e) => e.type === "image") && (
        <p className="why-note" data-testid="why-image">{f.explanation} The image itself is not shown in the prototype.</p>
      )}

      {data && data.reasons.length > 0 && (
        <section aria-label="Reasons">
          <h4>Reasons</h4>
          <ReasonBars reasons={data.reasons} testId="why-reasons" />
          <p className="why-note">The weights are each reason's share of the explanation.
            {data.reasons.length > 1 && data.reasons.every((r) => r.weight === data.reasons[0]!.weight)
              && " They are equal because this rule needs every criterion met; a trained model's would differ."}</p>
        </section>
      )}

      {data && (
        <section aria-label="Rule and measurements">
          <h4>The Rule</h4>
          <p data-testid="why-rule">{data.rule || f.explanation}</p>
          <dl className="why-measured" data-testid="why-measured">
            {Object.entries(data.features).map(([k, v]) => (<div key={k}><dt>{titleCase(k)}</dt><dd>{v}</dd></div>))}
          </dl>
          {data.rr_intervals_s.length > 0 && (
            <p className="why-note" data-testid="why-rr">R-R intervals (s): {data.rr_intervals_s.map((x) => x.toFixed(2)).join(", ")}</p>
          )}
        </section>
      )}

      <section aria-label="How Sure">
        <h4>How Sure</h4>
        <CertaintyTable values={f.certainty} cfg={cfg} registry={registry} shownMetric={shown} testId="why-certainty" />
      </section>

      <ExampleNote model={f.model} />

      <section aria-label="Ask a Question">
        <h4>Ask a Question</h4>
        <label className="why-ask">
          <input type="text" disabled placeholder="Why do you think this was AF?" data-testid="why-ask" />
          <button type="button" className="btn" disabled>Ask</button>
        </label>
        <p className="why-note" data-testid="why-ask-note">Questions to the language model need an API token, which is added in Settings (milestone M5). Only this finding would be sent, with no patient identifiers.</p>
      </section>

      <div className="why-links">
        {f.parameter && (
          <button type="button" className="btn" data-testid="why-data"
                  onClick={() => useUi.getState().showSheet("underlying-data", f.parameter)}>Underlying Data</button>
        )}
      </div>
    </div>
  );
}
