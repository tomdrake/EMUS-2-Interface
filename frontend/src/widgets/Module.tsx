import { AiCertainty, AiChip, AiExplain } from "@/ai/AiChip";
import { BpReadings } from "./BpReadings";
import { useDesign, useUi } from "@/app/store";
import type { ExampleSnapshot } from "@/contracts/types.gen";
import { useSnapshot } from "@/examples/store";
import { useEditor } from "@/studio/editor";
import { rowTitle, titleCase } from "@/design/text";
import { paramVar } from "@/design/theme";
import type { Row } from "@/design/types";
import { visibleContent, type Placement } from "@/layout/grid";
import { RowStatus, Tile, type TileValue } from "@/safety/Tile";
import { TraceFrame } from "@/traces/TraceFrame";

import { ActivityDetail, FallsDetail, NewsTrend, OxygenDetail, RISK_COLOUR } from "./ModuleDetails";

/** The values a row's tile holds, primary first. Blood pressure reads as one value, "120/80 (93)". */
export function tileValues(row: Row, numerics?: ExampleSnapshot["numerics"], notes: string[] = []): TileValue[] {
  const n = row.numerics as string[];
  const at = (p: string) => (numerics as Record<string, number | string | null | undefined> | undefined)?.[p];
  if (n.includes("bp_sys") && n.includes("bp_dia")) {
    return [{ parameter: "bp_sys", name: "BP", value: at("bp_sys"),
              extra: [{ separator: "/", value: at("bp_dia"), parameter: "bp_dia" }, ...(n.includes("bp_mean")
                ? [{ separator: " ", wrap: [" (", ")"] as [string, string], value: at("bp_mean"), parameter: "bp_mean" }] : [])] }];
  }
  return n.map((parameter, i) => ({ parameter, value: at(parameter), ...(i === 0 && notes.length ? { notes } : {}) }));
}

/** "15 H" for a window of 900 minutes; "24 H" for a day. */
const windowH = (min: number) => `${Math.max(1, Math.round(min / 60))} H`;

/**
 * The small lines under a tile's number: the heart's rhythm in words, whether breathing is regular, and the
 * highest and lowest temperature over the last day. They come from the same example snapshot as the numbers.
 */
export function tileNotes(row: Row, s: ExampleSnapshot | null, rhythmLabels: Record<string, string> = {}): string[] {
  if (!s) return [];
  if (row.parameter === "hr" && s.rhythm) return [titleCase(rhythmLabels[s.rhythm] ?? s.rhythm)];
  if (row.parameter === "rr" && s.resp_pattern) return [s.resp_pattern === "regular" ? "Regular" : "Irregular"];
  if (row.parameter === "temp") {
    const e = s.extremes_24h.temp;
    if (e && e.window_min > 0) return [`${windowH(e.window_min)} Max ${e.max.toFixed(1)} Min ${e.min.toFixed(1)}`];
  }
  return [];
}

/**
 * One monitored item drawn at the size the grid gives it.
 *
 * Four arrangements (registry MODULE_SIZES `flow`):
 *   row        the trace beside its tile: the familiar monitor row (full row, double)
 *   split      the number big on the left half, its detail on the right (tile, wide, large)
 *   stack      the number big on top, its detail below (tall, too narrow to split)
 *   tile-only  just the number, as large as will fit (small square)
 *
 * What it shows besides the number is what the design asked for, less what does not fit this size
 * (`visibleContent`); `data-content` and `data-dropped` say which. Text takes the module's colour, as
 * in every row. The whole module is tappable (alarm limits) through a transparent button above its
 * content; the x scale control and the AI chip sit above that, so buttons never nest.
 */
