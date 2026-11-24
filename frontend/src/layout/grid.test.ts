import type { ModuleSizeSpec } from "@/app/api";

import { HEIGHTS, rowWeights, emptyCells, packGrid, spanOf, visibleContent } from "./grid";

const sizes: Record<string, ModuleSizeSpec> = {
  compact: { label: "Small Square", cols: 1, rows: 1, full: false, flow: "tile-only", fits: ["number"] },
  tile: { label: "Tile", cols: 2, rows: 1, full: false, flow: "split", fits: ["number", "spark", "ai"] },
  tall: { label: "Tall", cols: 1, rows: 2, full: false, flow: "stack", fits: ["number", "spark", "ai", "certainty"] },
  wide: { label: "Wide", cols: 3, rows: 1, full: false, flow: "row", fits: ["number", "trace", "ai"] },
  large: { label: "Large", cols: 2, rows: 2, full: false, flow: "stack", fits: ["number", "trace", "ai", "certainty", "explain"] },
  row: { label: "Full Row", cols: 0, rows: 1, full: true, flow: "row", fits: ["number", "trace", "ai", "certainty"] },
  "row-tall": { label: "Full Row Double", cols: 0, rows: 2, full: true, flow: "row",
                fits: ["number", "trace", "ai", "certainty", "explain", "forecast"] },
};
const items = (...pairs: [string, string][]) => pairs.map(([row_id, size]) => ({ row_id, size }));
const at = (p: ReturnType<typeof packGrid>, id: string) => p.placements.find((x) => x.rowId === id)!;

describe("spans", () => {
  it("makes full sizes as wide as the grid", () => {
    expect(spanOf(sizes.row!, 8)).toEqual({ colSpan: 8, rowSpan: 1 });
    expect(spanOf(sizes["row-tall"]!, 6)).toEqual({ colSpan: 6, rowSpan: 2 });
    expect(spanOf(sizes.large!, 6)).toEqual({ colSpan: 2, rowSpan: 2 });
  });

  it("never lets a module be wider than the grid", () => {
    expect(spanOf(sizes.wide!, 2)).toEqual({ colSpan: 2, rowSpan: 1 });
  });
});

