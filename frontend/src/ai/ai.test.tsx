import { act, fireEvent, render, screen as dom } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useDesign, useUi } from "@/app/store";
import { useExample } from "@/examples/store";
import { useSafety } from "@/safety/store";
import { Module } from "@/widgets/Module";

const content = { trace: true, ai: true, certainty: true, explain: true, forecast: false };
const row = (over: object = {}) => ({ id: "ecg", kind: "parameter", parameter: "hr", trace: "waveform", waveform: "ecg",
  numerics: ["hr"], visible: true, label: null, method: null, colour: null, trend_window_min: 60,
  content, ...over }) as any;
const sizes = {
  row: { label: "Full Row", cols: 0, rows: 1, full: true, flow: "row", fits: ["number", "trace", "ai", "certainty"] },
  "row-tall": { label: "Full Row Double", cols: 0, rows: 2, full: true, flow: "row", fits: ["number", "trace", "ai", "certainty", "explain"] },
  large: { label: "Large", cols: 2, rows: 2, full: false, flow: "stack", fits: ["number", "trace", "ai", "certainty", "explain"] },
  compact: { label: "Small Square", cols: 1, rows: 1, full: false, flow: "tile-only", fits: ["number"] },
};
const finding = { id: "f1", parameter: "hr", domain: "rhythm", code: "af", label: "AF", status: "active", severity: "warning",
  summary: "AF now, started 11 min ago", explanation: "AF because: R-R intervals vary by 17%.",
  certainty: [{ metric: "evidence_agreement", score: 0.8, text: "4 of 5 signals", raw: {} }] };
const snapshot = { numerics: { hr: 144 }, strips: [], trends: {}, findings: [finding], alarms: { active: [] } } as any;

function setup(design: object = {}) {
  window.localStorage.clear();
  useUi.setState({
    aiOverride: null, openSheet: null, sheetContext: null,
    stored: { document: { rows: [], safety: { standby_text: "STANDBY", show_advice: true, device_status: "tiles" },
      labels: { auto_capitalise: true, show_method: true }, tiles: { width_px: 220 },
      traces: { show_baseline: true, show_scale: true, show_calibration_bar: true, show_time_scale: true, ecg_gain_mm_per_mv: 10 },
      sweep: { speed_mm_s: 25 },
      ai: { enabled: true, show_row_chips: true, show_confidence: true, show_trace_annotations: true, show_explain_link: true, min_confidence: 0.5 },
      forecast: { certainty: { display: "percent", finding_metric: "evidence_agreement", badge_medium_at: 0.5, badge_high_at: 0.8, show_metric_name: true } },
      ...design } as any } as any,
    registry: { parameters: { hr: { label: "Heart Rate", short: "HR", unit: "bpm", method: "ECG" } },
      module_sizes: sizes, certainty_metrics: { evidence_agreement: { label: "Agreement of evidence" } },
      waveforms: { ecg: { label: "ECG", unit: "mV", scale: { unit: "mV", calibrated: true, gains_mm_per_unit: [5, 10, 20],
        default_gain: 10, tick: 0.5, baseline: "isoelectric", range: [-0.5, 1] } } },
      signal_states: { ok: { text: "", tone: "normal" } }, signal_issues: {} } as any,
  });
  useExample.setState({ enabled: true, snapshot });
  useSafety.setState({ link: "live", signals: { hr: { state: "ok" } } as any, devices: [], alarms: null });
}
const place = (size: string) => ({ rowId: "ecg", size, col: 1, row: 1, colSpan: 1, rowSpan: size === "row" ? 1 : 2 });
const Design = () => { useDesign(); return null; };

