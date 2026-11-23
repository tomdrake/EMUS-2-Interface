"""M2 acceptance: simulator, live stream, alarms and the two-minute silence, oxygen.

Brief: docs/briefs/M2-monitor.md
"""

from datetime import timedelta
from statistics import mean, pstdev

import pytest

from app import clock, registry
from app.scenarios import SCENARIOS
from tests.conftest import todo


# ------------------------------------------------------------------ simulator

@todo("M2")
def test_scenario_values_interpolate_between_segments():
    from app.sources.simulator import scenario_values
    at0 = scenario_values("scn-pneumonia", 0)
    assert at0["hr"] == pytest.approx(102) and at0["rr"] == pytest.approx(22)
    mid = scenario_values("scn-pneumonia", 90)          # halfway between 0 and 180
    assert mid["hr"] == pytest.approx(107) and mid["spo2"] == pytest.approx(92.5)
    assert scenario_values("scn-pneumonia", -100)["oxygen"] == {"flow_l_min": 2, "device": "N"}
    assert scenario_values("scn-pneumonia", -300)["oxygen"]["device"] == "A"


@todo("M2")
def test_scenario_rhythm_follows_the_script():
    from app.sources.simulator import scenario_values
    assert scenario_values("scn-af", -140)["rhythm"] == "af"
    assert scenario_values("scn-af", 0)["rhythm"] == "sinus"
    assert scenario_values("scn-af", 30)["rhythm"] == "af"
    assert scenario_values("scn-vt", 5.5)["rhythm"] == "vt"


def _rr_intervals(samples, hz):
    """Crude R-peak detector good enough for synthetic ECG."""
    threshold = 0.6 * max(samples)
    peaks, last = [], -10**9
    for i in range(1, len(samples) - 1):
        if samples[i] > threshold and samples[i] >= samples[i - 1] and samples[i] > samples[i + 1]:
            if i - last > 0.2 * hz:
                peaks.append(i)
                last = i
    return [(b - a) / hz for a, b in zip(peaks, peaks[1:])]


@todo("M2")
def test_synthetic_ecg_rate_and_regularity():
    from app.sources.simulator import synth_ecg
    hz = registry.WAVEFORMS["ecg"]["hz"]
    n = int(hz * 30)
    sinus = _rr_intervals(synth_ecg("sinus", 75, hz, n, 0.0, seed=1), hz)
    af = _rr_intervals(synth_ecg("af", 130, hz, n, 0.0, seed=1), hz)
    assert 60 / mean(sinus) == pytest.approx(75, abs=4)
    assert pstdev(sinus) / mean(sinus) < 0.05, "sinus rhythm should be regular"
    assert pstdev(af) / mean(af) > 0.12, "AF should be irregularly irregular"
    assert synth_ecg("sinus", 75, hz, 500, 0.0, seed=1) == synth_ecg("sinus", 75, hz, 500, 0.0, seed=1)
    assert max(abs(x) for x in synth_ecg("pause", 0, hz, 500, 0.0)) < 0.1


# ------------------------------------------------------------------- patients

@todo("M2")
def test_scenario_patients_are_listed_and_marked_simulated(client):
    patients = client.get("/api/patients").json()
    assert {p["id"] for p in patients} >= set(SCENARIOS)
    smith = client.get("/api/patients/scn-pneumonia").json()
    assert smith["patient"]["family_name"] == "SMITH"
    assert smith["patient"]["nhs_number"] and smith["patient"]["simulated"] is True
    assert smith["source"]["simulated"] is True
    assert smith["settings"]["spo2_scale"] == 1
    assert client.get("/api/patients/scn-copd").json()["settings"]["spo2_scale"] == 2
    assert client.get("/api/patients/nobody").status_code == 404


@todo("M2")
def test_trend_history(client):
    body = client.get("/api/patients/scn-pneumonia/trend",
                      params={"parameter": "hr", "minutes": 240, "max_points": 120}).json()
    pts = body["points"]
    assert 20 <= len(pts) <= 120
    assert pts[0][1] < pts[-1][1], "heart rate rises over the last four hours in this scenario"


# --------------------------------------------------------------------- stream

@todo("M2")
def test_stream_sends_status_numerics_and_waveforms(client):
    seen = {}
    with client.websocket_connect("/api/stream/scn-stable") as ws:
        first = ws.receive_json()
        assert first["type"] == "status" and first["connected"] is True and first["simulated"] is True
        for _ in range(60):
            msg = ws.receive_json()
            seen.setdefault(msg["type"], msg)
            if {"numerics", "waveform", "alarms"} <= set(seen):
                break
    values = seen["numerics"]["values"]
    assert {"hr", "spo2", "rr", "temp", "o2_flow", "activity", "position"} <= set(values)
    assert 60 <= values["hr"] <= 90 and 94 <= values["spo2"] <= 100
    frame = seen["waveform"]["frames"][0]
    assert frame["waveform"] in registry.WAVEFORMS
    assert frame["hz"] == registry.WAVEFORMS[frame["waveform"]]["hz"]
    assert len(frame["samples"]) > 0
    assert "silenced_until" in seen["alarms"]["state"]


