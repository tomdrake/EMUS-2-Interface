import { fireEvent, render, screen as dom } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useUi } from "@/app/store";
import { useExample } from "@/examples/store";

import { ExplanationExamples } from "./ExplanationExamples";
import { toCsv, UnderlyingData } from "./UnderlyingData";
import { WhySheet } from "./WhySheet";

const model = { name: "Transparent rules (example)", version: "0.1", placeholder: true };
const cert = [{ metric: "evidence_agreement", score: 0.8, text: "4 of 5 signals", raw: {} },
              { metric: "input_quality", score: 0.9, text: "90% of expected data", raw: {} }];
const finding = { id: "f1", parameter: "hr", domain: "rhythm", code: "af", label: "AF", status: "active", severity: "warning",
  summary: "AF now, started 11 min ago", explanation: "AF because: R-R intervals vary by 17%.", certainty: cert, evidence: [],
  model, generated_at: "2026-11-24T10:00:00Z" };
const strip = (reading: string) => ({ waveform: "ecg", hz: 100, seconds: 2, ends_s_before_now: 0, samples: new Array(200).fill(0),
  quality: { sqi: 1 }, reading, marks: [{ kind: "bracket", start_s: 0, end_s: 1, label: "Irregular R-R", tone: "finding", finding_id: "f1" }], caption: "" });
const snapshot = {
  title: "Paroxysmal AF after surgery", numerics: { hr: 144, spo2: 95 }, findings: [finding],
  finding_data: { f1: { finding_id: "f1", strip: strip("af"), baseline_strip: strip("sinus"), rr_intervals_s: [0.4, 0.6],
    features: { "Mean Rate": "147 /min" }, rule: "AF when R-R varies by more than 12%.",
    reasons: [{ factor: "R-R varies by 17%", direction: "raises", weight: 1, parameter: null, evidence: [] }], values: [] } },
  trends: { hr: { parameter: "hr", unit: "bpm", device_id: "anne-chest", quality: 0.9, points: [{ t: -10, v: 80 }, { t: 0, v: 144 }] } },
  signals: { hr: { state: "ok", quality: 0.9, issue: null } },
  devices: [{ id: "anne-chest", label: "Chest sensor", connection: "connected", battery_pct: 70 }],
  forecast: { forecasts: [] }, alarms: { active: [] },
} as any;

beforeEach(() => {
  useUi.setState({ sheetContext: "f1", pxPerMm: 3.78,
    stored: { document: { forecast: { certainty: { display: "percent", finding_metric: "evidence_agreement", badge_medium_at: 0.5,
      badge_high_at: 0.8, show_metric_name: true } } } as any } as any,
    registry: { parameters: { hr: { label: "Heart Rate", unit: "bpm", default_low: 50, default_high: 120, method: "ECG" } },
      waveforms: { ecg: { label: "ECG", scale: { unit: "mV", calibrated: true, gains_mm_per_unit: [5, 10, 20], default_gain: 10, tick: 0.5,
        baseline: "isoelectric", range: [-0.5, 1] } } },
      certainty_metrics: { evidence_agreement: { label: "Agreement of evidence", tells_you: "How many signals agree." },
                           input_quality: { label: "Data quality", tells_you: "How clean the data was." } },
      signal_states: { ok: { text: "" } }, signal_issues: {} } as any });
  useExample.setState({ enabled: true, snapshot });
});

