import { useEffect } from "react";

import { applyTheme } from "@/design/theme";
import { MenuSheet } from "@/layout/MenuSheet";
import { ScreenRenderer } from "@/layout/ScreenRenderer";
import { Sheet } from "@/layout/Sheet";
import { TabBar } from "@/layout/TabBar";
import { TopBar } from "@/layout/TopBar";
import { NotificationBox } from "@/safety/NotificationBox";
import { startLinkWatchdog, useSafety } from "@/safety/store";

import { api } from "./api";
import { useDesign, useTheme, useUi } from "./store";

export function App() {
  const design = useDesign();
  const screenId = useUi((s) => s.screenId);
  const error = useUi((s) => s.error);
  const notice = useUi((s) => s.notice);

  useEffect(() => {
    Promise.all([api.activeDesign(), api.registry()])
      .then(([stored, registry]) => useUi.getState().load(stored, registry))
      .catch((e) => useUi.getState().fail(String(e?.message ?? e)));
  }, []);

  const theme = useTheme();
  useEffect(() => { if (theme) applyTheme(theme); }, [theme]);

  // A screen that has stopped receiving data must say so (see safety/store.ts).
  const staleAfter = useUi((s) => s.registry?.safety.display_stale_after_s);
  useEffect(() => (staleAfter ? startLinkWatchdog(staleAfter * 1000) : undefined), [staleAfter]);
  const link = useSafety((s) => s.link);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => useUi.getState().setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  if (error) return <div className="boot boot-error" role="alert">Cannot reach the monitor server: {error}</div>;
  if (!design) return <div className="boot">Starting…</div>;

  const screen = design.screens.find((s) => s.id === screenId)
    ?? design.screens.find((s) => s.id === design.home_screen)!;

  // The notification box is always present and never changes size, so nothing that
  // arrives can move or resize the rest of the monitor. As a strip it reserves its
  // own fixed row; otherwise it lives inside the tab bar or top bar.
  const where = design.notifications.position;
  const strip = <div className="notif-strip"><NotificationBox placement="strip" /></div>;

  return (
    <div className="app" data-testid="app" data-design={design.name} data-link={link}
         data-mode={theme?.mode}
         style={{ "--tabbar-h": `${design.tab_bar.height_px}px`,
                  "--topbar-h": `${design.top_bar.height_px}px` } as React.CSSProperties}>
      <TopBar />
      {where === "strip-top" && strip}
      <ScreenRenderer screen={screen} />
      {where === "strip-above-tabs" && strip}
      <MenuSheet />
      <Sheet />
      {notice && <div className="notice" role="status" data-testid="notice">{notice}</div>}
      <TabBar />
    </div>
  );
}
