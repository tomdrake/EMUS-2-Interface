import type { Theme } from "./types";

const FONT_STACKS: Record<NonNullable<Theme["font_family"]>, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  inter: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  "atkinson-hyperlegible": '"Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

const DENSITY_GAP = { compact: 4, comfortable: 8, large: 12 } as const;

/**
 * The single mapping from a design's theme to CSS custom properties.
 * Components style themselves only with these variables, never with literal colours,
 * so any theme edit (manual or by chat) shows immediately.
 */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.colours)) vars[`--c-${k.replace(/_/g, "-")}`] = v;
  for (const [k, v] of Object.entries(theme.parameter_colours)) vars[`--p-${k.replace(/_/g, "-")}`] = v!;
  for (const [k, v] of Object.entries(theme.news_bands)) vars[`--news-${k.replace(/_/g, "-")}`] = v;
  vars["--font-family"] = FONT_STACKS[theme.font_family ?? "system"];
  vars["--font-scale"] = String(theme.font_scale ?? 1);
  vars["--numeric-scale"] = String(theme.numeric_scale ?? 1);
  vars["--trace-width"] = `${theme.trace_width ?? 2}px`;
  vars["--touch"] = `${theme.touch_target_px ?? 56}px`;
  vars["--radius"] = `${theme.corner_radius_px ?? 8}px`;
  vars["--gap"] = `${DENSITY_GAP[theme.density ?? "comfortable"]}px`;
  return vars;
}

export function applyTheme(theme: Theme, el: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(themeToCssVars(theme))) el.style.setProperty(k, v);
  el.dataset.themePreset = theme.preset;
}

/** CSS variable holding a parameter's colour, e.g. paramVar("bp_sys") -> "var(--p-bp-sys)". */
export function paramVar(parameter: string): string {
  return `var(--p-${parameter.replace(/_/g, "-")}, var(--c-text))`;
}