describe("AI on the monitor", () => {
  beforeEach(() => setup());

  it("shows the finding with its certainty, named, and opens the Why sheet on a tap", () => {
    render(<Module row={row()} placement={place("row")} />);
    const chip = dom.getByTestId("ai-ecg");
    expect(chip.textContent).toContain("AF - 80% Certainty");
    expect(chip.textContent).not.toContain("Why?");
    fireEvent.click(chip);
    expect(useUi.getState().openSheet).toBe("finding-explain");
    expect(useUi.getState().sheetContext).toBe("f1");
  });

  it("the master switch removes every AI mark", () => {
    render(<Module row={row()} placement={place("large")} />);
    expect(dom.queryByTestId("ai-ecg")).toBeTruthy();
    expect(dom.queryByTestId("ai-certainty-ecg")).toBeTruthy();
    expect(dom.queryByTestId("ai-explain-ecg")).toBeTruthy();
    act(() => useUi.getState().toggleAi());
    expect(useUi.getState().aiOverride).toBe(false);
    expect(window.localStorage.getItem("emus.ai")).toBe("off");
    render(<Module row={row({ id: "ecg2" })} placement={place("large")} />);
    expect(dom.queryByTestId("ai-ecg2")).toBeNull();
    expect(dom.queryByTestId("ai-certainty-ecg2")).toBeNull();
  });

  it("this screen's choice beats the design's setting, and can turn AI on again", () => {
    setup({ ai: { enabled: false, show_row_chips: true, show_confidence: true, show_trace_annotations: true, show_explain_link: true, min_confidence: 0.5 } });
    render(<Module row={row()} placement={place("row")} />);
    expect(dom.queryByTestId("ai-ecg")).toBeNull();
    act(() => useUi.getState().toggleAi());
    expect(useUi.getState().aiOverride).toBe(true);
  });

  it("the design can hide the chip, or keep it and hide how sure", () => {
    setup({ ai: { enabled: true, show_row_chips: false, show_confidence: true, show_trace_annotations: true, show_explain_link: true, min_confidence: 0.5 } });
    const { unmount } = render(<Module row={row()} placement={place("row")} />);
    expect(dom.queryByTestId("ai-ecg")).toBeNull();
    unmount();
    setup({ ai: { enabled: true, show_row_chips: true, show_confidence: false, show_trace_annotations: true, show_explain_link: false, min_confidence: 0.5 } });
    render(<Module row={row()} placement={place("row")} />);
    expect(dom.getByTestId("ai-ecg").textContent).toContain("AF");
    expect(dom.getByTestId("ai-ecg").textContent).not.toContain("Certainty");
  });

  it("a module's own switch turns AI off for that module only", () => {
    render(<>
      <Module row={row({ content: { ...content, ai: false } })} placement={place("row")} />
      <Module row={row({ id: "other" })} placement={place("row")} />
    </>);
    expect(dom.queryByTestId("ai-ecg")).toBeNull();
    expect(dom.queryByTestId("ai-other")).toBeTruthy();
  });

  it("a single-height row carries certainty in the chip; a double-height row gives it its own block", () => {
    const { unmount } = render(<Module row={row()} placement={place("row")} />);
    expect(dom.queryByTestId("ai-certainty-ecg")).toBeNull();
    unmount();
    render(<Module row={row()} placement={place("row-tall")} />);
    expect(dom.getByTestId("ai-certainty-ecg").textContent).toContain("Agreement of evidence");
    expect(dom.getByTestId("ai-explain-ecg").textContent).toContain("R-R intervals vary by 17%");
  });

  it("a small square has no room for the chip; nothing AI is drawn there", () => {
    render(<Module row={row()} placement={place("compact")} />);
    expect(dom.queryByTestId("ai-ecg")).toBeNull();
  });

  it("the design's certainty display is what draws it", () => {
    setup({ forecast: { certainty: { display: "badge", finding_metric: "evidence_agreement", badge_medium_at: 0.5,
      badge_high_at: 0.8, show_metric_name: true } } });
    const { unmount } = render(<Module row={row()} placement={place("row")} />);
    expect(dom.getByTestId("ai-ecg").textContent).toContain("AF - High Certainty");
    unmount();
    render(<Module row={row()} placement={place("large")} />);
    expect(dom.getByTestId("certainty").dataset.display).toBe("badge");
    expect(dom.getByTestId("certainty").textContent).toContain("High");
  });

  it("says AI is paused, not 'nothing flagged', when there is no signal to read", () => {
    useExample.setState({ snapshot: { ...snapshot, findings: [] } });
    useSafety.setState({ signals: { hr: { state: "sensor-off" } } as any });
    render(<Module row={row()} placement={place("row")} />);
    expect(dom.getByTestId("ai-ecg").dataset.state).toBe("paused");
    expect(dom.getByTestId("ai-ecg").textContent).toContain("Paused");
  });

  it("hides a finding below the design's confidence floor, but never a poor-trace warning", () => {
    useExample.setState({ snapshot: { ...snapshot, findings: [{ ...finding, certainty: [{ ...finding.certainty[0], score: 0.2 }] }] } });
    const { unmount } = render(<Module row={row()} placement={place("row")} />);
    expect(dom.queryByTestId("ai-ecg")).toBeNull();      // nothing flagged shows nothing
    unmount();
    useExample.setState({ snapshot: { ...snapshot, findings: [{ ...finding, code: "poor-trace", label: "Poor ECG trace",
      certainty: [{ ...finding.certainty[0], score: 0.2 }] }] } });
    render(<Module row={row()} placement={place("row")} />);
    expect(dom.getByTestId("ai-ecg").dataset.code).toBe("poor-trace");
  });
});
void Design;
