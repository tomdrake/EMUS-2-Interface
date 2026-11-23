import { create } from "zustand";

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
  patientId: string;
  notice: string | null;

  load(stored: StoredDesign, registry: Registry): void;
  setDraft(draft: Design | null): void;
  go(screenId: string): void;
  showMenu(menu: Menu | null): void;
  showSheet(sheet: SheetId | null, context?: string | null): void;
  setEditMode(on: boolean): void;
  toggleMode(): void;
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
function writeMode(mode: ThemeMode): void {
  try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* not persisted */ }
}

export const useUi = create<UiState>((set) => ({
  stored: null, draft: null, registry: null, error: null,
  screenId: null, openMenu: null, openSheet: null, sheetContext: null,
  editMode: false, mode: readMode(), patientId: DEFAULT_PATIENT, notice: null,

  load: (stored, registry) =>
    set((s) => ({ stored, registry, error: null,
                  screenId: s.screenId ?? stored.document.home_screen })),
  setDraft: (draft) => set({ draft }),
  go: (screenId) => set({ screenId, openMenu: null, openSheet: null }),
  showMenu: (openMenu) => set({ openMenu, openSheet: null }),
  showSheet: (openSheet, sheetContext = null) => set({ openSheet, sheetContext, openMenu: null }),
  setEditMode: (editMode) => set({ editMode }),
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
