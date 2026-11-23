import { useDesign, useUi } from "@/app/store";
import { paramVar } from "@/design/theme";
import type { Row, WidgetOf } from "@/design/types";

/**
 * The ICU-style rows: trace on one side, numbers on the other.
 *
 * Scaffold: lays the rows out from the design (order, height, colour, labels) so
 * layout and colour edits are already visible. M2 replaces <RowBody> with the
 * real trace (WaveCanvas / TrendTrace / BarTrace / EventsTrace) and live numerics,
 * and makes a row tap open the 'alarm-limits' sheet with the row as context.
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
              <span className="row-kind">{row.trace ?? "trend"}{row.waveform ? ` · ${row.waveform}` : ""}</span>
            </div>
            <div className="row-numerics">
              {(row.numerics?.length ? row.numerics : []).map((p, i) => (
                <span key={p} className={i === 0 ? "num num-main" : "num"}>
                  <span className="num-value">--</span>
                  <span className="num-unit">{registry.parameters[p]?.short} {registry.parameters[p]?.unit}</span>
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
