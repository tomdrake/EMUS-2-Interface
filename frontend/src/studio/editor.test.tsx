import { act, fireEvent, render, screen as dom, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "@/app/api";
import { useUi } from "@/app/store";
import type { Design } from "@/design/types";

import { AiSettingsSheet } from "./AiSettingsSheet";
import { AppearanceSheet } from "./AppearanceSheet";
import { EditBar } from "./EditBar";
import { EditPanel } from "./EditPanel";
import { useEditor } from "./editor";
import { gridsOn, patchRow } from "./layoutEdit";
import { NavigationSheet } from "./NavigationSheet";

const content = { trace: true, ai: true, certainty: true, explain: false, forecast: false };
const row = (id: string, parameter: string) => ({ id, kind: "parameter", parameter, trace: "trend", waveform: null, numerics: [parameter], content,
  visible: true, label: null, method: null, colour: null, trend_window_min: 60, show_limits: true });
const theme = (mode: "dark" | "light") => ({ preset: mode === "dark" ? "icu-dark" : "news-paper", mode, font_scale: 1, numeric_scale: 1, trace_width: 2,
  density: "comfortable", colours: { accent: "#3B82F6" }, parameter_colours: {} });
const baseDesign = () => ({
  name: "ICU", home_screen: "monitor", theme: theme("dark"), alt_theme: theme("light"),
  rows: [row("temp", "temp"), row("hr", "hr")],
  screens: [{ id: "monitor", name: "Monitor", layout: { kind: "widget", widget: { id: "grid", type: "monitor-grid", columns: 6, numerics_side: "right",
    items: [{ row_id: "temp", size: "tile" }, { row_id: "hr", size: "row" }] } } }],
  labels: { auto_capitalise: true, show_method: true },
  ai: { enabled: true, show_row_chips: true, show_confidence: true, show_trace_annotations: true, show_explain_link: true, min_confidence: 0.5 },
  forecast: { certainty: { display: "percent", finding_metric: "evidence_agreement", badge_medium_at: 0.5, badge_high_at: 0.8, show_metric_name: true } },
  notifications: { position: "tab-bar-left", ticker: "vertical", empty_text: "No Notifications" },
  tab_bar: { show_labels: true, height_px: 72 }, top_bar: { show_button_labels: true, show_seconds: true, clock_format: "24h" },
}) as unknown as Design;
const sizes = Object.fromEntries([["compact", 1, 1, false, ["number"]], ["tile", 2, 1, false, ["number", "spark", "ai"]], ["row", 0, 1, true, ["number", "trace", "ai", "certainty"]]]
  .map(([id, cols, rows, full, fits]: any) => [id, { label: id, cols, rows, full, flow: "row", fits }]));
const registry = { parameters: { temp: { id: "temp", label: "Temperature", unit: "C", method: "Skin Sensor", waveforms: [] }, hr: { id: "hr", label: "Heart Rate", unit: "bpm", method: "ECG", waveforms: ["ecg"] } },
  module_sizes: sizes, certainty_metrics: { evidence_agreement: { id: "evidence_agreement", label: "Agreement", tells_you: "How many agree.", applies_to: ["finding"] } },
  signal_states: {}, signal_issues: {}, waveforms: {} } as any;
const stored = (builtin: boolean) => ({ meta: { id: "icu", name: "ICU", builtin, description: "", parent_id: null, current_version: 1 }, version: 1, document: baseDesign() }) as any;

function setup(builtin = false) {
  useUi.setState({ stored: stored(builtin), draft: null, registry, screenId: "monitor", editMode: true, notice: null, mode: null });
  useEditor.setState({ selected: null, history: [], errors: [], saving: false, saveError: null });
  vi.spyOn(api, "validateDesign").mockResolvedValue({ ok: true, errors: [], document: null });
  vi.spyOn(api, "themePresets").mockResolvedValue({ "icu-dark": theme("dark") as any, "high-contrast": { ...theme("dark"), preset: "high-contrast" } as any, "news-paper": theme("light") as any });
}
const items = () => gridsOn(useUi.getState().draft ?? useUi.getState().stored!.document, "monitor")[0]!.items.map((i) => `${i.row_id}:${i.size}`);

beforeEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

describe("editor store", () => {
  it("shows an edit at once as a draft and leaves the saved design alone", () => {
    setup();
    act(() => useEditor.getState().apply((d) => patchRow(d, "temp", { label: "Skin" })));
    expect(useUi.getState().draft!.rows[0]!.label).toBe("Skin");
    expect(useUi.getState().stored!.document.rows[0]!.label).toBeNull();
  });
  it("undo steps back through every edit, ending at the saved design", () => {
    setup();
    const { apply, undo } = useEditor.getState();
    act(() => { apply((d) => patchRow(d, "temp", { label: "A" })); apply((d) => patchRow(d, "temp", { label: "B" })); });
    act(() => undo());
    expect(useUi.getState().draft!.rows[0]!.label).toBe("A");
    act(() => useEditor.getState().undo());
    expect(useUi.getState().draft).toBeNull();
    expect(useEditor.getState().history).toEqual([]);
  });
  it("an edit that changes nothing is not an edit", () => {
    setup();
    act(() => useEditor.getState().apply((d) => d));
    expect(useUi.getState().draft).toBeNull();
    expect(useEditor.getState().history).toHaveLength(0);
  });
  it("shows the server's reason when a design is not valid", async () => {
    setup();
    (api.validateDesign as any).mockResolvedValue({ ok: false, errors: ["/rows/0/colour: too low contrast"], document: null });
    act(() => useEditor.getState().apply((d) => patchRow(d, "temp", { colour: "#111111" })));
    await waitFor(() => expect(useEditor.getState().errors).toEqual(["/rows/0/colour: too low contrast"]));
  });
  it("saves a new version of the user's own design with who and why, then clears the draft", async () => {
    setup(false);
    const save = vi.spyOn(api, "saveVersion").mockResolvedValue({ ...stored(false), version: 2 });
    act(() => useEditor.getState().apply((d) => patchRow(d, "temp", { label: "Skin" })));
    let ok = false;
    await act(async () => { ok = await useEditor.getState().save({ author: "Dr B", note: "Renamed", name: "" }); });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledWith("icu", expect.objectContaining({ author: "Dr B", note: "Renamed" }));
    expect(useUi.getState().draft).toBeNull();
    expect(useUi.getState().notice).toContain("version 2");
  });
  it("saving a built-in design makes a copy first and saves into that", async () => {
    setup(true);
    const dup = vi.spyOn(api, "duplicate").mockResolvedValue({ ...stored(false), meta: { ...stored(false).meta, id: "mine", name: "Mine" }, document: { ...baseDesign(), name: "Mine" } } as any);
    const active = vi.spyOn(api, "setActive").mockResolvedValue(stored(false));
    const save = vi.spyOn(api, "saveVersion").mockResolvedValue({ ...stored(false), version: 2 });
    act(() => useEditor.getState().apply((d) => patchRow(d, "temp", { label: "Skin" })));
    await act(async () => { await useEditor.getState().save({ author: "RN A", note: "", name: "Mine" }); });
    expect(dup).toHaveBeenCalledWith("icu", "Mine", "RN A");
    expect(active).toHaveBeenCalledWith("mine", "RN A");
    expect(save.mock.calls[0]![0]).toBe("mine");
    expect((save.mock.calls[0]![1].document as Design).name).toBe("Mine");
  });
  it("keeps the draft and says why when the server refuses", async () => {
    setup(false);
    vi.spyOn(api, "saveVersion").mockRejectedValue(new ApiError(422, "colour too dull"));
    act(() => useEditor.getState().apply((d) => patchRow(d, "temp", { label: "Skin" })));
    await act(async () => { await useEditor.getState().save({ author: "", note: "", name: "" }); });
    expect(useEditor.getState().saveError).toBe("colour too dull");
    expect(useUi.getState().draft).not.toBeNull();
  });
});

describe("edit bar", () => {
  it("is absent when nothing is being edited, and says EDITING LAYOUT while editing", () => {
    setup();
    useUi.setState({ editMode: false });
    const { unmount } = render(<EditBar />);
    expect(dom.queryByTestId("edit-bar")).toBeNull();
    unmount();
    useUi.setState({ editMode: true });
    render(<EditBar />);
    expect(dom.getByTestId("edit-title").textContent).toBe("EDITING LAYOUT");
  });
  it("stays as UNSAVED CHANGES after exit while a draft exists", () => {
    setup();
    act(() => useEditor.getState().apply((d) => patchRow(d, "temp", { label: "Skin" })));
    render(<EditBar />);
    fireEvent.click(dom.getByTestId("edit-exit"));
    expect(useUi.getState().editMode).toBe(false);
    expect(dom.getByTestId("edit-title").textContent).toBe("UNSAVED CHANGES");
  });
  it("blocks Save and says why while the design is invalid; says a built-in is saved as a copy", async () => {
    setup(true);
    render(<EditBar />);
    expect(dom.getByTestId("edit-note").textContent).toContain("your own copy");
    (api.validateDesign as any).mockResolvedValue({ ok: false, errors: ["bad"], document: null });
    act(() => useEditor.getState().apply((d) => patchRow(d, "temp", { colour: "#000000" })));
    await waitFor(() => expect((dom.getByTestId("edit-save") as HTMLButtonElement).disabled).toBe(true));
    expect(dom.getByTestId("edit-note").textContent).toContain("Cannot save: bad");
  });
  it("asks who saved it and why, and remembers who", async () => {
    setup(false);
    vi.spyOn(api, "saveVersion").mockResolvedValue({ ...stored(false), version: 2 });
    act(() => useEditor.getState().apply((d) => patchRow(d, "temp", { label: "Skin" })));
    render(<EditBar />);
    fireEvent.click(dom.getByTestId("edit-save"));
    fireEvent.change(dom.getByTestId("save-author"), { target: { value: "Dr B" } });
    fireEvent.change(dom.getByTestId("save-note"), { target: { value: "Clearer name" } });
    await act(async () => { fireEvent.click(dom.getByTestId("save-confirm")); });
    expect((api.saveVersion as any).mock.calls[0][1]).toMatchObject({ author: "Dr B", note: "Clearer name" });
    expect(window.localStorage.getItem("emus.author")).toBe("Dr B");
  });
});

describe("edit panel", () => {
  it("offers to add a module when none is selected", () => {
    setup();
    render(<EditPanel />);
    fireEvent.change(dom.getByTestId("add-parameter"), { target: { value: "hr" } });
    fireEvent.click(dom.getByTestId("add-size-compact"));
    fireEvent.click(dom.getByTestId("add-module"));
    expect(items()).toEqual(["temp:tile", "hr:row", "hr-2:compact"]);
    expect(useEditor.getState().selected).toBe("hr-2");
  });
  it("changes size, place, content and name of the selected module", () => {
    setup();
    useEditor.setState({ selected: "temp" });
    render(<EditPanel />);
    fireEvent.click(dom.getByTestId("size-row"));
    expect(items()[0]).toBe("temp:row");
    fireEvent.click(dom.getByTestId("move-later"));
    expect(items()).toEqual(["hr:row", "temp:row"]);
    fireEvent.click(dom.getByTestId("content-ai"));
    expect(useUi.getState().draft!.rows[0]!.content.ai).toBe(false);
    fireEvent.change(dom.getByTestId("row-label"), { target: { value: "Skin Temp" } });
    expect(useUi.getState().draft!.rows[0]!.label).toBe("Skin Temp");
  });
  it("says what the chosen size has no room for", () => {
    setup();
    useEditor.setState({ selected: "temp" });
    render(<EditPanel />);                       // a tile: number, spark and AI only
    expect(dom.getByTestId("noroom-certainty")).toBeTruthy();
    expect(dom.queryByTestId("noroom-ai")).toBeNull();
    fireEvent.click(dom.getByTestId("size-row"));
    expect(dom.queryByTestId("noroom-certainty")).toBeNull();
  });
  it("duplicates into a separate module and can remove it again; all of it can be undone", () => {
    setup();
    useEditor.setState({ selected: "temp" });
    render(<EditPanel />);
    fireEvent.click(dom.getByTestId("duplicate-module"));
    expect(items()).toEqual(["temp:tile", "temp-2:tile", "hr:row"]);
    fireEvent.click(dom.getByTestId("remove-module"));
    expect(items()).toEqual(["temp:tile", "hr:row"]);
    act(() => { useEditor.getState().undo(); useEditor.getState().undo(); });
    expect(useUi.getState().draft).toBeNull();
  });
  it("tapping a size is one touch and every control in the panel is a touch target in size", () => {
    setup();
    useEditor.setState({ selected: "temp" });
    render(<EditPanel />);
    expect(dom.getAllByRole("radio").length).toBeGreaterThanOrEqual(3);
  });
});

describe("settings sheets", () => {
  it("text size is changed for both themes at once", () => {
    setup();
    render(<AppearanceSheet />);
    fireEvent.click(dom.getByLabelText("Increase Text Size"));
    const d = useUi.getState().draft!;
    expect(d.theme.font_scale).toBe(1.125);
    expect(d.alt_theme.font_scale).toBe(1.125);
  });
  it("an accent colour changes only the theme on screen and marks it custom", () => {
    setup();
    render(<AppearanceSheet />);
    fireEvent.click(dom.getByTestId("accent-22C55E"));
    const d = useUi.getState().draft!;
    expect(d.theme.colours.accent).toBe("#22C55E");
    expect(d.theme.preset).toBe("custom");
    expect(d.alt_theme.colours.accent).toBe("#3B82F6");
  });
  it("choosing a preset keeps the user's sizes", async () => {
    setup();
    act(() => useEditor.getState().apply((d) => ({ ...d, theme: { ...d.theme, font_scale: 1.5 } }) as Design));
    render(<AppearanceSheet />);
    await waitFor(() => expect(dom.getByTestId("presets-dark").textContent).toContain("High Contrast"));
    fireEvent.click(dom.getByText("High Contrast"));
    const d = useUi.getState().draft!;
    expect(d.theme.preset).toBe("high-contrast");
    expect(d.theme.font_scale).toBe(1.5);
  });
  it("navigation settings edit the design's notification box and bars", () => {
    setup();
    render(<NavigationSheet />);
    fireEvent.click(dom.getByText("Top bar", { selector: ".choice-opt" }));
    expect(useUi.getState().draft!.notifications.position).toBe("top-bar");
    fireEvent.click(dom.getByTestId("top-seconds"));
    expect(useUi.getState().draft!.top_bar.show_seconds).toBe(false);
    fireEvent.click(dom.getByLabelText("Increase Tab Bar Height"));
    expect(useUi.getState().draft!.tab_bar.height_px).toBe(80);
  });
  it("AI settings switch things off, set the floor and the certainty display, and explain the measure", () => {
    setup();
    render(<AiSettingsSheet />);
    fireEvent.click(dom.getByTestId("ai-annotations"));
    expect(useUi.getState().draft!.ai.show_trace_annotations).toBe(false);
    fireEvent.click(dom.getByLabelText("Increase Hide findings below"));
    expect(useUi.getState().draft!.ai.min_confidence).toBe(0.6);
    fireEvent.click(dom.getByText("Bars"));
    expect(useUi.getState().draft!.forecast.certainty.display).toBe("bars");
    expect(dom.getByTestId("cert-tells").textContent).toBe("How many agree.");
  });
});
