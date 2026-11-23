import {
  NOMINAL_PX_PER_MM, gainText, mmToPx, niceTicks, secondBarPx, thinTicks, trendRange, trendY,
  waveTransform, type WaveScale,
} from "./traceScale";

const ecg: WaveScale = { unit: "mV", calibrated: true, gains_mm_per_unit: [5, 10, 20], default_gain: 10,
                         tick: 0.5, baseline: "isoelectric", range: [-0.5, 1.0] };
const pleth: WaveScale = { unit: "a.u.", calibrated: false, gains_mm_per_unit: [], default_gain: null,
                           tick: 0.5, baseline: "mean", range: [-1, 1] };

describe("ticks", () => {
  it("picks round numbers inside the range", () => {
    expect(niceTicks(-0.5, 1.0, 3)).toEqual([-0.5, 0, 0.5, 1]);
    expect(niceTicks(36, 134, 4)).toEqual([40, 60, 80, 100, 120]);
    expect(niceTicks(4.6, 28.4, 4)).toEqual([5, 10, 15, 20, 25]);
    expect(niceTicks(88, 100, 3)).toEqual([90, 95, 100]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it("drops labels that would crowd, keeping zero", () => {
    expect(thinTicks([-0.5, 0, 0.5, 1], 18.9)).toEqual([0, 1]);        // 9.4 px apart: every second
    expect(thinTicks([-0.5, 0, 0.5, 1], 37.8)).toEqual([-0.5, 0, 0.5, 1]);
    expect(thinTicks([0], 10)).toEqual([0]);
  });
});

describe("ECG scale", () => {
  it("draws a 1 mV bar exactly gain x pixels-per-mm tall when the gain fits", () => {
    const t = waveTransform({ heightPx: 140, scale: ecg, preferredGain: 10 });
    expect(t.gainMmPerUnit).toBe(10);
    expect(t.fitted).toBe(false);
    expect(t.unitBarPx).toBeCloseTo(10 * NOMINAL_PX_PER_MM, 6);
    expect(t.pxPerUnit).toBeCloseTo(37.795, 2);
  });

  it("falls back to a smaller gain, and says so, when the row is too short", () => {
    const t = waveTransform({ heightPx: 45, scale: ecg, preferredGain: 10 });
    expect(t.gainMmPerUnit).toBe(5);
    expect(t.fitted).toBe(true);
    expect(t.unitBarPx).toBeCloseTo(5 * NOMINAL_PX_PER_MM, 6);
    // the whole visible range fits
    expect(t.y(1.0)).toBeGreaterThanOrEqual(0);
    expect(t.y(-0.5)).toBeLessThanOrEqual(45);
  });

  it("never picks a gain bigger than the one asked for", () => {
    expect(waveTransform({ heightPx: 400, scale: ecg, preferredGain: 5 }).gainMmPerUnit).toBe(5);
    expect(waveTransform({ heightPx: 400, scale: ecg, preferredGain: 20 }).gainMmPerUnit).toBe(20);
  });

  it("puts 0 mV on the baseline and positive values above it", () => {
    const t = waveTransform({ heightPx: 140, scale: ecg, preferredGain: 10 });
    expect(t.y(0)).toBe(t.baselineY);
    expect(t.y(1)).toBeLessThan(t.y(0));
    expect(t.y(0) - t.y(1)).toBeCloseTo(t.unitBarPx!, 6);
  });

  it("centres the range when there is room to spare", () => {
    const t = waveTransform({ heightPx: 140, scale: ecg, preferredGain: 5 });
    const top = t.y(1.0), bottom = t.y(-0.5);
    expect(top - 3 + (140 - 3 - bottom)).toBeCloseTo((140 - 6) - 1.5 * t.pxPerUnit, 6);
    expect(Math.abs((top - 3) - (140 - 3 - bottom))).toBeLessThan(1e-6);
  });

  it("writes the gain as just the number and unit", () => {
    expect(gainText({ gainMmPerUnit: 10 })).toBe("10 mm/mV");
    expect(gainText({ gainMmPerUnit: 5 })).toBe("5 mm/mV");
    expect(gainText({ gainMmPerUnit: 2.5 })).toBe("2.5 mm/mV");
    expect(gainText({ gainMmPerUnit: null })).toBeNull();          // pleth and resp have no gain
  });
});

describe("arbitrary-unit scale", () => {
  it("fills the height with no gain and no calibration bar", () => {
    const t = waveTransform({ heightPx: 56, scale: pleth });
    expect(t.gainMmPerUnit).toBeNull();
    expect(t.unitBarPx).toBeNull();
    expect(t.y(1)).toBeCloseTo(3);
    expect(t.y(-1)).toBeCloseTo(53);
    expect(t.baselineY).toBeCloseTo(28);
  });
});

describe("time and trends", () => {
  it("makes the one-second bar speed x pixels per mm long", () => {
    expect(secondBarPx(25)).toBeCloseTo(25 * 96 / 25.4, 6);
    expect(secondBarPx(12.5, 4)).toBe(50);
    expect(mmToPx(10, 4)).toBe(40);
  });

  it("shows a trend over its usual span, inside the parameter's limits", () => {
    expect(trendRange({ default_low: 50, default_high: 120, min_value: 20, max_value: 250 })).toEqual([36, 134]);
    const [lo, hi] = trendRange({ default_low: 90, default_high: null, min_value: 50, max_value: 100 });
    expect(lo).toBeGreaterThanOrEqual(50);
    expect(hi).toBe(100);
    expect(trendY(134, [36, 134], 100)).toBeCloseTo(3);
    expect(trendY(36, [36, 134], 100)).toBeCloseTo(97);
  });
});
