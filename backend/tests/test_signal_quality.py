"""Trace-quality heuristic on synthetic signals with known problems."""

import math
import random

import pytest

from app import registry
from app.signal_quality import assess, worst

ECG_HZ = registry.WAVEFORMS["ecg"]["hz"]
PLETH_HZ = registry.WAVEFORMS["pleth"]["hz"]


def ecg(seconds=6, bpm=72, noise=0.0, wander=0.0, gain=1.0, seed=3):
    """Flat baseline, a narrow triangular R wave and a small rounded T wave."""
    rnd = random.Random(seed)
    out = []
    period = 60 / bpm
    for i in range(int(seconds * ECG_HZ)):
        t = i / ECG_HZ
        phase = t % period
        v = 0.0
        if phase < 0.08:
            v = 1.0 - abs(phase - 0.04) / 0.04
        elif 0.25 < phase < 0.45:
            v = 0.2 * math.sin(math.pi * (phase - 0.25) / 0.2)
        v = gain * v + wander * math.sin(2 * math.pi * 0.3 * t) + rnd.gauss(0, noise)
        out.append(v)
    return out


def pleth(seconds=6, bpm=72, noise=0.0, gain=1.0, seed=3):
    rnd = random.Random(seed)
    return [gain * 0.5 * math.sin(2 * math.pi * (bpm / 60) * i / PLETH_HZ) + rnd.gauss(0, noise)
            for i in range(int(seconds * PLETH_HZ))]


def test_clean_traces_are_good():
    for q in (assess("ecg", ecg(), ECG_HZ), assess("pleth", pleth(), PLETH_HZ),
              assess("ecg", ecg(bpm=150), ECG_HZ), assess("ecg", ecg(noise=0.01), ECG_HZ)):
        assert q.grade == "good" and q.sqi > 0.8 and q.issue is None and q.advice == ""


def test_dangerous_rhythms_are_not_dismissed_as_artefact():
    """A wide-complex tachycardia or coarse fibrillation looks unlike a normal ECG,
    but it is a real signal. Calling it a 'poor trace' would be the worst error
    this check could make."""
    n = int(8 * ECG_HZ)
    vt = [math.sin(2 * math.pi * 3.0 * i / ECG_HZ) for i in range(n)]
    assert assess("ecg", vt, ECG_HZ).grade == "good"
    fast_vt = [math.sin(2 * math.pi * 4.2 * i / ECG_HZ) for i in range(n)]
    assert assess("ecg", fast_vt, ECG_HZ).grade == "good"
    vf = [0.6 * math.sin(2 * math.pi * 5.0 * i / ECG_HZ + 1.5 * math.sin(2 * math.pi * 0.4 * i / ECG_HZ))
          * (0.7 + 0.3 * math.sin(2 * math.pi * 0.25 * i / ECG_HZ)) for i in range(n)]
    assert assess("ecg", vf, ECG_HZ).grade == "good"


def test_noise_degrades_in_steps():
    mild, bad, awful = (assess("ecg", ecg(noise=n), ECG_HZ) for n in (0.03, 0.18, 0.6))
    assert mild.grade == "good"
    assert bad.grade in ("poor", "unusable") and bad.issue == "noise"
    assert awful.grade == "unusable"
    assert mild.sqi > bad.sqi > awful.sqi
    assert bad.label == "Noisy trace" and "contact" in bad.advice


def test_wandering_baseline_and_movement():
    wander = assess("ecg", ecg(wander=0.6), ECG_HZ)
    assert wander.grade != "good" and wander.issue == "baseline-wander"
    moving = assess("ecg", ecg(wander=0.6, noise=0.25), ECG_HZ)
    assert moving.grade != "good" and moving.issue == "motion"
    assert "moving" in moving.advice.lower()
    assert assess("ecg", ecg(wander=0.03), ECG_HZ).grade == "good", "breathing-sized drift is fine"


def test_sensor_off_is_a_flat_line():
    q = assess("ecg", [0.001] * int(4 * ECG_HZ), ECG_HZ)
    assert (q.grade, q.issue, q.sqi) == ("unusable", "flatline", 0.0)
    assert "attached" in q.advice


def test_clipped_signal():
    clipped = [max(-0.2, min(0.2, x)) for x in pleth()]
    q = assess("pleth", clipped, PLETH_HZ)
    assert q.issue == "saturated" and q.grade == "unusable"


def test_weak_pleth_is_low_perfusion_and_weak_ecg_is_low_amplitude():
    p = assess("pleth", pleth(gain=0.1), PLETH_HZ)
    assert (p.grade, p.issue) == ("poor", "low-perfusion")
    e = assess("ecg", ecg(gain=0.1), ECG_HZ)
    assert (e.grade, e.issue) == ("poor", "low-amplitude")


def test_needs_enough_signal_and_a_known_waveform():
    with pytest.raises(ValueError):
        assess("ecg", ecg(seconds=1), ECG_HZ)
    with pytest.raises(KeyError):
        assess("eeg", ecg(), ECG_HZ)


def test_grades_follow_the_registry_thresholds():
    for noise in (0.0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5):
        q = assess("ecg", ecg(noise=noise), ECG_HZ)
        expected = ("unusable" if q.sqi < registry.SQI_UNUSABLE_BELOW
                    else "poor" if q.sqi < registry.SQI_POOR_BELOW else "good")
        assert q.grade == expected
        assert (q.issue is None) == (q.grade == "good")


def test_worst_picks_the_lowest():
    a, b = assess("ecg", ecg(), ECG_HZ), assess("pleth", pleth(noise=0.3), PLETH_HZ)
    assert worst([a, b]) is b and worst([]) is None


def test_every_issue_has_wording():
    for issue in registry.SIGNAL_ISSUES.values():
        assert issue["label"] and issue["advice"]
    for state_id, state in registry.SIGNAL_STATES.items():
        assert state["meaning"] and (state["text"] or state_id == "ok")
        assert state["tone"] in ("normal", "inactive", "technical")
    texts = [s["text"] for s in registry.SIGNAL_STATES.values() if s["text"]]
    assert len(texts) == len(set(texts)), "each state reads differently"
    assert "--" not in texts


def test_battery_states():
    b = registry.battery_state
    assert [b(None), b(80), b(20), b(11), b(10), b(3), b(5, charging=True)] == [
        "unknown", "ok", "low", "low", "critical", "critical", "charging"]
