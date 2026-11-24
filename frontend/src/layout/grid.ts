import type { ModuleSizeSpec } from "@/app/api";

/**
 * Packing modules into the monitor grid. Pure, so the rules are tested without a screen.
 *
 * The grid has `columns` equal columns and as many equal rows as the modules need, so
 * it always fills its pane and never scrolls. Modules are placed in order, each in the
 * first gap (reading order) where it fits, like CSS "grid-auto-flow: row dense".
 */
export interface GridItem { row_id: string; size: string }

export interface Placement {
  rowId: string;
  size: string;
  /** 1-based, ready for CSS grid-column / grid-row. */
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export function spanOf(spec: ModuleSizeSpec, columns: number): { colSpan: number; rowSpan: number } {
  return { colSpan: spec.full ? columns : Math.min(spec.cols, columns), rowSpan: spec.rows };
}

export function packGrid(items: readonly GridItem[], columns: number, sizes: Record<string, ModuleSizeSpec>):
  { placements: Placement[]; rowCount: number } {
  const taken: boolean[][] = [];
  const free = (r: number, c: number, cs: number, rs: number) => {
    if (c + cs > columns) return false;
    for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) if (taken[r + dr]?.[c + dc]) return false;
    return true;
  };
  const placements: Placement[] = [];
  let rowCount = 0;
  for (const item of items) {
    const spec = sizes[item.size] ?? sizes.row;
    if (!spec) continue;
    const { colSpan, rowSpan } = spanOf(spec, columns);
    let done = false;
    for (let r = 0; !done; r++) {
      for (let c = 0; c + colSpan <= columns && !done; c++) {
        if (!free(r, c, colSpan, rowSpan)) continue;
        for (let dr = 0; dr < rowSpan; dr++) {
          taken[r + dr] ??= [];
          for (let dc = 0; dc < colSpan; dc++) taken[r + dr]![c + dc] = true;
        }
        placements.push({ rowId: item.row_id, size: item.size, col: c + 1, row: r + 1, colSpan, rowSpan });
        rowCount = Math.max(rowCount, r + rowSpan);
        done = true;
      }
    }
  }
  return { placements, rowCount };
}

/** The height presets of Edit Layout: how tall a module is against the others in its line. */
export const HEIGHTS = [
  { value: 0.75, label: "Shorter" }, { value: 1, label: "Standard" }, { value: 1.25, label: "Taller" },
  { value: 1.5, label: "Tallest" }, { value: 2, label: "Double" },
] as const;

/**
 * The weight of each line of the grid, for its `fr` track. A line takes the largest `height_scale` among the
 * modules that cover it (a tall module scales every line it spans). With every scale at 1 the lines are equal,
 * as before.
 */
export function rowWeights(placements: readonly Placement[], rowCount: number,
                           scaleOf: (rowId: string) => number): number[] {
  const w = Array.from({ length: Math.max(1, rowCount) }, () => 0);
  for (const p of placements) {
    const each = scaleOf(p.rowId);
    for (let r = p.row - 1; r < p.row - 1 + p.rowSpan; r++) w[r] = Math.max(w[r] ?? 0, each);
  }
  return w.map((x) => (x > 0 ? x : 1));
}

/** Cells left empty in the packed grid: 0 means the layout is complete. */
export function emptyCells(p: { placements: Placement[]; rowCount: number }, columns: number): number {
  return p.rowCount * columns - p.placements.reduce((n, x) => n + x.colSpan * x.rowSpan, 0);
}

export interface ModuleContentFlags { trace: boolean; ai: boolean; certainty: boolean; explain: boolean; forecast: boolean; readings?: boolean }
export type Dropped = "trace" | "ai" | "certainty" | "explain" | "forecast" | "readings";

export interface VisibleContent {
  /** A module always has its number. */
  number: true;
  /** The biggest form of the trace that fits: the full frame, a small spark, or none. */
  trace: "frame" | "spark" | null;
  ai: boolean;
  certainty: boolean;
  explain: boolean;
  forecast: boolean;
  readings: boolean;
  /** What the design asked for that this size has no room for. */
  dropped: Dropped[];
}

/**
 * What a module shows at its size: what was asked for, less what does not fit.
 * `drawsTrace` is false for bar and event rows, which have no trace frame to show.
 */
export function visibleContent(spec: Pick<ModuleSizeSpec, "fits">, content: ModuleContentFlags,
                               drawsTrace = true): VisibleContent {
  const fits = new Set(spec.fits);
  const dropped: Dropped[] = [];
  let trace: VisibleContent["trace"] = null;
  if (content.trace && drawsTrace) {
    if (fits.has("trace")) trace = "frame";
    else if (fits.has("spark")) trace = "spark";
    else dropped.push("trace");
  }
  const keep = (key: Exclude<Dropped, "trace">) => {
    if (!content[key as keyof ModuleContentFlags]) return false;
    if (fits.has(key)) return true;
    dropped.push(key);
    return false;
  };
  return { number: true, trace, ai: keep("ai"), certainty: keep("certainty"), explain: keep("explain"),
           forecast: keep("forecast"), readings: keep("readings"), dropped };
}
