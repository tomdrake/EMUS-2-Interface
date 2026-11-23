import { useDesign, useUi } from "@/app/store";
import { paramVar } from "@/design/theme";
import type { Row, WidgetOf } from "@/design/types";
import { Numeric, RowStatus } from "@/safety/Numeric";

/**
 * The ICU-style rows: trace on one side, numbers on the other.
 *
 * Scaffold: lays the rows out from the design (order, height, colour, labels) so
 * layout and colour edits are already visible. M2 adds the real trace
 * (WaveCanvas / TrendTrace / BarTrace / EventsTrace) and passes live values to
 * <Numeric>. Keep <Numeric> and <RowStatus>: they decide what is shown when there
 * is no trustworthy number (standby, connection lost, check sensor, poor trace).
 */
export function MonitorRows({ widget }: { widget: WidgetOf<"monitor-rows"> }) {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const byId = new Map(design.rows.map((r) => [r.id, r]));
  const rows = widget.row_ids.map((id) => byId.get(id)).filter((r): r is Row => !!r && r.visible !== false);
  const side = widget.numerics_side ?? "right";

  return (
    <div className="rows">
      {rows.map((row) => {
        if (row.kind === "spacer") {
          return <div key={row.id} className="row row-spacer" style={{ flex: `${row.height ?? 1} 1 0` }}
                      data-testid={`row-${row.id}`} />;
        }
        const colour = row.colour ?? (row.parameter ? paramVar(row.parameter) : "var(--c-text)");
        const label = row.label ?? (row.parameter ? registry.parameters[row.parameter]?.label : "Timer");
        return (
          <button key={row.id} type="button" className={`row row-${side}`}
                  style={{ flex: `${row.height ?? 1} 1 0`, color: colour }}
                  data-testid={`row-${row.id}`} data-parameter={row.parameter ?? ""}
                  onClick={() => useUi.getState().showSheet("alarm-limits", row.id)}>
            <div className="row-trace">
              <span className="row-label">{label}</span>
              {row.parameter && <RowStatus parameter={row.parameter} />}
            </div>
            <div className="row-numerics">
              {row.numerics.map((p, i) => <Numeric key={p} parameter={p} main={i === 0} />)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
