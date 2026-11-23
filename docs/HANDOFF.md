# Hand-off: filling in the scaffold

Milestone 1 (this scaffold) is done. Milestones M2 to M8 are specified here and
are ready to be implemented, one at a time, in order.

## What exists

| Area | State |
|---|---|
| Design document schema, default designs, theme presets | Done (`backend/app/models/design.py`, `defaults.py`) |
| Clinical registry: parameters, codes, UK lab ranges, events, certainty metrics | Done (`backend/app/registry.py`) |
| NEWS2 scoring | Done (`backend/app/news2.py`) |
| Data contracts: observations, findings, forecasts, events, certainty, stream messages | Done (`backend/app/models/clinical.py`) |
| Patch validation (the chatbot safety boundary) | Done (`backend/app/patching.py`) |
| SQL schema, seeding, read access to designs | Done (`backend/app/schema.sql`, `db.py`) |
| Scenario scripts (five simulated patients) | Done, data only (`backend/app/scenarios.py`) |
| LLM system prompt and tool definition | Done (`backend/app/ai/llm.py`) |
| All other backend modules and routes | Stubs with docstrings; routes return 501 naming their milestone |
| Frontend shell: top bar, tab bar, menus, sheets, split layouts, theme | Done |
| Trace-quality check (noise, movement, flat line, clipping, weak signal) | Done (`backend/app/signal_quality.py`) |
| Safety display: standby / searching / check sensor / connection lost / poor trace / no data, sound-paused banner, MONITOR banner, device battery and link | Done (`frontend/src/safety/`), driven by test data until M2 supplies live state |
| Frontend widgets and sheets | Placeholders naming their milestone (`frontend/src/widgets`, `frontend/src/studio`) |
| Generated TypeScript types | Done (`make types`) |

## Order

| Milestone | Brief | Workflow |
|---|---|---|
| M2 Monitor, alarms, oxygen | `docs/briefs/M2-monitor.md` | `fill-m2-monitor` |
| M3 NEWS2 chart | `docs/briefs/M3-news2.md` | `fill-m3-news2` |
| M4 Design studio and versions | `docs/briefs/M4-studio.md` | `fill-m4-studio` |
| M5 Tokens and redesign by chat | `docs/briefs/M5-chat.md` | `fill-m5-chat` |
| M6 MIMIC import and results | `docs/briefs/M6-mimic-epr.md` | `fill-m6-mimic-epr` |
| M7 AI findings and forecasts | `docs/briefs/M7-ai-forecast.md` | `fill-m7-ai-forecast` |
| M8 FHIR and HL7 v2 | `docs/briefs/M8-interop.md` | `fill-m8-interop` |

M3 needs M2. M5 needs M4. M7 needs M2, M3, M5 and M6. M8 needs M2, M6 and M7.
M4 only needs the scaffold, so M4 can run alongside M2 if you want two streams.

## How to run a milestone

**With a workflow** (set the session model to Sonnet first, or leave it: the scripts
ask for Sonnet on every agent):

> run the fill-m2-monitor workflow

If the name is not found, point at the file instead:

> run the workflow script at .claude/workflows/fill-m2-monitor.js

Each workflow has the same phases:

1. **Backend**: agents implement the milestone's backend modules, one step after
   another, until its acceptance tests pass. The workflow stops here if they do not.
2. **Frontend base**: one agent adds the API calls, stores and shared pieces.
3. **Components**: agents build the widgets and sheets at the same time, each
   owning its own files.
4. **Wire up**: one agent registers the components, extends the browser check,
   runs everything and writes "Notes for review" into the brief.
5. **Review**: a separate agent that did none of the work checks the result against
   the brief and these rules, runs every check, and reports. It does not fix.

A workflow leaves its changes **uncommitted**. Read the review, fix what you agree
with, then commit. To use a different model for the agents, pass it as an argument:
"run the fill-m2-monitor workflow with args {model: 'opus'}".

**Without workflows**: open the brief and say "implement docs/briefs/M2-monitor.md".

## Rules for every milestone

1. **Contracts are fixed.** Do not change `registry.py`, `models/design.py`,
   `models/clinical.py`, `news2.py`, `patching.py`, `schema.sql` or the route
   signatures to make something easier. If a contract is wrong, stop and write
   what is wrong and why in the milestone's "Notes for review"; a contract change
   is a deliberate, separate commit that also runs `make types`.
2. **Done means the acceptance tests pass with their `@todo` line removed.**
   `backend/tests/test_m*_*.py` hold the acceptance tests. They are marked as
   strict expected failures; a test that passes while still marked fails the run.
   Do not weaken, skip or delete a test. If a test is wrong, fix it and say why in
   the notes.
3. **The design only changes how things look.** No frontend component may hard-code
   a colour, a parameter list or a menu: read them from the design and the registry.
   Style with the CSS variables from `frontend/src/design/theme.ts`.
4. **Two touches.** Every function is reachable in at most two touches from the tab
   bar. Anything tappable is at least `var(--touch)` (48 px minimum) high and wide.
5. **Nothing simulated may look real.** Scenario data, synthetic waveforms, scripted
   findings and placeholder forecasts carry a visible SIMULATED / PLACEHOLDER badge,
   driven by `Patient.simulated`, `SourceInfo.simulated` and `ModelInfo.placeholder`.
6. **Time comes from `app.clock.now()`** on the backend so tests can move it.
7. **No patient data in redesign prompts.** No secrets in responses, logs or errors.
8. **Checks before finishing:** `make test`, then `make serve` and `make e2e` with the
   milestone's browser checks added to `frontend/e2e/smoke.cjs`.
9. **One commit per milestone** on the working branch, message starting `M2:` etc.
   Append a short "Notes for review" section to the brief: what was built, anything
   left out, any contract or test that needed changing and why.

10. **Safety states are not optional** (`docs/human-factors.md`). Every number goes
    through `<Numeric>`; never render a blank or `--`. Never show a value unless its
    signal state is `ok` or `poor-signal`. Never raise a patient alarm from missing
    data. Do not add a way to hide the paused banner, technical alarms or device
    warnings.

## Things that need a person

- **API tokens.** Claude and ELM calls are only tested against mocked responses.
  After M5, enter tokens in Settings > API tokens and try a real redesign request.
- **Codes marked provisional** in `registry.py` (NEWS2 and ACVPU SNOMED codes, body
  position, all lab LOINC codes and critical limits) must be checked against a
  terminology server and your laboratory's ranges before any real integration (M8).
- **MIMIC column names** in `backend/tests/test_m6_epr.py` were written from the
  published schema, not from the downloaded files. `make mimic` in M6 is the check.
- **ANNE One.** The adapter is a documented stub until Sibel SDK or SDC access exists.
- **The causal model.** Everything is a placeholder until a provider implementing
  `docs/causal-model-contract.md` is connected.
