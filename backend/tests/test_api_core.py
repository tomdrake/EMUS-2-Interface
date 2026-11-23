"""Routes that are implemented in the scaffold."""

from app import db, registry


def test_health_and_seed(client):
    assert client.get("/api/health").json()["ok"] is True
    designs = client.get("/api/designs").json()
    assert {d["id"] for d in designs} == {"icu-monitor", "news2-chart", "split-side", "split-stacked"}
    assert all(d["builtin"] for d in designs)


def test_active_design_defaults_to_icu_monitor(client):
    body = client.get("/api/active-design").json()
    assert body["meta"]["id"] == "icu-monitor"
    assert body["version"] == 1 and body["source"] == "seed"
    assert body["document"]["home_screen"] == "monitor"


def test_get_design_and_missing(client):
    assert client.get("/api/designs/news2-chart").json()["document"]["home_screen"] == "news2"
    assert client.get("/api/designs/nope").status_code == 404


def test_registry_and_schema_endpoints(client):
    reg = client.get("/api/registry").json()
    assert reg["alarm_silence_seconds"] == 120
    assert set(reg["parameters"]) == set(registry.PARAMETER_IDS)
    assert len(reg["certainty_metrics"]) == 16
    assert client.get("/api/design-schema").json()["title"] == "Design"
    assert "icu-dark" in client.get("/api/theme-presets").json()


def test_preview_patch_validates_without_saving(client):
    ok = client.post("/api/designs/icu-monitor/preview-patch", json={"ops": [
        {"op": "replace", "path": "/theme/colours/accent", "value": "#00AA88"}]}).json()
    assert ok["ok"] and ok["document"]["theme"]["colours"]["accent"] == "#00AA88"
    assert ok["max_touch_depth"] <= 2
    bad = client.post("/api/designs/icu-monitor/preview-patch", json={"ops": [
        {"op": "replace", "path": "/rows/0/parameter", "value": "glucose_cgm"}]}).json()
    assert not bad["ok"] and bad["document"] is None
    stored = client.get("/api/designs/icu-monitor").json()
    assert stored["version"] == 1
    assert stored["document"]["theme"]["colours"]["accent"] != "#00AA88"


def test_seeding_is_idempotent(client):
    db.init_db()
    db.init_db()
    assert len(client.get("/api/designs").json()) == 4


def test_unbuilt_routes_say_which_milestone_owns_them(client):
    r = client.get("/api/patients")
    assert r.status_code == 501
    assert r.json()["detail"]["milestone"] == "M2"
