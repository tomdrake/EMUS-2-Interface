import { describe, expect, it } from "vitest";

import type { Design } from "@/design/types";

import { addModule, cellsOf, changeParameter, duplicateModule, gridsOn, move, patchRow, removeModule, rowForParameter, setSize, uniqueRowId, unfit } from "./layoutEdit";

const registry = { parameters: {
  hr: { waveforms: ["ecg"] }, spo2: { waveforms: ["pleth"] }, rr: { waveforms: ["resp"] }, bp_sys: { waveforms: [] }, temp: { waveforms: [] },
  falls: { waveforms: [] }, o2_flow: { waveforms: [] },
} } as any;
const row = (id: string, parameter: string, over = {}) => ({ id, kind: "parameter", parameter, trace: "trend", waveform: null, numerics: [parameter],
  content: { trace: true, ai: true, certainty: true, explain: false, forecast: false }, visible: true, label: null, method: null, colour: null,
  trend_window_min: 60, show_limits: true, ...over });
const design = (): Design => ({
  rows: [row("ecg", "hr", { trace: "waveform", waveform: "ecg" }), row("temp", "temp"), row("falls", "falls")],
  screens: [
    { id: "monitor", name: "Monitor", layout: { kind: "widget", widget: { id: "grid", type: "monitor-grid", columns: 6, numerics_side: "right",
      items: [{ row_id: "ecg", size: "row" }, { row_id: "temp", size: "tile" }, { row_id: "falls", size: "compact" }] } } },
    { id: "split", name: "Split", layout: { kind: "split", direction: "horizontal", ratio: 0.5, children: [
      { kind: "widget", widget: { id: "news", type: "news2-chart" } },
      { kind: "widget", widget: { id: "grid2", type: "monitor-grid", columns: 6, numerics_side: "right", items: [{ row_id: "ecg", size: "row" }] } }] } },
  ],
} as unknown as Design);
const items = (d: Design, screen = "monitor") => gridsOn(d, screen)[0]!.items.map((i) => `${i.row_id}:${i.size}`);

describe("layout edits", () => {
  it("changes one module's size and nothing else, without touching the original", () => {
    const d = design();
    const next = setSize(d, "monitor", "temp", "large");
    expect(items(next)).toEqual(["ecg:row", "temp:large", "falls:compact"]);
    expect(items(d)).toEqual(["ecg:row", "temp:tile", "falls:compact"]);
    expect(next.rows).toBe(d.rows);
  });
  it("works inside a split, and only on the screen asked", () => {
    const next = setSize(design(), "split", "ecg", "wide");
    expect(items(next, "split")).toEqual(["ecg:wide"]);
    expect(items(next, "monitor")[0]).toBe("ecg:row");
  });
  it("moves a module earlier or later and stops at the ends", () => {
    const d = design();
    expect(items(move(d, "monitor", "temp", -1))).toEqual(["temp:tile", "ecg:row", "falls:compact"]);
    expect(items(move(d, "monitor", "temp", 1))).toEqual(["ecg:row", "falls:compact", "temp:tile"]);
    expect(move(d, "monitor", "ecg", -1)).toBe(d);
    expect(move(d, "monitor", "falls", 1)).toBe(d);
  });
  it("duplicates a module into its own row so the two can differ", () => {
    const { design: next, newId } = duplicateModule(design(), "monitor", "temp");
    expect(newId).toBe("temp-2");
    expect(items(next)).toEqual(["ecg:row", "temp:tile", "temp-2:tile", "falls:compact"]);
    expect(next.rows.map((r) => r.id)).toContain("temp-2");
    expect(uniqueRowId(next, "temp")).toBe("temp-3");
    const changed = patchRow(next, "temp-2", { label: "Skin" });
    expect(changed.rows.find((r) => r.id === "temp")!.label).toBeNull();
  });
  it("removes a module and its row, unless another screen still shows the row", () => {
    const d = design();
    const a = removeModule(d, "monitor", "temp");
    expect(items(a)).toEqual(["ecg:row", "falls:compact"]);
    expect(a.rows.map((r) => r.id)).not.toContain("temp");
    const b = removeModule(d, "monitor", "ecg");
    expect(b.rows.map((r) => r.id)).toContain("ecg");           // still on the split screen
  });
  it("patches a row's content without losing the rest", () => {
    const next = patchRow(design(), "ecg", { content: { ai: false }, label: "ECG Lead II" });
    const r = next.rows[0]!;
    expect(r.content).toEqual({ trace: true, ai: false, certainty: true, explain: false, forecast: false });
    expect(r.label).toBe("ECG Lead II");
  });
  it("builds a sensible row for any parameter, the way the built-in designs do", () => {
    expect(rowForParameter("hr", registry, "x", "row")).toMatchObject({ trace: "waveform", waveform: "ecg", numerics: ["hr"] });
    expect(rowForParameter("spo2", registry, "x", "row").numerics).toEqual(["spo2", "pulse"]);
    expect(rowForParameter("bp_sys", registry, "x", "row").numerics).toEqual(["bp_sys", "bp_dia", "bp_mean"]);
    expect(rowForParameter("temp", registry, "x", "row")).toMatchObject({ trace: "trend", waveform: null });
    expect(rowForParameter("falls", registry, "x", "row")).toMatchObject({ trace: "events", numerics: [] });
    expect(rowForParameter("o2_flow", registry, "x", "row").trace).toBe("bar");
  });
  it("changing what a row measures keeps its place, content switches and visibility, and clears custom names", () => {
    const d = patchRow(design(), "temp", { label: "Skin", colour: "#ffffff", content: { ai: false } });
    const next = changeParameter(d, "temp", "rr", registry);
    const r = next.rows.find((x) => x.id === "temp")!;
    expect(r).toMatchObject({ parameter: "rr", trace: "waveform", waveform: "resp", label: null, colour: null });
    expect(r.content.ai).toBe(false);
    expect(items(next)).toEqual(items(d));
  });
  it("adds a module at the end with its own row; nothing happens on a screen with no grid", () => {
    const { design: next, newId } = addModule(design(), "monitor", "spo2", "large", registry);
    expect(newId).toBe("spo2-2");
    expect(items(next).at(-1)).toBe("spo2-2:large");
    expect(next.rows.at(-1)).toMatchObject({ id: "spo2-2", parameter: "spo2", waveform: "pleth" });
    const none = addModule({ ...design(), screens: [{ id: "x", layout: { kind: "widget", widget: { id: "n", type: "news2-chart" } } }] } as any, "x", "hr", "row", registry);
    expect(none.newId).toBeNull();
  });
  it("says what a size has no room for, and how many cells it takes", () => {
    const tile = { fits: ["number", "spark", "ai"] } as any;
    expect(unfit(tile, { trace: "waveform", content: { trace: true, ai: true, certainty: true, explain: true, forecast: false } } as any)).toEqual(["certainty", "explain"]);
    expect(cellsOf({ cols: 0, rows: 2, full: true }, 6)).toEqual({ w: 6, h: 2 });
    expect(cellsOf({ cols: 3, rows: 1, full: false }, 2)).toEqual({ w: 2, h: 1 });
  });
});
