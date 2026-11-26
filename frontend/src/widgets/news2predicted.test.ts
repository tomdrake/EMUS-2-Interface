import { describe, expect, it } from "vitest";

import { planColumns, ribbonPath, trendSegments } from "./News2Chart";

describe("planColumns", () => {
  it("gives the predictions about half and the newest observed sets the rest, never more than eight", () => {
    expect(planColumns(12, 8, 5)).toEqual({ observed: 7, predicted: 5 });
    expect(planColumns(30, 20, 5)).toEqual({ observed: 8, predicted: 5 });
    expect(planColumns(10, 6, 5)).toEqual({ observed: 5, predicted: 5 });
  });
  it("keeps at least three predicted columns and drops observed sets first when narrow", () => {
    expect(planColumns(6, 8, 5)).toEqual({ observed: 3, predicted: 3 });
    expect(planColumns(3, 8, 5)).toEqual({ observed: 1, predicted: 3 });
  });
  it("copes with few observed sets, few predictions, or none", () => {
    expect(planColumns(12, 2, 5)).toEqual({ observed: 2, predicted: 5 });
    expect(planColumns(12, 8, 2)).toEqual({ observed: 8, predicted: 2 });
    expect(planColumns(12, 8, 0)).toEqual({ observed: 8, predicted: 0 });
    expect(planColumns(12, 0, 5)).toEqual({ observed: 0, predicted: 5 });
  });
});

describe("trendSegments", () => {
  const pt = (v: number, pred: boolean) => ({ v, pred });
  it("keeps what was observed solid and bridges from the last observed point through the predicted ones, dashed", () => {
    const { solid, dashed } = trendSegments([pt(1, false), pt(2, false), pt(3, true), pt(4, true)]);
    expect(solid.map((p) => p.v)).toEqual([1, 2]);
    expect(dashed.map((p) => p.v)).toEqual([2, 3, 4]);
  });
  it("has no dashed part without predictions, and handles a trend that starts predicted", () => {
    expect(trendSegments([pt(1, false), pt(2, false)]).dashed).toEqual([]);
    expect(trendSegments([pt(3, true), pt(4, true)]).dashed.map((p) => p.v)).toEqual([3, 4]);
  });
});

describe("ribbonPath", () => {
  const cols = [{ x: 100, top: 40, bottom: 60 }, { x: 140, top: 30, bottom: 70 }];
  it("starts at the last observed point, goes along the upper edge, back along the lower, and closes", () => {
    expect(ribbonPath({ x: 60, y: 50 }, cols)).toBe("M60.0 50.0L100.0 40.0L140.0 30.0L140.0 70.0L100.0 60.0Z");
  });
  it("widens with the horizon: the band is wider at the last column than at the first", () => {
    expect(cols[1]!.bottom - cols[1]!.top).toBeGreaterThan(cols[0]!.bottom - cols[0]!.top);
  });
  it("starts at the middle of the first column when there is no observation to start from, and is empty with no columns", () => {
    expect(ribbonPath(null, cols).startsWith("M100.0 50.0")).toBe(true);
    expect(ribbonPath({ x: 0, y: 0 }, [])).toBe("");
  });
});
