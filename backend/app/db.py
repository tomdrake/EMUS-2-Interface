"""SQLite access: connection, schema, seeding, and read access to designs.

Write operations on designs (save a version, revert, duplicate, import) belong
to milestone M4 and live in ``app.routers.designs``; the helpers they need are
sketched at the bottom of this file.
"""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from app.defaults import DEFAULT_DESIGNS
from app.models.design import Design

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = Path(__file__).with_name("schema.sql")
DEFAULT_ACTIVE_DESIGN = "icu-monitor"


def db_path() -> Path:
    return Path(os.environ.get("EMUS_DB", ROOT / "data" / "emus.sqlite3"))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def connect(path: Path | None = None) -> sqlite3.Connection:
    path = path or db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


@contextmanager
def session(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    """One connection per unit of work; commits on success, rolls back on error."""
    con = connect(path)
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db(path: Path | None = None) -> None:
    """Create tables (idempotent) and seed the built-in designs."""
    with session(path) as con:
        con.executescript(SCHEMA_PATH.read_text())
        seed_designs(con)


def seed_designs(con: sqlite3.Connection) -> None:
    """Make the built-in designs match the shipped defaults.

    A missing built-in design is inserted. One whose stored document differs from
    the shipped default gets a new ``seed`` version, so a database created by an
    earlier build picks up changed defaults. Built-in designs are read-only, so
    nothing a user made is touched; copies they made are separate designs.
    """
    ts = now_iso()
    for slug, doc in DEFAULT_DESIGNS.items():
        design = Design.model_validate(doc)
        shipped = design.model_dump_json()
        meta = con.execute("SELECT current_version FROM designs WHERE id = ?", (slug,)).fetchone()
        if meta is None:
            con.execute(
                "INSERT INTO designs (id, name, description, builtin, current_version, "
                "created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)",
                (slug, design.name, design.description, ts, ts),
            )
            con.execute(
                "INSERT INTO design_versions (design_id, version, document, source, author, "
                "note, created_at) VALUES (?, 1, ?, 'seed', 'system', 'Built-in design', ?)",
                (slug, shipped, ts),
            )
            continue
        current = con.execute(
            "SELECT document FROM design_versions WHERE design_id = ? AND version = ?",
            (slug, meta["current_version"])).fetchone()
        if current is not None and _same_design(current["document"], shipped):
            continue
        version = meta["current_version"] + 1
        con.execute(
            "INSERT INTO design_versions (design_id, version, document, source, author, "
            "note, created_at) VALUES (?, ?, ?, 'seed', 'system', "
            "'Built-in design updated to the shipped defaults', ?)",
            (slug, version, shipped, ts),
        )
        con.execute(
            "UPDATE designs SET name = ?, description = ?, current_version = ?, updated_at = ? "
            "WHERE id = ?", (design.name, design.description, version, ts, slug))
    if not con.execute("SELECT 1 FROM settings WHERE key = 'active_design'").fetchone():
        con.execute("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
                    ("active_design", DEFAULT_ACTIVE_DESIGN, ts))


def _same_design(stored_json: str, shipped_json: str) -> bool:
    """Compare as validated documents, so an older document that is missing a field the
    defaults now fill in is treated as the same only if filling it in changes nothing."""
    try:
        return Design.model_validate_json(stored_json).model_dump() == \
            Design.model_validate_json(shipped_json).model_dump()
    except Exception:
        return False  # an old document that no longer validates is replaced


# ---------------------------------------------------------------- design reads

def list_designs(con: sqlite3.Connection) -> list[dict]:
    rows = con.execute(
        "SELECT id, name, description, builtin, parent_id, current_version, created_at, "
        "updated_at FROM designs ORDER BY builtin DESC, updated_at DESC").fetchall()
    return [dict(r) | {"builtin": bool(r["builtin"])} for r in rows]


def get_design(con: sqlite3.Connection, design_id: str, version: int | None = None) -> dict | None:
    """Return {'meta': ..., 'version': n, 'document': {...}} or None."""
    meta = con.execute("SELECT * FROM designs WHERE id = ?", (design_id,)).fetchone()
    if meta is None:
        return None
    v = version or meta["current_version"]
    row = con.execute(
        "SELECT version, document, source, author, note, created_at FROM design_versions "
        "WHERE design_id = ? AND version = ?", (design_id, v)).fetchone()
    if row is None:
        return None
    return {
        "meta": dict(meta) | {"builtin": bool(meta["builtin"])},
        "version": row["version"],
        "source": row["source"],
        "author": row["author"],
        "note": row["note"],
        "created_at": row["created_at"],
        "document": json.loads(row["document"]),
    }


def get_setting(con: sqlite3.Connection, key: str, default: str | None = None) -> str | None:
    row = con.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


# --------------------------------------------------------- design writes (M4)

class DesignError(Exception):
    """A refused design operation. ``status`` is the HTTP status the router should return."""

    def __init__(self, status: int, message: str, errors: list[str] | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors or []


def audit(con: sqlite3.Connection, actor: str, action: str, target: str, detail: dict | None = None) -> None:
    con.execute("INSERT INTO audit_log (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)",
                (now_iso(), actor or "", action, target, json.dumps(detail or {})))


def set_setting(con: sqlite3.Connection, key: str, value: str) -> None:
    con.execute("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                (key, value, now_iso()))


def slugify(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-")
    while "--" in out:
        out = out.replace("--", "-")
    return out[:40].strip("-") or "design"


def unique_id(con: sqlite3.Connection, name: str) -> str:
    base = slugify(name)
    candidate, n = base, 2
    while con.execute("SELECT 1 FROM designs WHERE id = ?", (candidate,)).fetchone():
        candidate = f"{base}-{n}"
        n += 1
    return candidate


def _meta(con: sqlite3.Connection, design_id: str) -> sqlite3.Row:
    meta = con.execute("SELECT * FROM designs WHERE id = ?", (design_id,)).fetchone()
    if meta is None:
        raise DesignError(404, f"design {design_id!r} not found")
    return meta


def _editable(con: sqlite3.Connection, design_id: str) -> sqlite3.Row:
    meta = _meta(con, design_id)
    if meta["builtin"]:
        raise DesignError(409, "built-in designs are read-only: duplicate this design to edit a copy")
    return meta


def _insert_version(con: sqlite3.Connection, design_id: str, version: int, document: dict, *,
                    patch: list[dict] | None, source: str, author: str, note: str,
                    chat_message_id: int | None = None) -> None:
    con.execute(
        "INSERT INTO design_versions (design_id, version, document, patch, source, author, note, "
        "chat_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (design_id, version, json.dumps(document), None if patch is None else json.dumps(patch),
         source, author, note, chat_message_id, now_iso()))


def save_version(con: sqlite3.Connection, design_id: str, *, document: dict | None = None,
                 ops: list[dict] | None = None, source: str = "manual", author: str = "",
                 note: str = "", chat_message_id: int | None = None) -> int:
    """Validate and store a new immutable version; returns its number.

    Exactly one of ``document`` (full replacement) or ``ops`` (a JSON Patch on the current version)
    is given. Built-in designs are refused (duplicate first). Invalid designs are refused with the
    validator's errors. History is never rewritten.
    """
    from app import patching

    if source not in ("manual", "chat", "import"):
        raise DesignError(422, f"unknown source {source!r}", [f"source must be manual, chat or import"])
    if (document is None) == (ops is None):
        raise DesignError(422, "give either a document or a patch, not both or neither",
                          ["give either 'document' or 'ops'"])
    meta = _editable(con, design_id)
    current = get_design(con, design_id)["document"]  # type: ignore[index]
    result = patching.validate_design(document) if document is not None else patching.apply_patch(current, ops)
    if not result.ok:
        raise DesignError(422, "the design is not valid", result.errors)
    new_doc = result.design
    assert new_doc is not None
    patch = patching.diff(current, new_doc)
    version = meta["current_version"] + 1
    _insert_version(con, design_id, version, new_doc, patch=patch, source=source, author=author,
                    note=note, chat_message_id=chat_message_id)
    con.execute("UPDATE designs SET name = ?, description = ?, current_version = ?, updated_at = ? WHERE id = ?",
                (new_doc["name"], new_doc.get("description", ""), version, now_iso(), design_id))
    audit(con, author, "design.save", design_id, {"version": version, "source": source,
                                                    "touched": patching._touched(patch), "note": note})
    return version


def revert(con: sqlite3.Connection, design_id: str, to_version: int, *, author: str = "") -> int:
    """Save a NEW version whose document equals an old one. History is never rewritten."""
    from app import patching

    meta = _editable(con, design_id)
    old = get_design(con, design_id, to_version)
    if old is None:
        raise DesignError(404, f"design {design_id!r} has no version {to_version}")
    current = get_design(con, design_id)["document"]  # type: ignore[index]
    version = meta["current_version"] + 1
    _insert_version(con, design_id, version, old["document"], patch=patching.diff(current, old["document"]),
                    source="revert", author=author, note=f"Reverted to version {to_version}")
    con.execute("UPDATE designs SET name = ?, current_version = ?, updated_at = ? WHERE id = ?",
                (old["document"]["name"], version, now_iso(), design_id))
    audit(con, author, "design.revert", design_id, {"version": version, "to": to_version})
    return version


def duplicate(con: sqlite3.Connection, design_id: str, new_name: str, *, author: str = "") -> str:
    """A new, editable design copied from any design (built-in or not), with its parent recorded."""
    from app import patching

    src = get_design(con, design_id)
    if src is None:
        raise DesignError(404, f"design {design_id!r} not found")
    doc = dict(src["document"])
    doc["name"] = new_name.strip()[:60] or "Copy"
    result = patching.validate_design(doc)
    if not result.ok:
        raise DesignError(422, "the copy is not valid", result.errors)
    new_id = unique_id(con, doc["name"])
    ts = now_iso()
    con.execute("INSERT INTO designs (id, name, description, builtin, parent_id, current_version, created_at, "
                "updated_at) VALUES (?, ?, ?, 0, ?, 1, ?, ?)",
                (new_id, doc["name"], doc.get("description", ""), design_id, ts, ts))
    _insert_version(con, new_id, 1, result.design or doc, patch=None, source="manual", author=author,
                    note=f"Copy of {src['meta']['name']}")
    audit(con, author, "design.duplicate", new_id, {"from": design_id})
    return new_id


def set_active(con: sqlite3.Connection, design_id: str, *, author: str = "") -> None:
    _meta(con, design_id)
    set_setting(con, "active_design", design_id)
    audit(con, author, "design.activate", design_id)


def delete_design(con: sqlite3.Connection, design_id: str, *, author: str = "") -> None:
    _editable(con, design_id)
    con.execute("UPDATE designs SET parent_id = NULL WHERE parent_id = ?", (design_id,))
    con.execute("DELETE FROM designs WHERE id = ?", (design_id,))
    if get_setting(con, "active_design") == design_id:
        set_setting(con, "active_design", DEFAULT_ACTIVE_DESIGN)
    audit(con, author, "design.delete", design_id)


def list_versions(con: sqlite3.Connection, design_id: str) -> list[dict]:
    from app import patching

    _meta(con, design_id)
    out = []
    for r in con.execute("SELECT version, source, author, note, patch, created_at FROM design_versions "
                         "WHERE design_id = ? ORDER BY version DESC", (design_id,)):
        patch = json.loads(r["patch"]) if r["patch"] else None
        out.append({"version": r["version"], "source": r["source"], "author": r["author"], "note": r["note"],
                    "created_at": r["created_at"], "patch": patch,
                    "touched": patching._touched(patch) if patch else []})
    return out


def export_design(con: sqlite3.Connection, design_id: str) -> dict:
    found = get_design(con, design_id)
    if found is None:
        raise DesignError(404, f"design {design_id!r} not found")
    versions = []
    for r in con.execute("SELECT version, document, patch, source, author, note, created_at FROM design_versions "
                         "WHERE design_id = ? ORDER BY version", (design_id,)):
        versions.append({"version": r["version"], "document": json.loads(r["document"]),
                         "patch": json.loads(r["patch"]) if r["patch"] else None, "source": r["source"],
                         "author": r["author"], "note": r["note"], "created_at": r["created_at"]})
    return {"format": "emus-design/1", "meta": found["meta"], "version": found["version"],
            "document": found["document"], "versions": versions}


def import_design(con: sqlite3.Connection, payload: dict, *, author: str = "") -> str:
    """Import an exported design (or a bare design document) as a new, editable design. The
    document is validated like any other; the history it came with is not replayed."""
    from app import patching

    doc = payload.get("document") if isinstance(payload.get("document"), dict) else payload
    result = patching.validate_design(doc)
    if not result.ok:
        raise DesignError(422, "the design is not valid", result.errors)
    design = result.design or {}
    new_id = unique_id(con, design["name"])
    ts = now_iso()
    con.execute("INSERT INTO designs (id, name, description, builtin, parent_id, current_version, created_at, "
                "updated_at) VALUES (?, ?, ?, 0, NULL, 1, ?, ?)",
                (new_id, design["name"], design.get("description", ""), ts, ts))
    n = len(payload.get("versions", [])) if isinstance(payload.get("versions"), list) else 0
    _insert_version(con, new_id, 1, design, patch=None, source="import", author=author,
                    note="Imported" + (f" (exported with {n} versions)" if n else ""))
    audit(con, author, "design.import", new_id)
    return new_id
