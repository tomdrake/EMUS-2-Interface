import { create } from "zustand";

import { NOMINAL_PX_PER_MM } from "@/traces/traceScale";

import type { Registry } from "./api";
import type { Design, Menu, SheetId, StoredDesign, Theme, ThemeMode } from "@/design/types";

/**
 * One store for UI state. Live data (numerics, waveforms, alarms) gets its own
 * store in M2 so high-rate updates do not re-render the chrome.
 */
interface UiState {
  stored: StoredDesign | null;      // what is saved
  draft: Design | null;             // unsaved preview (studio edits, chat proposals)
  registry: Registry | null;
  error: string | null;

  screenId: string | null;
  openMenu: Menu | null;
  openSheet: SheetId | null;
  /** Context for a sheet opened from a row tap, e.g. the row id. */
  sheetContext: string | null;
  editMode: boolean;
  /** Dark / light choice for this screen; null = the design's default theme. */
  mode: ThemeMode | null;
  /** This screen's x scale per trace (row id to mm/s or minutes). Local, like dark / light;
   *  empty means "as the design says". The trace and its number both read this. */
  xScale: Record<string, number>;
  /** CSS pixels per millimetre used for trace gain and sweep speed. Nominal unless
   *  this screen has been calibrated (the calibration sheet is milestone M4). */
  pxPerMm: number;
  patientId: string;
  notice: string | null;

  load(stored: StoredDesign, registry: Registry): void;
  setDraft(draft: Design | null): void;
  go(screenId: string): void;
  showMenu(menu: Menu | null): void;
  showSheet(sheet: SheetId | null, context?: string | null): void;
  setEditMode(on: boolean): void;
  toggleMode(): void;
  /** Set (or with null, clear) one trace's x scale on this screen. */
  setXScale(rowId: string, value: number | null): void;
  setNotice(text: string | null): void;
  fail(message: string): void;
}

export const DEFAULT_PATIENT = "scn-pneumonia";

// The dark / light choice belongs to this screen (day or night on this ward), not
// to the design, so it is kept locally and survives a reload. Storage can be
// unavailable (private windows); the app works without it.
const MODE_KEY = "emus.theme-mode";
function readMode(): ThemeMode | null {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch { return null; }
}
const XSCALE_KEY = "emus.x-scale";
export function readXScale(): Record<string, number> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(XSCALE_KEY) ?? "{}");
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw ?? {})) if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v;
    return out;
  } catch { return {}; }
}
function writeXScale(v: Record<string, number>): void {
  try { window.localStorage.setItem(XSCALE_KEY, JSON.stringify(v)); } catch { /* not persisted */ }
}
function writeMode(mode: ThemeMode): void {
  try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* not persisted */ }
}

export const useUi = create<UiState>((set) => ({
  stored: null, draft: null, registry: null, error: null,
  screenId: null, openMenu: null, openSheet: null, sheetContext: null,
  editMode: false, mode: readMode(), xScale: readXScale(), pxPerMm: NOMINAL_PX_PER_MM, patientId: DEFAULT_PATIENT, notice: null,

  load: (stored, registry) =>
    set((s) => ({ stored, registry, error: null,
                  screenId: s.screenId ?? stored.document.home_screen })),
  setDraft: (draft) => set({ draft }),
  go: (screenId) => set({ screenId, openMenu: null, openSheet: null }),
  showMenu: (openMenu) => set({ openMenu, openSheet: null }),
  showSheet: (openSheet, sheetContext = null) => set({ openSheet, sheetContext, openMenu: null }),
  setEditMode: (editMode) => set({ editMode }),
  setXScale: (rowId, value) => set((s) => {
    const next = { ...s.xScale };
    if (value === null) delete next[rowId]; else next[rowId] = value;
    writeXScale(next);
    return { xScale: next };
  }),
  toggleMode: () => set((s) => {
    const design = s.draft ?? s.stored?.document;
    const current = s.mode ?? design?.theme.mode ?? "dark";
    const mode: ThemeMode = current === "dark" ? "light" : "dark";
    writeMode(mode);
    return { mode };
  }),
  setNotice: (notice) => set({ notice }),
  fail: (error) => set({ error }),
}));

/** The design currently on screen: the draft if one is being previewed, else the saved one. */
export function useDesign(): Design | null {
  return useUi((s) => s.draft ?? s.stored?.document ?? null);
}

/** The theme to draw: whichever of the design's pair matches this screen's dark / light choice. */
export function activeTheme(design: Design, mode: ThemeMode | null): Theme {
  if (mode === null || design.theme.mode === mode) return design.theme;
  return design.alt_theme;
}

export function useTheme(): Theme | null {
  const design = useDesign();
  const mode = useUi((s) => s.mode);
  return design ? activeTheme(design, mode) : null;
}
