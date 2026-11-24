import { SPEEDS_MM_S, WINDOWS_MIN, speedLabel, windowLabel, xScaleFor, xKey } from "./xScale";

const design = { sweep: { speed_mm_s: 25 } } as any;
const wave = { id: "ecg", trace: "waveform", trend_window_min: 60 } as any;
const trend = { id: "bp", trace: "trend", trend_window_min: 240 } as any;

describe("x scale labels", () => {
  it("writes a speed as a number with its unit", () => {
    expect(SPEEDS_MM_S.map(speedLabel)).toEqual(["6.25 mm/s", "12.5 mm/s", "25 mm/s", "50 mm/s"]);
  });

  it("writes a time window in the nearest sensible unit", () => {
    expect(WINDOWS_MIN.map(windowLabel)).toEqual(["15 min", "1 h", "4 h", "12 h", "24 h"]);
    expect(windowLabel(90)).toBe("1.5 h");
    expect(windowLabel(30)).toBe("30 min");
  });
});

describe("x scale of a trace", () => {
  it("is the design's speed for a waveform and its window for a trend", () => {
    expect(xScaleFor(wave, design, {})).toMatchObject({ kind: "speed", value: 25, label: "25 mm/s", overridden: false });
    expect(xScaleFor(trend, design, {})).toMatchObject({ kind: "window", value: 240, label: "4 h", overridden: false });
  });

  it("has no x scale for bars, events or nothing", () => {
    for (const trace of ["bar", "events", "none"]) expect(xScaleFor({ ...wave, trace }, design, {})).toBeNull();
  });

  it("offers the four speeds and the five windows", () => {
    expect(xScaleFor(wave, design, {})!.options.map((o) => o.value)).toEqual([6.25, 12.5, 25, 50]);
    expect(xScaleFor(trend, design, {})!.options.map((o) => o.value)).toEqual([15, 60, 240, 720, 1440]);
  });

  it("uses this screen's choice for that trace only", () => {
    const local = { ecg: 50 };
    expect(xScaleFor(wave, design, local)).toMatchObject({ value: 50, label: "50 mm/s", overridden: true });
    expect(xScaleFor({ ...wave, id: "spo2" }, design, local)).toMatchObject({ value: 25, overridden: false });
  });

  it("keeps a design value that is not in the usual list available", () => {
    const odd = { ...trend, trend_window_min: 90 };
    const x = xScaleFor(odd, design, {})!;
    expect(x.label).toBe("1.5 h");
    expect(x.options.map((o) => o.value)).toEqual([15, 60, 90, 240, 720, 1440]);
  });

  it("treats a local value equal to the design's as not changed", () => {
    expect(xScaleFor(wave, design, { ecg: 25 })!.overridden).toBe(false);
  });
});

describe("x scale of a small module", () => {
  const design = { sweep: { speed_mm_s: 25 } } as never;
  it("is a time window even when the full row is a waveform, and has its own place to keep it", () => {
    const row = { id: "ecg", trace: "waveform", trend_window_min: 60 } as never;
    const full = xScaleFor(row, design, {});
    const small = xScaleFor(row, design, {}, true);
    expect(full?.kind).toBe("speed");
    expect(small?.kind).toBe("window");
    expect(small?.label).toBe("1 h");
    expect(xKey(row, true)).toBe("ecg:window");
    expect(xKey(row)).toBe("ecg");
    // a choice for the small module leaves the waveform's speed alone
    expect(xScaleFor(row, design, { "ecg:window": 240 }, true)?.label).toBe("4 h");
    expect(xScaleFor(row, design, { "ecg:window": 240 })?.label).toBe("25 mm/s");
  });
  it("is the same window as the full trace for a trend row", () => {
    const row = { id: "temp", trace: "trend", trend_window_min: 240 } as never;
    expect(xKey(row, true)).toBe("temp");
    expect(xScaleFor(row, design, { temp: 720 }, true)?.label).toBe("12 h");
  });
});
