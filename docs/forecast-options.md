# Forecast display options and certainty metrics

A menu to choose from with clinicians. Every option is a setting in the design
document under `forecast` (see `backend/app/models/design.py`), so each can be
switched on a live monitor from Settings > Forecast and certainty, or by asking
the redesign assistant, and compared side by side.

Until the causal model is connected, the values behind these displays come from a
placeholder forecaster and are badged PLACEHOLDER on screen.

## 1. Future NEWS as a number (`forecast.news_number`)

| Id | Setting | What the clinician sees | Good for | Watch for |
|---|---|---|---|---|
| N1 | `value-range` | "NEWS in 4 h: 7 (5 to 8)" with an arrow from the current score | A quick read at the bedside | A single number invites false precision; always show the range |
| N2 | `band-probabilities` | A bar split into low / medium / high risk with percentages | Seeing how likely escalation is, not just the most likely score | Three numbers take longer to read |
| N3 | `time-to-threshold` | "NEWS 5 or more expected in about 2 h 30" | Planning when to review | Says nothing when no crossing is expected; needs a clear "not expected" state |

Horizon: `forecast.horizons_min` (1, 2, 4, 6, 12 h), default `default_horizon_min`.
Threshold for N3: `forecast.news_threshold`.

## 2. Dashed expected trends (`forecast.trend`)

Drawn on each row's trend and on the NEWS2 chart, starting at a "now" marker.

| Id | Setting | What the clinician sees | Good for | Watch for |
|---|---|---|---|---|
| T1 | `dashed` | One dashed line for the expected course | Least clutter | Hides uncertainty unless certainty is shown elsewhere |
| T2 | `dashed-fan` | Dashed line with shaded bands (`fan_levels`: 50, 80, 95 %) | Showing uncertainty growing with time | Bands can hide the trace on small rows |
| T3 | `fading-dashes` | Dashes that fade and thin as certainty falls | Uncertainty without extra area | Faint lines are hard to see in bright rooms |
| T4 | `ghost-columns` | Hollow future columns and dots on the NEWS2 chart | Keeping the familiar chart layout | Must never be mistaken for recorded observations |
| T5 | `what_if: true` | Two dashed lines: "no change" and "with intervention" | The causal model's distinctive output: what an action is expected to do | Reads as a treatment recommendation; needs careful wording |

## 3. Event predictions (`forecast.events`, any combination)

| Id | Setting | What the clinician sees | Good for | Watch for |
|---|---|---|---|---|
| E1 | `cards` | A card per event: "AF within 4 h, 62 %" with reasons | Detail and explanation | Takes screen space |
| E2 | `timeline` | A strip from past into future with markers at expected times and whiskers for timing spread | Seeing order and timing at a glance | Needs a wide pane |
| E3 | `row-chips` | A chip on the row concerned (for example on SpO2) | Keeping the prediction next to the signal | Easy to overlook; can crowd rows |
| E4 | `threshold-text` | "SpO2 below 88 % likely by 03:10" | A concrete, checkable statement | Clock times age quickly |

Events available (`forecast.event_types`): NEWS2 5 or more, NEWS2 7 or more,
desaturation, hypotension, AF / tachyarrhythmia, oxygen escalation, suspected
sepsis, acute kidney injury, fall.

`forecast.certainty.min_to_show` hides predictions below a chosen certainty, to
explore the trade-off between early warning and alert fatigue.

## 4. Certainty metrics to choose from

The model returns a value for each metric it supports; the design picks which one
drives the display for forecasts (`certainty.metric`), events (`event_metric`) and
findings (`finding_metric`). Each is normalised to 0 to 1 (higher is more certain)
so any metric can drive any display.

| Group | Metric id | What it tells the clinician | Applies to | Needs from the model |
|---|---|---|---|---|
| Forecast spread | `prediction_interval` | The range the value is expected to fall in | Forecasts | Quantiles or a predictive distribution |
| | `conformal_interval` | The same, with a coverage guarantee checked on held-out patients | Forecasts | A calibration set and conformal wrapper |
| | `ensemble_disagreement` | How much repeated model runs disagree | Forecasts, events, findings | An ensemble or Monte Carlo dropout |
| | `posterior_interval` | The range from a Bayesian model's posterior | Forecasts | A Bayesian causal model |
| Event probability | `calibrated_probability` | The chance of the event within the horizon | Events, findings | Calibration on validation data |
| | `ppv_natural_frequency` | "6 of 10 patients flagged like this went on to have it" | Events, findings | Validation counts at the operating threshold |
| | `time_to_event` | Median and interquartile range of when it is expected | Events | A time-to-event distribution |
| Data behind it | `input_quality` | How much recent, artefact-free data fed the output | All | Signal quality and completeness |
| | `population_similarity` | Whether this patient resembles those the model learned from | All | An out-of-distribution score |
| | `horizon_decay` | Certainty falling the further ahead it looks | Forecasts, events | Nothing; computed from the horizon |
| Causal robustness | `sensitivity` | Whether small plausible changes to the inputs flip the output | Forecasts, events | Perturbation or sensitivity analysis |
| | `evidence_agreement` | How many independent signals point the same way | All | Per-signal attributions |
| Language model | `token_logprob` | Probability the language model gave its answer tokens | LLM answers, findings | An endpoint that returns log-probabilities |
| | `self_consistency` | Agreement across repeated samples of the same question | LLM answers, findings | Several samples; works with any LLM |
| | `semantic_entropy` | Spread of meaning across sampled answers | LLM answers | Several samples and a clustering step |
| | `verbalised_confidence` | The model's own stated confidence | LLM answers, findings | Nothing; weakest, tends to overstate |

Notes on the language-model metrics:

- Token probability is only available where the API returns log-probabilities.
  OpenAI-compatible gateways can (`logprobs`); whether ELM passes them through for
  a given model needs checking with a token (milestone M5). I do not believe
  Claude's API exposes them; that is to be confirmed in M5 against the current
  reference, and `self_consistency` is the fallback that works everywhere.
- These metrics describe how sure the language model is of its wording, not
  whether the clinical statement is true. They suit the "ask about this finding"
  answers, not the numeric forecasts.

## 5. Ways of showing certainty (`forecast.certainty.display`)

| Setting | Looks like | Notes |
|---|---|---|
| `percent` | 62 % | Familiar; can suggest more precision than exists |
| `natural-frequency` | 6 in 10 | Usually better understood than percentages |
| `interval` | 5 to 8 | For forecast values |
| `badge` | Low / Medium / High | The "token" display; cut-offs are `badge_medium_at`, `badge_high_at` |
| `bars` | One to four bars | Glanceable, like signal strength |
| `opacity` | Fainter when less certain | For lines and bands; pair with text for accessibility |
| `dash-density` | Sparser dashes when less certain | For T1 to T3 |

Certainty never uses the NEWS score colours, so "uncertain" cannot be read as "abnormal".

## Suggested starting point for the first workshop

N1 with T2 and E1 + E3, certainty as `natural-frequency` driven by
`conformal_interval` for forecasts and `ppv_natural_frequency` for events. Then
swap one thing at a time and ask what changed for the clinician.