# --------------------------------------------------------------------- alarms

@todo("M2")
def test_alarm_fires_when_a_limit_is_crossed(client):
    client.post("/api/demo/scn-vt/seek", json={"minutes": 5.4})
    state = client.get("/api/patients/scn-vt/alarms").json()
    hr = [a for a in state["active"] if a["parameter"] == "hr" and a["kind"] == "high"]
    assert hr and hr[0]["priority"] == "high" and hr[0]["value"] > hr[0]["limit"]


@todo("M2")
def test_silence_lasts_exactly_two_minutes_and_keeps_alarms_visible(client, monkeypatch):
    client.post("/api/demo/scn-vt/seek", json={"minutes": 5.4})
    t0 = clock.now()
    monkeypatch.setattr(clock, "now", lambda: t0)
    state = client.post("/api/patients/scn-vt/alarms/silence",
                        json={"by": "RN test", "seconds": 3600}).json()   # 'seconds' is ignored
    assert state["silence_seconds"] == 120
    from datetime import datetime
    until = datetime.fromisoformat(state["silenced_until"])
    assert until - t0 == timedelta(seconds=120)
    assert state["active"], "visual alarms stay on while audio is silenced"

    monkeypatch.setattr(clock, "now", lambda: t0 + timedelta(seconds=119))
    assert client.get("/api/patients/scn-vt/alarms").json()["silenced_until"] is not None
    monkeypatch.setattr(clock, "now", lambda: t0 + timedelta(seconds=121))
    assert client.get("/api/patients/scn-vt/alarms").json()["silenced_until"] is None


@todo("M2")
def test_silence_can_be_ended_early(client):
    client.post("/api/patients/scn-stable/alarms/silence", json={"by": ""})
    assert client.delete("/api/patients/scn-stable/alarms/silence").json()["silenced_until"] is None


@todo("M2")
def test_alarm_limits_are_per_patient_and_bounded(client):
    ok = client.put("/api/patients/scn-stable/alarm-limits/spo2",
                    json={"low": 88, "high": None, "priority": "high", "enabled": True})
    assert ok.status_code == 200
    assert client.get("/api/patients/scn-stable").json()["settings"]["alarm_limits"]["spo2"]["low"] == 88
    assert "spo2" not in client.get("/api/patients/scn-af").json()["settings"]["alarm_limits"]
    too_low = client.put("/api/patients/scn-stable/alarm-limits/spo2", json={"low": 10})
    assert too_low.status_code == 422
    inverted = client.put("/api/patients/scn-stable/alarm-limits/hr", json={"low": 150, "high": 100})
    assert inverted.status_code == 422
    assert client.put("/api/patients/scn-stable/alarm-limits/glucose", json={"low": 4}).status_code == 404
    client.delete("/api/patients/scn-stable/alarm-limits/spo2")
    assert "spo2" not in client.get("/api/patients/scn-stable").json()["settings"]["alarm_limits"]


# --------------------------------------------------------------------- oxygen

@todo("M2")
def test_oxygen_is_recorded_with_flow_and_device(client):
    before = client.get("/api/patients/scn-stable/oxygen").json()
    assert before["current"]["flow_l_min"] == 0 and before["current"]["device"] == "A"
    r = client.post("/api/patients/scn-stable/oxygen", json={
        "at": clock.now().isoformat(), "flow_l_min": 4, "device": "N",
        "source": "manual", "recorded_by": "RN test"})
    assert r.status_code == 200
    after = client.get("/api/patients/scn-stable/oxygen").json()
    assert after["current"]["flow_l_min"] == 4 and after["current"]["device"] == "N"
    assert len(after["history"]) == len(before["history"]) + 1
    bad = client.post("/api/patients/scn-stable/oxygen", json={
        "at": clock.now().isoformat(), "flow_l_min": 4, "device": "ZZ"})
    assert bad.status_code == 422


@todo("M2")
def test_demo_controls(client):
    scenarios = client.get("/api/demo/scenarios").json()
    assert {s["id"] for s in scenarios} == set(SCENARIOS)
    assert all(s["title"] and s["teaching_point"] for s in scenarios)
    assert client.post("/api/demo/scn-stable/speed", json={"factor": 60}).status_code == 200
    assert client.post("/api/demo/scn-stable/speed", json={"factor": 0}).status_code == 422
    assert client.post("/api/demo/scn-stable/restart").status_code == 200
