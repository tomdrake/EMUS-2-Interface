import { useDesign, useUi } from "@/app/store";
import { rowTitle } from "@/design/text";
import { paramVar } from "@/design/theme";
import type { Row, WidgetOf } from "@/design/types";
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
 * The ICU-style rows: the trace on the left, one tile of numbers on the right.
 *
 * There is one tile per row, the same width on every row, so traces line up and
 * nothing shifts when a tile's content changes. A row with no numbers (events,
 * timer) keeps an empty cell so the grid lines run straight down.
 *
 * Scaffold: lays the rows out from the design and draws each trace's reference
 * marks (dashed baseline, scale) with no signal in them. M2 draws the signal inside
 * <TraceFrame> using the same transform, and passes live values to <Tile>. Keep
 * <Tile> and <RowStatus>: they decide what is shown when there is no trustworthy
 * number.
 */
export function MonitorRows({ widget }: { widget: WidgetOf<"monitor-rows"> }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const byId = new Map(design.rows.map((r) => [r.id, r]));
  const rows = widget.row_ids.map((id) => byId.get(id)).filter((r): r is Row => !!r && r.visible);
  const equal = design.tiles.equal_row_heights;
  const style = { "--tile": `${design.tiles.width_px}px` } as React.CSSProperties;

  return (
    <div className={`rows rows-${widget.numerics_side}`} style={style}>
      {rows.map((row) => {
        if (row.kind === "spacer") {
          return <div key={row.id} className="row row-spacer" style={{ flex: `${row.height} 1 0` }}
                      data-testid={`row-${row.id}`} />;
        }
        const colour = row.colour ?? (row.parameter ? paramVar(row.parameter) : "var(--c-text)");
        const title = rowTitle(row, design, registry);
        const values = tileValues(row);
        return (
          <div key={row.id} className="row"
               style={{ flex: `${equal && values.length ? 1 : row.height} 1 0`, color: colour }}
               data-testid={`row-${row.id}`} data-parameter={row.parameter ?? ""}>
            {/* The row's own tap (alarm limits). A sibling of the x scale control, not its parent:
                a button inside a button is invalid. It sits above the content, below the control. */}
            <button type="button" className="row-hit" data-testid={`row-hit-${row.id}`}
                    aria-label={`${title.name}: alarm limits`}
                    onClick={() => useUi.getState().showSheet("alarm-limits", row.id)} />
            <div className="row-trace">
              <div className="row-head">
                <span className="row-label" data-testid={`row-label-${row.id}`}>
                  {title.name}{title.method && <span className="row-method"> - {title.method}</span>}
                </span>
                {row.parameter && <RowStatus parameter={row.parameter} />}
              </div>
              <TraceFrame row={row} />
            </div>
            <div className="row-tiles">
              {values.length ? <Tile values={values} /> : <span className="tile tile-empty" aria-hidden="true" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
