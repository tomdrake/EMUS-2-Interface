import { render, screen as dom } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useExample } from "@/examples/store";

import { News2Breakdown } from "./News2Breakdown";

const snapshot = {
  spo2_scale: 1,
  news2: { total: 16, risk: "high", complete: true, monitoring_hours: 0, response: "Emergency assessment by a team with critical care competencies.",
    components: { rr: 3, spo2: 3, o2_flow: 2, bp_sys: 2, hr: 2, acvpu: 3, temp: 1 },
    inputs: { rr: 29, spo2: 89, o2_flow: 6, bp_sys: 94, hr: 124, acvpu: "C", temp: 38.8 } },
} as any;

beforeEach(() => useExample.setState({ enabled: true, snapshot, taken: { bp: [], temp: [] } }));

describe("NEWS2 Breakdown", () => {
  it("lists each parameter with the value scored and its points, adding up to the total", () => {
    render(<News2Breakdown />);
    const points = ["rr", "spo2", "o2_flow", "bp_sys", "hr", "acvpu", "temp"].map((k) => +dom.getByTestId(`n2b-${k}`).getAttribute("data-points")!);
    expect(points).toEqual([3, 3, 2, 2, 2, 3, 1]);
    expect(points.reduce((a, b) => a + b, 0)).toBe(16);
    expect(dom.getByTestId("n2b-total").getAttribute("data-total")).toBe("16");
  });
  it("shows the values that were scored, in words where the chart uses a level", () => {
    render(<News2Breakdown />);
    expect(dom.getByTestId("n2b-temp").textContent).toContain("38.8");
    expect(dom.getByTestId("n2b-acvpu").textContent).toContain("New Confusion");
    expect(dom.getByTestId("n2b-o2_flow").textContent).toContain("Oxygen 6 L/min");
    expect(dom.getByTestId("n2b-temp").textContent).toContain("Skin Sensor");
  });
  it("states the risk, the monitoring and the clinical response", () => {
    render(<News2Breakdown />);
    expect(dom.getByTestId("n2b-risk").textContent).toContain("High Risk");
    expect(dom.getByTestId("n2b-risk").textContent).toContain("Continuously");
    expect(dom.getByTestId("n2b-response").textContent).toMatch(/Emergency/);
  });
  it("says so when there is no example data", () => {
    useExample.setState({ enabled: false });
    render(<News2Breakdown />);
    expect(document.body.textContent).toMatch(/No observations to score/);
  });
});
