"""M7 acceptance: AI findings with evidence, forecasts, events and certainty metrics.

Brief: docs/briefs/M7-ai-forecast.md
"""

import math
from datetime import datetime, timedelta, timezone

import pytest

from app import registry
from tests.conftest import todo
from tests.test_m5_chat import FakeProvider, _use


# ------------------------------------------------------------------ certainty

def test_every_registry_metric_has_a_builder_with_a_normalised_score():
    from app.ai import certainty
    examples = {
        "prediction_interval": dict(lo=5, hi=8, reference_width=6),
        "conformal_interval": dict(lo=5, hi=8, reference_width=6, coverage=0.9),
        "posterior_interval": dict(lo=5, hi=8, reference_width=6),
        "ensemble_disagreement": dict(sd=0.6, reference_sd=3),
        "calibrated_probability": dict(p=0.62),
        "ppv_natural_frequency": dict(ppv=0.62),
        "time_to_event": dict(q25_min=120, median_min=180, q75_min=300, horizon_min=360),
        "input_quality": dict(present=0.92),
        "population_similarity": dict(percentile=0.7),
        "horizon_decay": dict(horizon_min=240, tau_min=480),
        "sensitivity": dict(flipped=2, perturbations=20),
        "evidence_agreement": dict(agreeing=4, considered=5),
        "token_logprob": dict(logprobs=[math.log(0.9), math.log(0.8)]),
        "self_consistency": dict(modal=4, samples=5),
        "semantic_entropy": dict(entropy=0.4, max_entropy=1.6),
        "verbalised_confidence": dict(stated_pct=80),
    }
    assert set(examples) == set(registry.CERTAINTY_METRIC_IDS)
    for metric, raw in examples.items():
        c = certainty.build(metric, **raw)
        assert c.metric == metric and 0.0 <= c.score <= 1.0 and c.text, metric
    assert certainty.build("prediction_interval", lo=5, hi=8, reference_width=6).text == "5 to 8"
    assert certainty.build("ppv_natural_frequency", ppv=0.62).text == "6 in 10"
    assert certainty.build("evidence_agreement", agreeing=4, considered=5).text == "4 of 5 signals"
    assert certainty.build("self_consistency", modal=4, samples=5).score == pytest.approx(0.8)
    narrow = certainty.build("prediction_interval", lo=6, hi=7, reference_width=6)
    wide = certainty.build("prediction_interval", lo=3, hi=9, reference_width=6)
    assert narrow.score > wide.score, "a narrower interval is more certain"
    with pytest.raises(KeyError):
        certainty.build("vibes", p=1)


def test_certainty_helpers():
    from app.ai import certainty
    assert certainty.natural_frequency(0.62) == "6 in 10"
    assert certainty.natural_frequency(0.04, 100) == "4 in 100"
    assert [certainty.badge(s, 0.5, 0.8) for s in (0.2, 0.5, 0.79, 0.8, 1.0)] == [
        "low", "medium", "medium", "high", "high"]
    assert certainty.token_logprob_score([math.log(0.9), math.log(0.8)]) == pytest.approx(math.sqrt(0.72))
    assert certainty.token_logprob_score([]) == 0.0


# ------------------------------------------------------------------- findings

def test_resolved_finding_wording():
    from app.ai.interpretation import describe_resolved
    from app.models.clinical import Finding, ModelInfo
    now = datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc)
    f = Finding(id="x", parameter="hr", domain="rhythm", code="af", label="AF", status="resolved",
                onset=now - timedelta(minutes=160), offset=now - timedelta(minutes=134),
                summary="", model=ModelInfo(name="m", version="0", placeholder=True),
                generated_at=now)
    assert describe_resolved(f, now) == "Last run of AF 2 h 14 min ago"
    f.offset = now - timedelta(minutes=9)
    assert describe_resolved(f, now) == "Last run of AF 9 min ago"


