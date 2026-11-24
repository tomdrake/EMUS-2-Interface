import { describe, expect, it } from "vitest";

import type { Band } from "@/app/api";

import { axisY, bandIndex, bandSpan, chartGroups, tickText, fitLabel, frequencyText, readableOn, wrapText } from "./News2Chart";

const b = (label: string, score: number, low: number | null, high: number | null, extra: Partial<Band> = {}): Band => ({ label, score, low, high, ...extra });
const HR = [b("≥131", 3, 131, null), b("111–130", 2, 111, 130), b("91–110", 1, 91, 110), b("51–90", 0, 51, 90), b("41–50", 1, 41, 50), b("≤40", 3, null, 40)];
const AC = ["A", "C", "V", "P", "U"].map((l) => b(l, l === "A" ? 0 : 3, null, null, { level: l }));

describe("NEWS2 chart helpers", () => {
  it("puts a value in the printed row it falls in, at the edges of every band", () => {
    expect(bandIndex(HR, "hr", 131, false)).toBe(0);
    expect(bandIndex(HR, "hr", 130, false)).toBe(1);
    expect(bandIndex(HR, "hr", 90, false)).toBe(3);
    expect(bandIndex(HR, "hr", 51, false)).toBe(3);
    expect(bandIndex(HR, "hr", 50, false)).toBe(4);
    expect(bandIndex(HR, "hr", 40, false)).toBe(5);
    expect(bandIndex(HR, "hr", null, false)).toBe(-1);
  });
  it("marks consciousness in the row of its own level", () => {
    expect(["A", "C", "V", "P", "U"].map((l) => bandIndex(AC, "acvpu", l, false))).toEqual([0, 1, 2, 3, 4]);
  });
  it("uses the oxygen rows of scale 2 only for a patient on oxygen", () => {
    const s2 = [b("≥97 on O2", 3, 97, null, { oxygen: true }), b("≥93 on air", 0, 93, null, { oxygen: false }), b("88–92", 0, 88, 92)];
    expect(bandIndex(s2, "spo2", 98, true)).toBe(0);
    expect(bandIndex(s2, "spo2", 98, false)).toBe(1);
    expect(bandIndex(s2, "spo2", 90, true)).toBe(2);
  });
  it("lists the blocks as printed, with the letter of ABCDE, for either SpO2 scale", () => {
    const all = Object.fromEntries(["rr", "spo2_1", "spo2_2", "o2_flow", "bp_sys", "hr", "acvpu", "temp"].map((k) => [k, [b("x", 0, null, null)]]));
    const one = chartGroups(all, 1), two = chartGroups(all, 2);
    expect(one.map((g) => g.key)).toEqual(["rr", "spo2", "o2_flow", "bp_sys", "hr", "acvpu", "temp"]);
    expect(one.filter((g) => g.letter).map((g) => g.letter)).toEqual(["A+B", "A+B", "C", "C", "D", "E"]);
    expect(one[1]!.title).toBe("SpO2 Scale 1");
    expect(two[1]!.title).toBe("SpO2 Scale 2");
    expect(two[1]!.bandKey).toBe("spo2_2");
  });
  it("chooses black or white text that reads on a colour", () => {
    expect(readableOn("#FFFFFF")).toBe("#000000");
    expect(readableOn("#FFF1B0")).toBe("#000000");
    expect(readableOn("#8C3329")).toBe("#ffffff");
    expect(readableOn("#12161C")).toBe("#ffffff");
  });
  it("wraps notes into lines, and picks a name that fits a short block", () => {
    expect(wrapText("Score uses systolic BP only", 14)).toEqual(["Score uses", "systolic BP", "only"]);
    expect(wrapText("", 10)).toEqual([]);
    expect(fitLabel(["Consciousness", "ACVPU"], 120)).toBe("Consciousness");
    expect(fitLabel(["Consciousness", "ACVPU"], 40)).toBe("ACVPU");
    expect(fitLabel(["Respirations"], 10)).toBe("Respirations");
  });
  it("writes how often to monitor", () => {
    expect([frequencyText(0), frequencyText(0.5), frequencyText(1), frequencyText(12), frequencyText(null)]).toEqual(["Cont.", "30 min", "1 h", "12 h", ""]);
  });
});

describe("continuous axes", () => {
  const axis = { min: 25, max: 140, step: 1, ticks: [30, 40, 50, 90, 110, 130] };
  it("puts a value at its true height inside the block, higher values higher, and clamps outside the axis", () => {
    expect(axisY(140, axis, 100, 115)).toBe(100);
    expect(axisY(25, axis, 100, 115)).toBe(215);
    expect(axisY(82.5, axis, 100, 115)).toBeCloseTo(157.5);
    expect(axisY(200, axis, 100, 115)).toBe(100);
    expect(axisY(0, axis, 100, 115)).toBe(215);
    expect(axisY(110, axis, 0, 115)).toBeLessThan(axisY(90, axis, 0, 115));
  });
  it("paints each band half a step beyond its printed limits, and open ends to the axis edge", () => {
    expect(bandSpan(HR[0]!, axis)).toEqual([140, 130.5]);
    expect(bandSpan(HR[3]!, axis)).toEqual([90.5, 50.5]);
    expect(bandSpan(HR[5]!, axis)).toEqual([40.5, 25]);
    const t = { min: 34, max: 40, step: 0.1, ticks: [] };
    expect(bandSpan(b("38.1-39.0", 1, 38.1, 39.0), t)[0]).toBeCloseTo(39.05);
  });
  it("tiles the axis: every band starts where the one above stops", () => {
    const spans = HR.map((x) => bandSpan(x, axis));
    expect(spans[0]![0]).toBe(axis.max);
    expect(spans[spans.length - 1]![1]).toBe(axis.min);
    spans.slice(1).forEach((sp, i) => expect(sp[0]).toBe(spans[i]![1]));
  });
  it("writes temperature ticks to a tenth and the others as whole numbers", () => {
    expect(tickText(38, { min: 34, max: 40, step: 0.1, ticks: [] })).toBe("38.0");
    expect(tickText(90, axis)).toBe("90");
  });
});
