import { useEffect } from "react";

import { applyTheme } from "@/design/theme";
import { MenuSheet } from "@/layout/MenuSheet";
import { ScreenRenderer } from "@/layout/ScreenRenderer";
import { Sheet } from "@/layout/Sheet";
import { TabBar } from "@/layout/TabBar";
import { TopBar } from "@/layout/TopBar";
import { useSilenceActions, useSilenceRemaining } from "@/alarms/SilenceButton";
import { SilenceBanner } from "@/safety/SilenceBanner";
import { startLinkWatchdog, useSafety } from "@/safety/store";
import { SystemBanner } from "@/safety/SystemBanner";

import { api } from "./api";
import { useDesign, useUi } from "./store";

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

  useEffect(() => { if (design) applyTheme(design.theme); }, [design]);

  // A screen that has stopped receiving data must say so (see safety/store.ts).
  const staleAfter = useUi((s) => s.registry?.safety.display_stale_after_s);
  useEffect(() => (staleAfter ? startLinkWatchdog(staleAfter * 1000) : undefined), [staleAfter]);
  const link = useSafety((s) => s.link);
  const silenceLeft = useSilenceRemaining();
  const { resume } = useSilenceActions();

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => useUi.getState().setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  if (error) return <div className="boot boot-error" role="alert">Cannot reach the monitor server: {error}</div>;
  if (!design) return <div className="boot">Starting…</div>;

  const screen = design.screens.find((s) => s.id === screenId)
    ?? design.screens.find((s) => s.id === design.home_screen)!;

  const banner = <SilenceBanner secondsLeft={silenceLeft} onResume={resume} />;
  const bannerOnTop = design.safety.silence_banner === "top";

  return (
    <div className="app" data-testid="app" data-design={design.name} data-link={link}>
      <TopBar />
      {bannerOnTop && banner}
      <SystemBanner />
      <ScreenRenderer screen={screen} />
      {!bannerOnTop && banner}
      <MenuSheet />
      <Sheet />
      {notice && <div className="notice" role="status" data-testid="notice">{notice}</div>}
      <TabBar />
    </div>
  );
}
