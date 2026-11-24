import type { Registry } from "@/app/api";
import type { Design, LayoutNode, Row, WidgetOf } from "@/design/types";
import { visibleContent, type Dropped } from "@/layout/grid";

/**
 * Edits to the monitor grid, as pure functions from one design document to the next. The editor
 * applies them to a local draft; nothing reaches the server until the draft is saved as a new
 * version, and the server validates it again. None of these can change a data structure: they only
 * move, resize, copy and configure rows that refer to the registry by id.
 */
type Grid = WidgetOf<"monitor-grid">;
type Item = Grid["items"][number];

function mapNode(node: LayoutNode, fn: (g: Grid) => Grid | null, done: { hit: boolean }): LayoutNode {
  if (node.kind === "split") {
    const [a, b] = node.children as [LayoutNode, LayoutNode];
    return { ...node, children: [mapNode(a, fn, done), mapNode(b, fn, done)] } as LayoutNode;
  }
  if (node.widget.type !== "monitor-grid" || done.hit) return node;
  const next = fn(node.widget as Grid);
  if (!next) return node;
  done.hit = true;
  return { ...node, widget: next } as LayoutNode;
}

/** Apply `fn` to the first monitor grid on a screen for which it returns a grid (null = not this one). */
function editGrid(d: Design, screenId: string, fn: (g: Grid) => Grid | null): Design {
  const done = { hit: false };
  const screens = d.screens.map((s) => (s.id === screenId ? { ...s, layout: mapNode(s.layout as LayoutNode, fn, done) } : s));
  return done.hit ? ({ ...d, screens } as Design) : d;
}

function findGrids(node: LayoutNode, out: Grid[]): void {
  if (node.kind === "split") (node.children as LayoutNode[]).forEach((c) => findGrids(c, out));
  else if (node.widget.type === "monitor-grid") out.push(node.widget as Grid);
}

export function gridsOn(d: Design, screenId: string): Grid[] {
  const s = d.screens.find((x) => x.id === screenId);
  const out: Grid[] = [];
  if (s) findGrids(s.layout as LayoutNode, out);
  return out;
}

export const hasModules = (d: Design, screenId: string): boolean => gridsOn(d, screenId).length > 0;

const withItem = (rowId: string) => (g: Grid): Grid | null => (g.items.some((i) => i.row_id === rowId) ? g : null);

export function setSize(d: Design, screenId: string, rowId: string, size: string): Design {
  return editGrid(d, screenId, (g) => withItem(rowId)(g) && {
    ...g, items: g.items.map((i) => (i.row_id === rowId ? { ...i, size } : i)) as Grid["items"] });
}

/** Move a module earlier (-1) or later (+1) in reading order. */
export function move(d: Design, screenId: string, rowId: string, delta: -1 | 1): Design {
  return editGrid(d, screenId, (g) => {
    const i = g.items.findIndex((x) => x.row_id === rowId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= g.items.length) return null;
    const items = [...g.items];
    [items[i], items[j]] = [items[j]!, items[i]!];
    return { ...g, items };
  });
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 34) || "module";

export function uniqueRowId(d: Design, base: string): string {
  const ids = new Set(d.rows.map((r) => r.id));
  const root = slug(base).replace(/-\d+$/, "");
  for (let n = 2; ; n++) {
    const id = `${root}-${n}`;
    if (!ids.has(id)) return id;
  }
}

/** A copy of a module, placed after it, with its own row so the two can be configured separately. */
export function duplicateModule(d: Design, screenId: string, rowId: string): { design: Design; newId: string | null } {
  const row = d.rows.find((r) => r.id === rowId);
  if (!row) return { design: d, newId: null };
  const newId = uniqueRowId(d, rowId);
  const next = editGrid(d, screenId, (g) => {
    const i = g.items.findIndex((x) => x.row_id === rowId);
    if (i < 0) return null;
    const items = [...g.items];
    items.splice(i + 1, 0, { ...items[i]!, row_id: newId } as Item);
    return { ...g, items };
  });
  if (next === d) return { design: d, newId: null };
  return { design: { ...next, rows: [...next.rows, { ...row, id: newId }] } as Design, newId };
}

