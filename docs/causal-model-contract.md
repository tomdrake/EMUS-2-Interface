# Connecting the causal model

The monitor does not care how predictions are made. It asks a **prediction
provider** for a `ForecastBundle` and draws whatever comes back. Connect the
causal model in either of two ways:

1. **In process**: subclass `PredictionProvider` in `backend/app/ai/forecaster.py`.
2. **Over HTTP**: serve the two endpoints below and set the setting
   `causal_model_url`; `HttpCausalModelProvider` calls them.

The shapes are the Pydantic models in `backend/app/models/clinical.py`
(`ForecastBundle`, `Forecast`, `ForecastPoint`, `EventPrediction`, `Contributor`,
`SuggestedCause`, `CertaintyValue`, `ModelInfo`). Those models are the contract;
this page explains them.

## Endpoints

`GET {base}/model` returns `ModelInfo`:

```json
{
  "name": "emus-causal", "version": "0.3.1", "placeholder": false,
  "description": "Structural causal model trained on ...",
  "supported_certainty": ["conformal_interval", "calibrated_probability",
                          "ppv_natural_frequency", "input_quality", "sensitivity"]
}
```

`POST {base}/forecast` with:

```json
{
  "patient_id": "…",
  "now": "2026-11-23T12:00:00Z",
  "horizons_min": [60, 120, 240, 360],
  "parameters": ["news2", "hr", "rr", "spo2", "bp_sys", "temp"],
  "news_threshold": 5,
  "include_what_if": true,
  "inputs": {
    "observations": [{"parameter": "rr", "at": "…", "value": 22}],
    "oxygen": [{"at": "…", "flow_l_min": 2, "device": "N"}],
    "labs": [{"test": "crp", "collected_at": "…", "value": 231}],
    "spo2_scale": 1
  }
}
```

and returns a `ForecastBundle`.

## What to return

**Forecasts.** One per requested parameter with `scenario: "baseline"`. Each has a
point per horizon with the expected value and intervals keyed `"50"`, `"80"`,
`"95"` as `[low, high]`. Return the levels you can support; the display uses what
is there. For `news2`, return the expected aggregate score.

**What-if forecasts** (optional). Additional forecasts for the same parameter with
a different `scenario` id and a short `scenario_label` such as "Oxygen increased
now". This is where an interventional model shows what it can do that a
correlational one cannot.

**NEWS band probabilities** per horizon (`low`, `medium`, `high`, summing to 1) and
`minutes_to_news_threshold` keyed by the threshold as a string, `null` when no
crossing is expected.

**Events.** For each plausible event in `registry.EVENT_TYPES`: probability within
the horizon, and where possible `expected_at` with `earliest_at` / `latest_at`.

**Why.** `contributors`: a factor in plain words, the parameter it relates to,
whether it raises or lowers the prediction, and a weight (shares summing to about
1). `suggested_causes`: label, probability, one-line rationale. These are shown to
clinicians verbatim, so write them as you would say them.

**Certainty.** For each forecast and event, a `CertaintyValue` for every metric you
list in `supported_certainty`:

```json
{"metric": "conformal_interval", "score": 0.62, "text": "5 to 8",
 "raw": {"lo": 5, "hi": 8, "coverage": 0.9}}
```

`score` is 0 to 1 with 1 most certain, whatever the metric. `text` is the phrase a
clinician reads. `raw` carries native values for the explanation view. The
normalisation used by the placeholder is documented in
`backend/app/ai/certainty.py`; use the same so displays stay comparable. The full
menu of metrics is in `docs/forecast-options.md`.

**Honesty flags.** Set `placeholder: false` only for a real model. If a forecast
could not be made for a parameter, omit it; do not send a guess.

## Mapping to FHIR

Event predictions are exposed as `RiskAssessment` resources and findings as
Observations (milestone M8). Nothing extra is needed from the model for that.
