"""M2 acceptance: telling monitoring failure modes apart.

Brief: docs/briefs/M2-monitor.md (section "Monitoring health") and docs/human-factors.md.
Scenario 'scn-technical' has a well patient and scripted monitoring problems.
"""

from datetime import timedelta

from app import clock, registry
from tests.conftest import todo

P = "scn-technical"


def _detail(client, patient=P):
    return client.get(f"/api/patients/{patient}").json()


def _fault(client, fault, device=None, patient=P, seconds=None):
    body = {"fault": fault}
    if device:
        body["device_id"] = device
    if seconds:
        body["seconds"] = seconds
    r = client.post(f"/api/demo/{patient}/fault", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _technical(client, patient=P):
    state = client.get(f"/api/patients/{patient}/alarms").json()
    return state, {a["technical"]: a for a in state["active"] if a["kind"] == "technical"}


# -------------------------------------------------------- standby is not a blank

@todo("M2")
def test_modality_without_a_device_is_on_standby(client):
    d = _detail(client)
    cuff = next(x for x in d["devices"] if x["id"] == "bp-cuff")
    assert cuff["connection"] == "not-paired"
    for p in ("bp_sys", "bp_dia", "bp_mean"):
        assert d["signals"][p]["state"] == "standby"
    assert d["signals"]["hr"]["state"] == "ok" and d["signals"]["spo2"]["state"] == "ok"
    # Standby is not a fault: nothing is raised for it.
    _, technical = _technical(client)
    assert not technical


@todo("M2")
def test_stream_sends_devices_and_never_a_number_without_a_state(client):
    seen = {}
    with client.websocket_connect(f"/api/stream/{P}") as ws:
        for _ in range(60):
            msg = ws.receive_json()
            seen.setdefault(msg["type"], msg)
            if {"numerics", "devices"} <= set(seen):
                break
    signals = seen["devices"]["signals"]
    values = seen["numerics"]["values"]
    assert {d["id"] for d in seen["devices"]["devices"]} == {"anne-chest", "anne-limb", "bp-cuff"}
    for parameter, value in values.items():
        if parameter in signals and signals[parameter]["state"] not in ("ok", "poor-signal"):
            assert value is None, f"{parameter} sent a value while {signals[parameter]['state']}"
    assert values["bp_sys"] is None and values["hr"] is not None


# ------------------------------------------------------------------- battery

@todo("M2")
def test_low_then_critical_battery(client):
    _fault(client, "battery-low", "anne-limb")
    limb = next(x for x in _detail(client)["devices"] if x["id"] == "anne-limb")
    assert limb["battery"] == "low" and limb["battery_pct"] <= registry.BATTERY_LOW_PCT
    _, technical = _technical(client)
    low = technical["battery-low"]
    assert low["priority"] == "low" and low["device_id"] == "anne-limb" and low["parameter"] is None
    assert "Limb sensor" in low["message"] and "%" in low["message"]
    assert _detail(client)["signals"]["spo2"]["state"] == "ok", "a low battery still measures"

    _fault(client, "battery-critical", "anne-limb")
    _, technical = _technical(client)
    assert technical["battery-critical"]["priority"] == "medium"
    assert "battery-low" not in technical, "the more serious alarm replaces the lesser one"


# ---------------------------------------------------------------- connection

@todo("M2")
def test_connection_loss_is_distinct_and_marks_parameters_unmonitored(client, monkeypatch):
    t0 = clock.now()
    monkeypatch.setattr(clock, "now", lambda: t0)
    before = _detail(client)["signals"]["spo2"]
    _fault(client, "connection-lost", "anne-limb")
    monkeypatch.setattr(clock, "now", lambda: t0 + timedelta(
        seconds=registry.CONNECTION_LOST_AFTER_S + 1))

    d = _detail(client)
    limb = next(x for x in d["devices"] if x["id"] == "anne-limb")
    assert limb["connection"] == "lost" and limb["last_seen"]
    spo2 = d["signals"]["spo2"]
    assert spo2["state"] == "connection-lost" and spo2["device_id"] == "anne-limb"
    assert spo2["last_value"] is not None and spo2["last_value_at"]
    assert d["signals"]["hr"]["state"] == "ok", "the chest sensor is unaffected"
    assert spo2["state"] != before["state"]

    state, technical = _technical(client)
    lost = technical["connection-lost"]
    assert lost["priority"] == "medium" and "Not monitoring" in lost["message"]
    assert "spo2" in state["unmonitored"] and "hr" not in state["unmonitored"]
    # No patient alarm is invented from missing data.
    assert not [a for a in state["active"] if a["kind"] in ("low", "high")]

    client.delete(f"/api/demo/{P}/fault")
    monkeypatch.setattr(clock, "now", lambda: t0 + timedelta(seconds=30))
    assert _detail(client)["signals"]["spo2"]["state"] in ("acquiring", "ok")
    assert "connection-lost" not in _technical(client)[1]


@todo("M2")
def test_sensor_off_differs_from_connection_lost(client):
    _fault(client, "sensor-off", "anne-chest")
    d = _detail(client)
    chest = next(x for x in d["devices"] if x["id"] == "anne-chest")
    assert chest["connection"] == "connected", "the device is still talking to us"
    assert d["signals"]["hr"]["state"] == "sensor-off"
    assert d["signals"]["hr"]["advice"]
    _, technical = _technical(client)
    assert "sensor-off" in technical and "connection-lost" not in technical


# ------------------------------------------------------------------ poor trace

@todo("M2")
def test_noisy_trace_is_reported_with_advice_and_the_value_is_kept(client):
    _fault(client, "motion", "anne-chest")
    with client.websocket_connect(f"/api/stream/{P}") as ws:
        devices = numerics = None
        for _ in range(120):
            msg = ws.receive_json()
            if msg["type"] == "devices" and msg["signals"]["hr"]["state"] == "poor-signal":
                devices = msg
            if msg["type"] == "numerics":
                numerics = msg
            if devices and numerics:
                break
    assert devices, "the stream should report a poor trace within the first messages"
    hr = devices["signals"]["hr"]
    assert hr["quality"] < registry.SQI_POOR_BELOW and hr["issue"] in ("motion", "noise", "baseline-wander")
    assert hr["advice"]
    q = next(x for x in devices["quality"] if x["waveform"] == "ecg")
    assert q["grade"] in ("poor", "unusable") and q["assessed_by"] == "heuristic"
    assert numerics["values"]["hr"] is not None, "a poor trace still shows its number, flagged"
    assert numerics["quality"]["hr"] < registry.SQI_POOR_BELOW
    assert devices["signals"]["spo2"]["state"] == "ok", "the pleth is on another device"


@todo("M2")
def test_synthetic_artefacts_are_graded_by_the_real_check():
    """The simulator adds artefact to the waveform; it does not just set a flag."""
    from app.signal_quality import assess
    from app.sources.simulator import add_artefact, synth_ecg
    hz = registry.WAVEFORMS["ecg"]["hz"]
    clean = synth_ecg("sinus", 72, hz, int(6 * hz), 0.0, seed=1)
    assert assess("ecg", clean, hz).grade == "good"
    assert assess("ecg", add_artefact(clean, "noise", hz, 0.0, seed=1), hz).grade != "good"
    assert assess("ecg", add_artefact(clean, "motion", hz, 0.0, seed=1), hz).grade != "good"
    assert assess("ecg", add_artefact(clean, "sensor-off", hz, 0.0), hz).issue == "flatline"
    # Arrhythmias from the simulator must not be graded as artefact.
    for rhythm, rate in (("af", 130), ("svt", 180), ("vt", 180)):
        ecg = synth_ecg(rhythm, rate, hz, int(6 * hz), 0.0, seed=1)
        assert assess("ecg", ecg, hz).grade == "good", rhythm


# ------------------------------------------------- silence and technical alarms

@todo("M2")
def test_silence_does_not_hide_technical_alarms_or_unmonitored_state(client):
    _fault(client, "connection-lost", "anne-limb", seconds=600)
    client.post(f"/api/patients/{P}/alarms/silence", json={"by": "RN test"})
    state, technical = _technical(client)
    assert state["silenced_until"] is not None
    assert "connection-lost" in technical and "spo2" in state["unmonitored"]


@todo("M2")
def test_switching_an_alarm_off_is_recorded_and_reported(client):
    r = client.put(f"/api/patients/{P}/alarm-limits/rr",
                   json={"low": 8, "high": 25, "priority": "medium", "enabled": False})
    assert r.status_code == 200
    assert "rr" in client.get(f"/api/patients/{P}/alarms").json()["alarms_off"]
    from app import db
    with db.session() as con:
        row = con.execute("SELECT detail FROM audit_log WHERE action = 'alarm.limit' "
                          "ORDER BY id DESC LIMIT 1").fetchone()
    assert '"enabled": false' in row["detail"]


@todo("M2")
def test_fault_injection_is_validated(client):
    assert client.post(f"/api/demo/{P}/fault", json={"fault": "gremlins"}).status_code == 422
    assert client.post(f"/api/demo/{P}/fault",
                       json={"fault": "noise", "device_id": "toaster"}).status_code == 422
    assert client.delete(f"/api/demo/{P}/fault").status_code == 200
