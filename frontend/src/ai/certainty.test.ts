import { describe, expect, it } from "vitest";

import type { CertaintyValue, Finding } from "@/contracts/types.gen";

import { certaintyView, findingsForRow, levelOf, pickCertainty, type CertaintyConfig } from "./certainty";

const registry = { certainty_metrics: { evidence_agreement: { label: "Agreement of Evidence" },
                                        prediction_interval: { label: "Prediction interval" } } } as any;
const cfg = (display: CertaintyConfig["display"]): CertaintyConfig =>
  ({ display, badge_medium_at: 0.5, badge_high_at: 0.8, show_metric_name: true } as CertaintyConfig);
const value = (score: number, metric = "evidence_agreement", text = "x"): CertaintyValue =>
  ({ metric, score, text, raw: {} }) as CertaintyValue;

describe("certainty display", () => {
  it("shows the same score as a percent, natural frequency, badge or bars", () => {
    expect(certaintyView(value(0.62), cfg("percent"), registry).text).toBe("62%");
    expect(certaintyView(value(0.62), cfg("natural-frequency"), registry).text).toBe("6 in 10");
    expect(certaintyView(value(0.62), cfg("badge"), registry).text).toBe("Medium");
    expect(certaintyView(value(0.62), cfg("bars"), registry).bars).toBe(3);
  });
  it("an interval metric shows its interval; any other metric falls back to a percent", () => {
    expect(certaintyView(value(0.7, "prediction_interval", "5 to 8"), cfg("interval"), registry).text).toBe("5 to 8");
    expect(certaintyView(value(0.7), cfg("interval"), registry).text).toBe("70%");
  });
  it("opacity and dash density fall as certainty falls", () => {
    const hi = certaintyView(value(0.95), cfg("opacity"), registry);
    const lo = certaintyView(value(0.3), cfg("opacity"), registry);
    expect(lo.opacity).toBeLessThan(hi.opacity);
    expect(hi.dash).toBe("");
    expect(lo.dash).not.toBe("");
  });
  it("levels follow the design's thresholds", () => {
    expect([0.2, 0.5, 0.79, 0.8].map((s) => levelOf(s, cfg("badge")))).toEqual(["low", "medium", "medium", "high"]);
  });
  it("names the metric from the registry", () => {
    expect(certaintyView(value(0.5), cfg("percent"), registry).metricLabel).toBe("Agreement of Evidence");
  });
  it("picks the design's metric, else the first the finding has", () => {
    const vs = [value(0.4, "input_quality"), value(0.9, "evidence_agreement")];
    expect(pickCertainty(vs, "evidence_agreement")!.score).toBe(0.9);
    expect(pickCertainty(vs, "sensitivity")!.metric).toBe("input_quality");
    expect(pickCertainty([], "x")).toBeNull();
  });
});

describe("findings for a row", () => {
  const f = (id: string, parameter: string | null) => ({ id, parameter }) as Finding;
  it("matches the row's parameter only", () => {
    const all = [f("a", "hr"), f("b", "spo2"), f("c", null), f("d", "hr")];
    expect(findingsForRow(all, "hr").map((x) => x.id)).toEqual(["a", "d"]);
    expect(findingsForRow(all, null)).toEqual([]);
  });
});
