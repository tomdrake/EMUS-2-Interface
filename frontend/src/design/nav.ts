import { SETTINGS_MENU_ID, type Action, type Design, type Menu } from "./types";

export type Resolved =
  | { kind: "screen"; screenId: string }
  | { kind: "menu"; menu: Menu }
  | { kind: "sheet"; sheet: Extract<Action, { type: "sheet" }>["sheet"] }
  | { kind: "silence" }
  | { kind: "theme" }
  | { kind: "ai" };

/** What a tab or menu item does. Settings opens the menu with id "settings". */
export function resolveAction(design: Design, action: Action): Resolved {
  switch (action.type) {
    case "screen":
      return { kind: "screen", screenId: action.screen_id };
    case "menu":
      return { kind: "menu", menu: findMenu(design, action.menu_id) };
    case "open-settings":
      return { kind: "menu", menu: findMenu(design, SETTINGS_MENU_ID) };
    case "sheet":
      return { kind: "sheet", sheet: action.sheet };
    case "silence-alarms":
      return { kind: "silence" };
    case "toggle-theme":
      return { kind: "theme" };
    case "toggle-ai":
      return { kind: "ai" };
  }
}

function findMenu(design: Design, id: string): Menu {
  const menu = (design.menus ?? []).find((m) => m.id === id);
  if (!menu) throw new Error(`design has no menu "${id}"`);
  return menu;
}

/** Touches from the always-visible buttons to the deepest function. The backend guarantees <= 2. */
export function maxTouchDepth(design: Design): number {
  let depth = 1;
  for (const button of [...design.tabs, ...design.top_bar.buttons]) {
    if (resolveAction(design, button.action).kind === "menu") depth = 2;
  }
  return depth;
}