@todo("M7")
def test_af_scenario_shows_last_run_then_active_run(client):
    body = client.get("/api/patients/scn-af/findings").json()
    assert body["model"]["placeholder"] is True
    af = [f for f in body["findings"] if f["code"] == "af"]
    assert len(af) == 1 and af[0]["status"] == "resolved" and af[0]["parameter"] == "hr"
    assert af[0]["summary"].startswith("Last run of AF 2 h")
    assert af[0]["certainty"] and all(0 <= c["score"] <= 1 for c in af[0]["certainty"])
    ev = next(e for e in af[0]["evidence"] if e["type"] == "waveform")
    assert ev["waveform"] == "ecg" and ev["marks"] and ev["baseline_start"]
    assert {m["label"] for m in ev["marks"]} >= {"No P waves", "Irregular R-R"}

    client.post("/api/demo/scn-af/seek", json={"minutes": 20})
    now_findings = client.get("/api/patients/scn-af/findings").json()["findings"]
    active = [f for f in now_findings if f["code"] == "af" and f["status"] == "active"]
    assert len(active) == 1 and active[0]["severity"] in ("warning", "critical")
    assert now_findings[0]["status"] == "active", "active findings are listed first"


def _af(client):
    findings = client.get("/api/patients/scn-af/findings").json()["findings"]
    return next(f for f in findings if f["code"] == "af")


@todo("M7")
def test_finding_detail_carries_drawable_evidence(client):
    f = _af(client)
    detail = client.get(f"/api/patients/scn-af/findings/{f['id']}").json()
    strip = detail["evidence_data"][0]
    assert strip["samples"] and strip["hz"] == registry.WAVEFORMS["ecg"]["hz"]
    assert strip["baseline_samples"], "a strip of the patient's own sinus rhythm for comparison"
    assert detail["finding"]["explanation"]
    assert client.get("/api/patients/scn-af/findings/nope").status_code == 404


@todo("M7")
def test_lab_and_imaging_findings(client):
    findings = client.get("/api/patients/scn-pneumonia/findings").json()["findings"]
    codes = {f["code"]: f for f in findings}
    assert "wcc-rising" in codes and codes["wcc-rising"]["domain"] == "lab"
    assert any(e["type"] == "lab" and e["test"] == "wcc" for e in codes["wcc-rising"]["evidence"])
    cxr = next(f for f in findings if f["domain"] == "imaging")
    img = next(e for e in cxr["evidence"] if e["type"] == "image")
    assert img["study_id"] == "scn-pneumonia-cxr-2" and img["compare_study_id"] == "scn-pneumonia-cxr-1"
    assert img["regions"]
    vt = client.get("/api/patients/scn-vt/findings").json()["findings"]
    assert any(f["code"] == "k-critical" and f["severity"] == "critical" for f in vt)


@todo("M7")
def test_ask_about_a_finding(client):
    f = _af(client)
    fake = _use(client, FakeProvider())
    r = client.post(f"/api/patients/scn-af/findings/{f['id']}/ask",
                    json={"question": "Why do you think this was AF?"}).json()
    assert r["generated"] is True and "P waves" in r["answer"]
    assert "OKAFOR" not in fake.calls[0]["system"], "identifiers are not sent"


# ------------------------------------------------------------------- forecast

def _forecast(client, patient="scn-pneumonia", **params):
    return client.get(f"/api/patients/{patient}/forecast", params=params).json()


