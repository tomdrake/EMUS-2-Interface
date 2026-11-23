import { maxTouchDepth, resolveAction } from "./nav";
import type { Design } from "./types";

const design = {
  tabs: [
    { id: "monitor", label: "Monitor", action: { type: "screen", screen_id: "monitor" } },
    { id: "views", label: "Views", action: { type: "menu", menu_id: "views" } },
    { id: "silence", label: "Silence", action: { type: "silence-alarms" } },
    { id: "settings", label: "Settings", action: { type: "open-settings" } },
  ],
  menus: [
    { id: "views", title: "Views", items: [
      { id: "a", label: "A", action: { type: "screen", screen_id: "split-h" } }] },
    { id: "settings", title: "Settings", items: [
      { id: "b", label: "B", action: { type: "sheet", sheet: "studio-appearance" } }] },
  ],
} as unknown as Design;

const tab = (i: number) => design.tabs[i]!.action;

describe("navigation", () => {
  it("resolves each action type", () => {
    expect(resolveAction(design, tab(0))).toEqual({ kind: "screen", screenId: "monitor" });
    expect(resolveAction(design, tab(1))).toMatchObject({ kind: "menu", menu: { id: "views" } });
    expect(resolveAction(design, tab(2))).toEqual({ kind: "silence" });
    expect(resolveAction(design, design.menus[1]!.items[0]!.action))
      .toEqual({ kind: "sheet", sheet: "studio-appearance" });
  });

  it("settings opens the menu called 'settings'", () => {
    expect(resolveAction(design, tab(3))).toMatchObject({ kind: "menu", menu: { id: "settings" } });
  });

  it("everything is within two touches", () => {
    expect(maxTouchDepth(design)).toBe(2);
  });

  it("fails loudly when a menu is missing", () => {
    const broken = { ...design, menus: [] } as Design;
    expect(() => resolveAction(broken, tab(3))).toThrow(/settings/);
  });
});
