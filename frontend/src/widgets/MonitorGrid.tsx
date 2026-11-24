import { useMemo } from "react";

import { useDesign, useUi } from "@/app/store";
import type { Row, WidgetOf } from "@/design/types";
import { packGrid } from "@/layout/grid";

import { Module } from "./Module";

/**
 * The monitor: modules of different sizes packed into a grid that fills the pane.
 *
 * `packGrid` (layout/grid.ts) places the modules and says how many rows of cells are
 * needed, so the grid is always exactly as tall as its pane and never scrolls. A pane of
 * full-width 'row' modules is the familiar bedside monitor, with one tile per row, the
 * same width on every row, so traces line up and nothing shifts when a tile's content
 * changes.
 *
 * Scaffold: lays the modules out from the design and draws each trace's reference marks
 * with no signal in them. M2 draws the signal inside <TraceFrame> using the same
 * transform and passes live values to <Tile>.
 */
export function MonitorGrid({ widget }: { widget: WidgetOf<"monitor-grid"> }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const byId = new Map(design.rows.map((r) => [r.id, r]));
  const shown = widget.items.filter((i) => byId.get(i.row_id)?.visible);
  const { placements, rowCount } = useMemo(
    () => packGrid(shown, widget.columns, registry.module_sizes),
    [shown.map((i) => `${i.row_id}:${i.size}`).join(","), widget.columns, registry.module_sizes]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = {
    "--tile": `${design.tiles.width_px}px`,
    gridTemplateColumns: `repeat(${widget.columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${Math.max(1, rowCount)}, minmax(0, 1fr))`,
  } as React.CSSProperties;

  return (
    <div className={`rows module-grid rows-${widget.numerics_side}`} style={style}
         data-columns={widget.columns} data-rows={rowCount} data-testid={`grid-${widget.id}`}>
      {placements.map((p) => <Module key={p.rowId} row={byId.get(p.rowId) as Row} placement={p} />)}
    </div>
  );
}
