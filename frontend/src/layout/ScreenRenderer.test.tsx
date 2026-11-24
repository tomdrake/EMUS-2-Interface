import { render, screen as dom } from "@testing-library/react";

import { useUi } from "@/app/store";
import type { Design, Screen } from "@/design/types";

import { ScreenRenderer } from "./ScreenRenderer";

const content = { trace: true, ai: true, certainty: true, explain: false, forecast: false };
const rows = [
  { id: "ecg", kind: "parameter", parameter: "hr", trace: "waveform", waveform: "ecg", numerics: ["hr"],
    visible: true, label: null, method: null, colour: null, trend_window_min: 60, content },
  { id: "bp", kind: "parameter", parameter: "bp_sys", trace: "trend", waveform: null, label: "blood pressure",
    numerics: ["bp_sys", "bp_dia", "bp_mean"], visible: true, method: null, colour: null, trend_window_min: 240, content },
  { id: "falls", kind: "parameter", parameter: "falls", trace: "events", numerics: [], visible: true,
    label: null, method: null, colour: null, trend_window_min: 60, content },
  { id: "hidden", kind: "parameter", parameter: "rr", visible: false, numerics: [], trace: "trend", content },
];
const sizes = {
  compact: { label: "Small Square", cols: 1, rows: 1, full: false, flow: "tile-only", fits: ["number"] },
  tile: { label: "Tile", cols: 2, rows: 1, full: false, flow: "side", fits: ["number", "spark", "ai"] },
  tall: { label: "Tall", cols: 1, rows: 2, full: false, flow: "stack", fits: ["number", "spark", "ai", "certainty"] },
  row: { label: "Full Row", cols: 0, rows: 1, full: true, flow: "row", fits: ["number", "trace", "ai", "certainty"] },
};
const split = {
  id: "split-h", name: "Split",
  layout: { kind: "split", direction: "horizontal", ratio: 0.4, children: [
    { kind: "widget", widget: { id: "news", type: "news2-chart", variant: "bands-dark" } },
    { kind: "widget", widget: { id: "rows", type: "monitor-grid", columns: 4, numerics_side: "right",
        items: [{ row_id: "ecg", size: "row" }, { row_id: "bp", size: "tall" }, { row_id: "falls", size: "compact" },
                { row_id: "hidden", size: "row" }] } },
  ] },
} as unknown as Screen;

