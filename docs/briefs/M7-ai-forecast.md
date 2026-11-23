# M7: AI findings, explanations, forecasts and certainty

Read `docs/HANDOFF.md` and `docs/causal-model-contract.md` first. Needs M2, M3, M5, M6.
Acceptance tests: `backend/tests/test_m7_ai_forecast.py`.

## Goal

The monitor says what it thinks is happening, how sure it is, and why, and shows
what it expects next, in several display styles that clinicians can switch between
in the design studio. Everything here is a labelled placeholder until the causal
model is connected; the point of this milestone is the interface and the contract.

## Backend

| File | Build |
|---|---|
| `app/ai/certainty.py` | One builder per registry metric, normalised as documented in the module. |
| `app/ai/interpretation.py` | `ScenarioInterpretation`, `RuleInterpretation`, `describe_resolved`. |
| `app/ai/forecaster.py` | `PlaceholderForecaster`, `HttpCausalModelProvider`. |
| `app/routers/findings.py`, `predictions.py` | The stubbed routes. |
| stream | Send `FindingsMessage` when findings change. |

Findings:

- From scenario ground truth: rhythm spans become rhythm findings on the ECG row
  (`af`, `svt`, `vt`); active while in the span, then resolved with `offset` so the
  summary reads "Last run of AF 2 h 14 min ago". Waveform evidence marks the
  features ("No P waves", "Irregular R-R", "Wide QRS") on the strip and includes a
  baseline strip from the same patient in sinus rhythm.
- Other scripted findings: desaturation episodes, fall, lab trends across the
  admission (`wcc-rising`, `crp-rising`, `creat-rising`), critical labs
  (`k-critical`), imaging change (comparison of the two studies with regions).
- `RuleInterpretation` produces the lab and vital-sign findings for MIMIC patients
  with simple, stated rules. No rhythm claims for MIMIC patients (their waveforms
  are synthetic).
- Every finding has certainty values, a plain explanation, provenance
  (`ModelInfo`, `generated_at`) and `placeholder: true`.
- `ask`: sends the one finding and a summary of its evidence, without patient
  identifiers, to the configured LLM; the answer is returned as `generated: true`.
  Where the endpoint supports it, attach `self_consistency` or `token_logprob`.

Forecasts (see the class docstring for the placeholder's method):

- Per parameter and for NEWS2: points per horizon with nested 50/80/95 intervals
  that widen with horizon; NEWS2 values derived by scoring the forecast vitals.
- NEWS band probabilities per horizon and minutes to the threshold.
- Events from `registry.EVENT_TYPES` with probability, expected time and spread.
- Contributors and suggested causes from the scenario's `forecast_story`; for
  MIMIC patients, from which inputs are trending (stated as such, not as causes).
- `what_if`: a second forecast per parameter using the scenario's `what_if` effect.
- Every metric in the registry is emitted with simulated values so each display
  option can be demonstrated; `ModelInfo.placeholder` is true.

## Frontend

All of these read `design.forecast`, `design.ai` and the row toggles.

| Option | Build |
|---|---|
| Row chips | `src/widgets/AiChip.tsx` on rows with `show_ai`: label plus certainty in the chosen display, highlighted per `ai.highlight_style`; resolved text when `ai.show_resolved`. Tap opens `finding-explain`. |
| Explain sheet | `src/studio/FindingExplainSheet.tsx`: the evidence drawn (ECG strip with marks beside the baseline strip; lab chart with range and baselines; image with regions and previous study), certainty with the metric named and what it means, model and time, and the question box. |
| N1, N2, N3 | Future NEWS as value and range; as band probabilities bar; as time to threshold. In the forecast panel and optionally the top bar `news2` field. |
| T1 to T4 | Dashed continuation on row trends and the NEWS2 chart from the "now" line: line only; line with fan; fading dashes; ghost columns. |
| T5 | What-if pair as two dashed lines with a legend. |
| E1 to E4 | Event cards; timeline strip with whiskers (`events-timeline` widget); row chips; threshold text. |
| Certainty displays | `src/widgets/Certainty.tsx`: percent, natural frequency, interval, badge, bars, opacity, dash density. One component used everywhere. Hide anything below `min_to_show`. |
| Studio | `src/studio/ForecastSheet.tsx` (`studio-forecast`): every option above, the certainty metric pickers grouped as in the registry with their "tells you" text, thresholds. `ForecastHorizonSheet.tsx`. |
| Panels | `ai-summary` and `forecast-panel` widgets, with contributors ("why") and suggested causes. |

Forecast colour is `--c-forecast`; never reuse NEWS band colours for certainty.
A PLACEHOLDER badge shows wherever placeholder output is on screen.

## Done when

- All `@todo("M7")` tests pass with the decorator removed; `make test` is green.
- Browser checks added: `scn-af` shows "Last run of AF" on the ECG row, and after
  seeking to minute 20 an active AF chip; the explain sheet shows two strips;
  `scn-pneumonia` shows a future NEWS number above the current one; switching
  `forecast.trend` and `certainty.display` in the studio changes the screen;
  the placeholder badge is visible.
- Screenshots of each of N1 to N3, T1 to T5, E1 to E4 and each certainty display,
  saved under `frontend/e2e/screenshots/` for the workshop pack.
