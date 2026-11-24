import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BpLayer, arrowDown, arrowUp, bpDots, bpExtent, bpLabelPlan, bpRange, dotLine, keyCorner, keySize, lineSamples, tempDots } from "./Discrete";
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
    expect(keySize(50)).toMatchObject({ compact: true, h: 14 });
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

describe("blood pressure numbers and range", () => {
  const readings = [60, 120, 180].map((m, i) => ({ at: ago(m), sys: 150 - i * 20, dia: 90 - i * 10, map: 110 - i * 13 }));
  it("puts the systolic above the top of each tail and the diastolic below the bottom", () => {
    const dots = bpDots(readings, NOW, frame);
    const plan = bpLabelPlan(dots, 200);
    expect(plan).toHaveLength(3);
    plan.forEach((l) => {
      const d = dots[l.i]!;
      expect(l.sysY).toBeLessThan(d.tailTop!);
      expect(l.diaY).toBeGreaterThan(d.tailBottom!);
      expect(l.sys).toBe(d.sys);
      expect(l.dia).toBe(d.dia);
    });
  });
  it("writes systolic and diastolic together above the tail when the plot is too short for two numbers", () => {
    const dots = bpDots(readings, NOW, frame);
    const plan = bpLabelPlan(dots, 40);
    expect(plan.every((l) => l.joined)).toBe(true);
    expect(bpLabelPlan(dots, 120).every((l) => !l.joined)).toBe(true);
  });
  it("keeps every number inside the plot, even for a tail at the very top or bottom", () => {
    const dots = bpDots([{ at: ago(10), sys: 199, dia: 41, map: 90 }], NOW, { ...frame, y: (v: number) => 200 - v });
    const [l] = bpLabelPlan(dots, 120);
    expect(l!.sysY).toBeGreaterThanOrEqual(10);
    expect(l!.diaY).toBeLessThanOrEqual(117);
  });
  it("drops numbers that would touch their neighbours, keeping the newest", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ at: ago(i * 5), sys: 120, dia: 70, map: 87 }));
    const plan = bpLabelPlan(bpDots(many, NOW, frame), 200, 26);
    const xs = plan.map((l) => l.x);
    xs.slice(1).forEach((x, i) => expect(x - xs[i]!).toBeGreaterThanOrEqual(26));
    expect(plan[plan.length - 1]!.i).toBe(11);
  });
  it("sizes the y range to the readings in whole tens, with room for the numbers, within the registry range", () => {
    expect(bpRange(readings, [40, 200])).toEqual([60, 160]);
    expect(bpRange([], [40, 200])).toEqual([40, 200]);
    const [lo, hi] = bpRange([{ at: ago(1), sys: 101, dia: 99, map: 100 }], [40, 200]);
    expect(hi - lo).toBeGreaterThanOrEqual(60);
    expect(bpRange([{ at: ago(1), sys: 250, dia: 30, map: 100 }], [40, 200])).toEqual([40, 200]);
  });
});


describe("blood pressure markers", () => {
  const readings = [60, 120, 180].map((m, i) => ({ at: ago(m), sys: 150 - i * 20, dia: 90 - i * 10, map: 110 - i * 13 }));
  const num = (pts: string) => pts.split(" ").map((p) => p.split(",").map(Number) as [number, number]);
  it("draws a down arrow for systolic: flat edge above, point below", () => {
    const [a, b, tip] = num(arrowDown(50, 40));
    expect(a![1]).toBe(b![1]);
    expect(tip![1]).toBeGreaterThan(a![1]);
    expect(tip![0]).toBe(50);
  });
  it("draws an up arrow for diastolic: flat edge below, point above", () => {
    const [a, b, tip] = num(arrowUp(50, 40));
    expect(a![1]).toBe(b![1]);
    expect(tip![1]).toBeLessThan(a![1]);
  });
  it("shows an arrow for each of the two pressures, an X for the MAP, and three dashed lines joining them", () => {
    const dots = bpDots(readings, NOW, frame);
    const { container } = render(<svg><BpLayer dots={dots} rowId="bp" plotH={160} /></svg>);
    expect(container.querySelectorAll('[data-testid^="bp-sysmark-"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid^="bp-diamark-"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid^="bp-mapmark-"]')).toHaveLength(3);
    for (const id of ["bp-line-bp", "bp-line-sys-bp", "bp-line-dia-bp"]) expect(container.querySelector(`[data-testid="${id}"]`)!.getAttribute("d")!.split("L")).toHaveLength(3);
  });
  it("has the systolic arrow above the X above the diastolic arrow, at every reading", () => {
    const { container } = render(<svg><BpLayer dots={bpDots(readings, NOW, frame)} rowId="bp" plotH={160} /></svg>);
    container.querySelectorAll('[data-testid^="bp-dot-"]').forEach((g) => {
      expect(+g.getAttribute("data-top")!).toBeLessThan(+g.getAttribute("data-y")!);
      expect(+g.getAttribute("data-y")!).toBeLessThan(+g.getAttribute("data-bottom")!);
    });
  });
  it("without room (tails off) draws the X and its dashed line only", () => {
    const { container } = render(<svg><BpLayer dots={bpDots(readings, NOW, frame)} rowId="bp" tails={false} /></svg>);
    expect(container.querySelectorAll('[data-testid^="bp-sysmark-"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid^="bp-mapmark-"]')).toHaveLength(3);
  });
});
