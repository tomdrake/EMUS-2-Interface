import type { Registry } from "@/app/api";
import type { CertaintyValue, Finding } from "@/contracts/types.gen";
import type { Design } from "@/design/types";

/**
 * How a certainty value is shown. Every metric is normalised to a score where 1 is most
 * certain, so any display can be driven by any metric; the design picks the metric
 * (`forecast.certainty`) and how it looks. Pure, so each display is tested without a screen.
 */
export type CertaintyConfig = Design["forecast"]["certainty"];
export type Level = "low" | "medium" | "high";

export interface CertaintyView {
  text: string;
  level: Level;
  /** Filled segments of a 5-segment bar. */
  bars: number;
  /** 0.45 to 1: how solid to draw something that carries the certainty (a chip, a dashed line). */
  opacity: number;
  /** SVG dash pattern: sparser dashes as certainty falls. Empty = solid. */
  dash: string;
  metricLabel: string;
  score: number;
}

export function levelOf(score: number, cfg: Pick<CertaintyConfig, "badge_medium_at" | "badge_high_at">): Level {
  return score >= cfg.badge_high_at ? "high" : score >= cfg.badge_medium_at ? "medium" : "low";
}

const INTERVAL_METRICS = new Set(["prediction_interval", "conformal_interval", "posterior_interval"]);

/** The finding's value for the design's metric, else its first (findings carry what the rule measured). */
export function pickCertainty(values: readonly CertaintyValue[], metric: string): CertaintyValue | null {
  return values.find((v) => v.metric === metric) ?? values[0] ?? null;
}

export function certaintyView(value: CertaintyValue, cfg: CertaintyConfig,
                              registry: Pick<Registry, "certainty_metrics">): CertaintyView {
  const s = Math.min(1, Math.max(0, value.score));
  const level = levelOf(s, cfg);
  const pct = `${Math.round(s * 100)}%`;
  let text = pct;
  switch (cfg.display) {
    case "natural-frequency": text = `${Math.round(s * 10)} in 10`; break;
    case "interval": text = INTERVAL_METRICS.has(value.metric) ? value.text : pct; break;
    case "badge": text = level[0]!.toUpperCase() + level.slice(1); break;
    default: break;
  }
  const dashLen = Math.max(2, Math.round(10 * s));
  return {
    text, level, score: s,
    bars: Math.max(s > 0 ? 1 : 0, Math.round(s * 5)),
    opacity: Number((0.45 + 0.55 * s).toFixed(2)),
    dash: s >= 0.95 ? "" : `${dashLen} ${Math.round(2 + (1 - s) * 10)}`,
    metricLabel: registry.certainty_metrics[value.metric]?.label ?? value.metric,
  };
}

/** Findings that belong to a row: the row's own parameter. Active first, as the server sorts them. */
export function findingsForRow(findings: readonly Finding[], parameter: string | null): Finding[] {
  if (!parameter) return [];
  return findings.filter((f) => f.parameter === parameter);
}

/** One line for a finding: what it is, in the words the rule produced. */
export const findingLine = (f: Finding): string => f.summary || f.label;

/** What a certainty value is a certainty OF, in one or two words, so "100%" is never bare. */
export const SHORT_NAMES: Record<string, string> = {
  prediction_interval: "range", conformal_interval: "range", posterior_interval: "range",
  ensemble_disagreement: "runs agree", calibrated_probability: "likely", ppv_natural_frequency: "right",
  time_to_event: "timing", input_quality: "data quality", population_similarity: "similar patients",
  horizon_decay: "ahead", sensitivity: "stable", evidence_agreement: "agreement", token_logprob: "token prob.",
  self_consistency: "consistent", semantic_entropy: "consistent", verbalised_confidence: "stated",
};
