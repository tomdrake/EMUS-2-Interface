"""Scenario simulator (milestone M2). See docs/briefs/M2-monitor.md.

Plays ``app.scenarios.SCENARIOS`` in real time:
  * numerics: linear interpolation between scenario segments + physiological noise;
  * waveforms: synthetic ECG / pleth / resp for the rhythm in force
    (sinus, af, svt, vt, brady, pause) at the registry sample rates;
  * charted observation sets every ``obs_interval_min``, scored with app.news2;
  * activity, position, sleep, fall events, oxygen steps.

Must be deterministic for a given (scenario, seed) so screenshots and tests are stable.
"""

from __future__ import annotations

from datetime import datetime
from typing import AsyncIterator

from app.models.clinical import ObservationSet, OxygenTherapy, Patient, StreamMessage
from app.sources.base import DeviceSource, SourceInfo

M = "M2"


def synth_ecg(rhythm: str, hr: float, hz: float, n: int, t0: float, seed: int = 0) -> list[float]:
    """Return ``n`` ECG samples (mV) starting at phase time ``t0`` seconds.

    sinus/brady: P-QRS-T with regular RR.  af: no P waves, fibrillatory baseline,
    irregularly irregular RR.  svt: narrow complex, regular, P hidden.
    vt: wide complex, regular, ~180/min.  pause: flat line.
    """
    raise NotImplementedError(M)


def synth_pleth(pulse: float, spo2: float, hz: float, n: int, t0: float) -> list[float]:
    raise NotImplementedError(M)


def synth_resp(rr: float, hz: float, n: int, t0: float) -> list[float]:
    raise NotImplementedError(M)


def scenario_values(scenario_id: str, at_min: float) -> dict:
    """Noise-free interpolated vitals, rhythm, oxygen and state at a scenario time.

    Also used by the placeholder forecaster to look ahead. Pure function.
    """
    raise NotImplementedError(M)


class SimulatorSource(DeviceSource):
    def __init__(self, scenario_id: str, *, seed: int = 0, started_at: datetime | None = None):
        self.scenario_id = scenario_id
        self.seed = seed
        self.started_at = started_at

    def info(self) -> SourceInfo:
        raise NotImplementedError(M)

    def patient(self) -> Patient:
        raise NotImplementedError(M)

    def stream(self) -> AsyncIterator[StreamMessage]:
        raise NotImplementedError(M)

    def history(self, parameter, start, end, max_points=600):
        raise NotImplementedError(M)

    def observation_sets(self, start, end) -> list[ObservationSet]:
        raise NotImplementedError(M)

    def oxygen(self, at) -> OxygenTherapy | None:
        raise NotImplementedError(M)