beforeEach(() => {
  useUi.setState({
    stored: { document: {
      rows, safety: { standby_text: "STANDBY", show_advice: true, device_status: "tiles" },
      labels: { auto_capitalise: true, show_method: true }, tiles: { width_px: 220 },
      traces: { show_baseline: true, show_scale: true, show_calibration_bar: true, show_time_scale: true,
                ecg_gain_mm_per_mv: 10 },
      sweep: { speed_mm_s: 25 },
      ai: { enabled: true, show_row_chips: true, show_confidence: true, show_trace_annotations: true, show_explain_link: true, min_confidence: 0.5 },
      forecast: { certainty: { display: "percent", finding_metric: "evidence_agreement", badge_medium_at: 0.5,
                                badge_high_at: 0.8, show_metric_name: true } },
    } as unknown as Design } as any,
    registry: { parameters: { hr: { label: "Heart Rate", short: "HR", unit: "bpm", method: "ECG" },
                              bp_sys: { label: "Systolic Blood Pressure", short: "SYS", unit: "mmHg", method: "Cuff" } },
                module_sizes: sizes,
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

  it("lays out visible modules in design order and skips hidden ones", () => {
    render(<ScreenRenderer screen={split} />);
    const ids = [...dom.getByTestId("grid-rows").children].map((e) => e.getAttribute("data-testid"));
    expect(ids).toEqual(["row-ecg", "row-bp", "row-falls"]);
    expect(dom.queryByTestId("row-hidden")).toBeNull();
  });

  it("makes the grid as many columns and rows as the modules need", () => {
    render(<ScreenRenderer screen={split} />);
    const grid = dom.getByTestId("grid-rows");
    expect(grid.dataset.columns).toBe("4");
    expect(grid.dataset.rows).toBe("3");            // a full row, then a tall one (2 high) beside a small square
    expect(grid.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(grid.style.gridTemplateRows).toBe("repeat(3, minmax(0, 1fr))");
  });

  it("places each module by its size", () => {
    render(<ScreenRenderer screen={split} />);
    const place = (id: string) => (dom.getByTestId(`row-${id}`) as HTMLElement).style;
    expect([place("ecg").gridColumn, place("ecg").gridRow]).toEqual(["1 / span 4", "1 / span 1"]);   // full row
    expect([place("bp").gridColumn, place("bp").gridRow]).toEqual(["1 / span 1", "2 / span 2"]);     // tall
    expect([place("falls").gridColumn, place("falls").gridRow]).toEqual(["2 / span 1", "2 / span 1"]);   // small square beside it
  });

  it("draws each size in its own arrangement", () => {
    render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("row-ecg").dataset.flow).toBe("row");
    expect(dom.getByTestId("row-ecg").className).toContain("row");
    expect(dom.getByTestId("row-bp").dataset.flow).toBe("stack");
    expect(dom.getByTestId("row-falls").dataset.flow).toBe("tile-only");
  });

  it("shows the trace in full on a row, as a small spark on a tall module, and none on a small square", () => {
    render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("row-ecg").dataset.content).toContain("trace");
    expect(dom.getByTestId("row-ecg").querySelector(".trace-mini")).toBeNull();
    expect(dom.getByTestId("row-bp").querySelector(".trace-mini")).not.toBeNull();
    expect(dom.getByTestId("row-bp").dataset.dropped).toBe("");                       // explain/forecast were not asked for
    // the small square has room for the number only; AI and certainty are on by default, so they are
    // recorded as dropped. An events row has no trace to drop.
    expect(dom.getByTestId("row-falls").dataset.dropped).toBe("ai certainty");
    expect(dom.getByTestId("row-falls").dataset.content).toBe("");
  });

  it("records what a size has no room for", () => {
    const wants = { ...rows[1]!, content: { trace: true, ai: true, certainty: true, explain: true, forecast: true } };
    useUi.setState({ stored: { document: { ...useUi.getState().stored!.document, rows: [rows[0], wants, rows[2], rows[3]] } } as any });
    render(<ScreenRenderer screen={split} />);
    const bp = dom.getByTestId("row-bp");
    expect(bp.dataset.dropped).toBe("explain forecast");           // a tall module has no room for those
    expect(bp.dataset.content).toBe("trace ai certainty");
  });

  it("names each module with what is measured and how", () => {
    render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("row-label-ecg").textContent).toBe("Heart Rate - ECG");
    expect(dom.getByTestId("row-label-bp").textContent).toBe("Blood Pressure - Cuff");
  });

  it("gives every module one tile, with blood pressure in one", () => {
    render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("row-bp").querySelectorAll(".tile:not(.tile-empty)")).toHaveLength(1);
    expect(dom.getByTestId("row-ecg").querySelectorAll(".tile:not(.tile-empty)")).toHaveLength(1);
    const grid = dom.getByTestId("grid-rows");
    expect(grid.style.getPropertyValue("--tile")).toBe("220px");
  });

  it("gives each trace module a frame for its reference marks", () => {
    render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("trace-ecg")).toBeTruthy();
    expect(dom.getByTestId("trace-bp")).toBeTruthy();
  });

  it("writes the x scale of a full trace as a number and has no horizontal scale bar", () => {
    const { container } = render(<ScreenRenderer screen={split} />);
    expect(dom.getByTestId("xscale-ecg").textContent).toBe("25 mm/s");
    expect(dom.queryByTestId("xscale-bp")).toBeNull();               // the small spark has no axis or x scale
    expect(container.querySelector('[data-testid^="trace-time"]')).toBeNull();
  });

  it("makes a module a div with a tap button beside the x scale control, never one inside the other", () => {
    const { container } = render(<ScreenRenderer screen={split} />);
    const row = dom.getByTestId("row-ecg");
    expect(row.tagName).toBe("DIV");
    expect(container.querySelectorAll("button button")).toHaveLength(0);
    expect(row.querySelector(".row-hit")).not.toBeNull();
    expect(row.querySelector('[data-testid="xscale-ecg"]')).not.toBeNull();
    expect(row.querySelector(".row-hit")!.contains(row.querySelector('[data-testid="xscale-ecg"]'))).toBe(false);
  });

  it("opens alarm limits when a module is tapped, whatever its size", () => {
    render(<ScreenRenderer screen={split} />);
    for (const id of ["ecg", "bp", "falls"]) {
      useUi.getState().showSheet(null);
      (dom.getByTestId(`row-${id}`).querySelector(".row-hit") as HTMLButtonElement).click();
      expect(useUi.getState().openSheet).toBe("alarm-limits");
      expect(useUi.getState().sheetContext).toBe(id);
    }
  });
});
