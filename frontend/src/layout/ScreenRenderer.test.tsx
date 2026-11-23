import { render, screen as dom } from "@testing-library/react";

import { useUi } from "@/app/store";
import type { Design, Screen } from "@/design/types";

import { ScreenRenderer } from "./ScreenRenderer";

const rows = [
  { id: "ecg", kind: "parameter", parameter: "hr", trace: "waveform", waveform: "ecg", numerics: ["hr"] },
  { id: "gap", kind: "spacer", trace: "none" },
  { id: "hidden", kind: "parameter", parameter: "rr", visible: false },
];
const split: Screen = {
  id: "split-h", name: "Split",
  layout: { kind: "split", direction: "horizontal", ratio: 0.4, children: [
    { kind: "widget", widget: { id: "news", type: "news2-chart", variant: "bands-dark" } },
    { kind: "widget", widget: { id: "rows", type: "monitor-rows", row_ids: ["ecg", "gap", "hidden"] } },
  ] },
} as Screen;

beforeEach(() => {
  useUi.setState({
    stored: { document: { rows } as unknown as Design } as any,
    registry: { parameters: { hr: { label: "Heart rate", short: "HR", unit: "bpm" } } } as any,
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
    expect(dom.getByTestId("row-ecg").textContent).toContain("Heart rate");
    expect(dom.getByTestId("row-gap").className).toContain("row-spacer");
    expect(dom.queryByTestId("row-hidden")).toBeNull();
  });
});
