import { SilenceButton } from "@/alarms/SilenceButton";
import { useDesign, useUi } from "@/app/store";
import { resolveAction } from "@/design/nav";
import { label } from "@/design/text";
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

  if (button.action.type === "silence-alarms") {
    return <SilenceButton tab={button} showLabel={showLabel} where={where} />;
  }
  const r = resolveAction(design, button.action);
  const active = (r.kind === "screen" && r.screenId === screenId)
    || (r.kind === "menu" && openMenu?.id === r.menu.id);
  const text = r.kind === "theme" ? (mode === "dark" ? "Light" : "Dark")
    : r.kind === "ai" ? (aiOn ? "AI On" : "AI Off") : button.label;
  return (
    <button type="button" className={`${where === "tab" ? "tab" : "topbtn"}${active ? " is-active" : ""}`}
            data-testid={`${where}-${button.id}`} aria-current={active ? "page" : undefined}
            aria-label={r.kind === "theme" ? `Switch to ${text.toLowerCase()} theme`
              : r.kind === "ai" ? `AI interpretation is ${aiOn ? "on" : "off"}. Tap to turn ${aiOn ? "off" : "on"}`
                : button.label}
            aria-pressed={r.kind === "ai" ? aiOn : undefined}
            style={button.colour ? { color: button.colour } : undefined}
            onClick={() => (active && r.kind === "menu"
              ? useUi.getState().showMenu(null) : runAction(design, button.action))}>
      <Icon id={button.icon} size={where === "tab" ? 24 : 22} />
      {showLabel && <span className="tab-label">{label(text, design)}</span>}
    </button>
  );
}
