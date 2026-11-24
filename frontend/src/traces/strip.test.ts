import { describe, expect, it } from "vitest";

import type { TraceMark } from "@/contracts/types.gen";

import { placeMarks } from "./AnnotationLayer";
import { sparkPath, trendPath } from "./Spark";
import { stripPath, stripWindow, xAtSec } from "./Strip";

const strip = { samples: Array.from({ length: 300 }, (_, i) => Math.sin(i / 10)), hz: 100, seconds: 3 };
const mark = (start_s: number, end_s: number, label: string, kind: TraceMark["kind"] = "bracket"): TraceMark =>
  ({ kind, start_s, end_s, label, tone: "finding", finding_id: "f" });

describe("strip window", () => {
  it("fits seconds to the sweep speed: pixels per second = mm/s x px/mm", () => {
    const w = stripWindow(strip, { x0: 0, x1: 100, speedMmPerS: 25, pxPerMm: 4 });
    expect(w.pxPerSec).toBe(100);
    expect(w.startSec).toBeCloseTo(2);             // 100 px at 100 px/s shows the last 1 s of a 3 s strip
  });
  it("starts at the left edge when the strip is shorter than the window", () => {
    expect(stripWindow(strip, { x0: 10, x1: 2000, speedMmPerS: 25, pxPerMm: 4 }).startSec).toBe(0);
  });
  it("slower sweep shows more seconds in the same width", () => {
    const fast = stripWindow({ seconds: 60 }, { x0: 0, x1: 500, speedMmPerS: 50, pxPerMm: 4 });
    const slow = stripWindow({ seconds: 60 }, { x0: 0, x1: 500, speedMmPerS: 6.25, pxPerMm: 4 });
    expect(slow.pxPerSec).toBeLessThan(fast.pxPerSec);
    expect(slow.startSec).toBeLessThan(fast.startSec);
  });
});

describe("strip path", () => {
  const w = stripWindow(strip, { x0: 0, x1: 300, speedMmPerS: 25, pxPerMm: 4 });
  it("draws inside the window and clamps to the trace height", () => {
    const d = stripPath(strip, w, (v) => 50 - v * 1000, 100);
    const ys = [...d.matchAll(/[ML][\d.]+ ([\d.-]+)/g)].map((m) => Number(m[1]));
    expect(d.startsWith("M0.0")).toBe(true);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });
  it("uses the same vertical transform it is given (so marks and signal share one scale)", () => {
    const d = stripPath({ samples: [0, 1], hz: 1, seconds: 2 }, { startSec: 0, pxPerSec: 10, x0: 0, x1: 50 }, (v) => 20 - v * 10, 40);
    expect(d).toBe("M0.0 20.0L10.0 10.0");
  });
  it("is empty with no samples", () => {
    expect(stripPath({ samples: [], hz: 100, seconds: 0 }, w, (v) => v, 10)).toBe("");
  });
});

describe("annotation placement", () => {
  const w = { startSec: 0, pxPerSec: 100, x0: 0, x1: 500 };
  it("puts a bracket over the seconds it refers to", () => {
    const [p] = placeMarks([mark(1, 2, "No P waves")], w);
    expect(p!.x1).toBe(100);
    expect(p!.x2).toBe(200);
  });
  it("puts overlapping marks in separate lanes so labels never sit on each other", () => {
    const p = placeMarks([mark(0, 4, "No P waves"), mark(0.5, 2, "Irregular R-R")], w);
    expect(p.map((x) => x.lane)).toEqual([0, 1]);
  });
  it("reuses a lane once the earlier label has ended", () => {
    const p = placeMarks([mark(0, 0.5, "A"), mark(4, 4.5, "B")], w);
    expect(p.map((x) => x.lane)).toEqual([0, 0]);
  });
  it("drops marks outside the window and clips ones that straddle an edge", () => {
    const shifted = { startSec: 2, pxPerSec: 100, x0: 0, x1: 300 };
    const p = placeMarks([mark(0, 1, "gone"), mark(1, 3, "clipped"), mark(6, 9, "off the right")], shifted);
    expect(p.map((x) => x.mark.label)).toEqual(["clipped"]);
    expect(p[0]!.x1).toBe(0);
    expect(xAtSec(shifted, 3)).toBe(100);
  });
});

describe("spark and trend paths", () => {
  const pts = [{ t: -60, v: 90 }, { t: -30, v: 95 }, { t: 0, v: 100 }];
  it("draws the latest value as the dot at the right", () => {
    const { d, last } = sparkPath(pts, 100, 40, 60);
    expect(d.startsWith("M4.0")).toBe(true);
    expect(last![0]).toBeCloseTo(96);
  });
  it("needs two points and a size", () => {
    expect(sparkPath([pts[0]!], 100, 40, 60).d).toBe("");
    expect(sparkPath(pts, 0, 40, 60).d).toBe("");
  });
  it("does not divide by zero for a flat series", () => {
    expect(sparkPath([{ t: -1, v: 5 }, { t: 0, v: 5 }], 100, 40, 10).d).not.toContain("NaN");
  });
  it("a trend uses only the window asked for", () => {
    const d = trendPath(pts, 0, 100, 30, (v) => v);
    expect(d.split("L")).toHaveLength(2);          // 2 of the 3 points are inside 30 min
    expect(d.startsWith("M0.0")).toBe(true);
  });
});
