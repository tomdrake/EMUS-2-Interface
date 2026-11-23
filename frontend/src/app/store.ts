import { create } from "zustand";

import type { Registry } from "./api";
import type { Design, Menu, SheetId, StoredDesign } from "@/design/types";

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
  patientId: string;
  notice: string | null;

  load(stored: StoredDesign, registry: Registry): void;
  setDraft(draft: Design | null): void;
  go(screenId: string): void;
  showMenu(menu: Menu | null): void;
  showSheet(sheet: SheetId | null, context?: string | null): void;
  setEditMode(on: boolean): void;
  setNotice(text: string | null): void;
  fail(message: string): void;
}

export const DEFAULT_PATIENT = "scn-pneumonia";

export const useUi = create<UiState>((set) => ({
  stored: null, draft: null, registry: null, error: null,
  screenId: null, openMenu: null, openSheet: null, sheetContext: null,
  editMode: false, patientId: DEFAULT_PATIENT, notice: null,

  load: (stored, registry) =>
    set((s) => ({ stored, registry, error: null,
                  screenId: s.screenId ?? stored.document.home_screen })),
  setDraft: (draft) => set({ draft }),
  go: (screenId) => set({ screenId, openMenu: null, openSheet: null }),
  showMenu: (openMenu) => set({ openMenu, openSheet: null }),
  showSheet: (openSheet, sheetContext = null) => set({ openSheet, sheetContext, openMenu: null }),
  setEditMode: (editMode) => set({ editMode }),
  setNotice: (notice) => set({ notice }),
  fail: (error) => set({ error }),
}));

/** The design currently on screen: the draft if one is being previewed, else the saved one. */
export function useDesign(): Design | null {
  return useUi((s) => s.draft ?? s.stored?.document ?? null);
}