describe("packing", () => {
  it("stacks full rows one under another", () => {
    const p = packGrid(items(["a", "row"], ["b", "row"], ["c", "row"]), 8, sizes);
    expect(p.rowCount).toBe(3);
    expect(p.placements.map((x) => [x.col, x.row, x.colSpan])).toEqual([[1, 1, 8], [1, 2, 8], [1, 3, 8]]);
  });

  it("fills a row left to right, then starts the next", () => {
    const p = packGrid(items(["a", "wide"], ["b", "wide"], ["c", "tile"], ["d", "compact"]), 8, sizes);
    expect([at(p, "a").col, at(p, "b").col, at(p, "c").col]).toEqual([1, 4, 7]);       // 3 + 3 + 2 = 8
    expect([at(p, "d").col, at(p, "d").row]).toEqual([1, 2]);
    expect(p.rowCount).toBe(2);
  });

  it("lets a double-height module hold up the cells beside it, and fills the gap under", () => {
    const p = packGrid(items(["a", "tall"], ["b", "compact"], ["c", "compact"], ["d", "compact"]), 3, sizes);
    expect([at(p, "a").col, at(p, "a").rowSpan]).toEqual([1, 2]);
    expect([at(p, "b").col, at(p, "b").row]).toEqual([2, 1]);
    expect([at(p, "c").col, at(p, "c").row]).toEqual([3, 1]);
    expect([at(p, "d").col, at(p, "d").row]).toEqual([2, 2]);      // beside the tall one, in the gap
  });

  it("places a later small module in an earlier gap (dense)", () => {
    const p = packGrid(items(["a", "wide"], ["b", "large"], ["c", "compact"]), 4, sizes);
    expect([at(p, "a").col, at(p, "a").row]).toEqual([1, 1]);
    expect([at(p, "b").col, at(p, "b").row]).toEqual([1, 2]);     // 2x2 does not fit beside the wide one
    expect([at(p, "c").col, at(p, "c").row]).toEqual([4, 1]);     // the gap left at the end of row 1
  });

  it("never overlaps and never leaves the grid", () => {
    const list = items(["a", "row-tall"], ["b", "large"], ["c", "large"], ["d", "tall"], ["e", "tall"],
                       ["f", "compact"], ["g", "compact"], ["h", "tile"], ["i", "tile"]);
    const p = packGrid(list, 6, sizes);
    const seen = new Set<string>();
    for (const x of p.placements) {
      expect(x.col + x.colSpan - 1).toBeLessThanOrEqual(6);
      for (let r = 0; r < x.rowSpan; r++) for (let c = 0; c < x.colSpan; c++) {
        const k = `${x.row + r},${x.col + c}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });

  it("fills the modular example exactly: 6 columns by 5 rows, no gaps", () => {
    const p = packGrid(items(["ecg", "row-tall"], ["spo2", "large"], ["resp", "large"], ["bp", "tall"],
                             ["temp", "tall"], ["oxygen", "compact"], ["activity", "compact"],
                             ["falls", "tile"], ["sleep", "tile"]), 6, sizes);
    expect(p.rowCount).toBe(5);
    expect(emptyCells(p, 6)).toBe(0);
    expect([at(p, "ecg").row, at(p, "spo2").row, at(p, "oxygen").row]).toEqual([1, 3, 5]);
  });

  it("reports gaps when the sizes do not tile", () => {
    const p = packGrid(items(["a", "wide"]), 4, sizes);
    expect(emptyCells(p, 4)).toBe(1);
  });

  it("copes with no modules and unknown sizes", () => {
    expect(packGrid([], 8, sizes)).toEqual({ placements: [], rowCount: 0 });
    expect(packGrid(items(["a", "giant"]), 4, sizes).placements[0]!.colSpan).toBe(4);   // falls back to a full row
  });
});

describe("what fits", () => {
  const all = { trace: true, ai: true, certainty: true, explain: true, forecast: true };

  it("always keeps the number", () => {
    for (const s of Object.values(sizes)) expect(visibleContent(s, all).number).toBe(true);
  });

  it("shows only the number in a small square, and says what was left out", () => {
    const v = visibleContent(sizes.compact!, all);
    expect(v).toMatchObject({ trace: null, ai: false, certainty: false, explain: false, forecast: false });
    expect(v.dropped).toEqual(["trace", "ai", "certainty", "explain", "forecast"]);
  });

  it("gives a tile a spark and the AI line but not the full trace", () => {
    const v = visibleContent(sizes.tile!, all);
    expect(v).toMatchObject({ trace: "spark", ai: true, certainty: false });
    expect(v.dropped).toEqual(["certainty", "explain", "forecast"]);
  });

  it("gives a large module the full trace, certainty and the why line, but not the forecast", () => {
    expect(visibleContent(sizes.large!, all)).toMatchObject({ trace: "frame", ai: true, certainty: true, explain: true, forecast: false });
  });

  it("shows everything in a double-height full row", () => {
    const v = visibleContent(sizes["row-tall"]!, all);
    expect(v).toMatchObject({ trace: "frame", ai: true, certainty: true, explain: true, forecast: true });
    expect(v.dropped).toEqual([]);
  });

  it("drops nothing that was not asked for", () => {
    expect(visibleContent(sizes.compact!, { trace: false, ai: false, certainty: false, explain: false, forecast: false }).dropped).toEqual([]);
    expect(visibleContent(sizes.row!, { trace: true, ai: false, certainty: false, explain: false, forecast: false })).toMatchObject({ trace: "frame", ai: false });
  });

  it("has no trace to show for bar and event rows, and does not call that a drop", () => {
    const v = visibleContent(sizes.row!, all, false);
    expect(v.trace).toBeNull();
    expect(v.dropped).not.toContain("trace");
  });
});


describe("row weights (the Height setting)", () => {
  const p = (rowId: string, row: number, rowSpan = 1) => ({ rowId, size: "row", col: 1, row, colSpan: 4, rowSpan });
  it("gives every line the same weight at the standard height", () => {
    expect(rowWeights([p("a", 1), p("b", 2), p("c", 3)], 3, () => 1)).toEqual([1, 1, 1]);
  });
  it("makes a taller module's line proportionally taller", () => {
    const scale = (id: string) => ({ a: 1.25, b: 1 }[id] ?? 1);
    expect(rowWeights([p("a", 1), p("b", 2)], 2, scale)).toEqual([1.25, 1]);
  });
  it("takes the largest scale among the modules that start in a line", () => {
    const placements = [{ ...p("x", 1), colSpan: 2 }, { ...p("y", 1), col: 3, colSpan: 2 }];
    expect(rowWeights(placements, 1, (id) => (id === "y" ? 1.5 : 0.75))).toEqual([1.5]);
  });
  it("applies a tall module's scale to every line it spans, so it stays equal at the standard height", () => {
    expect(rowWeights([p("t", 1, 2)], 2, () => 1)).toEqual([1, 1]);
    expect(rowWeights([p("t", 1, 2), p("u", 3)], 3, (id) => (id === "t" ? 2 : 1))).toEqual([2, 2, 1]);
  });
  it("offers presets from shorter to double, with standard in the middle", () => {
    expect(HEIGHTS.map((h) => h.label)).toEqual(["Shorter", "Standard", "Taller", "Tallest", "Double"]);
    expect(HEIGHTS.find((h) => h.label === "Standard")!.value).toBe(1);
  });
});