@todo("M7")
def test_forecast_bundle_shape_and_intervals(client):
    b = _forecast(client, horizons="60,120,240,360", parameters="news2,rr,spo2")
    assert b["model"]["placeholder"] is True
    assert set(b["model"]["supported_certainty"]) == set(registry.CERTAINTY_METRIC_IDS)
    by_param = {f["parameter"]: f for f in b["forecasts"] if f["scenario"] == "baseline"}
    assert set(by_param) == {"news2", "rr", "spo2"}
    news = by_param["news2"]
    assert [p["horizon_min"] for p in news["points"]] == [60, 120, 240, 360]
    widths = []
    for p in news["points"]:
        i50, i80, i95 = (p["intervals"][k] for k in ("50", "80", "95"))
        assert i95[0] <= i80[0] <= i50[0] <= p["value"] <= i50[1] <= i80[1] <= i95[1]
        widths.append(i80[1] - i80[0])
    assert widths == sorted(widths), "uncertainty grows with horizon"
    assert news["points"][-1]["value"] > news["points"][0]["value"], "this patient deteriorates"
    assert by_param["rr"]["points"][-1]["value"] > by_param["rr"]["points"][0]["value"]
    assert by_param["spo2"]["points"][-1]["value"] < by_param["spo2"]["points"][0]["value"]


@todo("M7")
def test_forecast_reasons_and_certainty(client):
    b = _forecast(client, parameters="news2")
    news = b["forecasts"][0]
    metrics = {c["metric"] for c in news["certainty"]}
    assert {"prediction_interval", "conformal_interval", "input_quality", "horizon_decay",
            "evidence_agreement"} <= metrics
    assert all(0 <= c["score"] <= 1 and c["text"] for c in news["certainty"])
    assert sum(c["weight"] for c in news["contributors"]) == pytest.approx(1.0, abs=0.01)
    assert news["contributors"][0]["factor"] == "Respiratory rate rising for 4 hours"
    assert news["suggested_causes"][0]["label"] == "Worsening pneumonia with sepsis"
    probs = [c["probability"] for c in news["suggested_causes"]]
    assert probs == sorted(probs, reverse=True) and sum(probs) <= 1.0


@todo("M7")
def test_future_news_number_options(client):
    b = _forecast(client, parameters="news2", news_threshold=5)
    bands = {x["horizon_min"]: x for x in b["news_bands"]}
    assert set(bands) == {60, 120, 240, 360}
    for x in bands.values():
        assert x["low"] + x["medium"] + x["high"] == pytest.approx(1.0, abs=0.01)
    assert bands[360]["high"] > bands[60]["high"]
    minutes = b["minutes_to_news_threshold"]["5"]
    assert minutes is not None and 0 <= minutes <= 360
    stable = _forecast(client, "scn-stable", parameters="news2")
    assert stable["minutes_to_news_threshold"]["5"] is None


@todo("M7")
def test_event_predictions(client):
    b = _forecast(client)
    events = {e["event"]: e for e in b["events"]}
    assert set(events) <= set(registry.EVENT_TYPE_IDS)
    e = events["news2_ge_5"]
    assert e["probability"] >= 0.5 and e["label"]
    t = [datetime.fromisoformat(e[k]) for k in ("earliest_at", "expected_at", "latest_at")]
    assert t[0] <= t[1] <= t[2]
    assert {"calibrated_probability", "ppv_natural_frequency", "time_to_event"} <= {
        c["metric"] for c in e["certainty"]}
    assert "o2_escalation" in events
    stable = _forecast(client, "scn-stable")
    assert all(ev["probability"] < 0.3 for ev in stable["events"])
    af = {ev["event"] for ev in _forecast(client, "scn-af")["events"] if ev["probability"] >= 0.5}
    assert "tachyarrhythmia" in af


@todo("M7")
def test_what_if_pair(client):
    b = _forecast(client, parameters="spo2", what_if="true")
    scenarios = {f["scenario"]: f for f in b["forecasts"]}
    assert set(scenarios) == {"baseline", "o2-escalation"}
    assert scenarios["o2-escalation"]["scenario_label"] == "Oxygen increased now"
    assert scenarios["o2-escalation"]["points"][-1]["value"] > scenarios["baseline"]["points"][-1]["value"]
    assert len(_forecast(client, parameters="spo2")["forecasts"]) == 1


@todo("M7")
def test_prediction_model_is_declared_a_placeholder(client):
    info = client.get("/api/prediction-model").json()
    assert info["placeholder"] is True and info["name"] and info["version"]
