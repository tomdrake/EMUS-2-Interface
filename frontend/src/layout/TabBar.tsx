import { useDesign, useUi } from "@/app/store";
import { SilenceButton } from "@/alarms/SilenceButton";
import { resolveAction } from "@/design/nav";
import type { Action, Design } from "@/design/types";

import { Icon } from "./Icon";

/** Run a tab or menu-item action. Shared by TabBar and MenuSheet. */
export function useRunAction() {
  const { go, showMenu, showSheet } = useUi.getState();
  return (design: Design, action: Action) => {
    const r = resolveAction(design, action);
    if (r.kind === "screen") go(r.screenId);
    else if (r.kind === "menu") showMenu(r.menu);
    else if (r.kind === "sheet") showSheet(r.sheet);
    // 'silence' is handled by SilenceButton itself.
  };
}

/** Bottom tab bar: every function is one touch here, or two via a menu. */
export function TabBar() {
  const design = useDesign()!;
  const screenId = useUi((s) => s.screenId);
  const openMenu = useUi((s) => s.openMenu);
  const run = useRunAction();
  const showLabels = design.tab_bar?.show_labels ?? true;

  return (
    <nav className="tabbar" style={{ height: design.tab_bar?.height_px ?? 72 }} aria-label="Main">
      {design.tabs.map((tab) => {
        if (tab.action.type === "silence-alarms") {
          return <SilenceButton key={tab.id} tab={tab} showLabel={showLabels} />;
        }
        const r = resolveAction(design, tab.action);
        const active = (r.kind === "screen" && r.screenId === screenId)
          || (r.kind === "menu" && openMenu?.id === r.menu.id);
        return (
          <button key={tab.id} type="button" className={`tab${active ? " is-active" : ""}`}
                  data-testid={`tab-${tab.id}`} aria-current={active ? "page" : undefined}
                  style={tab.colour ? { color: tab.colour } : undefined}
                  onClick={() => (active && r.kind === "menu"
                    ? useUi.getState().showMenu(null) : run(design, tab.action))}>
            <Icon id={tab.icon ?? "none"} />
            {showLabels && <span className="tab-label">{tab.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}
