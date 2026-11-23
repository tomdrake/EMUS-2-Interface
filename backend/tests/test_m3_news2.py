"""M3 acceptance: NEWS2 chart columns.

Brief: docs/briefs/M3-news2.md
"""

from app import news2
from tests.conftest import todo


def _rescore(col, scale):
    v = col["values"]
    on_o2 = bool(col["oxygen"] and col["oxygen"]["flow_l_min"] > 0)
    return news2.news2(rr=v.get("rr"), spo2=v.get("spo2"), on_oxygen=on_o2,
                       bp_sys=v.get("bp_sys"), pulse=v.get("hr"), acvpu=v.get("acvpu"),
                       temp=v.get("temp"), spo2_scale=scale)


@todo("M3")
def test_charted_columns_are_ordered_scored_and_carry_oxygen(client):
    cols = client.get("/api/patients/scn-pneumonia/observation-sets", params={"hours": 24}).json()
    assert len(cols) >= 6
    assert [c["at"] for c in cols] == sorted(c["at"] for c in cols)
    for c in cols:
        r = _rescore(c, 1)
        assert c["news2_total"] == r.total
        assert c["news2_components"] == r.components
        assert c["news2_risk"] == r.risk
        assert c["monitoring_hours"] == r.monitoring_hours
        assert c["oxygen"] is not None and c["oxygen"]["device"]
    assert cols[-1]["news2_total"] > cols[0]["news2_total"], "this scenario deteriorates"
    assert cols[-1]["oxygen"]["flow_l_min"] == 2 and cols[-1]["oxygen"]["device"] == "N"


@todo("M3")
def test_scale_2_patient_is_scored_on_scale_2(client):
    cols = client.get("/api/patients/scn-copd/observation-sets", params={"hours": 15}).json()
    assert cols
    for c in cols:
        assert c["news2_components"]["spo2"] == _rescore(c, 2).components["spo2"]
    # 96% on oxygen is over-oxygenation on scale 2 (scores 2), but 0 on scale 1.
    assert any(c["values"]["spo2"] >= 95 and c["news2_components"]["spo2"] >= 2 for c in cols)


@todo("M3")
def test_switching_scale_rescoring(client):
    assert client.put("/api/patients/scn-copd/spo2-scale", json={"scale": 1, "by": "Dr test"}).status_code == 200
    cols = client.get("/api/patients/scn-copd/observation-sets", params={"hours": 15}).json()
    for c in cols:
        assert c["news2_components"]["spo2"] == _rescore(c, 1).components["spo2"]
    assert client.put("/api/patients/scn-copd/spo2-scale", json={"scale": 3}).status_code == 422


@todo("M3")
def test_continuous_columns_at_the_requested_interval(client):
    cols = client.get("/api/patients/scn-stable/observation-sets",
                      params={"hours": 12, "source": "continuous", "interval_min": 60}).json()
    assert 11 <= len(cols) <= 13
    assert all(c["source"] == "continuous" for c in cols)


@todo("M3")
def test_manual_observation_set_is_scored_and_stored(client):
    before = len(client.get("/api/patients/scn-stable/observation-sets").json())
    r = client.post("/api/patients/scn-stable/observation-sets", json={
        "rr": 22, "spo2": 93, "bp_sys": 104, "hr": 112, "acvpu": "A", "temp": 38.4,
        "recorded_by": "RN test"})
    assert r.status_code == 200
    col = r.json()
    assert col["news2_total"] == 2 + 2 + 0 + 1 + 2 + 0 + 1
    assert col["news2_risk"] == "high"
    assert len(client.get("/api/patients/scn-stable/observation-sets").json()) == before + 1


@todo("M3")
def test_incomplete_set_is_flagged_not_silently_scored(client):
    col = client.post("/api/patients/scn-stable/observation-sets",
                      json={"rr": 16, "spo2": 97, "hr": 70}).json()
    assert col["news2_complete"] is False
