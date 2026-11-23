import { useDesign, useUi } from "@/app/store";

import { Icon } from "./Icon";
import { useRunAction } from "./TabBar";

/** A menu opened from the tab bar. Its items are the second (and last) touch. */
export function MenuSheet() {
  const design = useDesign()!;
  const menu = useUi((s) => s.openMenu);
  const run = useRunAction();
  if (!menu) return null;
  return (
    <>
      <div className="scrim" onClick={() => useUi.getState().showMenu(null)} />
      <section className="menu" role="menu" aria-label={menu.title} data-testid={`menu-${menu.id}`}>
        <h2 className="menu-title">{menu.title}</h2>
        <div className="menu-grid">
          {menu.items.map((item) => (
            <button key={item.id} type="button" role="menuitem" className="menu-item"
                    data-testid={`menu-item-${item.id}`}
                    onClick={() => run(design, item.action)}>
              <Icon id={item.icon ?? "none"} size={28} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
