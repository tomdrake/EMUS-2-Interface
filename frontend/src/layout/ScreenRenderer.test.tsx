import { render, screen as dom } from "@testing-library/react";

import { useUi } from "@/app/store";
import type { Design, Screen } from "@/design/types";

import { ScreenRenderer } from "./ScreenRenderer";

const rows = [
  { id: "ecg", kind: "parameter", parameter: "hr", trace: "waveform", waveform: "ecg", numerics: ["hr"],
    visible: true, height: 1, label: null, method: null, colour: null, trend_window_min: 60 },
  { id: "bp", kind: "parameter", parameter: "bp_sys", trace: "trend", waveform: null, label: "blood pressure",
    numerics: ["bp_sys", "bp_dia", "bp_mean"], visible: true, height: 1, method: null, colour: null, trend_window_min: 240 },
  { id: "gap", kind: "spacer", trace: "none", visible: true, height: 0.25, numerics: [] },
  { id: "hidden", kind: "parameter", parameter: "rr", visible: false, numerics: [] },
];
const split: Screen = {
  id: "split-h", name: "Split",
  layout: { kind: "split", direction: "horizontal", ratio: 0.4, children: [
    { kind: "widget", widget: { id: "news", type: "news2-chart", variant: "bands-dark" } },
    { kind: "widget", widget: { id: "rows", type: "monitor-rows", numerics_side: "right",
                                row_ids: ["ecg", "bp", "gap", "hidden"] } },
  ] },
} as Screen;

beforeEach(() => {
  useUi.setState({
    stored: { document: {
      rows, safety: { standby_text: "STANDBY", show_advice: true, device_status: "tiles" },
      labels: { auto_capitalise: true, show_method: true }, tiles: { width_px: 220, equal_row_heights: true },
      traces: { show_baseline: true, show_scale: true, show_calibration_bar: true, show_time_scale: true,
                ecg_gain_mm_per_mv: 10 },
      sweep: { speed_mm_s: 25 },
    } as unknown as Design } as any,
    registry: { parameters: { hr: { label: "Heart Rate", short: "HR", unit: "bpm", method: "ECG" },
                              bp_sys: { label: "Systolic Blood Pressure", short: "SYS", unit: "mmHg", method: "Cuff" } },
                waveforms: { ecg: { label: "ECG", unit: "mV", scale: { unit: "mV", calibrated: true,
                  gains_mm_per_unit: [5, 10, 20], default_gain: 10, tick: 0.5, baseline: "isoelectric", range: [-0.5, 1] } } },
                signal_states: { standby: { text: "STANDBY", tone: "inactive" } }, signal_issues: {} } as any,
  });
});

describe("ScreenRenderer", () => {
  it("renders both panes of a split with the design's ratio", () => {
    render(<ScreenRenderer screen={split} />);
    const container = dom.getByTestId("split");
    expect(container.className).toContain("split-horizontal");
    const panes = container.querySelectorAll(":scope > .pane");
    expect(panes).toHaveLength(2);
    expect((panes[0] as HTMLElement).style.flex).toContain("0.4");
    expect(dom.getByTestId("widget-news")).toBeTruthy();
    expect(dom.getByTestId("widget-rows")).toBeTruthy();
  });

  it("lays out visible rows in design order and skips hidden ones", () => {
    render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("row-gap").className).toContain("row-spacer");
    expect(dom.queryByTestId("row-hidden")).toBeNull();
  });

  it("names each row with what is measured and how", () => {
    render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("row-label-ecg").textContent).toBe("Heart Rate - ECG");
    expect(dom.getByTestId("row-label-bp").textContent).toBe("Blood Pressure - Cuff");
  });

  it("gives every row one tile of the design's width, with blood pressure in one tile", () => {
    render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("row-bp").querySelectorAll(".tile:not(.tile-empty)")).toHaveLength(1);
    expect(dom.getByTestId("row-ecg").querySelectorAll(".tile:not(.tile-empty)")).toHaveLength(1);
    // a row with no numbers keeps an empty cell, so the grid lines run straight down
    expect(dom.getByTestId("row-gap").querySelectorAll(".tile")).toHaveLength(0);
    const rowsEl = dom.getByTestId("widget-rows").querySelector(".rows") as HTMLElement;
    expect(rowsEl.style.getPropertyValue("--tile")).toBe("220px");
    expect(rowsEl.style.getPropertyValue("--tile-slots")).toBe("");
  });

  it("gives each trace row a frame for its reference marks, and none for the spacer", () => {
    render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("trace-ecg")).toBeTruthy();
    expect(dom.getByTestId("trace-bp")).toBeTruthy();
    expect(dom.queryByTestId("trace-gap")).toBeNull();
  });

  it("writes each trace's x scale as a number and has no horizontal scale bar", () => {
    const { container } = render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("xscale-ecg").textContent).toBe("25 mm/s");
    expect(dom.getByTestId("xscale-bp").textContent).toBe("4 h");
    expect(container.querySelector('[data-testid^="trace-time"]')).toBeNull();
  });

  it("makes a row a div with a tap button beside the x scale control, never one inside the other", () => {
    const { container } = render(<ScreenRenderer screen={split} />);
    const row = dom.getByTestId("row-ecg");
    expect(row.tagName).toBe("DIV");
    expect(container.querySelectorAll("button button")).toHaveLength(0);
    expect(row.querySelector(".row-hit")).not.toBeNull();
    expect(row.querySelector('[data-testid="xscale-ecg"]')).not.toBeNull();
    expect(row.querySelector(".row-hit")!.contains(row.querySelector('[data-testid="xscale-ecg"]'))).toBe(false);
  });

  it("opens alarm limits when the row is tapped", () => {
    render(<ScreenRenderer screen={split} />);
    (dom.getByTestId("row-ecg").querySelector(".row-hit") as HTMLButtonElement).click();
    expect(useUi.getState().openSheet).toBe("alarm-limits");
    expect(useUi.getState().sheetContext).toBe("ecg");
  });
});
