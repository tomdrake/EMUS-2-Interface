import { useDesign, useUi } from "@/app/store";
import { label } from "@/design/text";

import { runAction } from "./ActionButton";
import { Icon } from "./Icon";

/** A menu opened from a button. Its items are the second (and last) touch. */
export function MenuSheet() {
  const design = useDesign()!;
  const menu = useUi((s) => s.openMenu);
  if (!menu) return null;
  return (
    <>
      <div className="scrim" onClick={() => useUi.getState().showMenu(null)} />
      <section className="menu" role="menu" aria-label={menu.title} data-testid={`menu-${menu.id}`}>
        <h2 className="menu-title">{label(menu.title, design)}</h2>
        <div className="menu-grid">
          {menu.items.map((item) => (
            <button key={item.id} type="button" role="menuitem" className="menu-item"
                    data-testid={`menu-item-${item.id}`}
                    onClick={() => { useUi.getState().showMenu(null); runAction(design, item.action); }}>
              <Icon id={item.icon} size={28} />
              <span>{label(item.label, design)}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
