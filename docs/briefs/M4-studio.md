# M4: design studio and versioned persistence

Read `docs/HANDOFF.md` first. Needs only the scaffold. Acceptance tests:
`backend/tests/test_m4_designs.py`.

## Goal

Clinicians can change anything about the screen by touch, see it immediately, and
save it. Every save is kept as a version with who made it and why, so a workshop
leaves a record of what people changed.

> **Status.** The backend below is done and its acceptance tests pass. The first studio sheets are
> built (Edit Layout, Appearance, Tabs and Menus, AI and Certainty, Versions); what remains is listed
> in `docs/HANDOFF.md` (split screens and widget types, alarm defaults, card module types, drag and drop).

## Backend

| File | Build |
|---|---|
| `app/db.py` | `save_version`, `revert`, `duplicate`, `set_setting`, secrets helpers (see the notes at the bottom of the file). |
| `app/routers/designs.py` | The eight stubbed routes. |

- Built-in designs are read-only: saving or deleting one returns 409. Duplicate first.
- A save takes either a full `document` or `ops`, never both, never neither (422).
- Validation failures return 422 with `detail.errors` from `patching`.
- Each version stores the full document, the JSON Patch from the previous version,
  and `touched` (top-level sections changed) is returned in the version list.
- Revert writes a new version; history is never rewritten.
- Export is `{meta, document, versions:[...]}`; import validates and creates a new design.
- Audit rows: `design.duplicate`, `design.save`, `design.revert`, `design.delete`,
  `design.import`, `design.activate`.

## Frontend

One edit path for everything: a change is a list of JSON Patch ops against the
stored document, sent to `POST /api/designs/{id}/preview-patch`, and the returned
document becomes the draft (`useUi.setDraft`) so the screen updates behind the
sheet. A persistent bar shows "Unsaved changes: Save / Discard". Saving asks once
for the participant's label (role or initials, kept in `localStorage`) and an
optional note. Editing a built-in design offers "Make a copy to edit" first.

| File | Build |
|---|---|
| new `src/studio/useDesignEditor.ts` | The edit path above, with undo of the last op. |
| new `src/studio/AppearanceSheet.tsx` | A design has two themes, `theme` and `alt_theme`, one dark and one light; the top-bar switch flips between them on this screen without saving anything. Edit whichever is showing, with a control to pick which is the default. Theme preset tiles; colour swatches for every token (native colour input is fine); sliders for text size, number size, trace width, touch size, corner radius; density. Label options: Title Case on or off, show the method of collection. Tile width and "all tiles the same height". |
| new `src/studio/LayoutSheet.tsx` | Screens list; per screen choose single widget or split, direction, ratio slider, widget type per pane and its options. Add, rename, remove screens. |
| new `src/studio/RowsSheet.tsx` | Reorder with up/down buttons, show/hide, add from the registry's parameters, remove; per row: label and method of collection (shown as "Heart Rate - ECG"; blank uses the default), colour, trace type, waveform, height, numbers shown, AI text and forecast toggles. Sweep settings. |
| new `src/studio/NavigationSheet.tsx` | Buttons in the tab bar and in the top bar (order, label, icon, target, and moving a button from one bar to the other), menus and their items, top bar fields and order, and where the notification box sits (`notifications.position`, order, size, empty wording). The schema refuses to remove the silence and settings buttons, the name or the clock: show that as a plain message, not an error dump. |
| new `src/studio/AlarmDefaultsSheet.tsx` | Default limits per parameter (bounded by registry), alarm presentation, and the `safety` display options (standby wording, stale values, advice line, where device status shows, dimming poor traces) with the state colours `silenced`, `technical`, `inactive`. There is deliberately no option to hide any of them; say so on the sheet. |
| new `src/studio/VersionsSheet.tsx` | Designs list with "use on this monitor"; version history with author, note, source, sections touched; preview a version; revert; duplicate; export and import as a file. |
| edit mode | A toggle in the unsaved-changes bar or Settings menu: while on, tapping a row, widget, tab or the top bar opens the matching studio section focused on that element (`data-widget`, `data-testid` attributes are already there). |

Validation errors from the server are shown next to the control that caused them,
in plain words.

## Done when

- All `@todo("M4")` tests pass with the decorator removed; `make test` is green.
- Browser checks added: change the theme preset and see colours change before
  saving; save, reload, and the change persists; reorder two rows; switch the home
  screen to a split; the versions sheet lists the saves; revert restores the look.
- Every studio section is reachable in two touches from the tab bar.
