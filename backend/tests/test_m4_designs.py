"""M4 acceptance: versioned design persistence in SQL.

Brief: docs/briefs/M4-studio.md
"""

from fastapi.testclient import TestClient

from tests.conftest import todo

RECOLOUR = [{"op": "replace", "path": "/theme/colours/accent", "value": "#00AA88"}]


def _copy(client, name="Ward 204 draft"):
    r = client.post("/api/designs/icu-monitor/duplicate", json={"name": name, "author": "RN A"})
    assert r.status_code == 200, r.text
    return r.json()["meta"]["id"]


@todo("M4")
def test_builtin_designs_are_read_only_but_can_be_duplicated(client):
    assert client.post("/api/designs/icu-monitor/versions",
                       json={"ops": RECOLOUR, "author": "x"}).status_code == 409
    assert client.delete("/api/designs/icu-monitor").status_code == 409
    new_id = _copy(client)
    body = client.get(f"/api/designs/{new_id}").json()
    assert body["meta"]["builtin"] is False and body["meta"]["parent_id"] == "icu-monitor"
    assert body["version"] == 1
    assert body["document"]["name"] == "Ward 204 draft"


@todo("M4")
def test_saving_creates_an_immutable_version_with_who_and_why(client):
    d = _copy(client)
    r = client.post(f"/api/designs/{d}/versions", json={
        "ops": RECOLOUR, "author": "Dr B", "note": "Greener accent", "source": "manual"})
    assert r.status_code == 200 and r.json()["version"] == 2
    assert client.get(f"/api/designs/{d}").json()["document"]["theme"]["colours"]["accent"] == "#00AA88"
    assert client.get(f"/api/designs/{d}", params={"version": 1}).json()[
        "document"]["theme"]["colours"]["accent"] != "#00AA88"
    versions = client.get(f"/api/designs/{d}/versions").json()
    assert [v["version"] for v in versions] == [2, 1]
    latest = versions[0]
    assert (latest["author"], latest["note"], latest["source"]) == ("Dr B", "Greener accent", "manual")
    assert latest["patch"] and latest["touched"] == ["theme"]


@todo("M4")
def test_full_document_save_and_invalid_saves(client):
    d = _copy(client)
    doc = client.get(f"/api/designs/{d}").json()["document"]
    doc["theme"]["font_scale"] = 1.3
    assert client.post(f"/api/designs/{d}/versions", json={"document": doc}).json()["version"] == 2

    doc["rows"][0]["parameter"] = "glucose_cgm"
    bad = client.post(f"/api/designs/{d}/versions", json={"document": doc})
    assert bad.status_code == 422 and bad.json()["detail"]["errors"]
    assert client.get(f"/api/designs/{d}").json()["version"] == 2

    assert client.post(f"/api/designs/{d}/versions", json={}).status_code == 422
    assert client.post(f"/api/designs/{d}/versions",
                       json={"document": doc, "ops": RECOLOUR}).status_code == 422


@todo("M4")
def test_revert_adds_a_version_and_keeps_history(client):
    d = _copy(client)
    v1 = client.get(f"/api/designs/{d}").json()["document"]
    client.post(f"/api/designs/{d}/versions", json={"ops": RECOLOUR})
    r = client.post(f"/api/designs/{d}/revert", json={"version": 1, "author": "RN A"})
    assert r.json()["version"] == 3
    assert client.get(f"/api/designs/{d}").json()["document"] == v1
    versions = client.get(f"/api/designs/{d}/versions").json()
    assert len(versions) == 3 and versions[0]["source"] == "revert"


@todo("M4")
def test_active_design_persists_across_restart(client, tmp_path):
    d = _copy(client)
    assert client.put("/api/active-design", json={"design_id": d}).status_code == 200
    assert client.put("/api/active-design", json={"design_id": "nope"}).status_code == 404
    from app.main import create_app
    with TestClient(create_app()) as again:      # same EMUS_DB
        assert again.get("/api/active-design").json()["meta"]["id"] == d


@todo("M4")
def test_export_import_round_trip_and_delete(client):
    d = _copy(client)
    client.post(f"/api/designs/{d}/versions", json={"ops": RECOLOUR, "note": "x"})
    exported = client.get(f"/api/designs/{d}/export").json()
    assert exported["document"]["theme"]["colours"]["accent"] == "#00AA88"
    assert len(exported["versions"]) == 2
    imported = client.post("/api/designs/import", json=exported).json()
    assert imported["meta"]["id"] != d and imported["meta"]["builtin"] is False
    assert client.get(f"/api/designs/{imported['meta']['id']}").json()[
        "document"]["theme"]["colours"]["accent"] == "#00AA88"
    exported["document"]["patients"] = []
    assert client.post("/api/designs/import", json=exported).status_code == 422
    assert client.delete(f"/api/designs/{d}").status_code == 200
    assert client.get(f"/api/designs/{d}").status_code == 404


@todo("M4")
def test_every_change_is_audited(client):
    from app import db
    d = _copy(client)
    client.post(f"/api/designs/{d}/versions", json={"ops": RECOLOUR, "author": "Dr B"})
    with db.session() as con:
        actions = [r["action"] for r in con.execute(
            "SELECT action FROM audit_log WHERE target = ? ORDER BY id", (d,))]
    assert actions == ["design.duplicate", "design.save"]
