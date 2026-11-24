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


# ------------------------------------------------------------------ the chart's bands

def _b(label: str, score: int, low: float | None, high: float | None, **extra) -> dict:
    """One row of the printed chart: its label, its score, and the values that fall in it (inclusive)."""
    return {"label": label, "score": score, "low": low, "high": high, **extra}


#: The rows of the RCP NEWS2 chart, top to bottom, for drawing it. Each parameter lists its bands with the
#: score of each; the tests walk every band and check the scoring functions above agree.
NEWS2_BANDS: dict[str, list[dict]] = {
    "rr": [_b("≥25", 3, 25, None), _b("21–24", 2, 21, 24), _b("18–20", 0, 18, 20), _b("15–17", 0, 15, 17),
           _b("12–14", 0, 12, 14), _b("9–11", 1, 9, 11), _b("≤8", 3, None, 8)],
    "spo2_1": [_b("≥96", 0, 96, None), _b("94–95", 1, 94, 95), _b("92–93", 2, 92, 93), _b("≤91", 3, None, 91)],
    #: Scale 2 (target 88 to 92 %, only under clinician direction). Rows marked ``oxygen`` apply to a patient on oxygen.
    "spo2_2": [_b("≥97 on O2", 3, 97, None, oxygen=True), _b("95–96 on O2", 2, 95, 96, oxygen=True),
               _b("93–94 on O2", 1, 93, 94, oxygen=True), _b("≥93 on air", 0, 93, None, oxygen=False),
               _b("88–92", 0, 88, 92), _b("86–87", 1, 86, 87), _b("84–85", 2, 84, 85), _b("≤83", 3, None, 83)],
    #: Air, oxygen litres per minute, and the delivery device (a code, never scored).
    "o2_flow": [_b("A=Air", 0, None, 0), _b("O2 L/min", 2, 0.01, None), _b("Device", 0, None, None)],
    "bp_sys": [_b("≥220", 3, 220, None), _b("201–219", 0, 201, 219), _b("181–200", 0, 181, 200), _b("161–180", 0, 161, 180),
               _b("141–160", 0, 141, 160), _b("121–140", 0, 121, 140), _b("111–120", 0, 111, 120),
               _b("101–110", 1, 101, 110), _b("91–100", 2, 91, 100), _b("81–90", 3, 81, 90), _b("71–80", 3, 71, 80),
               _b("61–70", 3, 61, 70), _b("51–60", 3, 51, 60), _b("≤50", 3, None, 50)],
    "hr": [_b("≥131", 3, 131, None), _b("121–130", 2, 121, 130), _b("111–120", 2, 111, 120), _b("101–110", 1, 101, 110),
           _b("91–100", 1, 91, 100), _b("81–90", 0, 81, 90), _b("71–80", 0, 71, 80), _b("61–70", 0, 61, 70),
           _b("51–60", 0, 51, 60), _b("41–50", 1, 41, 50), _b("31–40", 3, 31, 40), _b("≤30", 3, None, 30)],
    "acvpu": [_b("Alert", 0, None, None, level="A"), _b("Confusion", 3, None, None, level="C"),
              _b("V", 3, None, None, level="V"), _b("P", 3, None, None, level="P"), _b("U", 3, None, None, level="U")],
    "temp": [_b("≥39.1°", 2, 39.1, None), _b("38.1–39.0°", 1, 38.1, 39.0), _b("37.1–38.0°", 0, 37.1, 38.0),
             _b("36.1–37.0°", 0, 36.1, 37.0), _b("35.1–36.0°", 1, 35.1, 36.0), _b("≤35.0°", 3, None, 35.0)],
}


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
