import { create } from "zustand";

import { api, ApiError } from "@/app/api";
import { useUi } from "@/app/store";
import type { Design } from "@/design/types";

/**
 * The design editor: edits are applied to a local draft (so they show at once), checked by the
 * server as they are made, and saved as a new version only when asked. The draft is the existing
 * `useUi.draft`, so every screen already draws it. Built-in designs are read-only: saving one asks
 * for a name and saves a copy of it.
 *
 * Undo keeps every earlier state of this editing session; `null` in the history means "as saved".
 */
interface EditorState {
  selected: string | null;
  history: (Design | null)[];
  errors: string[];
  saving: boolean;
  saveError: string | null;

  select(rowId: string | null): void;
  /** Apply an edit to the design on screen. A function that returns its input changes nothing. */
  apply(fn: (d: Design) => Design): void;
  undo(): void;
  discard(): void;
  save(args: { author: string; note: string; name: string }): Promise<boolean>;
}

let checkSeq = 0;

function validate(doc: Design): void {
  const mine = ++checkSeq;
  api.validateDesign(doc).then((r) => {
    if (mine === checkSeq) useEditor.setState({ errors: r.ok ? [] : r.errors });
  }).catch(() => { /* the server's answer at save time is the one that counts */ });
}

export const useEditor = create<EditorState>((set, get) => ({
  selected: null, history: [], errors: [], saving: false, saveError: null,

  select: (selected) => set({ selected }),

  apply: (fn) => {
    const ui = useUi.getState();
    const current = ui.draft ?? ui.stored?.document;
    if (!current) return;
    const next = fn(current);
    if (next === current) return;
    set((s) => ({ history: [...s.history, ui.draft], saveError: null }));
    ui.setDraft(next);
    validate(next);
  },

  undo: () => {
    const { history } = get();
    if (!history.length) return;
    const prev = history[history.length - 1]!;
    useUi.getState().setDraft(prev);
    set({ history: history.slice(0, -1), saveError: null, errors: [] });
    if (prev) validate(prev); else checkSeq++;
  },

  discard: () => {
    checkSeq++;
    useUi.getState().setDraft(null);
    set({ history: [], errors: [], saveError: null });
  },

  save: async ({ author, note, name }) => {
    const ui = useUi.getState();
    const draft = ui.draft;
    const stored = ui.stored;
    if (!draft || !stored || !ui.registry) return false;
    set({ saving: true, saveError: null });
    try {
      let id = stored.meta.id;
      let doc = draft;
      if (stored.meta.builtin) {
        // Built-in designs are read-only: the edits go to a copy, which becomes the start-up design.
        const copy = await api.duplicate(id, name || `${stored.meta.name} (Mine)`, author);
        id = copy.meta.id;
        doc = { ...draft, name: copy.document.name } as Design;
        await api.setActive(id, author);
      }
      const saved = await api.saveVersion(id, { document: doc, author, note });
      ui.load(saved, ui.registry);
      ui.setDraft(null);
      set({ history: [], errors: [], saving: false, selected: get().selected });
      ui.setNotice(`Saved as version ${saved.version} of "${saved.meta.name}"`);
      return true;
    } catch (e) {
      set({ saving: false, saveError: e instanceof ApiError ? e.message : String((e as Error)?.message ?? e) });
      return false;
    }
  },
}));
