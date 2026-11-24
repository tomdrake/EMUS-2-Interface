import { useState } from "react";

import { CertaintyTable, ExampleNote, ReasonBars } from "@/explain/parts";
import { EvidenceStrip } from "@/explain/EvidenceStrip";
import { WhatIfChart } from "@/explain/WhatIf";
import { Certainty } from "@/ai/Certainty";
import { pickCertainty } from "@/ai/certainty";
import { useDesign, useUi } from "@/app/store";
import { useSnapshot } from "@/examples/store";

interface Style { id: string; title: string; shows: string; goodFor: string; watch: string }

const STYLES: Style[] = [
  { id: "sentence", title: "A Plain Sentence", shows: "One sentence of why.",
    goodFor: "A glance at the bedside.", watch: "Cannot be checked against anything." },
  { id: "reasons", title: "Reasons As Bars", shows: "Each reason and its share of the explanation.",
    goodFor: "Seeing which reason matters most.", watch: "Shares look precise; in this example they are equal because every criterion must be met." },
  { id: "trace", title: "Marked On The Trace", shows: "The strip with the part the AI used marked.",
    goodFor: "A clinician who can read the ECG and wants to check it.", watch: "Needs a clean trace and a few seconds of attention." },
  { id: "baseline", title: "Against This Patient's Normal", shows: "The marked strip beside this patient's own sinus rhythm.",
    goodFor: "Seeing what changed for this patient.", watch: "Only as good as the baseline chosen." },
  { id: "whatif", title: "What If We Act", shows: "The expected course with and without a change.",
    goodFor: "Deciding whether to act.", watch: "A what-if is a model's estimate, not a promise." },
  { id: "certainty", title: "How Sure, By Every Measure", shows: "All the certainty measures the output carries and what each means.",
    goodFor: "Judging how far to trust it.", watch: "Many numbers; some clinicians will want only one." },
  { id: "frequency", title: "How Often This Is Right", shows: "The same certainty as a count out of ten.",
    goodFor: "Conveying chance without percentages.", watch: "In this example the count is the rule's own agreement, not a measured hit rate." },
];

/**
 * The same finding and forecast explained several ways, side by side, so clinicians can say which
 * style they would trust and use. Each card uses the real parts of the Why sheet, drawn from the example
 * now on screen. Cards say who each style suits and what to watch for.
 */
export function ExplanationExamples() {
  const snapshot = useSnapshot();
  const registry = useUi((s) => s.registry)!;
  const design = useDesign()!;
  const [open, setOpen] = useState<string | null>(null);
  if (!snapshot) return <p className="why-empty" data-testid="why-empty">Example data is off. Turn it on in Demo Controls to see explanations.</p>;

  const cfg = design.forecast.certainty;
  const withStrip = snapshot.findings.find((f) => snapshot.finding_data[f.id]?.strip && f.code !== "poor-trace");
  const f = withStrip ?? snapshot.findings[0];
  const d = f ? snapshot.finding_data[f.id] : undefined;
  const shown = f ? pickCertainty(f.certainty, cfg.finding_metric) : null;
  const spo2 = (g: string) => snapshot.forecast.forecasts.find((x) => x.parameter === "spo2" && x.scenario === g);
  const baseline = spo2("baseline");
  const whatIf = snapshot.forecast.forecasts.find((x) => x.parameter === "spo2" && x.scenario !== "baseline");

  const body = (id: string) => {
    if (!f) return <p className="why-note">No finding at this moment. Move the scenario to a time with one.</p>;
    switch (id) {
      case "sentence": return <p data-testid="ex-sentence">{f.explanation || f.summary}</p>;
      case "reasons": return d && d.reasons.length ? <ReasonBars reasons={d.reasons} testId="ex-reasons" /> : <p className="why-note">No reasons for this finding.</p>;
      case "trace": return d?.strip ? <EvidenceStrip strip={d.strip} testId="ex-trace" caption={f.label} /> : <p className="why-note">This finding has no trace. Try the Paroxysmal AF scenario.</p>;
      case "baseline": return d?.strip && d.baseline_strip ? (<><EvidenceStrip strip={d.strip} testId="ex-trace2" caption={f.label} />
        <EvidenceStrip strip={d.baseline_strip} testId="ex-baseline" caption="This patient's own sinus rhythm" /></>) : <p className="why-note">This finding has no baseline strip. Try the Paroxysmal AF scenario.</p>;
      case "whatif": return baseline && whatIf ? <WhatIfChart baseline={baseline} whatIf={whatIf} now={Number(snapshot.numerics.spo2)} unit="%" testId="ex-whatif" />
        : <p className="why-note">This scenario has no what-if for oxygen saturation. Try the pneumonia scenario.</p>;
      case "certainty": return <CertaintyTable values={f.certainty} cfg={cfg} registry={registry} shownMetric={shown?.metric ?? ""} testId="ex-certainty" />;
      case "frequency": return shown ? <p data-testid="ex-frequency" className="ex-big">
        <Certainty value={shown} cfg={{ ...cfg, display: "natural-frequency" }} registry={registry} showName={false} /> checks agree</p> : null;
      default: return null;
    }
  };
  return (
    <div className="gallery" data-testid="gallery">
      <p className="demo-note">The same {f ? `finding ("${f.summary}")` : "moment"} explained {STYLES.length} ways. Tap one to open it.
        Everything is example data and a transparent rule, not a clinical model.</p>
      {STYLES.map((s) => (
        <article key={s.id} className={`style-card${open === s.id ? " is-open" : ""}`} data-testid={`style-${s.id}`}>
          <button type="button" className="style-head" aria-expanded={open === s.id}
                  onClick={() => setOpen(open === s.id ? null : s.id)}>
            <strong>{s.title}</strong><span>{s.shows}</span>
          </button>
          <div className="style-notes"><span><b>Good for:</b> {s.goodFor}</span><span><b>Watch for:</b> {s.watch}</span></div>
          {open === s.id && <div className="style-body">{body(s.id)}</div>}
        </article>
      ))}
      {f && <ExampleNote model={f.model} />}
    </div>
  );
}