/** Take a module off the screen. Its row is deleted too unless another screen still uses it. */
export function removeModule(d: Design, screenId: string, rowId: string): Design {
  const next = editGrid(d, screenId, (g) => withItem(rowId)(g) && { ...g, items: g.items.filter((i) => i.row_id !== rowId) as Grid["items"] });
  const used = next.screens.some((s) => gridsOn(next, s.id).some((g) => g.items.some((i) => i.row_id === rowId)));
  return used ? next : { ...next, rows: next.rows.filter((r) => r.id !== rowId) } as Design;
}

type RowPatch = Partial<Omit<Row, "content">> & { content?: Partial<Row["content"]> };

export function patchRow(d: Design, rowId: string, patch: RowPatch): Design {
  return { ...d, rows: d.rows.map((r) => (r.id === rowId
    ? { ...r, ...patch, content: { ...r.content, ...(patch.content ?? {}) } } : r)) } as Design;
}

const WAVE_FOR: Record<string, string> = { hr: "ecg", spo2: "pleth", rr: "resp" };

/** A sensible row for any registry parameter, the way the built-in designs configure it. */
export function rowForParameter(parameter: string, registry: Pick<Registry, "parameters">, id: string, size: string): Row {
  const p = registry.parameters[parameter];
  const wave = WAVE_FOR[parameter] && p?.waveforms.includes(WAVE_FOR[parameter]!) ? WAVE_FOR[parameter]! : null;
  const numerics = parameter === "spo2" ? ["spo2", "pulse"]
    : parameter === "bp_sys" ? ["bp_sys", "bp_dia", "bp_mean"]
      : ["falls", "sleep"].includes(parameter) ? []
        : parameter === "activity" ? ["position"] : [parameter];
  const trace = wave ? "waveform" : ["o2_flow", "activity"].includes(parameter) ? "bar"
    : ["falls", "sleep"].includes(parameter) ? "events" : "trend";
  void size;
  return {
    id, kind: "parameter", parameter, label: null, method: null, colour: null, trace, waveform: wave,
    trend_window_min: 240, numerics, show_limits: true, visible: true,
    content: { trace: true, ai: true, certainty: true, explain: false, forecast: false },
  } as unknown as Row;
}

/** Change what a row measures. Its trace, numbers and name follow, and any custom label, method and colour are cleared. */
export function changeParameter(d: Design, rowId: string, parameter: string, registry: Pick<Registry, "parameters">): Design {
  const old = d.rows.find((r) => r.id === rowId);
  if (!old) return d;
  const fresh = rowForParameter(parameter, registry, rowId, "");
  return { ...d, rows: d.rows.map((r) => (r.id === rowId ? { ...fresh, content: old.content, visible: old.visible } : r)) } as Design;
}

export function addModule(d: Design, screenId: string, parameter: string, size: string,
                          registry: Pick<Registry, "parameters">): { design: Design; newId: string | null } {
  const grids = gridsOn(d, screenId);
  if (!grids.length) return { design: d, newId: null };
  const newId = uniqueRowId(d, parameter.replace(/_/g, "-"));
  const row = rowForParameter(parameter, registry, newId, size);
  const next = editGrid(d, screenId, (g) => ({ ...g, items: [...g.items, { row_id: newId, size }] as Grid["items"] }));
  return { design: { ...next, rows: [...next.rows, row] } as Design, newId };
}

/** What a module has been asked for that its size has no room for. */
export function unfit(spec: Parameters<typeof visibleContent>[0], row: Pick<Row, "content" | "trace">): Dropped[] {
  const draws = row.trace === "waveform" || row.trace === "trend";
  return visibleContent(spec, row.content, draws).dropped;
}

/** Cells a size takes, for drawing it as a little diagram: `columns` is the grid's width. */
export function cellsOf(spec: { cols: number; rows: number; full: boolean }, columns: number): { w: number; h: number } {
  return { w: spec.full ? columns : Math.min(spec.cols, columns), h: spec.rows };
}