export function Module({ row, placement }: { row: Row; placement: Placement }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const editing = useUi((s) => s.editMode);
  const selected = useEditor((s) => s.selected === row.id);
  const spec = registry.module_sizes[placement.size] ?? registry.module_sizes.row!;
  const drawsTrace = row.trace === "waveform" || row.trace === "trend";
  const vis = visibleContent(spec, row.content, drawsTrace);
  const snapshot = useSnapshot();
  const values = tileValues(row, snapshot?.numerics, tileNotes(row, snapshot, registry.rhythm_labels));
  const risk = row.parameter === "news2" ? snapshot?.news2.risk : null;
  const colour = risk ? RISK_COLOUR[risk] : row.colour ?? (row.parameter ? paramVar(row.parameter) : "var(--c-text)");
  const title = rowTitle(row, design, registry);
  const flow = spec.flow;
  const tall = placement.rowSpan > 1;

  // A single-height row has no room under its trace: its certainty rides in the chip. Taller
  // modules show certainty (and the why line) as their own block.
  const roomForBlock = flow !== "row" || tall;
  const blockCertainty = vis.certainty && roomForBlock;
  const blockExplain = vis.explain && roomForBlock;
  const chip = vis.ai ? <AiChip row={row} withCertainty={blockCertainty} /> : null;
  // Stacked and double-height split modules have room for the chip in a block under the detail; a
  // single-height tile or wide module floats it over the corner of its trace.
  const chipInBlock = flow === "stack" || (flow === "split" && tall);
  const extras = (
    <>
      {blockCertainty && <AiCertainty row={row} />}
      {blockExplain && <AiExplain row={row} />}
    </>
  );
  const head = (
    <div className="row-head">
      <span className="row-label" data-testid={`row-label-${row.id}`}>
        {title.name}{title.method && <span className="row-method"> - {title.method}</span>}
      </span>
      {row.parameter && <RowStatus parameter={row.parameter} />}
    </div>
  );
  // In a full row the last five blood pressures sit under the number, in the tile.
  const underNumber = flow === "row" && vis.readings && row.parameter === "bp_sys" && snapshot
    ? <BpReadings readings={snapshot.bp_readings} nowIso={snapshot.generated_at} variant="tile" /> : null;
  const tile = values.length ? <Tile values={values} below={underNumber} /> : <span className="tile tile-empty" aria-hidden="true" />;
  // Falls, activity and the NEWS2 history have no trace; they show their own small summaries instead.
  const summary = flow === "row" && row.trace !== "news" ? null : row.parameter === "falls" ? <FallsDetail /> : row.parameter === "activity" ? <ActivityDetail />
    : row.parameter === "o2_flow" ? <OxygenDetail />
    : row.trace === "news" ? <NewsTrend /> : null;
  const trace = summary ?? (vis.trace
    ? <TraceFrame row={row} mini={vis.trace === "spark"} />
    : <div className="trace-area" data-testid={`trace-${row.id}`} />);
  const titleOnly = !values.length && (
    <div className="module-title"><span className="row-label">{title.name}</span>
      {row.parameter && <RowStatus parameter={row.parameter} />}</div>);
  const readings = vis.readings && row.parameter === "bp_sys" && snapshot
    ? <BpReadings readings={snapshot.bp_readings} nowIso={snapshot.generated_at} /> : null;
  const block = (blockCertainty || blockExplain || (chipInBlock && chip)) && (
    <div className="module-ai">{chipInBlock && chip}{extras}</div>);

  return (
    <div className={`module module-${flow} size-${placement.size}${flow === "row" ? " row" : ""}`}
         style={{ gridColumn: `${placement.col} / span ${placement.colSpan}`,
                  gridRow: `${placement.row} / span ${placement.rowSpan}`, color: colour }}
         data-testid={`row-${row.id}`} data-parameter={row.parameter ?? ""} data-size={placement.size} data-selected={selected || undefined}
         data-flow={flow} data-content={[vis.trace && "trace", vis.ai && "ai", vis.certainty && "certainty",
                                          vis.explain && "explain", vis.forecast && "forecast", vis.readings && "readings"].filter(Boolean).join(" ")}
         data-dropped={vis.dropped.join(" ")}>
      <button type="button" className="row-hit" data-testid={`row-hit-${row.id}`}
              aria-label={editing ? `Edit ${title.name}` : row.parameter === "news2" ? `${title.name}: how it was scored` : `${title.name}: alarm limits`}
              aria-pressed={editing ? selected : undefined}
              onClick={() => (editing ? useEditor.getState().select(row.id) : row.parameter === "news2" ? useUi.getState().showSheet("news2-breakdown") : useUi.getState().showSheet("alarm-limits", row.id))} />
      {flow === "row" && (
        <>
          <div className="row-trace">{head}{chip}{trace}{extras}</div>
          <div className="row-tiles">{tile}</div>
        </>
      )}
      {flow === "stack" && (
        <>
          <div className="module-tile">{titleOnly || tile}</div>
          <div className="module-detail">
            {head}
            {readings}
            <div className="module-trace">{trace}</div>
            {block}
          </div>
        </>
      )}
      {flow === "split" && (
        <>
          <div className="module-tile">{titleOnly || tile}</div>
          <div className="module-detail">
            {tall && head}
            {readings}
            <div className="module-trace">{trace}</div>
            {block}
            {!chipInBlock && chip}
          </div>
        </>
      )}
      {flow === "tile-only" && <div className="module-tile">{titleOnly || tile}</div>}
    </div>
  );
}
