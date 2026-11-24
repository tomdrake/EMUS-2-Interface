import { describe, expect, it } from "vitest";

import type { Row } from "@/design/types";

import { duration } from "./ModuleDetails";
import { tileNotes, tileValues } from "./Module";

const row = (parameter: string) => ({ id: parameter, parameter, numerics: [parameter] }) as unknown as Row;
const snap = {
  rhythm: "af", resp_pattern: "irregular",
  extremes_24h: { temp: { max: 38.84, min: 36.96, window_min: 1440 } },
} as any;
const labels = { sinus: "Sinus rhythm", af: "Atrial fibrillation" };

describe("tile notes", () => {
  it("writes the rhythm in words, Title Case", () => {
    expect(tileNotes(row("hr"), snap, labels)).toEqual(["Atrial Fibrillation"]);
    expect(tileNotes(row("hr"), { ...snap, rhythm: "sinus" }, labels)).toEqual(["Sinus Rhythm"]);
  });
  it("says whether breathing is regular or irregular", () => {
    expect(tileNotes(row("rr"), snap)).toEqual(["Irregular"]);
    expect(tileNotes(row("rr"), { ...snap, resp_pattern: "regular" })).toEqual(["Regular"]);
  });
  it("gives the highest and lowest temperature with the window it covers", () => {
    expect(tileNotes(row("temp"), snap)).toEqual(["24 H Max 38.8 Min 37.0"]);
    expect(tileNotes(row("temp"), { extremes_24h: { temp: { max: 36.6, min: 36.4, window_min: 720 } } } as any)).toEqual(["12 H Max 36.6 Min 36.4"]);
  });
  it("has no notes without data, for other rows, or with no ECG or respiration strip", () => {
    expect(tileNotes(row("hr"), null)).toEqual([]);
    expect(tileNotes(row("spo2"), snap)).toEqual([]);
    expect(tileNotes(row("hr"), { ...snap, rhythm: null })).toEqual([]);
    expect(tileNotes(row("rr"), { ...snap, resp_pattern: null })).toEqual([]);
  });
  it("puts the notes on the first value of a tile", () => {
    const v = tileValues({ ...row("spo2"), numerics: ["spo2", "pulse"] } as any, { spo2: 96, pulse: 80 } as any, ["x"]);
    expect(v[0]!.notes).toEqual(["x"]);
    expect(v[1]!.notes).toBeUndefined();
  });
});

describe("durations", () => {
  it("writes hours and minutes briefly", () => {
    expect([duration(0), duration(40), duration(60), duration(130), duration(780)]).toEqual(["None", "40 min", "1 h", "2h 10m", "13 h"]);
  });
});
