"""Example data: stateless snapshots of the scripted scenarios, always badged as examples."""

import pytest

from app import examples, registry
from app.scenarios import SCENARIOS


def snap(client, scenario, minute=0):
    r = client.get(f"/api/examples/{scenario}", params={"minute": minute})
    assert r.status_code == 200, r.text
    return r.json()


def test_scenario_list_has_every_scenario_and_highlights(client):
    body = client.get("/api/examples").json()
    assert {s["id"] for s in body} == set(SCENARIOS)
    af = next(s for s in body if s["id"] == "scn-af")
    assert any("AF" in h["label"] for h in af["highlights"])
    assert client.get("/api/examples/nope").status_code == 404


def test_every_snapshot_is_badged_and_stateless(client):
    for sid, sc in SCENARIOS.items():
        a = snap(client, sid, sc["end_min"] // 2)
        assert a["placeholder"] is True and a["badge"] == "EXAMPLE DATA"
        assert a["model"]["placeholder"] is True
        assert a["patient"]["simulated"] is True
        b = snap(client, sid, sc["end_min"] // 2)
        assert a["numerics"] == b["numerics"] and a["strips"][0]["samples"] == b["strips"][0]["samples"]


def test_numbers_follow_the_script(client):
    now = snap(client, "scn-pneumonia", 0)
    later = snap(client, "scn-pneumonia", 360)
    assert now["numerics"]["hr"] == 102 and now["numerics"]["rr"] == 22
    assert later["numerics"]["rr"] > now["numerics"]["rr"] and later["numerics"]["spo2"] < now["numerics"]["spo2"]
    assert later["news2"]["total"] > now["news2"]["total"]
    assert snap(client, "scn-pneumonia", 999)["minute"] == SCENARIOS["scn-pneumonia"]["end_min"]


def test_strips_are_graded_by_the_real_quality_check(client):
    s = snap(client, "scn-stable", 0)
    assert {x["waveform"] for x in s["strips"]} == {"ecg", "pleth", "resp"}
    assert all(x["quality"]["grade"] == "good" and x["quality"]["assessed_by"] == "heuristic"
               for x in s["strips"])
    assert all(len(x["samples"]) == round(x["hz"] * x["seconds"]) for x in s["strips"])


def test_af_is_read_back_from_the_signal_with_reasons_and_marks(client):
    s = snap(client, "scn-af", 20)
    af = [f for f in s["findings"] if f["code"] == "af"]
    assert [f["status"] for f in af] == ["active", "resolved"], "active first, then the earlier run"
    active, resolved = af
    assert active["summary"].startswith("AF now") and resolved["summary"].startswith("Last run of AF 2 h")
    d = s["finding_data"][active["id"]]
    assert d["rule"] and d["rr_intervals_s"] and d["strip"]["marks"] and d["baseline_strip"]
    assert any(m["label"] == "Irregular R-R" for m in d["strip"]["marks"])
    assert sum(r["weight"] for r in d["reasons"]) == pytest.approx(1.0, abs=0.01)
    assert d["strip"]["reading"] == "af" and d["baseline_strip"]["reading"] == "sinus"
    assert all(0 <= c["score"] <= 1 and c["text"] for c in active["certainty"])
    assert {c["metric"] for c in active["certainty"]} >= {"evidence_agreement", "input_quality", "sensitivity"}


def test_vt_is_wide_and_critical_and_svt_is_narrow(client):
    s = snap(client, "scn-vt", 5.4)
    vt = next(f for f in s["findings"] if f["code"] == "vt")
    assert vt["status"] == "active" and vt["severity"] == "critical"
    assert any(m["label"] == "Wide QRS" for m in s["finding_data"][vt["id"]]["strip"]["marks"])
    assert any(f["code"] == "k-critical" and f["severity"] == "critical" for f in s["findings"])
    hr_alarm = [a for a in s["alarms"]["active"] if a["parameter"] == "hr"]
    assert hr_alarm and hr_alarm[0]["kind"] == "high"


def test_the_ecg_rule_agrees_with_the_script_across_scenarios():
    """The rule reads the synthesised signal; it is not told the answer."""
    wrong = []
    for sid, sc in SCENARIOS.items():
        for span in sc["rhythms"]:
            mid = (span["from_min"] + span["to_min"]) / 2
            strip = examples._ecg_strip(sid, mid, [], rhythm_override=span["rhythm"], use_faults=False)
            if strip.reading != span["rhythm"]:
                wrong.append((sid, span["rhythm"], strip.reading))
    assert not wrong


def test_poor_trace_pauses_interpretation(client):
    s = snap(client, "scn-technical", 4)      # movement on the chest sensor
    ecg = next(x for x in s["strips"] if x["waveform"] == "ecg")
    assert ecg["quality"]["grade"] != "good" and ecg["reading"] is None
    assert any(m["tone"] == "technical" for m in ecg["marks"])
    poor = next(f for f in s["findings"] if f["code"] == "poor-trace")
    assert "paused" in poor["summary"]
    assert s["signals"]["hr"]["state"] == "poor-signal"
    assert not any(f["domain"] == "rhythm" and f["code"] != "poor-trace" for f in s["findings"])


def test_failure_modes_are_told_apart(client):
    states = lambda m: {k: v["state"] for k, v in snap(client, "scn-technical", m)["signals"].items()}
    assert states(0)["bp_sys"] == "standby", "cuff not connected"
    assert states(11)["hr"] == "sensor-off" and states(11)["rr"] == "sensor-off"
    lost = snap(client, "scn-technical", 14)
    assert lost["signals"]["spo2"]["state"] == "connection-lost" and lost["signals"]["pulse"]["state"] == "connection-lost"
    assert {x["waveform"] for x in lost["strips"]} == {"ecg", "resp"}, "no pleth while the limb sensor is lost"
    technical = {a["technical"] for a in lost["alarms"]["active"] if a["kind"] == "technical"}
    assert {"connection-lost", "battery-low"} <= technical
    assert "spo2" in lost["alarms"]["unmonitored"]
    crit = snap(client, "scn-technical", 18)
    assert next(d for d in crit["devices"] if d["id"] == "anne-limb")["battery"] == "critical"


def test_forecast_has_intervals_certainty_and_reasons(client):
    b = snap(client, "scn-pneumonia", 0)["forecast"]
    assert b["model"]["placeholder"] is True
    news = next(f for f in b["forecasts"] if f["parameter"] == "news2" and f["scenario"] == "baseline")
    widths = []
    for p in news["points"]:
        i = p["intervals"]
        assert i["95"][0] <= i["80"][0] <= i["50"][0] <= p["value"] <= i["50"][1] <= i["80"][1] <= i["95"][1]
        widths.append(i["80"][1] - i["80"][0])
    assert widths == sorted(widths), "uncertainty grows with distance"
    assert news["points"][-1]["value"] > news["points"][0]["value"]
    assert news["contributors"][0]["factor"] == "Respiratory rate rising for 4 hours"
    assert sum(c["weight"] for c in news["contributors"]) == pytest.approx(1.0, abs=0.01)
    assert any(f["scenario"] == "o2-escalation" for f in b["forecasts"]), "what-if pair"
    assert all(abs(x["low"] + x["medium"] + x["high"] - 1) < 0.01 for x in b["news_bands"])
    assert b["minutes_to_news_threshold"]["5"] is not None
    assert snap(client, "scn-stable", 0)["forecast"]["minutes_to_news_threshold"]["5"] is None


def test_trends_and_every_metric_value_is_in_range(client):
    s = snap(client, "scn-pneumonia", 0)
    hr = s["trends"]["hr"]["points"]
    assert hr[0]["t"] == -1440 and hr[-1]["t"] == 0 and hr[0]["v"] < hr[-1]["v"]
    short = snap(client, "scn-technical", 0)["trends"]["hr"]["points"]
    assert short[0]["t"] == -240, "no points from before the scenario began"
    for f in s["findings"]:
        assert all(0 <= c["score"] <= 1 for c in f["certainty"])
        assert {c["metric"] for c in f["certainty"]} <= set(registry.CERTAINTY_METRIC_IDS)


def test_a_high_number_is_never_met_with_nothing_flagged(client):
    """The AI chip must not say 'nothing flagged' beside an RR of 29 or a fast regular rhythm."""
    late = snap(client, "scn-pneumonia", 360)
    codes = {f["code"]: f for f in late["findings"]}
    assert codes["fast-breathing"]["parameter"] == "rr" and codes["fast-breathing"]["severity"] == "critical"
    assert codes["desaturation"]["parameter"] == "spo2"
    tach = codes["sinus-tachycardia"]
    assert tach["parameter"] == "hr" and "not read from the ECG" in tach["explanation"]
    assert snap(client, "scn-stable", 0)["findings"] == [] or all(
        f["domain"] == "lab" for f in snap(client, "scn-stable", 0)["findings"])


def test_certainty_values_come_from_what_the_rule_measured(client):
    s = snap(client, "scn-af", 20)
    active = next(f for f in s["findings"] if f["code"] == "af" and f["status"] == "active")
    by = {c["metric"]: c for c in active["certainty"]}
    q = next(x for x in s["strips"] if x["waveform"] == "ecg")["quality"]["sqi"]
    assert by["input_quality"]["score"] == pytest.approx(q, abs=0.001), "data quality is the trace's own grade"
    assert by["sensitivity"]["raw"]["perturbations"] == 3, "stability is re-reading three windows of the strip"
