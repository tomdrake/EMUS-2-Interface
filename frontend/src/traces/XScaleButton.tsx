import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useDesign, useUi } from "@/app/store";
import type { Row } from "@/design/types";

import { xScaleFor } from "./xScale";

/**
 * The x scale of a trace as a number ("25 mm/s", "4 h") in thin light text. One touch
 * opens a menu of the values it can take, a second chooses one. The choice is this
 * screen's, per trace, kept locally; it does not make a new design version.
 *
 * Its hit area is at least a touch target tall and wide even though the text is small.
 * It sits above the row's own tap area (which opens alarm limits), so the two never nest.
 */
export function XScaleButton({ row }: { row: Row }) {
  const design = useDesign()!;
  const local = useUi((s) => s.xScale);
  const setXScale = useUi((s) => s.setXScale);
  const spec = xScaleFor(row, design, local);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAnchor(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor]);

  if (!spec) return null;
  const name = row.label ?? row.parameter ?? row.id;

  return (
    <>
      <button ref={button} type="button" className={`xscale${spec.overridden ? " is-changed" : ""}`}
              data-testid={`xscale-${row.id}`} aria-haspopup="menu" aria-expanded={!!anchor}
              aria-label={`${name} ${spec.kind === "speed" ? "sweep speed" : "time window"} ${spec.label}. Change.`}
              onClick={() => setAnchor(anchor ? null : button.current!.getBoundingClientRect())}>
        <span className="xscale-text">{spec.label}</span>
      </button>
      {anchor && createPortal(
        <>
          <div className="scrim-clear xscale-scrim" onClick={() => setAnchor(null)} />
          <div className="xscale-menu" role="menu" data-testid={`xscale-menu-${row.id}`}
               aria-label={spec.kind === "speed" ? "Sweep speed" : "Time window"}
               style={menuPosition(anchor, spec.options.length)}>
            {spec.options.map((o) => (
              <button key={o.value} type="button" role="menuitemradio" aria-checked={o.value === spec.value}
                      className={`xscale-option${o.value === spec.value ? " is-current" : ""}`}
                      data-testid={`xscale-option-${row.id}-${o.value}`}
                      onClick={() => { setXScale(row.id, o.value); setAnchor(null); }}>
                {o.label}
              </button>
            ))}
          </div>
        </>, document.body)}
    </>
  );
}

const OPTION_PX = 56;

/** Opens upward from the button when there is room above it, downward otherwise; right edges aligned. */
export function menuPosition(anchor: Pick<DOMRect, "top" | "bottom" | "right">, count: number,
                             viewportH = window.innerHeight, viewportW = window.innerWidth): React.CSSProperties {
  const height = count * OPTION_PX + 8;
  const right = Math.max(8, viewportW - anchor.right);
  const up = anchor.top - height - 6 >= 8;
  return up ? { right, bottom: viewportH - anchor.top + 6 } : { right, top: Math.min(anchor.bottom + 6, viewportH - height - 8) };
}
