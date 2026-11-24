"""Certainty metrics: normalising each metric to a 0-1 score and a clinician phrase.

Every metric in ``registry.CERTAINTY_METRICS`` gets one builder here. ``score`` is
always 'higher = more certain' so any display (percent, badge, bars, opacity,
dash density) can be driven by any metric. Milestone M7.

Normalisation rules (to implement and unit-test):
  prediction_interval / conformal_interval / posterior_interval
      score = 1 - clamp(width_80 / reference_width)  where reference_width is the
      parameter's clinically meaningful span (e.g. NEWS2: 6 points, HR: 40 bpm).
      text  = '5 to 8' (the 80% interval, rounded to the parameter's decimals).
  ensemble_disagreement      score = 1 - clamp(sd / reference_sd);  text = 'runs agree closely'
  calibrated_probability     score = p;  text = '62%'
  ppv_natural_frequency      score = ppv;  text = '6 in 10'
  time_to_event              score = 1 - clamp(iqr_min / horizon_min);  text = 'in 2 to 5 h'
  input_quality              score = fraction of expected samples present and artefact-free
  population_similarity      score = similarity percentile
  horizon_decay              score = exp(-horizon_min / tau)
  sensitivity                score = 1 - fraction of perturbations that change the band
  evidence_agreement         score = agreeing signals / signals considered;  text = '4 of 5 signals'
  token_logprob              score = exp(mean token logprob) of the answer span
  self_consistency           score = share of samples giving the modal answer;  text = '4 of 5 runs'
  semantic_entropy           score = 1 - entropy / log(n_clusters_max)
  verbalised_confidence      score = stated confidence / 100
"""

from __future__ import annotations

import math
from typing import Callable

from app import registry
from app.models.clinical import CertaintyValue


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return lo if x < lo else hi if x > hi else x


def _round(x: float, decimals: int = 0) -> str:
    v = round(x, decimals)
    return str(int(v)) if decimals == 0 or float(v).is_integer() else f"{v:.{decimals}f}"


def badge(score: float, medium_at: float, high_at: float) -> str:
    """'low' | 'medium' | 'high' for the visual token display."""
    return "high" if score >= high_at else "medium" if score >= medium_at else "low"


def natural_frequency(p: float, denominator: int = 10) -> str:
    """0.62 -> '6 in 10'."""
    return f"{round(_clamp(p) * denominator)} in {denominator}"


def token_logprob_score(logprobs: list[float]) -> float:
    """Geometric-mean token probability of an answer span."""
    if not logprobs:
        return 0.0
    return _clamp(math.exp(sum(logprobs) / len(logprobs)))


def _hours(minutes: float) -> str:
    return f"{minutes / 60:.0f} h" if minutes >= 90 else f"{minutes:.0f} min"


def _interval(metric: str, *, lo: float, hi: float, reference_width: float,
              decimals: int = 0, coverage: float | None = None) -> CertaintyValue:
    width = max(hi - lo, 0.0)
    return CertaintyValue(metric=metric, score=round(1 - _clamp(width / reference_width), 3),
                          text=f"{_round(lo, decimals)} to {_round(hi, decimals)}",
                          raw={"lo": lo, "hi": hi, "width": width, "reference_width": reference_width,
                               **({"coverage": coverage} if coverage is not None else {})})


def _ensemble(*, sd: float, reference_sd: float) -> CertaintyValue:
    score = 1 - _clamp(sd / reference_sd)
    text = ("runs agree closely" if score >= 0.8 else "runs mostly agree" if score >= 0.5
            else "runs disagree")
    return CertaintyValue(metric="ensemble_disagreement", score=round(score, 3), text=text,
                          raw={"sd": sd, "reference_sd": reference_sd})


def _calibrated(*, p: float) -> CertaintyValue:
    return CertaintyValue(metric="calibrated_probability", score=round(_clamp(p), 3),
                          text=f"{round(_clamp(p) * 100)}%", raw={"p": p})


def _ppv(*, ppv: float, denominator: int = 10) -> CertaintyValue:
    return CertaintyValue(metric="ppv_natural_frequency", score=round(_clamp(ppv), 3),
                          text=natural_frequency(ppv, denominator), raw={"ppv": ppv})


