# EMUS-2 co-design patient monitor

A touch-first patient monitor for co-design workshops with doctors and nurses. It
starts from two familiar displays, an ICU bedside monitor and the RCP NEWS2 chart,
and lets people redesign every part of the screen by hand or by asking a chatbot,
with each change saved as a version. It is the front end for a causal AI model
that predicts complications some hours ahead.

**This is a prototype for design workshops. It is not a medical device and must
not be used for patient care.** Data is simulated or from the open-access MIMIC-IV
demo, and AI findings and forecasts are placeholders until the causal model is
connected.

## Status

The scaffold (milestone 1) is in place: the design schema, clinical registry,
NEWS2 scoring, data contracts, patch validation, SQL schema, and a shell that
renders the default designs. Milestones M2 to M8 are specified with briefs,
acceptance tests and agent workflows, and are not built yet. See
[`docs/HANDOFF.md`](docs/HANDOFF.md).

## Run it

Needs Python 3.11 or newer and Node 20 or newer.

```bash
make setup
```

```bash
make dev
```

Open the Vite address it prints (port 5173). For tablets on the same network, use
one server instead:

```bash
make serve
```

and open `http://<this-computer>:8000` on the tablet.

Checks:

```bash
make test
```

```bash
make e2e
```

(`make e2e` needs `make serve` running in another terminal.)

## How it fits together

```
backend/app/
  registry.py        read-only clinical vocabulary: parameters, codes, UK ranges
  models/design.py   the design document: the only thing redesign can change
  models/clinical.py data contracts: observations, findings, forecasts, certainty
  news2.py           NEWS2 scoring
  patching.py        applies and validates design edits (the chatbot boundary)
  scenarios.py       scripted simulated patients
  sources/           device adapters: simulator, MIMIC replay, ANNE One (stub)
  signal_quality.py  is this trace good enough to trust?
  ai/                interpretation, forecaster, certainty, LLM providers
  interop/           FHIR R4 and HL7 v2 mapping
  routers/           HTTP and WebSocket API
frontend/src/
  design/            generated types, theme to CSS variables, navigation
  layout/            top bar, bottom tabs, menus, sheets, split layouts
  safety/            tiles (a number or why there is none), the notification ticker
  traces/            baseline, scale and calibration marks drawn on every trace
  widgets/           what goes in a pane: the monitor grid of modules, NEWS2 chart, labs ...
  layout/grid.ts     packs modules of different sizes into a grid that fills the pane
  studio/            sheets: clinical panels and design-studio sections
docs/
  HANDOFF.md              what is built, what is next, the rules
  briefs/                 one brief per milestone
  human-factors.md        how failure modes are told apart; alarm and device states
  forecast-options.md     forecast displays and certainty metrics to choose from
  causal-model-contract.md  how to connect the causal model
.claude/workflows/   agent workflows that implement each milestone
```

**The screen is data.** Everything visible is drawn from one JSON design document:
theme, screens and split layouts, rows, tabs, menus, alarm defaults, and how AI
findings and forecasts are shown. Editing by touch, editing by chat and version
history all act on that document. It refers to clinical items only by id; the
items themselves live in the read-only registry, so a redesign cannot alter data
structures. A few things cannot be designed away: the patient's name, the clock,
the alarm-silence button (always two minutes), the settings button, the
notification box, and the warnings that say the monitoring itself has a problem.

## Example data and AI

With no live feed yet, the monitor shows **example data**: scripted scenarios at a chosen
minute (Settings, Demo Controls), with synthesised ECG, pleth and respiration, labelled
EXAMPLE DATA everywhere. The AI chip on each module says what the interpretation found and
how sure it is; brackets on the trace say why. The interpretation is a short, readable
rule over the synthetic signal (not a clinical model) so each finding can be explained.
The AI button in the top bar turns every AI mark off for the screen.

## ABCDE and the NEWS2 chart

The **ABCDE** tab checks Airway, Breathing, Circulation, Disability and Exposure from the monitor's data and a few prompts, then shows the latest blood gas, bloods and glucose with when they were taken, a Trends button, and the NEWS2 chart on the other half of the screen. Airway, capillary refill, AVPU, GCS and exposure are recorded on the screen only.

## Customising the screen

Settings, then **Edit Layout**: tap a module, choose its size from seven pictured shapes (small
square to double-height row), move, copy or remove it, change what it measures, its name, colour
and content, and turn its AI off. **Appearance**, **Tabs and Menus** and **AI and Certainty** change
the rest. Changes show at once and are saved as a new version with your name and a note;
**Versions** keeps the history, reverts, copies, exports and imports.

## Data and standards

- The monitor is a grid of modules: a small square, a tile (number and trend), tall, wide,
  large, a full row, or a double-height full row. The built-in "Modular Example" design
  shows them all.
- Simulated scenarios: pneumonia with deterioration, paroxysmal AF, COPD on SpO2
  scale 2 with a fall, non-sustained VT with critical potassium, a stable patient,
  and a well patient with monitoring problems (standby, low battery, poor trace,
  sensor off, connection lost).
- MIMIC-IV Clinical Database Demo v2.2 (open access) via `make mimic` (milestone M6).
- Target device: Sibel ANNE One (ECG, HR, RR, SpO2, pulse, skin temperature,
  position, activity, falls). The adapter is a documented stub until SDK access.
- FHIR R4 and HL7 v2 interfaces are milestone M8. Clinical codes marked provisional
  in `registry.py` need checking against a terminology server before real use.
