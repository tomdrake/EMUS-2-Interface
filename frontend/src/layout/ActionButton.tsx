import { SilenceButton } from "@/alarms/SilenceButton";
import { PREDICTION_OVERLAY_SCREEN, useDesign, useUi } from "@/app/store";
import { resolveAction } from "@/design/nav";
import { label } from "@/design/text";
import { useMeasure } from "@/examples/measure";
import type { Action, Button, Design } from "@/design/types";

import { Icon } from "./Icon";

/** Run a button or menu-item action. */
export function runAction(design: Design, action: Action): void {
  const ui = useUi.getState();
  const r = resolveAction(design, action);
  if (r.kind === "screen") ui.go(r.screenId);
  else if (r.kind === "menu") ui.showMenu(r.menu);
  else if (r.kind === "sheet") ui.showSheet(r.sheet);
  else if (r.kind === "theme") ui.toggleMode();
  else if (r.kind === "ai") ui.toggleAi();
  else if (r.kind === "edit") ui.setEditMode(true);
  else if (r.kind === "overlay") ui.toggleAiOverlay();
  else if (r.kind === "measure") useMeasure.getState().toggle(r.which);
  else if (r.kind === "prediction-overlay") ui.togglePredictionOverlay();
  // 'silence' is handled by SilenceButton itself.
}

/**
 * One button from the design, wherever the design puts it: the tab bar ("tab") or
 * the top bar ("top"). The silence button keeps its own behaviour in either place.
 */
export function ActionButton({ button, where, showLabel }:
  { button: Button; where: "tab" | "top"; showLabel: boolean }) {
  const design = useDesign()!;
  const screenId = useUi((s) => s.screenId);
  const openMenu = useUi((s) => s.openMenu);
  const mode = useUi((s) => s.mode) ?? design.theme.mode;
  const aiOn = useUi((s) => s.aiOverride) ?? design.ai.enabled;
  const overlayOn = useUi((s) => s.aiOverlay);
  const measuring = useMeasure((s) => (button.action.type === "measure" ? s.running[button.action.kind] != null : false));

  if (button.action.type === "silence-alarms") {
    return <SilenceButton tab={button} showLabel={showLabel} where={where} />;
  }
  const r = resolveAction(design, button.action);
  const active = (r.kind === "screen" && r.screenId === screenId)
    || (r.kind === "menu" && openMenu?.id === r.menu.id) || (r.kind === "overlay" && overlayOn)
    || (r.kind === "prediction-overlay" && screenId === PREDICTION_OVERLAY_SCREEN);
  const text = r.kind === "theme" ? (mode === "dark" ? "Light" : "Dark")
    : r.kind === "ai" ? (aiOn ? "AI On" : "AI Off") : button.label;
  return (
    <button type="button" className={`${where === "tab" ? "tab" : "topbtn"}${active ? " is-active" : ""}${measuring ? " is-measuring" : ""}`}
            data-testid={`${where}-${button.id}`} aria-current={active ? "page" : undefined} data-measuring={measuring || undefined} aria-busy={measuring || undefined}
            aria-label={r.kind === "theme" ? `Switch to ${text.toLowerCase()} theme`
              : r.kind === "ai" ? `AI interpretation is ${aiOn ? "on" : "off"}. Tap to turn ${aiOn ? "off" : "on"}`
                : r.kind === "overlay" ? `AI overview is ${overlayOn ? "on" : "off"}. Tap to turn ${overlayOn ? "off" : "on"}`
                  : r.kind === "prediction-overlay" ? `Prediction overlay is ${active ? "on" : "off"}. Tap to turn ${active ? "off" : "on"}`
                    : r.kind === "measure" ? `${button.label}. ${measuring ? "Measuring. Tap to cancel." : "Tap to start."}`
                    : button.label}
            aria-pressed={r.kind === "ai" ? aiOn : r.kind === "overlay" ? overlayOn : r.kind === "measure" ? measuring : r.kind === "prediction-overlay" ? active : undefined}
            style={button.colour ? { color: button.colour } : undefined}
            onClick={() => (active && r.kind === "menu"
              ? useUi.getState().showMenu(null) : runAction(design, button.action))}>
      <Icon id={button.icon} size={where === "tab" ? 24 : 22} />
      {showLabel && <span className="tab-label">{label(text, design)}</span>}
    </button>
  );
}
