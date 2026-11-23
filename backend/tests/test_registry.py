"""Registry consistency, lab flagging, and scenario scripts using only registry ids."""

import json

from app import registry as r
from app.scenarios import SCENARIOS


def test_public_registry_is_json_serialisable():
    json.dumps(r.as_public_dict())


def test_parameter_limits_are_coherent():
    for p in r.PARAMETERS.values():
        if p.default_low is not None and p.default_high is not None:
            assert p.default_low < p.default_high, p.id
        for v in (p.default_low, p.default_high):
            if v is not None and p.min_value is not None:
                assert p.min_value <= v <= p.max_value, p.id
        for w in p.waveforms:
            assert w in r.WAVEFORMS, p.id


def test_news2_inputs_are_in_the_registry():
    assert {p.id for p in r.PARAMETERS.values() if p.news2} == {
        "hr", "spo2", "rr", "bp_sys", "temp", "o2_flow", "acvpu"}


def test_technical_scenario_covers_every_failure_mode():
    s = SCENARIOS["scn-technical"]
    assert {f["fault"] for f in s["faults"]} >= {
        "battery-low", "battery-critical", "motion", "sensor-off", "connection-lost"}
    assert any(d["connection"] == "not-paired" for d in s["devices"]), "one modality on standby"
    assert not s["rhythms"] and not s["events"], "the patient is well throughout"


def test_technical_alarms_and_safety_constants():
    for a in r.TECHNICAL_ALARMS.values():
        assert a["priority"] in ("high", "medium", "low") and a["label"] and a["message"]
    assert r.TECHNICAL_ALARMS["battery-critical"]["priority"] != "low"
    assert r.BATTERY_CRITICAL_PCT < r.BATTERY_LOW_PCT
    assert r.SQI_UNUSABLE_BELOW < r.SQI_POOR_BELOW
    assert r.DISPLAY_STALE_AFTER_S <= r.CONNECTION_LOST_AFTER_S


def test_waveform_scales():
    ecg = r.WAVEFORMS["ecg"]["scale"]
    assert ecg["unit"] == "mV" and ecg["calibrated"] and ecg["baseline"] == "isoelectric"
    assert ecg["default_gain"] == 10 and set(ecg["gains_mm_per_unit"]) == {5, 10, 20}
    for wid in ("pleth", "resp"):
        sc = r.WAVEFORMS[wid]["scale"]
        assert sc["unit"] == "a.u." and not sc["calibrated"] and sc["baseline"] == "mean", wid
        assert sc["default_gain"] is None, "no absolute amplitude, so no mm per unit"
    for w in r.WAVEFORMS.values():
        lo, hi = w["scale"]["range"]
        assert lo < 0 < hi and w["scale"]["tick"] > 0
    assert r.WAVEFORMS["ecg"]["unit"] == "mV"


def test_alarm_priority_marks_use_one_to_three_exclamation_marks():
    assert r.ALARM_PRIORITY_MARKS == {"high": "!!!", "medium": "!!", "low": "!"}
    assert r.as_public_dict()["alarm_priority_marks"] == r.ALARM_PRIORITY_MARKS


def test_alarm_silence_is_two_minutes():
    assert r.ALARM_SILENCE_SECONDS == 120


def test_lab_ranges_and_flags():
    assert r.lab_flag("k", 4.2) == "normal"
    assert r.lab_flag("k", 3.3) == "low"
    assert r.lab_flag("k", 2.4) == "critical-low"
    assert r.lab_flag("k", 6.6) == "critical-high"
    assert r.lab_flag("crp", 231) == "high"
    assert r.lab_range("hb", "male") == (130, 180)
    assert r.lab_range("hb", "female") == (115, 165)
    assert r.lab_flag("hb", 125, "male") == "low"
    assert r.lab_flag("hb", 125, "female") == "normal"
    for t in r.LAB_TESTS.values():
        assert t.group in r.LAB_GROUPS, t.id
        if t.low is not None and t.high is not None:
            assert t.low < t.high, t.id


def test_certainty_metrics_cover_the_agreed_groups():
    groups = {m.group for m in r.CERTAINTY_METRICS.values()}
    assert groups == {"Forecast spread", "Event probability", "Data behind it",
                      "Causal robustness", "Language model"}
    assert len(r.CERTAINTY_METRICS) == 16
    for kind in ("forecast", "event", "finding", "llm"):
        assert any(kind in m.applies_to for m in r.CERTAINTY_METRICS.values())


def test_scenarios_only_use_registry_vocabulary():
    for s in SCENARIOS.values():
        assert s["start_min"] < 0 < s["end_min"], s["id"]
        times = [seg["at_min"] for seg in s["segments"]]
        assert times == sorted(times) and times[0] == s["start_min"], s["id"]
        assert times[-1] == s["end_min"], s["id"]
        for lab in s["labs"] + s["historic_labs"]:
            assert lab["test"] in r.LAB_TESTS, (s["id"], lab)
        for o2 in s["oxygen"]:
            assert o2["device"] in r.O2_DEVICES, s["id"]
            assert (o2["flow_l_min"] == 0) == (o2["device"] == "A"), s["id"]
        for span in s["rhythms"]:
            assert span["rhythm"] in r.RHYTHM_LABELS and span["from_min"] < span["to_min"]
        device_ids = {d["id"] for d in s["devices"]}
        for d in s["devices"]:
            assert d["kind"] in r.DEVICE_KINDS and set(d["parameters"]) <= set(r.PARAMETERS)
            assert set(d["waveforms"]) <= set(r.WAVEFORMS)
        for f in s["faults"]:
            assert f["fault"] in r.DEMO_FAULTS and f["device"] in device_ids, (s["id"], f)
            assert s["start_min"] <= f["at_min"] <= s["end_min"]
        story = s["forecast_story"]
        for c in story["contributors"]:
            assert c["parameter"] is None or c["parameter"] in r.PARAMETERS
        if story["contributors"]:
            assert abs(sum(c["weight"] for c in story["contributors"]) - 1.0) < 1e-6, s["id"]