describe("Why sheet", () => {
  it("shows the rule, what was measured, the reasons and every certainty measure, and says it is an example", () => {
    render(<WhySheet />);
    expect(dom.getByTestId("why-summary").textContent).toContain("AF now");
    expect(dom.getByTestId("why-rule").textContent).toContain("R-R varies by more than 12%");
    expect(dom.getByTestId("why-measured").textContent).toContain("147 /min");
    expect(dom.getByTestId("why-reasons").textContent).toContain("100%");
    expect(dom.getByTestId("why-rr").textContent).toContain("0.40, 0.60");
    const rows = dom.getByTestId("why-certainty").querySelectorAll("tbody tr");
    expect([...rows].map((r) => (r as HTMLElement).dataset.metric)).toEqual(["evidence_agreement", "input_quality"]);
    expect(dom.getByTestId("why-certainty").querySelector(".is-shown")!.textContent).toContain("shown on the monitor");
    expect(dom.getByTestId("example-note").textContent).toContain("not a clinical model");
  });
  it("draws the evidence strip and the patient's own baseline", () => {
    render(<WhySheet />);
    expect(dom.getByTestId("why-evidence")).toBeTruthy();
    expect(dom.getByTestId("why-baseline").textContent).toContain("own sinus rhythm");
  });
  it("the question box is disabled and says why", () => {
    render(<WhySheet />);
    expect((dom.getByTestId("why-ask") as HTMLInputElement).disabled).toBe(true);
    expect(dom.getByTestId("why-ask-note").textContent).toContain("API token");
  });
  it("says so when the finding is no longer current, or example data is off", () => {
    useUi.setState({ sheetContext: "gone" });
    const { unmount } = render(<WhySheet />);
    expect(dom.getByTestId("why-empty").textContent).toContain("not current");
    unmount();
    useExample.setState({ enabled: false });
    render(<WhySheet />);
    expect(dom.getByTestId("why-empty").textContent).toContain("Example data is off");
  });
  it("links to the underlying data of the item", () => {
    render(<WhySheet />);
    fireEvent.click(dom.getByTestId("why-data"));
    expect(useUi.getState().openSheet).toBe("underlying-data");
    expect(useUi.getState().sheetContext).toBe("hr");
  });
});

describe("Underlying data", () => {
  it("lists the values, source, signal state, limits and the raw evidence", () => {
    useUi.setState({ sheetContext: "hr" });
    render(<UnderlyingData />);
    expect(dom.getByTestId("ud-value").textContent).toBe("144");
    expect(dom.getByTestId("ud-device").textContent).toContain("Chest sensor, connected, battery 70%");
    expect(dom.getByTestId("ud-limits").textContent).toContain("50 to 120");
    expect(dom.getByTestId("ud-finding-af").textContent).toContain("147 /min");
    expect(dom.getByTestId("ud-table").querySelectorAll("tbody tr")).toHaveLength(2);
  });
  it("offers a choice of item when none was given", () => {
    useUi.setState({ sheetContext: null });
    render(<UnderlyingData />);
    expect(dom.getByTestId("ud-option-hr")).toBeTruthy();
  });
  it("the CSV has a header, one line per value, and says it is example data", () => {
    const csv = toCsv(snapshot, "hr", "bpm").split("\n");
    expect(csv[0]).toBe("minutes_before_now,value,unit,device,quality,example_data");
    expect(csv[1]).toBe("10,80,bpm,anne-chest,0.90,true");
    expect(csv).toHaveLength(3);
    expect(toCsv(snapshot, "nope", "")).toBe("");
  });
});

describe("Explanation examples", () => {
  it("offers seven styles, each saying who it suits and what to watch for, opened one at a time", () => {
    render(<ExplanationExamples />);
    const cards = dom.getByTestId("gallery").querySelectorAll("article");
    expect(cards).toHaveLength(7);
    expect([...cards].every((c) => /Good for/.test(c.textContent!) && /Watch for/.test(c.textContent!))).toBe(true);
    fireEvent.click(dom.getByTestId("style-reasons").querySelector("button")!);
    expect(dom.getByTestId("ex-reasons")).toBeTruthy();
    fireEvent.click(dom.getByTestId("style-frequency").querySelector("button")!);
    expect(dom.queryByTestId("ex-reasons")).toBeNull();
    expect(dom.getByTestId("ex-frequency").textContent).toContain("8 in 10");
  });
  it("says when a style has nothing to show here instead of drawing something", () => {
    render(<ExplanationExamples />);
    fireEvent.click(dom.getByTestId("style-whatif").querySelector("button")!);
    expect(dom.getByTestId("style-whatif").textContent).toContain("no what-if");
  });
});
