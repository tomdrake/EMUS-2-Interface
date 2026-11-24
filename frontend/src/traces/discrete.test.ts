import { describe, expect, it } from "vitest";

import { bpDots, bpExtent, dotLine, keyCorner, keySize, lineSamples, tempDots } from "./Discrete";
import { fullWindow, sweepMotion } from "./Strip";
import { trendRange } from "./traceScale";

const NOW = "2026-11-24T12:00:00Z";
const ago = (m: number) => new Date(Date.parse(NOW) - m * 60000).toISOString();
const frame = { x0: 0, x1: 240, windowMin: 240, y: (v: number) => 200 - v };

describe("discrete measurements", () => {
  it("puts a cuff pressure at its time, as a dot at the MAP with a tail from diastolic to systolic", () => {
    const [d] = bpDots([{ at: ago(120), sys: 120, dia: 70, map: 87 }], NOW, frame);
    expect(d!.x).toBe(120);
    expect(d!.y).toBe(200 - 87);
    expect(d!.tailTop).toBe(200 - 120);
    expect(d!.tailBottom).toBe(200 - 70);
  });
  it("orders dots oldest first, drops those outside the window, and joins them with one dashed line", () => {
    const dots = bpDots([{ at: ago(10), sys: 1, dia: 1, map: 1 }, { at: ago(300), sys: 1, dia: 1, map: 1 }, { at: ago(200), sys: 1, dia: 1, map: 1 }], NOW, frame);
    expect(dots.map((d) => d.x)).toEqual([40, 230]);
    expect(dotLine(dots).split("L")).toHaveLength(2);
    expect(dotLine([dots[0]!])).toBe("");                 // one reading is a dot and no line
  });
  it("measured temperatures are dots without tails", () => {
    const [d] = tempDots([{ at: ago(60), value: 37.2 }], NOW, { ...frame, y: (v) => 100 - v });
    expect(d!.tailTop).toBeUndefined();
    expect(d!.x).toBe(180);
  });
  it("gives the range the tails need", () => {
    expect(bpExtent([{ at: "", sys: 140, dia: 80, map: 100 }, { at: "", sys: 110, dia: 60, map: 77 }])).toEqual([60, 140]);
    expect(bpExtent([])).toBeNull();
  });
  it("places the key in the first corner that covers no point, and is one line on a short plot", () => {
    const plot = { x0: 0, x1: 400, h: 120 };
    const k = keySize(120);
    expect(keyCorner([], plot, k)).toBe("tl");
    expect(keyCorner([{ x: 20, y: 10 }], plot, k)).toBe("tr");
    expect(keyCorner([{ x: 20, y: 10 }, { x: 380, y: 10 }], plot, k)).toBe("bl");
    expect(keySize(50)).toMatchObject({ compact: true, h: 15 });
    expect(keySize(120).compact).toBe(false);
  });
  it("samples the dashed line so a key never sits on a segment", () => {
    const s = lineSamples([{ x: 0, y: 0 }, { x: 120, y: 0 }], 12);
    expect(s.length).toBeGreaterThanOrEqual(8);
    expect(s.every((p) => p.x > 0 && p.x < 120)).toBe(true);
  });
});

describe("sweep and axes", () => {
  it("moves a strip at the sweep speed: travel is its length less the plot, time is travel over speed", () => {
    const w = fullWindow({ seconds: 30 }, { x0: 40, speedMmPerS: 25, pxPerMm: 4 });
    expect(w.pxPerSec).toBe(100);
    expect(w.x1 - w.x0).toBe(3000);
    expect(sweepMotion({ seconds: 30 }, 1000, 100)).toEqual({ travelPx: 2000, seconds: 20 });
    expect(sweepMotion({ seconds: 5 }, 1000, 100)).toBeNull();      // a short strip does not move
  });
  it("a slower sweep moves slower", () => {
    const a = sweepMotion({ seconds: 30 }, 500, 100)!, b = sweepMotion({ seconds: 30 }, 500, 25)!;
    expect(b.travelPx).toBeLessThan(a.travelPx);
  });
  it("uses the registry's own axis range when it has one (SpO2 50 to 100)", () => {
    const p = { default_low: 90, default_high: null, min_value: 50, max_value: 100 };
    expect(trendRange({ ...p, trend_range: [50, 100] })).toEqual([50, 100]);
    expect(trendRange(p)[0]).toBeGreaterThan(50);
  });
});
