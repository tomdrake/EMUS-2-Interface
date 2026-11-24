import { act, fireEvent, render, screen as dom } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/app/api";
import { useExample } from "@/examples/store";

import { MeasureSheet } from "./MeasureSheet";

const snapshot = { generated_at: "2026-11-24T12:00:00Z", numerics: {}, bp_readings: [], temp_readings: [] } as any;

beforeEach(() => {
  vi.useFakeTimers();
  useExample.setState({ enabled: true, scenario: "scn-pneumonia", minute: 360, snapshot, taken: { bp: [], temp: [] } });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Measure BP and Measure Temp sheets", () => {
  it("runs a simulated cuff reading: Start, Measuring, then the reading, added to this screen", async () => {
    const spy = vi.spyOn(api, "measure").mockResolvedValue({ kind: "bp", placeholder: true, temp: null, bp: { at: "2026-11-24T12:00:05Z", sys: 142, dia: 88, map: 106 } });
    render(<MeasureSheet kind="bp" />);
    expect(dom.getByTestId("measure-start").textContent).toBe("Start Cuff");
    fireEvent.click(dom.getByTestId("measure-start"));
    expect(dom.getByTestId("measure-running")).toBeTruthy();
    expect(spy).toHaveBeenCalledWith("scn-pneumonia", "bp", 360);
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(dom.getByTestId("measure-value").textContent).toContain("142/88 (106)");
    expect(dom.getByTestId("measure-result").textContent).toContain("Simulated Reading");
    expect(useExample.getState().taken.bp).toHaveLength(1);
  });
  it("takes a thermometer reading in less time and adds a temperature point", async () => {
    vi.spyOn(api, "measure").mockResolvedValue({ kind: "temp", placeholder: true, bp: null, temp: { at: "2026-11-24T12:00:05Z", value: 38.4 } });
    render(<MeasureSheet kind="temp" />);
    expect(dom.getByTestId("measure-start").textContent).toBe("Take Temperature");
    fireEvent.click(dom.getByTestId("measure-start"));
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(dom.getByTestId("measure-value").textContent).toContain("38.4");
    expect(useExample.getState().taken.temp).toHaveLength(1);
  });
  it("can be stopped part way, and then adds nothing", async () => {
    vi.spyOn(api, "measure").mockResolvedValue({ kind: "bp", placeholder: true, temp: null, bp: { at: "x", sys: 1, dia: 1, map: 1 } });
    render(<MeasureSheet kind="bp" />);
    fireEvent.click(dom.getByTestId("measure-start"));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    fireEvent.click(dom.getByTestId("measure-stop"));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(dom.getByTestId("measure-start")).toBeTruthy();
    expect(useExample.getState().taken.bp).toHaveLength(0);
  });
  it("says to turn example data on when it is off, and cannot start", () => {
    useExample.setState({ enabled: false });
    render(<MeasureSheet kind="bp" />);
    expect(dom.getByTestId("measure-off")).toBeTruthy();
    expect((dom.getByTestId("measure-start") as HTMLButtonElement).disabled).toBe(true);
  });
});
