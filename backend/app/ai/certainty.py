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

from app.models.clinical import CertaintyValue

M = "M7"


def build(metric: str, **raw) -> CertaintyValue:
    """Dispatch to the metric's builder. Raises KeyError for unknown metrics."""
    raise NotImplementedError(M)


def badge(score: float, medium_at: float, high_at: float) -> str:
    """'low' | 'medium' | 'high' for the visual token display."""
    raise NotImplementedError(M)


def natural_frequency(p: float, denominator: int = 10) -> str:
    """0.62 -> '6 in 10'."""
    raise NotImplementedError(M)


def token_logprob_score(logprobs: list[float]) -> float:
    """Geometric-mean token probability of an answer span."""
    raise NotImplementedError(M)
