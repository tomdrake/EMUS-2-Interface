import schema from "./design.schema.json";
import { paramVar, themeToCssVars } from "./theme";
import type { Theme } from "./types";

const theme = {
  preset: "custom", mode: "dark",
  colours: {
    background: "#000000", surface: "#111111", surface_alt: "#222222", text: "#ffffff",
    text_muted: "#aaaaaa", border: "#333333", accent: "#4c8dff", alarm_high: "#ff0000",
    alarm_medium: "#ffcc00", alarm_low: "#00ccff", silenced: "#ffc400", technical: "#35d0e6",
    inactive: "#8a94a3", ai_highlight: "#3b2f6b", forecast: "#b79cff",
  },
  parameter_colours: { hr: "#00ff00", bp_sys: "#ff5a4d" },
  news_bands: {
    score_0: "#ffffff", score_1: "#fff1b8", score_2: "#f6c99b", score_3: "#ec9b85",
    grid: "#2b2b2b", header: "#2a5db8", header_text: "#ffffff",
  },
  font_family: "system", font_scale: 1.25, numeric_scale: 1, touch_target_px: 64,
  corner_radius_px: 4, density: "large", trace_width: 3,
} as unknown as Theme;

describe("themeToCssVars", () => {
  const vars = themeToCssVars(theme);

  it("maps every colour token to a CSS variable", () => {
    expect(vars["--c-background"]).toBe("#000000");
    expect(vars["--c-surface-alt"]).toBe("#222222");
    expect(vars["--c-ai-highlight"]).toBe("#3b2f6b");
    expect(vars["--p-bp-sys"]).toBe("#ff5a4d");
    expect(vars["--news-score-3"]).toBe("#ec9b85");
  });

  it("covers every colour token in the design schema", () => {
    const defs = (schema as any).$defs;
    for (const key of Object.keys(defs.ThemeColours.properties)) {
      expect(vars).toHaveProperty(`--c-${key.replace(/_/g, "-")}`);
    }
    for (const key of Object.keys(defs.NewsBandColours.properties)) {
      expect(vars).toHaveProperty(`--news-${key.replace(/_/g, "-")}`);
    }
  });

  it("maps sizes with units", () => {
    expect(vars["--touch"]).toBe("64px");
    expect(vars["--radius"]).toBe("4px");
    expect(vars["--trace-width"]).toBe("3px");
    expect(vars["--font-scale"]).toBe("1.25");
    expect(vars["--gap"]).toBe("12px");
  });

  it("paramVar falls back to the text colour", () => {
    expect(paramVar("bp_sys")).toBe("var(--p-bp-sys, var(--c-text))");
  });
});
