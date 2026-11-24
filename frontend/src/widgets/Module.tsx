import { AiCertainty, AiChip, AiExplain } from "@/ai/AiChip";
import { useDesign, useUi } from "@/app/store";
import type { ExampleSnapshot } from "@/contracts/types.gen";
import { useSnapshot } from "@/examples/store";
import { useEditor } from "@/studio/editor";
import { rowTitle } from "@/design/text";
import { paramVar } from "@/design/theme";
import type { Row } from "@/design/types";
import { visibleContent, type Placement } from "@/layout/grid";
import { RowStatus, Tile, type TileValue } from "@/safety/Tile";
import { TraceFrame } from "@/traces/TraceFrame";

/** The values a row's tile holds, primary first. Blood pressure reads as one value, "120/80 (93)". */
export function tileValues(row: Row, numerics?: ExampleSnapshot["numerics"]): TileValue[] {
  const n = row.numerics as string[];
  const at = (p: string) => (numerics as Record<string, number | string | null | undefined> | undefined)?.[p];
  if (n.includes("bp_sys") && n.includes("bp_dia")) {
    return [{ parameter: "bp_sys", name: "BP", value: at("bp_sys"),
              extra: [{ separator: "/", value: at("bp_dia") }, ...(n.includes("bp_mean")
                ? [{ separator: " ", wrap: [" (", ")"] as [string, string], value: at("bp_mean") }] : [])] }];
  }
  return n.map((parameter) => ({ parameter, value: at(parameter) }));
}

/**
 * One monitored item drawn at the size the grid gives it.
 *
 * Four arrangements (registry MODULE_SIZES `flow`):
 *   row        the trace beside its tile: the familiar monitor row (wide, full row, double)
 *   stack      the tile on top, the trace below (tall, large)
 *   side       the tile beside a small spark (tile)
 *   tile-only  just the tile (small square)
 *
 * What it shows besides the number is what the design asked for, less what does not
 * fit this size (`visibleContent`); `data-content` and `data-dropped` say which. Text
 * takes the module's colour, as in every row. The whole module is tappable (alarm
 * limits) through a transparent button above its content; the x scale control sits
 * above that, so buttons never nest.
 *
 * Scaffold: number and trace. AI interpretation, certainty, the why line and the
 * forecast arrive with the AI layer; their room is already decided by `visibleContent`.
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
  const values = tileValues(row, snapshot?.numerics);
  const colour = row.colour ?? (row.parameter ? paramVar(row.parameter) : "var(--c-text)");
  const title = rowTitle(row, design, registry);
  const flow = spec.flow;

  const example = snapshot ? <span className="example-mark" data-testid={`example-${row.id}`}>Example</span> : null;
  // A single-height row has no room under its trace: its certainty rides in the chip. Taller
  // modules and the double-height row show certainty (and the why line) as their own block.
  const roomForBlock = flow !== "row" || placement.rowSpan > 1;
  const blockCertainty = vis.certainty && roomForBlock;
  const blockExplain = vis.explain && roomForBlock;
  const chip = vis.ai ? <AiChip row={row} withCertainty={blockCertainty} /> : null;
  // A stacked module (tall, large) has no room beside its title: its chip sits in the block under the trace.
  const chipInBlock = flow === "stack";
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
      {example}
      {row.parameter && <RowStatus parameter={row.parameter} />}
    </div>
  );
  const tile = values.length ? <Tile values={values} /> : <span className="tile tile-empty" aria-hidden="true" />;
  const trace = vis.trace
    ? <TraceFrame row={row} mini={vis.trace === "spark"} />
    : <div className="trace-area" data-testid={`trace-${row.id}`} />;
  const titleOnly = !values.length && (
    <div className="module-title"><span className="row-label">{title.name}</span>
      {row.parameter && <RowStatus parameter={row.parameter} />}</div>);
  const corner = flow === "side" || flow === "tile-only" ? example : null;

  return (
    <div className={`module module-${flow} size-${placement.size}${flow === "row" ? " row" : ""}`}
         style={{ gridColumn: `${placement.col} / span ${placement.colSpan}`,
                  gridRow: `${placement.row} / span ${placement.rowSpan}`, color: colour }}
         data-testid={`row-${row.id}`} data-parameter={row.parameter ?? ""} data-size={placement.size} data-selected={selected || undefined}
         data-flow={flow} data-content={[vis.trace && "trace", vis.ai && "ai", vis.certainty && "certainty",
                                          vis.explain && "explain", vis.forecast && "forecast"].filter(Boolean).join(" ")}
         data-dropped={vis.dropped.join(" ")}>
      <button type="button" className="row-hit" data-testid={`row-hit-${row.id}`}
              aria-label={editing ? `Edit ${title.name}` : `${title.name}: alarm limits`}
              aria-pressed={editing ? selected : undefined}
              onClick={() => (editing ? useEditor.getState().select(row.id) : useUi.getState().showSheet("alarm-limits", row.id))} />
      {flow === "row" && (
        <>
          <div className="row-trace">{head}{chip}{trace}{extras}</div>
          <div className="row-tiles">{tile}</div>
        </>
      )}
      {flow === "stack" && (
        <>
          {head}
          {!chipInBlock && chip}
          <div className="module-tile">{tile}</div>
          <div className="module-trace">{trace}</div>
          {(blockCertainty || blockExplain || (chipInBlock && chip)) && (
            <div className="module-ai">{chipInBlock && chip}{extras}</div>
          )}
        </>
      )}
      {flow === "side" && (
        <>
          <div className="module-tile">{titleOnly || tile}</div>
          <div className="module-trace">{trace}</div>
          {chip}
          {corner}
        </>
      )}
      {flow === "tile-only" && <><div className="module-tile">{titleOnly || tile}</div>{corner}</>}
    </div>
  );
}
