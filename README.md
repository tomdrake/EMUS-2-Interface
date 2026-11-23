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
  ai/                interpretation, forecaster, certainty, LLM providers
  interop/           FHIR R4 and HL7 v2 mapping
  routers/           HTTP and WebSocket API
frontend/src/
  design/            generated types, theme to CSS variables, navigation
  layout/            top bar, bottom tabs, menus, sheets, split layouts
  widgets/           what goes in a pane: rows, NEWS2 chart, labs, forecast ...
  studio/            sheets: clinical panels and design-studio sections
docs/
  HANDOFF.md              what is built, what is next, the rules
  briefs/                 one brief per milestone
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
the alarm-silence button (always two minutes) and the settings button.

## Data and standards

- Simulated scenarios: pneumonia with deterioration, paroxysmal AF, COPD on SpO2
  scale 2 with a fall, non-sustained VT with critical potassium, and a stable patient.
- MIMIC-IV Clinical Database Demo v2.2 (open access) via `make mimic` (milestone M6).
- Target device: Sibel ANNE One (ECG, HR, RR, SpO2, pulse, skin temperature,
  position, activity, falls). The adapter is a documented stub until SDK access.
- FHIR R4 and HL7 v2 interfaces are milestone M8. Clinical codes marked provisional
  in `registry.py` need checking against a terminology server before real use.
