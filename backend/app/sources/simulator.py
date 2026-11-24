"""Scenario simulator (milestone M2). See docs/briefs/M2-monitor.md.

Plays ``app.scenarios.SCENARIOS`` in real time:
  * numerics: linear interpolation between scenario segments + physiological noise;
  * waveforms: synthetic ECG / pleth / resp for the rhythm in force
    (sinus, af, svt, vt, brady, pause) at the registry sample rates;
  * charted observation sets every ``obs_interval_min``, scored with app.news2;
  * activity, position, sleep, fall events, oxygen steps;
  * devices with battery drain and link state, scripted and injected faults
    (registry.DEMO_FAULTS): noise and movement are added to the synthetic waveform
    so that app.signal_quality grades it honestly rather than being told the answer.

Must be deterministic for a given (scenario, seed) so screenshots and tests are stable.
"""

from __future__ import annotations

import math
import random
from datetime import datetime
from typing import AsyncIterator

from app import registry
from app.scenarios import SCENARIOS
from app.models.clinical import ObservationSet, OxygenTherapy, Patient, StreamMessage
from app.sources.base import DeviceSource, SourceInfo

M = "M2"


def _rng(seed: int, *salt) -> random.Random:
    return random.Random(f"{seed}:{':'.join(str(x) for x in salt)}")


def _gauss(x: float, mu: float, sigma: float) -> float:
    return math.exp(-0.5 * ((x - mu) / sigma) ** 2)


def _beat(phase: float, rr_s: float, kind: str) -> float:
    """One ECG cycle at ``phase`` seconds after the previous R peak's start (mV).

    Shapes are schematic: enough to show P, QRS and T for sinus rhythm, narrow
    complexes for SVT and wide ones for VT. Not a physiological model.
    """
    if kind == "vt":
        # Wide, tall, slurred complex with a broad opposite-polarity T.
        return 1.1 * _gauss(phase, 0.12, 0.06) - 0.45 * _gauss(phase, 0.26, 0.07)
    p_wave = 0.12 * _gauss(phase, 0.0, 0.025) if kind in ("sinus", "brady") else 0.0
    base = rr_s * 0.12 if kind in ("sinus", "brady") else 0.0
    # Measure from the P wave start: P at 0, QRS about 0.16 s later, T about 0.34 s later.
    q = -0.12 * _gauss(phase, 0.145, 0.008)
    r = 1.0 * _gauss(phase, 0.165, 0.011)
    s_ = -0.22 * _gauss(phase, 0.185, 0.010)
    t = 0.28 * _gauss(phase, 0.38 if kind != "svt" else 0.30, 0.055)
    return p_wave + q + r + s_ + t + 0.0 * base


def _r_times(rhythm: str, hr: float, t_start: float, t_end: float, seed: int) -> list[float]:
    """R-peak times (seconds, absolute) in and just around [t_start, t_end].

    Beat ``k`` sits at ``k * mean_rr`` plus a jitter that depends only on ``k``, so any
    stretch of time, including negative time, is computed directly and consecutive
    chunks join without a seam. AF jitters widely (irregularly irregular), other
    rhythms very little.
    """
    mean_rr = 60.0 / max(hr, 1.0)
    spread = 0.45 if rhythm == "af" else 0.03
    k0 = math.floor((t_start - 1.5) / mean_rr)
    k1 = math.ceil((t_end + 1.5) / mean_rr)
    return [k * mean_rr + (_rng(seed, "beat", k).random() - 0.5) * spread * mean_rr
            for k in range(k0, k1 + 1)]


def synth_ecg(rhythm: str, hr: float, hz: float, n: int, t0: float, seed: int = 0) -> list[float]:
    """Return ``n`` ECG samples (mV) starting at phase time ``t0`` seconds.

    sinus/brady: P-QRS-T with regular RR.  af: no P waves, fibrillatory baseline,
    irregularly irregular RR.  svt: narrow complex, regular, P hidden.
    vt: wide complex, regular, ~180/min.  pause: flat line.
    """
    if rhythm not in registry.RHYTHM_LABELS:
        raise KeyError(rhythm)
    if rhythm == "pause":
        return [0.0] * n
    if rhythm == "vt":
        hr = 180.0
    t_end = t0 + n / hz
    beats = _r_times(rhythm, hr, t0, t_end, seed)
    kind = "sinus" if rhythm == "brady" else rhythm
    out = [0.0] * n
    fib = _rng(seed, "fib")
    f1, f2 = 5.3 + 2 * fib.random(), 7.9 + 2 * fib.random()
    lead = 0.12 if kind == "vt" else 0.165
    rr_s = 60.0 / max(hr, 1.0)
    for b in beats:
        start = b - lead
        i0 = max(0, math.ceil((start - 0.05 - t0) * hz))
        i1 = min(n - 1, math.floor((start + 0.7 - t0) * hz))
        for i in range(i0, i1 + 1):
            out[i] += _beat(t0 + i / hz - start, rr_s, kind)
    for i in range(n):
        v = out[i]
        if kind == "af":
            t = t0 + i / hz
            v += 0.03 * math.sin(2 * math.pi * f1 * t) + 0.02 * math.sin(2 * math.pi * f2 * t)
        out[i] = round(v, 4)
    return out


