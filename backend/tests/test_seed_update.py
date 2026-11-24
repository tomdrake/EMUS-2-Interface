"""Built-in designs follow the shipped defaults; user copies are never touched."""

import copy
import json

from app import db, defaults
from app.models.design import Design


def _versions(con, design_id):
    return [dict(r) for r in con.execute(
        "SELECT version, source, document FROM design_versions WHERE design_id = ? ORDER BY version",
        (design_id,))]


def test_unchanged_defaults_do_not_add_versions(client):
    db.init_db()
    db.init_db()
    with db.session() as con:
        assert [v["version"] for v in _versions(con, "icu-monitor")] == [1]


def test_a_database_made_by_an_older_build_picks_up_new_defaults(client):
    # Simulate the old build: the stored built-in has a narrower tile.
    with db.session() as con:
        old = json.loads(_versions(con, "icu-monitor")[0]["document"])
        old["tiles"]["width_px"] = 150
        old["tiles"]["equal_row_heights"] = True      # a field an older build wrote
        con.execute("UPDATE design_versions SET document = ? WHERE design_id = 'icu-monitor'",
                    (json.dumps(old),))
    db.init_db()
    with db.session() as con:
        versions = _versions(con, "icu-monitor")
        assert [v["version"] for v in versions] == [1, 2] and versions[1]["source"] == "seed"
        assert json.loads(versions[1]["document"])["tiles"]["width_px"] == 220
        assert con.execute("SELECT current_version FROM designs WHERE id = 'icu-monitor'"
                           ).fetchone()[0] == 2
    assert client.get("/api/designs/icu-monitor").json()["document"]["tiles"]["width_px"] == 220


def test_an_old_document_that_no_longer_validates_is_replaced(client):
    with db.session() as con:
        con.execute("UPDATE design_versions SET document = ? WHERE design_id = 'news2-chart'",
                    ('{"name": "broken"}',))
    db.init_db()
    assert client.get("/api/designs/news2-chart").json()["version"] == 2


def test_user_designs_are_left_alone(client, monkeypatch):
    doc = Design.model_validate(copy.deepcopy(defaults.DEFAULT_DESIGNS["icu-monitor"])).model_dump(mode="json")
    doc["name"] = "My ward"
    doc["tiles"]["width_px"] = 150
    ts = db.now_iso()
    with db.session() as con:
        con.execute("INSERT INTO designs (id, name, description, builtin, parent_id, current_version, "
                    "created_at, updated_at) VALUES ('my-ward', 'My ward', '', 0, 'icu-monitor', 1, ?, ?)", (ts, ts))
        con.execute("INSERT INTO design_versions (design_id, version, document, source, author, note, created_at) "
                    "VALUES ('my-ward', 1, ?, 'manual', 'RN A', '', ?)",
                    (Design.model_validate(doc).model_dump_json(), ts))
    db.init_db()
    with db.session() as con:
        assert [v["version"] for v in _versions(con, "my-ward")] == [1]
        assert json.loads(_versions(con, "my-ward")[0]["document"])["tiles"]["width_px"] == 150
