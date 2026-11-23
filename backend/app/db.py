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


# ------------------------------------------------------ M4: to be implemented
# save_version(con, design_id, document, *, source, author, note, chat_message_id=None) -> int
#     Validate with patching.validate_design, refuse builtin designs (duplicate first),
#     store the full document plus patching.diff(previous, new), bump current_version,
#     write an audit_log row. Returns the new version number.
# revert(con, design_id, to_version, *, author) -> int
#     Saves a NEW version whose document equals an old one (source='revert'); history
#     is never rewritten.
# duplicate(con, design_id, new_name, *, author) -> str
#     New non-builtin design with parent_id set and version 1 copied from the source.
# set_setting(con, key, value) / set_secret / get_secret (env vars take precedence).
