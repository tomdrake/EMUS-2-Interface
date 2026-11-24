import { describe, expect, it } from "vitest";

import { chipText, findingName, spanText } from "./certainty";

const registry = { certainty_metrics: {} } as any;
const cfg = (display: string) => ({ display, badge_medium_at: 0.5, badge_high_at: 0.8, show_metric_name: true }) as any;
const finding = (over: object = {}) => ({ id: "f", label: "AF", domain: "rhythm", status: "active", generated_at: "2026-11-24T12:00:00Z", offset: null, ...over }) as any;
const cert = { metric: "evidence_agreement", score: 0.8, text: "x", raw: {} } as any;

describe("AI chip wording", () => {
  it("is the finding then the certainty: AF - 80% Certainty", () => {
    expect(chipText(finding(), cert, cfg("percent"), registry)).toBe("AF - 80% Certainty");
    expect(chipText(finding(), cert, cfg("natural-frequency"), registry)).toBe("AF - 8 in 10 Certainty");
    expect(chipText(finding(), cert, cfg("badge"), registry)).toBe("AF - High Certainty");
  });
  it("is just the name when the design hides how sure, or there is no value", () => {
    expect(chipText(finding(), cert, cfg("percent"), registry, false)).toBe("AF");
    expect(chipText(finding(), null, cfg("percent"), registry)).toBe("AF");
  });
  it("puts a finding in Title Case", () => {
    expect(findingName(finding({ label: "Falling oxygen saturation" }))).toBe("Falling Oxygen Saturation");
  });
  it("calls an ended rhythm its last run, and anything else just says how long ago", () => {
    const gone = { status: "resolved", offset: "2026-11-24T09:46:00Z" };
    expect(findingName(finding(gone))).toBe("Last Run of AF 2 h 14 min Ago");
    expect(findingName(finding({ ...gone, domain: "activity", label: "Fall detected", offset: "2026-11-24T11:20:00Z" }))).toBe("Fall Detected 40 min Ago");
  });
  it("writes spans in the units clinicians write", () => {
    expect([spanText(9), spanText(134), spanText(60)]).toEqual(["9 min", "2 h 14 min", "1 h 0 min"]);
  });
});
