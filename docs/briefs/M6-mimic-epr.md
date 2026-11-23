# M6: MIMIC-IV demo import and the results panel

Read `docs/HANDOFF.md` first. Needs M2. Acceptance tests: `backend/tests/test_m6_epr.py`.

## Goal

Real recorded patients alongside the scripted ones, and a results screen that shows
laboratory tests with UK units and ranges, what has changed, and critical values
that cannot be missed, plus imaging reports.

## Backend

| File | Build |
|---|---|
| `app/mimic.py` | Conversions, label mapping, download, `import_demo`. |
| `app/sources/mimic_replay.py` | `MimicReplaySource`. |
| `app/routers/patients.py` | `labs`, `imaging`, placeholder image. |
| scenario seeding | Scenario `labs`, `historic_labs` and `imaging` loaded for scenario patients. |

MIMIC:

- Source: MIMIC-IV Clinical Database Demo v2.2 (open access, ODbL). Files listed in
  `mimic.FILES`. Download into `data/mimic-iv-demo/`, which is git-ignored. Never
  commit MIMIC data.
- Map by label through `d_items` / `d_labitems`, not by item id. Report expected
  labels that are missing. **Run `make mimic` against the real download** and
  compare the real column headers with the fixture in the test file; fix the
  fixture if they differ and say so in the notes.
- Convert to UK units with the registry factors; Fahrenheit to Celsius. Use the
  registry's UK reference range for flagging, and keep MIMIC's own range in the
  stored document for reference.
- Choose stays with the best vital-sign coverage. Give patients synthetic names and
  999-range NHS numbers; MIMIC dates are shifted, so replay maps the stay onto the
  wall clock with seek and speed like scenarios.
- No waveforms exist for these patients: synthesise sinus-rhythm waveforms from the
  recorded numerics and report `simulated` for waveforms in `SourceInfo`/status so
  the screen can badge the traces while the numbers are real recorded values.
- ACVPU is derived from GCS and marked derived.

Labs API:

- `series` per test: latest, history this admission, historic baseline (median of
  results before admission), recent baseline (previous result), deltas, trend
  (`rising`/`falling` when the latest differs from the previous by more than 10%
  of the reference range width, else `stable`).
- `critical`: latest results flagged `critical-low` or `critical-high`.
- Sex-specific ranges via `registry.lab_range`.

Imaging: scenario studies newest first. `image.svg` is a schematic chest outline
(lungs, heart, diaphragm) drawn in SVG with nothing that could be mistaken for a
real radiograph, and a "Schematic placeholder" caption inside the image. Regions
from the scenario are returned as data for the overlay, not baked into the SVG.

## Frontend

| File | Build |
|---|---|
| new `src/widgets/Labs.tsx` | Critical strip pinned at the top (colour plus icon plus the word "Critical", never colour alone). Grouped table: test, value with unit, flag arrow, reference range, sparkline with the range shaded, change from previous and from historic normal, time since collection. Tap a row for detail: full history chart, where and when it was done, specimen. Honour `LabsWidget` options. |
| new `src/widgets/Imaging.tsx` | Study list; viewer with report, where and when, "compare with previous" side by side, and the placeholder caption. Region overlay arrives with M7. |
| demo controls | Patient picker now lists MIMIC patients, labelled "MIMIC-IV demo (recorded)". |

## Done when

- All `@todo("M6")` tests pass with the decorator removed; `make test` is green.
- `make mimic` completes against the real files and a recorded stay replays on the
  monitor with labs in UK units. Paste the import report into the notes.
- Browser checks added: `scn-vt` shows potassium in the critical strip; `scn-pneumonia`
  shows WCC rising with both baselines; imaging shows two studies and the compare view.
