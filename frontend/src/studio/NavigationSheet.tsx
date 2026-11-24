import { useDesign, useUi } from "@/app/store";
import type { Design } from "@/design/types";

import { Choice, DraftNote, Stepper, Switch } from "./controls";
import { useEditor } from "./editor";

/** Where things are and how they are labelled: the notification box, the tab bar, the top bar. */
export function NavigationSheet() {
  const design = useDesign()!;
  const dirty = useUi((s) => !!s.draft);
  const apply = useEditor.getState().apply;
  const set = <K extends "notifications" | "tab_bar" | "top_bar">(k: K, patch: Partial<Design[K]>) =>
    apply((d) => ({ ...d, [k]: { ...d[k], ...patch } }) as Design);
  return (
    <div className="settings" data-testid="navigation">
      <DraftNote dirty={dirty} />
      <h4>Notification Box</h4>
      <Choice testId="notif-position" label="Where" value={design.notifications.position}
              options={[{ value: "tab-bar-left", label: "Left of Tabs" }, { value: "tab-bar-right", label: "Right of Tabs" },
                        { value: "top-bar", label: "Top Bar" }, { value: "strip-top", label: "Strip at Top" }, { value: "strip-above-tabs", label: "Strip Above Tabs" }]}
              onChange={(v) => set("notifications", { position: v })} />
      <Choice testId="notif-ticker" label="Rolls" value={design.notifications.ticker}
              options={[{ value: "vertical", label: "Up" }, { value: "horizontal", label: "Sideways" }]}
              onChange={(v) => set("notifications", { ticker: v })} />
      <Choice testId="notif-empty" label="When Empty It Says" value={design.notifications.empty_text}
              options={[{ value: "No Notifications", label: "No Notifications" }, { value: "All Clear", label: "All Clear" }, { value: "No Alerts", label: "No Alerts" }]}
              onChange={(v) => set("notifications", { empty_text: v })} />
      <h4>Tab Bar</h4>
      <Switch testId="tab-labels" label="Show words under tab icons" checked={design.tab_bar.show_labels} onChange={(v) => set("tab_bar", { show_labels: v })} />
      <Stepper testId="tab-height" label="Tab Bar Height" value={design.tab_bar.height_px} step={8} min={56} max={112}
               format={(v) => `${v} px`} onChange={(v) => set("tab_bar", { height_px: v })} />
      <h4>Top Bar</h4>
      <Switch testId="top-labels" label="Show words under top buttons" checked={design.top_bar.show_button_labels} onChange={(v) => set("top_bar", { show_button_labels: v })} />
      <Switch testId="top-seconds" label="Show seconds on the clock" checked={design.top_bar.show_seconds} onChange={(v) => set("top_bar", { show_seconds: v })} />
      <Choice testId="top-clock" label="Clock" value={design.top_bar.clock_format}
              options={[{ value: "24h", label: "24 Hour" }, { value: "12h", label: "12 Hour" }]} onChange={(v) => set("top_bar", { clock_format: v })} />
      <p className="demo-note">The patient name, the clock, the alarm silence button, the settings button and the notification box
        cannot be removed, however the screen is designed.</p>
    </div>
  );
}
