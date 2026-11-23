"""NEWS2 scoring (Royal College of Physicians, 2017).

Pure functions, no I/O. The thresholds below are the published NEWS2 chart; they
are covered row by row in ``backend/tests/test_news2.py``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Risk = Literal["low", "low-medium", "medium", "high"]
SpO2Scale = Literal[1, 2]


def score_rr(rr: float) -> int:
    if rr <= 8:
        return 3
    if rr <= 11:
        return 1
    if rr <= 20:
        return 0
    if rr <= 24:
        return 2
    return 3


def score_spo2(spo2: float, scale: SpO2Scale = 1, on_oxygen: bool = False) -> int:
    """Scale 1 is the default. Scale 2 is for a prescribed 88-92% target
    (hypercapnic respiratory failure) and only under clinician direction."""
    if scale == 1:
        if spo2 <= 91:
            return 3
        if spo2 <= 93:
            return 2
        if spo2 <= 95:
            return 1
        return 0
    # Scale 2
    if spo2 <= 83:
        return 3
    if spo2 <= 85:
        return 2
    if spo2 <= 87:
        return 1
    if spo2 <= 92 or not on_oxygen:
        return 0
    if spo2 <= 94:
        return 1
    if spo2 <= 96:
        return 2
    return 3


def score_oxygen(on_oxygen: bool) -> int:
    return 2 if on_oxygen else 0


def score_systolic(sys: float) -> int:
    if sys <= 90:
        return 3
    if sys <= 100:
        return 2
    if sys <= 110:
        return 1
    if sys <= 219:
        return 0
    return 3


def score_pulse(pulse: float) -> int:
    if pulse <= 40:
        return 3
    if pulse <= 50:
        return 1
    if pulse <= 90:
        return 0
    if pulse <= 110:
        return 1
    if pulse <= 130:
        return 2
    return 3


def score_consciousness(acvpu: str) -> int:
    """'A' scores 0; new Confusion, Voice, Pain, Unresponsive score 3."""
    level = acvpu.strip().upper()[:1]
    if level not in "ACVPU" or not level:
        raise ValueError(f"ACVPU must be one of A, C, V, P, U; got {acvpu!r}")
    return 0 if level == "A" else 3


def score_temperature(temp_c: float) -> int:
    t = round(temp_c, 1)
    if t <= 35.0:
        return 3
    if t <= 36.0:
        return 1
    if t <= 38.0:
        return 0
    if t <= 39.0:
        return 1
    return 2


@dataclass(frozen=True)
class News2Result:
    total: int
    risk: Risk
    #: Component scores keyed by registry parameter id ('o2_flow' = air-or-oxygen).
    components: dict[str, int]
    #: True when any single parameter scores 3 (the "red score").
    red_score: bool
    #: Minimum observation frequency in hours; 0 means continuous monitoring.
    monitoring_hours: float
    response: str
    #: Parameters that were missing; the total is then a partial score.
    missing: tuple[str, ...] = field(default_factory=tuple)

    @property
    def complete(self) -> bool:
        return not self.missing


_REQUIRED = ("rr", "spo2", "o2_flow", "bp_sys", "hr", "acvpu", "temp")


def news2(
    *,
    rr: float | None,
    spo2: float | None,
    on_oxygen: bool | None,
    bp_sys: float | None,
    pulse: float | None,
    acvpu: str | None,
    temp: float | None,
    spo2_scale: SpO2Scale = 1,
) -> News2Result:
    """Aggregate NEWS2. Missing inputs are reported in ``missing`` and score 0,
    so callers must check ``complete`` before presenting a total as definitive."""
    components: dict[str, int] = {}
    missing: list[str] = []

    def put(key: str, value, fn) -> None:
        if value is None:
            missing.append(key)
        else:
            components[key] = fn(value)

    put("rr", rr, score_rr)
    if spo2 is None:
        missing.append("spo2")
    else:
        components["spo2"] = score_spo2(spo2, spo2_scale, bool(on_oxygen))
    put("o2_flow", on_oxygen, score_oxygen)
    put("bp_sys", bp_sys, score_systolic)
    put("hr", pulse, score_pulse)
    put("acvpu", acvpu, score_consciousness)
    put("temp", temp, score_temperature)

    total = sum(components.values())
    red = any(v == 3 for v in components.values())
    risk, hours, response = classify(total, red)
    return News2Result(total, risk, components, red, hours, response,
                       tuple(k for k in _REQUIRED if k in missing))


def classify(total: int, red_score: bool) -> tuple[Risk, float, str]:
    """Clinical risk band, minimum monitoring frequency (hours) and response."""
    if total >= 7:
        return "high", 0, "Emergency assessment by a team with critical care competencies"
    if total >= 5:
        return "medium", 1, "Urgent review by a clinician competent in acute illness"
    if red_score:
        return "low-medium", 1, "Urgent ward-based review (single parameter scoring 3)"
    if total >= 1:
        return "low", 4, "Assessment by a registered nurse"
    return "low", 12, "Continue routine monitoring"
