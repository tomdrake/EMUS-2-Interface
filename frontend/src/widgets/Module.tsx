import { useDesign, useUi } from "@/app/store";
import { rowTitle } from "@/design/text";
import { paramVar } from "@/design/theme";
import type { Row } from "@/design/types";
import { visibleContent, type Placement } from "@/layout/grid";
import { RowStatus, Tile, type TileValue } from "@/safety/Tile";
import { TraceFrame } from "@/traces/TraceFrame";

/** The values a row's tile holds, primary first. Blood pressure reads as one value, "120/80 (93)". */
export function tileValues(row: Row): TileValue[] {
  const n = row.numerics as string[];
  if (n.includes("bp_sys") && n.includes("bp_dia")) {
    return [{ parameter: "bp_sys", name: "BP",
              extra: [{ separator: "/" }, ...(n.includes("bp_mean")
                ? [{ separator: " ", wrap: [" (", ")"] as [string, string] }] : [])] }];
  }
  return n.map((parameter) => ({ parameter }));
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
  const spec = registry.module_sizes[placement.size] ?? registry.module_sizes.row!;
  const drawsTrace = row.trace === "waveform" || row.trace === "trend";
  const vis = visibleContent(spec, row.content, drawsTrace);
  const values = tileValues(row);
  const colour = row.colour ?? (row.parameter ? paramVar(row.parameter) : "var(--c-text)");
  const title = rowTitle(row, design, registry);
  const flow = spec.flow;

  const head = (
    <div className="row-head">
      <span className="row-label" data-testid={`row-label-${row.id}`}>
        {title.name}{title.method && <span className="row-method"> - {title.method}</span>}
      </span>
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

  return (
    <div className={`module module-${flow} size-${placement.size}${flow === "row" ? " row" : ""}`}
         style={{ gridColumn: `${placement.col} / span ${placement.colSpan}`,
                  gridRow: `${placement.row} / span ${placement.rowSpan}`, color: colour }}
         data-testid={`row-${row.id}`} data-parameter={row.parameter ?? ""} data-size={placement.size}
         data-flow={flow} data-content={[vis.trace && "trace", vis.ai && "ai", vis.certainty && "certainty",
                                          vis.explain && "explain", vis.forecast && "forecast"].filter(Boolean).join(" ")}
         data-dropped={vis.dropped.join(" ")}>
      <button type="button" className="row-hit" data-testid={`row-hit-${row.id}`}
              aria-label={`${title.name}: alarm limits`}
              onClick={() => useUi.getState().showSheet("alarm-limits", row.id)} />
      {flow === "row" && (
        <>
          <div className="row-trace">{head}{trace}</div>
          <div className="row-tiles">{tile}</div>
        </>
      )}
      {flow === "stack" && (
        <>
          {head}
          <div className="module-tile">{tile}</div>
          <div className="module-trace">{trace}</div>
        </>
      )}
      {flow === "side" && (
        <>
          <div className="module-tile">{titleOnly || tile}</div>
          <div className="module-trace">{trace}</div>
        </>
      )}
      {flow === "tile-only" && <div className="module-tile">{titleOnly || tile}</div>}
    </div>
  );
}
