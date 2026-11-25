import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/app/api";
import { useUi } from "@/app/store";

import { MEASURE_SECONDS, useMeasure } from "./measure";
import { useExample } from "./store";

const bp = { kind: "bp", placeholder: true, temp: null, bp: { at: "x", sys: 142, dia: 88, map: 106 } } as any;
const temp = { kind: "temp", placeholder: true, bp: null, temp: { at: "x", value: 38.4 } } as any;

beforeEach(() => {
  vi.useFakeTimers();
  useExample.setState({ enabled: true, scenario: "scn-pneumonia", minute: 360, snapshot: null, taken: { bp: [], temp: [] } });
  useMeasure.getState().cancelAll();
  useUi.setState({ notice: null });
});
afterEach(() => { useMeasure.getState().cancelAll(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("one-touch measuring", () => {
  it("starts on one touch, with nothing opened, and adds the reading when it is done", async () => {
    const spy = vi.spyOn(api, "measure").mockResolvedValue(bp);
    useMeasure.getState().toggle("bp");
    expect(useMeasure.getState().running.bp).not.toBeNull();
    expect(useUi.getState().openSheet ?? null).toBeNull();
    expect(spy).toHaveBeenCalledWith("scn-pneumonia", "bp", 360);
    await vi.advanceTimersByTimeAsync(MEASURE_SECONDS.bp * 1000 - 100);
    expect(useMeasure.getState().running.bp).not.toBeNull();         // still going
    await vi.advanceTimersByTimeAsync(200);
    expect(useMeasure.getState().running.bp).toBeNull();
    expect(useExample.getState().taken.bp).toHaveLength(1);
    expect(useExample.getState().taken.bp[0]).toMatchObject({ sys: 142, dia: 88, map: 106 });
  });
  it("cancels on the next touch, before it finishes, and adds nothing", async () => {
    vi.spyOn(api, "measure").mockResolvedValue(bp);
    useMeasure.getState().toggle("bp");
    await vi.advanceTimersByTimeAsync(3000);
    useMeasure.getState().toggle("bp");
    expect(useMeasure.getState().running.bp).toBeNull();
    await vi.advanceTimersByTimeAsync(20000);
    expect(useExample.getState().taken.bp).toHaveLength(0);
  });
  it("a thermometer reading is quicker and adds a temperature point", async () => {
    vi.spyOn(api, "measure").mockResolvedValue(temp);
    useMeasure.getState().toggle("temp");
    await vi.advanceTimersByTimeAsync(MEASURE_SECONDS.temp * 1000 + 100);
    expect(useExample.getState().taken.temp.map((r) => r.value)).toEqual([38.4]);
    expect(MEASURE_SECONDS.temp).toBeLessThan(MEASURE_SECONDS.bp);
  });
  it("runs a BP and a temperature measurement independently", async () => {
    vi.spyOn(api, "measure").mockImplementation(async (_s, kind) => (kind === "bp" ? bp : temp));
    useMeasure.getState().toggle("bp");
    useMeasure.getState().toggle("temp");
    expect(useMeasure.getState().running.bp).not.toBeNull();
    expect(useMeasure.getState().running.temp).not.toBeNull();
    useMeasure.getState().toggle("bp");
    expect(useMeasure.getState().running).toMatchObject({ bp: null });
    expect(useMeasure.getState().running.temp).not.toBeNull();
  });
  it("stops when the scenario or the time changes", async () => {
    vi.spyOn(api, "measure").mockResolvedValue(bp);
    useMeasure.getState().toggle("bp");
    useExample.setState({ minute: 361 });
    expect(useMeasure.getState().running.bp).toBeNull();
    await vi.advanceTimersByTimeAsync(20000);
    expect(useExample.getState().taken.bp).toHaveLength(0);
  });
  it("says so, and does not start, when example data is off", () => {
    const spy = vi.spyOn(api, "measure").mockResolvedValue(bp);
    useExample.setState({ enabled: false });
    useMeasure.getState().toggle("bp");
    expect(useMeasure.getState().running.bp).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(useUi.getState().notice).toMatch(/example data/i);
  });
  it("says so if the reading could not be taken", async () => {
    vi.spyOn(api, "measure").mockRejectedValue(new Error("down"));
    useMeasure.getState().toggle("bp");
    await vi.advanceTimersByTimeAsync(MEASURE_SECONDS.bp * 1000 + 100);
    expect(useMeasure.getState().running.bp).toBeNull();
    expect(useUi.getState().notice).toMatch(/could not/i);
  });
});
