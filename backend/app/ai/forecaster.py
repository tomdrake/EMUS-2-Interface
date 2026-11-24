"""Prediction provider contract and the placeholder forecaster (milestone M7).

The real causal model plugs in by implementing ``PredictionProvider`` (in process)
or by serving the HTTP contract in docs/causal-model-contract.md, which
``HttpCausalModelProvider`` consumes. The UI is identical either way.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

from app.models.clinical import ForecastBundle, ModelInfo

M = "M7"


class PredictionProvider(ABC):
    @abstractmethod
    def model_info(self) -> ModelInfo: ...

    @abstractmethod
    def forecast(self, patient_id: str, now: datetime, *,
                 horizons_min: list[int],
                 parameters: list[str],
                 news_threshold: int = 5,
                 include_what_if: bool = False) -> ForecastBundle:
        """Return, for each requested parameter (and 'news2'):
          * a 'baseline' Forecast with one point per horizon and 50/80/95 intervals;
          * if ``include_what_if``, a second Forecast with a different ``scenario``;
          * NEWS2 band probabilities per horizon and minutes to ``news_threshold``;
          * EventPrediction objects for registry.EVENT_TYPES that are plausible;
          * a CertaintyValue for every metric in ``model_info().supported_certainty``
            on each forecast and event.
        """


class PlaceholderForecaster(PredictionProvider):
    """Stand-in until the causal model is connected. ``placeholder=True``.

    Scenario patients: looks ahead in the scenario script (sources.simulator.
    scenario_values) with noise, widening intervals with horizon, and reports the
    scenario's ``forecast_story`` as contributors, causes and what-if.
    MIMIC patients: uses the recorded future of the stay the same way.
    Anything else: damped linear trend of the last 60 minutes.

    Emits every certainty metric in the registry with simulated values so the
    design studio can demonstrate each option. See ai/certainty.py.
    """

    def model_info(self) -> ModelInfo:
        raise NotImplementedError(M)

    def forecast(self, patient_id, now, *, horizons_min, parameters, news_threshold=5,
                 include_what_if=False) -> ForecastBundle:
        raise NotImplementedError(M)


class HttpCausalModelProvider(PredictionProvider):
    """Calls an external model service. Configure with setting 'causal_model_url'."""

    def __init__(self, base_url: str, *, timeout_s: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s

    def model_info(self) -> ModelInfo:
        raise NotImplementedError(M)

    def forecast(self, patient_id, now, *, horizons_min, parameters, news_threshold=5,
                 include_what_if=False) -> ForecastBundle:
        raise NotImplementedError(M)
