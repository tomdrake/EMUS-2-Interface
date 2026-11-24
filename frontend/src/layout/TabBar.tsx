import { useDesign } from "@/app/store";
import { NotificationBox } from "@/safety/NotificationBox";

import { ActionButton } from "./ActionButton";

/** Bottom tab bar: every function is one touch here, or two via a menu. */
export function TabBar() {
  const design = useDesign()!;
  const where = design.notifications.position;
  return (
    <nav className="tabbar" style={{ height: design.tab_bar.height_px }} aria-label="Main">
      {where === "tab-bar-left" && <NotificationBox placement="bar" />}
      {design.tabs.map((tab) => (
        <ActionButton key={tab.id} button={tab} where="tab" showLabel={design.tab_bar.show_labels} />
      ))}
      {where === "tab-bar-right" && <NotificationBox placement="bar" />}
    </nav>
  );
}
