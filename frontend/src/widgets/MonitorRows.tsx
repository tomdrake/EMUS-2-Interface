import { useDesign, useUi } from "@/app/store";
import { rowTitle } from "@/design/text";
import { paramVar } from "@/design/theme";
import type { Row, WidgetOf } from "@/design/types";
import { Numeric, RowStatus } from "@/safety/Numeric";

/** Blood pressure reads as one value, "120/80 (93)", so it takes one tile. */
function isBloodPressure(numerics: readonly string[]): boolean {
  return numerics.includes("bp_sys") && numerics.includes("bp_dia");
}

function tileCount(row: Row): number {
  if (row.kind !== "parameter") return 0;
  return isBloodPressure(row.numerics as string[]) ? 1 : row.numerics.length;
}

/**
 * The ICU-style rows: trace on one side, tiles of numbers on the other.
 *
 * The tile column is the same width on every row (as many tile slots as the
 * busiest row needs), so traces line up and nothing shifts when a tile's content
 * changes.
 *
 * Scaffold: lays the rows out from the design (order, height, colour, labels).
 * M2 adds the real trace (WaveCanvas / TrendTrace / BarTrace / EventsTrace) and
 * passes live values to <Numeric>. Keep <Numeric> and <RowStatus>: they decide
 * what is shown when there is no trustworthy number.
 */
export function MonitorRows({ widget }: { widget: WidgetOf<"monitor-rows"> }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const byId = new Map(design.rows.map((r) => [r.id, r]));
  const rows = widget.row_ids.map((id) => byId.get(id)).filter((r): r is Row => !!r && r.visible);
  const slots = Math.max(1, ...rows.map(tileCount));
  const equal = design.tiles.equal_row_heights;
  const style = { "--tile": `${design.tiles.width_px}px`, "--tile-slots": slots } as React.CSSProperties;

  return (
    <div className={`rows rows-${widget.numerics_side}`} style={style}>
      {rows.map((row) => {
        if (row.kind === "spacer") {
          return <div key={row.id} className="row row-spacer" style={{ flex: `${row.height} 1 0` }}
                      data-testid={`row-${row.id}`} />;
        }
        const colour = row.colour ?? (row.parameter ? paramVar(row.parameter) : "var(--c-text)");
        const title = rowTitle(row, design, registry);
        const bp = isBloodPressure(row.numerics as string[]);
        return (
          <button key={row.id} type="button" className="row"
                  style={{ flex: `${equal && tileCount(row) > 0 ? 1 : row.height} 1 0`, color: colour }}
                  data-testid={`row-${row.id}`} data-parameter={row.parameter ?? ""}
                  onClick={() => useUi.getState().showSheet("alarm-limits", row.id)}>
            <div className="row-trace">
              <span className="row-label" data-testid={`row-label-${row.id}`}>
                {title.name}{title.method && <span className="row-method"> - {title.method}</span>}
              </span>
              {row.parameter && <RowStatus parameter={row.parameter} />}
            </div>
            <div className="row-tiles">
              {bp ? (
                <Numeric parameter="bp_sys" name="BP" main
                         extra={[{ separator: "/" }, ...((row.numerics as string[]).includes("bp_mean")
                           ? [{ separator: " ", wrap: [" (", ")"] as [string, string] }] : [])]} />
              ) : row.numerics.map((p, i) => <Numeric key={p} parameter={p} main={i === 0} />)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
