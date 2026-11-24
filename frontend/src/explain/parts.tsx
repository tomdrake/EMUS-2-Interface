import type { Registry } from "@/app/api";
import { titleCase } from "@/design/text";
import { Certainty } from "@/ai/Certainty";
import type { CertaintyConfig } from "@/ai/certainty";
import type { CertaintyValue, Contributor } from "@/contracts/types.gen";

/** Reasons as bars: each reason's share of the explanation, and which way it pushes. */
export function ReasonBars({ reasons, testId }: { reasons: readonly Pick<Contributor, "factor" | "weight" | "direction">[]; testId: string }) {
  return (
    <ul className="reasons" data-testid={testId}>
      {reasons.map((r) => (
        <li key={r.factor}>
          <span className="reason-text">{r.factor}</span>
          <span className="reason-bar" role="img" aria-label={`${Math.round(r.weight * 100)}% of the explanation`}>
            <i style={{ width: `${Math.round(r.weight * 100)}%` }} />
          </span>
          <span className="reason-weight">{Math.round(r.weight * 100)}%</span>
          <span className="reason-dir">{r.direction === "raises" ? "raises concern" : "lowers concern"}</span>
        </li>
      ))}
    </ul>
  );
}

/** Every certainty metric the output carries: what it is, what it tells you, and which one the monitor shows. */
export function CertaintyTable({ values, cfg, registry, shownMetric, testId }: {
  values: readonly CertaintyValue[]; cfg: CertaintyConfig; registry: Pick<Registry, "certainty_metrics">;
  shownMetric: string; testId: string;
}) {
  return (
    <table className="certainty-table" data-testid={testId}>
      <thead><tr><th>Measure</th><th>Value</th><th>What It Tells You</th></tr></thead>
      <tbody>
        {values.map((v) => {
          const m = registry.certainty_metrics[v.metric];
          return (
            <tr key={v.metric} data-metric={v.metric} className={v.metric === shownMetric ? "is-shown" : ""}>
              <th scope="row">{titleCase(m?.label ?? v.metric)}{v.metric === shownMetric && <small> shown on the monitor</small>}</th>
              <td><Certainty value={v} cfg={cfg} registry={registry} showName={false} /> <small>{v.text}</small></td>
              <td>{m?.tells_you ?? ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** One line saying this is an example and what kind of reading it is. */
export function ExampleNote({ model }: { model: { name: string; version: string; placeholder: boolean } }) {
  return (
    <p className="example-note" data-testid="example-note">
      
      {model.name} v{model.version}: {model.placeholder
        ? "a short readable rule over a simulated signal, not a clinical model. Certainty is derived from what the rule measured and is not calibrated."
        : "model output."}
    </p>
  );
}