def _pleth_shape(ph: float) -> float:
    return (math.exp(-((ph - 0.22) / 0.13) ** 2) + 0.35 * math.exp(-((ph - 0.5) / 0.1) ** 2) - 0.35)


_PLETH_MEAN = 2 * sum(_pleth_shape(i / 200) for i in range(200)) / 200


def synth_pleth(pulse: float, spo2: float, hz: float, n: int, t0: float) -> list[float]:
    """Photoplethysmogram: a rounded upstroke and a dicrotic notch, amplitude scaled by
    saturation only slightly (the device normalises it). Mean is near zero, range about +-1."""
    period = 60.0 / max(pulse, 1.0)
    out = []
    for i in range(n):
        ph = ((t0 + i / hz) % period) / period
        v = _pleth_shape(ph)
        out.append(round(2 * v - _PLETH_MEAN, 4))
    return out


def synth_resp(rr: float, hz: float, n: int, t0: float) -> list[float]:
    """Respiration (chest impedance): a slow, slightly asymmetric wave, range about +-1."""
    f = max(rr, 1.0) / 60.0
    out = []
    for i in range(n):
        x = 2 * math.pi * f * (t0 + i / hz)
        out.append(round(math.sin(x) + 0.18 * math.sin(2 * x + 0.6), 4))
    return out


def add_artefact(samples: list[float], kind: str, hz: float, t0: float, seed: int = 0) -> list[float]:
    """Return samples with a demo artefact added: 'noise' (broadband), 'motion'
    (noise plus large slow drift), 'low-perfusion' (amplitude scaled to ~10%),
    'sensor-off' (flat line). Deterministic for a given seed."""
    if kind not in ("noise", "motion", "low-perfusion", "sensor-off"):
        raise KeyError(kind)
    if kind == "sensor-off":
        return [0.0] * len(samples)
    rng = _rng(seed, "artefact", kind)
    if kind == "low-perfusion":
        mid = sum(samples) / len(samples) if samples else 0.0
        return [round(mid + 0.06 * (x - mid) + 0.002 * rng.gauss(0, 1), 4) for x in samples]
    out = []
    for i, x in enumerate(samples):
        t = t0 + i / hz
        v = x + (0.45 if kind == "motion" else 0.35) * rng.gauss(0, 1)
        if kind == "motion":
            v += 0.95 * math.sin(2 * math.pi * 0.35 * t) + 0.45 * math.sin(2 * math.pi * 0.9 * t + 1.0)
        out.append(round(v, 4))
    return out


_VITALS = ("hr", "rr", "spo2", "bp_sys", "bp_dia", "temp", "activity")


def scenario_values(scenario_id: str, at_min: float) -> dict:
    """Noise-free interpolated vitals, rhythm, oxygen and state at a scenario time.

    Also used by the placeholder forecaster to look ahead. Pure function.
    """
    sc = SCENARIOS[scenario_id]
    segs = sorted(sc["segments"], key=lambda s: s["at_min"])
    if at_min <= segs[0]["at_min"]:
        lo = hi = segs[0]
        frac = 0.0
    elif at_min >= segs[-1]["at_min"]:
        lo = hi = segs[-1]
        frac = 0.0
    else:
        for a, b in zip(segs, segs[1:]):
            if a["at_min"] <= at_min <= b["at_min"]:
                lo, hi = a, b
                frac = (at_min - a["at_min"]) / (b["at_min"] - a["at_min"])
                break
    out: dict = {}
    for k in _VITALS:
        if k in lo and k in hi:
            out[k] = lo[k] + (hi[k] - lo[k]) * frac
    # Coded values hold until the next segment is reached, like a charted observation.
    cur = lo if frac < 1.0 else hi
    out["position"] = cur.get("position", "upright")
    out["acvpu"] = cur.get("acvpu", "A")
    out["asleep"] = bool(cur.get("asleep", False))
    out["rhythm"] = "sinus"
    for span in sc["rhythms"]:
        if span["from_min"] <= at_min < span["to_min"]:
            out["rhythm"] = span["rhythm"]
    ox = sorted(sc["oxygen"], key=lambda o: o["at_min"])
    step = ox[0]
    for o in ox:
        if o["at_min"] <= at_min:
            step = o
    out["oxygen"] = {"flow_l_min": step["flow_l_min"], "device": step["device"]}
    out["at_min"] = at_min
    return out


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

    def devices(self):
        raise NotImplementedError(M)

    def signal_status(self):
        raise NotImplementedError(M)

    def signal_quality(self):
        raise NotImplementedError(M)

    def inject_fault(self, fault, *, device_id=None, seconds=None):
        raise NotImplementedError(M)

    def clear_faults(self):
        raise NotImplementedError(M)

    def history(self, parameter, start, end, max_points=600):
        raise NotImplementedError(M)

    def observation_sets(self, start, end) -> list[ObservationSet]:
        raise NotImplementedError(M)

    def oxygen(self, at) -> OxygenTherapy | None:
        raise NotImplementedError(M)
