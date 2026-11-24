import { fireEvent, render, screen as dom } from "@testing-library/react";

import { readXScale, useUi } from "@/app/store";
import type { Design, Row } from "@/design/types";

import { menuPosition, XScaleButton } from "./XScaleButton";

const design = { sweep: { speed_mm_s: 25 } } as unknown as Design;
const ecg = { id: "ecg", label: null, parameter: "hr", trace: "waveform", trend_window_min: 60 } as unknown as Row;
const spo2 = { id: "spo2", label: null, parameter: "spo2", trace: "waveform", trend_window_min: 60 } as unknown as Row;
const bp = { id: "bp", label: "Blood Pressure", parameter: "bp_sys", trace: "trend", trend_window_min: 240 } as unknown as Row;
const bar = { id: "oxygen", parameter: "o2_flow", trace: "bar", trend_window_min: 60 } as unknown as Row;

beforeEach(() => {
  window.localStorage.clear();
  useUi.setState({ stored: { document: design } as any, xScale: {} });
});

describe("x scale button", () => {
  it("writes the speed of a waveform and the window of a trend as a number", () => {
    render(<><XScaleButton row={ecg} /><XScaleButton row={bp} /></>);
    expect(dom.getByTestId("xscale-ecg").textContent).toBe("25 mm/s");
    expect(dom.getByTestId("xscale-bp").textContent).toBe("4 h");
  });

  it("is absent on bar and event rows", () => {
    render(<XScaleButton row={bar} />);
    expect(dom.queryByTestId("xscale-oxygen")).toBeNull();
  });

  it("opens a menu of the usual values with the current one marked", () => {
    render(<XScaleButton row={ecg} />);
    expect(dom.queryByTestId("xscale-menu-ecg")).toBeNull();
    fireEvent.click(dom.getByTestId("xscale-ecg"));
    const items = dom.getByTestId("xscale-menu-ecg").querySelectorAll("[role=menuitemradio]");
    expect([...items].map((e) => e.textContent)).toEqual(["6.25 mm/s", "12.5 mm/s", "25 mm/s", "50 mm/s"]);
    expect([...items].map((e) => e.getAttribute("aria-checked"))).toEqual(["false", "false", "true", "false"]);
    expect(dom.getByTestId("xscale-ecg").getAttribute("aria-expanded")).toBe("true");
  });

  it("changes only that trace, closes the menu, and keeps the choice", () => {
    render(<><XScaleButton row={ecg} /><XScaleButton row={spo2} /></>);
    fireEvent.click(dom.getByTestId("xscale-ecg"));
    fireEvent.click(dom.getByTestId("xscale-option-ecg-50"));
    expect(dom.getByTestId("xscale-ecg").textContent).toBe("50 mm/s");
    expect(dom.getByTestId("xscale-spo2").textContent).toBe("25 mm/s");
    expect(dom.queryByTestId("xscale-menu-ecg")).toBeNull();
    expect(useUi.getState().xScale).toEqual({ ecg: 50 });
    expect(readXScale()).toEqual({ ecg: 50 });                        // survives a reload
  });

  it("changes a trend's window the same way", () => {
    render(<XScaleButton row={bp} />);
    fireEvent.click(dom.getByTestId("xscale-bp"));
    fireEvent.click(dom.getByTestId("xscale-option-bp-15"));
    expect(dom.getByTestId("xscale-bp").textContent).toBe("15 min");
  });

  it("closes without changing anything when the outside is touched", () => {
    render(<XScaleButton row={ecg} />);
    fireEvent.click(dom.getByTestId("xscale-ecg"));
    fireEvent.click(document.querySelector(".xscale-scrim")!);
    expect(dom.queryByTestId("xscale-menu-ecg")).toBeNull();
    expect(useUi.getState().xScale).toEqual({});
  });

  it("ignores junk in local storage", () => {
    window.localStorage.setItem("emus.x-scale", JSON.stringify({ ecg: "fast", spo2: -3, resp: 12.5, bp: null }));
    expect(readXScale()).toEqual({ resp: 12.5 });
    window.localStorage.setItem("emus.x-scale", "not json");
    expect(readXScale()).toEqual({});
  });
});

describe("menu position", () => {
  it("opens upward when there is room, downward when there is not, right edges aligned", () => {
    const up = menuPosition({ top: 500, bottom: 548, right: 1270 }, 4, 800, 1280);
    expect(up).toEqual({ right: 10, bottom: 306 });
    const down = menuPosition({ top: 90, bottom: 138, right: 1270 }, 4, 800, 1280) as { top: number; right: number };
    expect(down.right).toBe(10);
    expect(down.top).toBe(144);
  });

  it("stays on screen", () => {
    const near = menuPosition({ top: 20, bottom: 780, right: 1270 }, 4, 800, 1280) as { top: number };
    expect(near.top).toBeLessThanOrEqual(800 - (4 * 56 + 8) - 8);
  });
});
