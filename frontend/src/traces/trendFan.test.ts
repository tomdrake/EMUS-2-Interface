import { describe, expect, it } from "vitest";

import { axisMarks, fanGeometry, markText, type FanPoint } from "./TrendFan";

const pt = (t: number, v: number, w = 2): FanPoint => ({ t, v, i50: [v - w / 2, v + w / 2], i80: [v - w, v + w], i95: [v - 2 * w, v + 2 * w] });
const series = { past: [{ t: -240, v: 90 }, { t: -120, v: 95 }, { t: -30, v: 100 }], now: 100, future: [pt(60, 104), pt(240, 110), pt(480, 112)] };
const opts = { tMin: -240, tMax: 480, w: 600, h: 100 };

describe("fanGeometry", () => {
  it("puts one time scale on every chart: the left edge, now and the right edge are at the same x whatever the values", () => {
    const a = fanGeometry(series, opts), b = fanGeometry({ ...series, now: 5, future: [pt(60, 6)] }, opts);
    expect(a.x(-240)).toBe(a.plot.l);
    expect(a.x(480)).toBeCloseTo(a.plot.r);
    expect(a.x(0)).toBeCloseTo(b.x(0));
    expect(a.x(240)).toBeCloseTo(b.x(240));
    expect(a.x(0)).toBeCloseTo(a.plot.l + (240 / 720) * (a.plot.r - a.plot.l));
  });
  it("keeps the whole 95 % band and the history in view, higher values higher up", () => {
    const g = fanGeometry(series, opts);
    expect(g.yMin).toBeLessThanOrEqual(90);
    expect(g.yMax).toBeGreaterThanOrEqual(112 + 4);
    expect(g.y(110)).toBeLessThan(g.y(95));
    expect(g.y(g.yMax)).toBeCloseTo(g.plot.t);
  });
  it("draws the history, the prediction from now, and bands that close", () => {
    const g = fanGeometry(series, opts);
    expect(g.past.startsWith("M")).toBe(true);
    expect(g.future.startsWith(`M${g.now!.x.toFixed(1)} ${g.now!.y.toFixed(1)}`)).toBe(true);
    expect(g.band80.endsWith("Z")).toBe(true);
    expect(g.band95.endsWith("Z")).toBe(true);
    expect(g.end!.x).toBeCloseTo(g.plot.r);
  });
  it("keeps a reference range in view and fixes the scale when asked", () => {
    const g = fanGeometry({ past: [], now: 2, future: [pt(60, 3, 0.5)] }, { ...opts, lines: [5, 7], yFloor: 0, yCeil: 8 });
    expect(g.yMin).toBe(0);
    expect(g.yMax).toBe(8);
    expect(g.y(7)).toBeLessThan(g.y(5));
  });
  it("copes with no data and with a flat line", () => {
    expect(fanGeometry({ past: [], now: null, future: [] }, opts).band80).toBe("");
    const flat = fanGeometry({ past: [{ t: -10, v: 5 }], now: 5, future: [] }, opts);
    expect(flat.yMax).toBeGreaterThan(flat.yMin);
  });
  it("ignores history before the window and predictions after it", () => {
    const g = fanGeometry({ ...series, past: [{ t: -600, v: 0 }, ...series.past], future: [...series.future, pt(600, 500)] }, opts);
    expect(g.yMin).toBeGreaterThan(0);
    expect(g.yMax).toBeLessThan(500);
  });
});

describe("the shared time axis", () => {
  it("marks every two hours from the left edge to +8 H, with Now at zero", () => {
    expect(axisMarks(-240, 480)).toEqual([-240, -120, 0, 120, 240, 360, 480]);
    expect(axisMarks(-240, 480, 4)).toEqual([-240, 0, 240, 480]);
  });
  it("writes the marks", () => {
    expect([-240, 0, 120, 480].map(markText)).toEqual(["-4 H", "Now", "+2 H", "+8 H"]);
  });
});
