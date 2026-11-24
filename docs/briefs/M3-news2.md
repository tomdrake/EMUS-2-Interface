# M3: NEWS2 chart and split home screens

Read `docs/HANDOFF.md` first. Needs M2. Acceptance tests: `backend/tests/test_m3_news2.py`.

## Goal

A NEWS2 chart that nurses recognise as the RCP chart, in three styles, usable as
the home screen or as half of a split with the continuous observations.

## Backend

| File | Build |
|---|---|
| `app/routers/patients.py` | `observation-sets` get/post, `spo2-scale` put. |
| `app/sources/simulator.py` | `observation_sets()` at the scenario's `obs_interval_min`, and the `continuous` source at any interval. |

- Score with `app.news2.news2` using the patient's SpO2 scale and the oxygen in
  force at that time. Store manual sets in `observation_sets`.
- A set with missing inputs is returned with `news2_complete: false` and is drawn
  as incomplete; never present a partial total as if it were complete.
- Switching scale is audited and re-scores what is displayed. It does not rewrite
  stored history: store the scale used with each manual set.

## Frontend

| File | Build |
|---|---|
| new `src/widgets/News2Chart.tsx` (+ helpers) | SVG chart. |
| new `src/studio/News2VariantSheet.tsx`, `HomeScreenSheet.tsx`, `RecordObservationsSheet.tsx` | Style picker; home screen picker; manual entry. |

Chart layout, top to bottom, as on the RCP chart supplied with the project:
date and time header; Respirations; SpO2 scale 1 or scale 2 (only the one in use,
with the other available by toggle and a clear "Scale 2" label); Air or oxygen
(A, flow in L/min, device code); Blood pressure (systolic plotted, diastolic as a
dashed drop and number); Pulse; Consciousness (A, C, V, P, U); Temperature; NEWS
total (cell coloured by risk); monitoring frequency; escalation. Each band row is
shaded with the score it carries (`theme.news_bands.score_0..3`). Dots joined by
lines in the parameter colour, value printed above each dot.

Variants (`widget.variant`):

- `bands-light`: the paper chart. Uses `news_bands` as given by the light theme.
- `bands-dark`: same geometry on a dark background with dark band tints.
- `trend-dark`: continuous trend lines per parameter over time with thin threshold
  shading at the band edges, and the charted sets as dots. Fewer gridlines.

Behaviour: newest column on the right, scroll horizontally by drag, pinch not
required. Tap a column to see that set's values and component scores. A fixed
"now" line. Reserve space on the right for future columns (drawn in M7 when
`widget.show_future` is on). Row labels stay fixed while columns scroll.

The home-screen sheet sets `home_screen` to one of the four layouts through the
normal design edit path (preview, then save in M4; until M4 exists, apply as a
local draft and say so in the notes).

## Done when

- All `@todo("M3")` tests pass with the decorator removed; `make test` is green.
- Browser checks added: each of the three variants renders with at least 6 columns
  for `scn-pneumonia`; the last total cell matches the API; `scn-copd` shows the
  scale 2 block; split side-by-side and stacked both show chart and rows without
  overlap at 1024x768; recording a manual set adds a column.
- A side-by-side screenshot of `bands-light` next to the supplied RCP chart image
  is recognisably the same chart.
