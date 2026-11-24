import type { Registry } from "@/app/api";
import type { CertaintyValue } from "@/contracts/types.gen";

import { SHORT_NAMES, certaintyView, type CertaintyConfig } from "./certainty";

/** The certainty of one output, in the way the design asks (percent, natural frequency,
 *  interval, badge, bars; opacity and dash density are drawn by whatever carries the value). */
export function Certainty({ value, cfg, registry, showName = cfg.show_metric_name, short = false }: {
  value: CertaintyValue; cfg: CertaintyConfig; registry: Pick<Registry, "certainty_metrics">;
  showName?: boolean;
  /** Name it in one or two words after the figure ("94% agreement") instead of in full. */
  short?: boolean;
}) {
  const v = certaintyView(value, cfg, registry);
  return (
    <span className={`certainty certainty-${cfg.display} level-${v.level}`} data-testid="certainty"
          data-display={cfg.display} data-metric={value.metric} data-level={v.level} data-score={v.score.toFixed(2)}
          title={`${v.metricLabel}: ${value.text}`}>
      {cfg.display === "bars" && (
        <span className="certainty-bars" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < v.bars ? "on" : ""} />)}
        </span>
      )}
      <span className="certainty-text">{v.text}</span>
      {short ? <span className="certainty-name">{SHORT_NAMES[value.metric] ?? v.metricLabel}</span>
        : showName && <span className="certainty-name">{v.metricLabel}</span>}
    </span>
  );
}
