import { useEffect, useState } from "react";

import { api } from "@/app/api";
import { useDesign, useTheme, useUi } from "@/app/store";
import type { Design, Theme } from "@/design/types";

import { DATE_FORMATS, type DateFormat } from "@/design/datetime";

import { Choice, DraftNote, Stepper, Switch } from "./controls";
import { useEditor } from "./editor";

const ACCENTS = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#A855F7", "#14B8A6", "#EC4899", "#E5E7EB"];
const KEEP = ["font_family", "font_scale", "numeric_scale", "trace_width", "touch_target_px", "corner_radius_px", "density"] as const;

/** Edit both themes at once where it makes sense (sizes), or the one on screen where it does not (accent). */
const bothThemes = (d: Design, patch: Partial<Theme>): Design => ({ ...d, theme: { ...d.theme, ...patch }, alt_theme: { ...d.alt_theme, ...patch } }) as Design;

export function AppearanceSheet() {
  const design = useDesign()!;
  const theme = useTheme()!;
  const dirty = useUi((s) => !!s.draft);
  const [presets, setPresets] = useState<Record<string, Theme>>({});
  useEffect(() => { api.themePresets().then(setPresets).catch(() => undefined); }, []);
  const apply = useEditor.getState().apply;
  const slot = design.theme.mode === theme.mode ? "theme" : "alt_theme";

  const usePreset = (p: Theme) => apply((d) => {
    const key = p.mode === d.theme.mode ? "theme" : "alt_theme";
    const keep = Object.fromEntries(KEEP.map((k) => [k, d[key][k]]));
    return { ...d, [key]: { ...p, ...keep } } as Design;
  });

  return (
    <div className="settings" data-testid="appearance">
      <DraftNote dirty={dirty} />
      <h4>Themes</h4>
      {(["dark", "light"] as const).map((mode) => (
        <Choice key={mode} testId={`presets-${mode}`} label={`${mode === "dark" ? "Dark" : "Light"} Theme`}
                value={(mode === design.theme.mode ? design.theme : design.alt_theme).preset}
                options={Object.entries(presets).filter(([, p]) => p.mode === mode).map(([id, p]) => ({ value: p.preset ?? id, label: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))}
                onChange={(v) => { const p = Object.values(presets).find((x) => x.mode === mode && x.preset === v); if (p) usePreset(p); }} />
      ))}
      <h4>Sizes</h4>
      <Stepper testId="font-scale" label="Text Size" value={design.theme.font_scale} step={0.125} min={0.75} max={1.75}
               format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => apply((d) => bothThemes(d, { font_scale: v }))} />
      <Stepper testId="numeric-scale" label="Number Size" value={design.theme.numeric_scale} step={0.1} min={0.6} max={2}
               format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => apply((d) => bothThemes(d, { numeric_scale: v }))} />
      <Stepper testId="trace-width" label="Trace Thickness" value={design.theme.trace_width} step={0.5} min={1} max={5}
               format={(v) => `${v} px`} onChange={(v) => apply((d) => bothThemes(d, { trace_width: v }))} />
      <Choice testId="density" label="Spacing" value={design.theme.density}
              options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "large", label: "Large" }]}
              onChange={(v) => apply((d) => bothThemes(d, { density: v }))} />
      <h4>Date And Time</h4>
      <Choice testId="date-format" label="Date Format" value={design.top_bar.date_format as DateFormat} options={DATE_FORMATS}
              onChange={(v) => apply((d) => ({ ...d, top_bar: { ...d.top_bar, date_format: v } }) as Design)} />
      <Choice testId="clock-format" label="Time Format" value={design.top_bar.clock_format}
              options={[{ value: "24h", label: "24 Hour" }, { value: "12h", label: "12 Hour" }]}
              onChange={(v) => apply((d) => ({ ...d, top_bar: { ...d.top_bar, clock_format: v } }) as Design)} />
      <Switch testId="show-seconds" label="Show Seconds" checked={design.top_bar.show_seconds}
              onChange={(v) => apply((d) => ({ ...d, top_bar: { ...d.top_bar, show_seconds: v } }) as Design)} />
      <Switch testId="show-date" label="Show Date Beside The Time" checked={(design.top_bar.fields ?? []).includes("date")}
              onChange={(v) => apply((d) => {
                const fields: Design["top_bar"]["fields"] = (d.top_bar.fields ?? []).filter((f) => f !== "date");
                const at = fields.indexOf("clock");
                if (v) fields.splice(at < 0 ? fields.length : at, 0, "date");
                return { ...d, top_bar: { ...d.top_bar, fields } } as Design;
              })} />
      <h4>Accent Colour ({theme.mode === "dark" ? "Dark" : "Light"} Theme)</h4>
      <div className="swatches" role="radiogroup" aria-label="Accent colour">
        {ACCENTS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={theme.colours.accent.toUpperCase() === c} aria-label={`Accent ${c}`}
                  className={`swatch${theme.colours.accent.toUpperCase() === c ? " is-current" : ""}`} style={{ background: c }}
                  data-testid={`accent-${c.slice(1)}`}
                  onClick={() => apply((d) => ({ ...d, [slot]: { ...d[slot], preset: "custom", colours: { ...d[slot].colours, accent: c } } }) as Design)} />
        ))}
      </div>
      <p className="demo-note">Colours that would be hard to read are refused when you save, with the reason.</p>
    </div>
  );
}
