import { useState } from "react";

import { useUi } from "@/app/store";

import { useEditor } from "./editor";

const AUTHOR_KEY = "emus.author";
const readAuthor = (): string => { try { return window.localStorage.getItem(AUTHOR_KEY) ?? ""; } catch { return ""; } };
const writeAuthor = (v: string) => { try { window.localStorage.setItem(AUTHOR_KEY, v); } catch { /* not kept */ } };

/**
 * Always on screen while the layout is being edited or there are unsaved changes, so it is never
 * unclear that what is shown is not saved. Editing changes the layout while it is open (this bar
 * and the side panel take room): it is not for use at a bedside.
 */
export function EditBar() {
  const editMode = useUi((s) => s.editMode);
  const draft = useUi((s) => s.draft);
  const stored = useUi((s) => s.stored);
  const { history, errors, saving, saveError } = useEditor();
  const [form, setForm] = useState(false);
  const [author, setAuthor] = useState(readAuthor);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  // Unsaved changes made here keep the bar on screen after Exit. A draft set by something else (a preview) does not.
  if (!editMode && !(draft && history.length > 0)) return null;
  const builtin = !!stored?.meta.builtin;
  const editor = useEditor.getState();
  const blocked = errors.length > 0;

  const submit = async () => {
    writeAuthor(author);
    const ok = await editor.save({ author, note, name: name || `${stored?.meta.name ?? "Design"} (Mine)` });
    if (ok) { setForm(false); setNote(""); }
  };

  return (
    <div className="edit-bar" role="region" aria-label={editMode ? "Editing layout" : "Unsaved changes"} data-testid="edit-bar"
         data-editing={editMode} data-dirty={!!draft}>
      <div className="edit-bar-row">
        <strong className="edit-bar-title" data-testid="edit-title">{editMode ? "EDITING LAYOUT" : "UNSAVED CHANGES"}</strong>
        <span className="edit-bar-note" data-testid="edit-note">
          {blocked ? `Cannot save: ${errors[0]}`
            : builtin ? "Built-in design: saving makes your own copy."
              : draft ? "Not saved yet." : "No changes yet."}
        </span>
        <span className="edit-bar-actions">
          <button type="button" className="btn" disabled={!history.length} onClick={() => editor.undo()} data-testid="edit-undo">Undo</button>
          <button type="button" className="btn" disabled={!draft} onClick={() => { editor.discard(); setForm(false); }} data-testid="edit-discard">Discard</button>
          <button type="button" className="btn btn-primary" disabled={!draft || blocked} onClick={() => setForm(true)} data-testid="edit-save">Save</button>
          {editMode && (
            <button type="button" className="btn" onClick={() => { useUi.getState().setEditMode(false); editor.select(null); setForm(false); }}
                    data-testid="edit-exit">Exit</button>
          )}
        </span>
      </div>
      {form && draft && (
        <form className="edit-save" data-testid="edit-save-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {builtin && (
            <label>Name of your copy<input value={name} placeholder={`${stored?.meta.name} (Mine)`} maxLength={60}
                                           onChange={(e) => setName(e.target.value)} data-testid="save-name" /></label>
          )}
          <label>Who is saving this?<input value={author} placeholder="Name or role" maxLength={60}
                                           onChange={(e) => setAuthor(e.target.value)} data-testid="save-author" /></label>
          <label>What changed and why?<input value={note} placeholder="Optional" maxLength={200}
                                             onChange={(e) => setNote(e.target.value)} data-testid="save-note" /></label>
          <button type="submit" className="btn btn-primary" disabled={saving} data-testid="save-confirm">{saving ? "Saving…" : "Save Version"}</button>
          <button type="button" className="btn" onClick={() => setForm(false)}>Cancel</button>
          {saveError && <span className="edit-error" role="alert" data-testid="save-error">{saveError}</span>}
        </form>
      )}
    </div>
  );
}