def _time_to_event(*, q25_min: float, median_min: float, q75_min: float,
                   horizon_min: float) -> CertaintyValue:
    score = 1 - _clamp((q75_min - q25_min) / horizon_min)
    return CertaintyValue(metric="time_to_event", score=round(score, 3),
                          text=f"in {_hours(q25_min)} to {_hours(q75_min)}",
                          raw={"q25_min": q25_min, "median_min": median_min, "q75_min": q75_min,
                               "horizon_min": horizon_min})


def _input_quality(*, present: float) -> CertaintyValue:
    return CertaintyValue(metric="input_quality", score=round(_clamp(present), 3),
                          text=f"{round(_clamp(present) * 100)}% of expected data, artefact-free",
                          raw={"present": present})


def _similarity(*, percentile: float) -> CertaintyValue:
    return CertaintyValue(metric="population_similarity", score=round(_clamp(percentile), 3),
                          text=f"{round(_clamp(percentile) * 100)}th percentile similarity",
                          raw={"percentile": percentile})


def _horizon(*, horizon_min: float, tau_min: float) -> CertaintyValue:
    return CertaintyValue(metric="horizon_decay", score=round(math.exp(-horizon_min / tau_min), 3),
                          text=f"{_hours(horizon_min)} ahead",
                          raw={"horizon_min": horizon_min, "tau_min": tau_min})


def _sensitivity(*, flipped: int, perturbations: int) -> CertaintyValue:
    return CertaintyValue(metric="sensitivity",
                          score=round(1 - flipped / perturbations, 3) if perturbations else 0.0,
                          text=f"{perturbations - flipped} of {perturbations} small changes keep it",
                          raw={"flipped": flipped, "perturbations": perturbations})


def _agreement(*, agreeing: int, considered: int) -> CertaintyValue:
    return CertaintyValue(metric="evidence_agreement",
                          score=round(agreeing / considered, 3) if considered else 0.0,
                          text=f"{agreeing} of {considered} signals",
                          raw={"agreeing": agreeing, "considered": considered})


def _token(*, logprobs: list[float]) -> CertaintyValue:
    score = token_logprob_score(logprobs)
    return CertaintyValue(metric="token_logprob", score=round(score, 3),
                          text=f"{round(score * 100)}% token probability", raw={"logprobs": logprobs})


def _self_consistency(*, modal: int, samples: int) -> CertaintyValue:
    return CertaintyValue(metric="self_consistency",
                          score=round(modal / samples, 3) if samples else 0.0,
                          text=f"{modal} of {samples} runs", raw={"modal": modal, "samples": samples})


def _semantic_entropy(*, entropy: float, max_entropy: float) -> CertaintyValue:
    score = 1 - _clamp(entropy / max_entropy) if max_entropy > 0 else 0.0
    return CertaintyValue(metric="semantic_entropy", score=round(score, 3),
                          text="answers mean the same" if score >= 0.7 else "answers differ in meaning",
                          raw={"entropy": entropy, "max_entropy": max_entropy})


def _verbalised(*, stated_pct: float) -> CertaintyValue:
    return CertaintyValue(metric="verbalised_confidence", score=round(_clamp(stated_pct / 100), 3),
                          text=f"says {round(stated_pct)}% sure", raw={"stated_pct": stated_pct})


_BUILDERS: dict[str, Callable[..., CertaintyValue]] = {
    "prediction_interval": lambda **r: _interval("prediction_interval", **r),
    "conformal_interval": lambda **r: _interval("conformal_interval", **r),
    "posterior_interval": lambda **r: _interval("posterior_interval", **r),
    "ensemble_disagreement": _ensemble,
    "calibrated_probability": _calibrated,
    "ppv_natural_frequency": _ppv,
    "time_to_event": _time_to_event,
    "input_quality": _input_quality,
    "population_similarity": _similarity,
    "horizon_decay": _horizon,
    "sensitivity": _sensitivity,
    "evidence_agreement": _agreement,
    "token_logprob": _token,
    "self_consistency": _self_consistency,
    "semantic_entropy": _semantic_entropy,
    "verbalised_confidence": _verbalised,
}
assert set(_BUILDERS) == set(registry.CERTAINTY_METRIC_IDS), "a registry metric has no builder"


def build(metric: str, **raw) -> CertaintyValue:
    """Dispatch to the metric's builder. Raises KeyError for unknown metrics."""
    return _BUILDERS[metric](**raw)
