import { useDesign, useUi } from "@/app/store";
import type { Design } from "@/design/types";

import { Choice, DraftNote, Stepper, Switch } from "./controls";
import { useEditor } from "./editor";

const DISPLAYS = [
  { value: "percent", label: "Percent" }, { value: "natural-frequency", label: "6 in 10" }, { value: "interval", label: "Interval" },
  { value: "badge", label: "Low / High" }, { value: "bars", label: "Bars" }, { value: "opacity", label: "Fade" }, { value: "dash-density", label: "Dashes" },
] as const;

/** AI and forecast: whether AI is shown, what it marks, and how certainty is drawn. */
export function AiSettingsSheet() {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const dirty = useUi((s) => !!s.draft);
  const apply = useEditor.getState().apply;
  const ai = design.ai;
  const cert = design.forecast.certainty;
  const setAi = (patch: Partial<Design["ai"]>) => apply((d) => ({ ...d, ai: { ...d.ai, ...patch } }) as Design);
  const setCert = (patch: Partial<Design["forecast"]["certainty"]>) =>
    apply((d) => ({ ...d, forecast: { ...d.forecast, certainty: { ...d.forecast.certainty, ...patch } } }) as Design);
  const metrics = Object.values(registry.certainty_metrics).filter((m) => m.applies_to.includes("finding"));
  return (
    <div className="settings" data-testid="ai-settings">
      <DraftNote dirty={dirty} />
      <h4>AI interpretation</h4>
      <Switch testId="ai-enabled" label="AI on by default" checked={ai.enabled} onChange={(v) => setAi({ enabled: v })}
              hint="The AI button in the top bar overrides this for one screen." />
      <Switch testId="ai-chips" label="Chip on each module" checked={ai.show_row_chips} onChange={(v) => setAi({ show_row_chips: v })} />
      <Switch testId="ai-annotations" label="Marks on traces saying why" checked={ai.show_trace_annotations} onChange={(v) => setAi({ show_trace_annotations: v })} />
      <Switch testId="ai-explain" label="Why? link on findings" checked={ai.show_explain_link} onChange={(v) => setAi({ show_explain_link: v })} />
      <Switch testId="ai-confidence" label="Show how sure" checked={ai.show_confidence} onChange={(v) => setAi({ show_confidence: v })} />
      <Stepper testId="ai-floor" label="Hide findings below" value={ai.min_confidence} step={0.1} min={0} max={1}
               format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setAi({ min_confidence: v })} />
      <h4>Certainty</h4>
      <Choice testId="cert-display" label="Shown as" value={cert.display} options={[...DISPLAYS]} onChange={(v) => setCert({ display: v })} />
      <label className="field">Measure shown for findings
        <select value={cert.finding_metric} data-testid="cert-metric" onChange={(e) => setCert({ finding_metric: e.target.value as typeof cert.finding_metric })}>
          {metrics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <p className="demo-note" data-testid="cert-tells">{registry.certainty_metrics[cert.finding_metric]?.tells_you}</p>
      <Switch testId="cert-name" label="Name the measure" checked={cert.show_metric_name} onChange={(v) => setCert({ show_metric_name: v })} />
      <Stepper testId="cert-medium" label="Medium from" value={cert.badge_medium_at} step={0.05} min={0} max={Math.max(0, cert.badge_high_at - 0.05)}
               format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setCert({ badge_medium_at: v })} />
      <Stepper testId="cert-high" label="High from" value={cert.badge_high_at} step={0.05} min={Math.min(1, cert.badge_medium_at + 0.05)} max={1}
               format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setCert({ badge_high_at: v })} />
    </div>
  );
}
