"""Design documents: registry, schema, read access (done) and versioned writes (M4)."""

from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, Field

from app import db, patching, registry
from app.defaults import THEME_PRESETS
from app.models.design import json_schema, max_touch_depth, Design

router = APIRouter(prefix="/api", tags=["designs"])


@router.get("/registry")
def get_registry() -> dict:
    """Read-only clinical vocabulary the design may reference."""
    return registry.as_public_dict()


@router.get("/design-schema")
def get_design_schema() -> dict:
    return json_schema()


@router.get("/theme-presets")
def get_theme_presets() -> dict:
    return THEME_PRESETS


@router.get("/designs")
def list_designs() -> list[dict]:
    with db.session() as con:
        return db.list_designs(con)


@router.get("/active-design")
def get_active_design() -> dict:
    """The design this installation shows on start-up."""
    with db.session() as con:
        design_id = db.get_setting(con, "active_design", db.DEFAULT_ACTIVE_DESIGN)
        found = db.get_design(con, design_id) or db.get_design(con, db.DEFAULT_ACTIVE_DESIGN)
    if found is None:
        raise HTTPException(404, "no designs in the database")
    return found


@router.get("/designs/{design_id}")
def get_design(design_id: str, version: int | None = None) -> dict:
    with db.session() as con:
        found = db.get_design(con, design_id, version)
    if found is None:
        raise HTTPException(404, f"design {design_id!r} not found")
    return found


class PatchRequest(BaseModel):
    ops: list[dict] = Field(description="RFC 6902 JSON Patch")


@router.post("/designs/{design_id}/preview-patch")
def preview_patch(design_id: str, body: PatchRequest) -> dict:
    """Apply a patch to a copy of the current version and validate it. Saves nothing."""
    with db.session() as con:
        found = db.get_design(con, design_id)
    if found is None:
        raise HTTPException(404, f"design {design_id!r} not found")
    result = patching.apply_patch(found["document"], body.ops)
    out = {"ok": result.ok, "errors": result.errors, "touched": result.touched,
           "document": result.design}
    if result.ok:
        out["max_touch_depth"] = max_touch_depth(Design.model_validate(result.design))
    return out


@router.post("/validate-design")
def validate_design(document: dict = Body(...)) -> dict:
    result = patching.validate_design(document)
    return {"ok": result.ok, "errors": result.errors, "document": result.design}


# --------------------------------------------------------------- versioned writes (M4)

class SaveRequest(BaseModel):
    """Exactly one of ``document`` (full replacement) or ``ops`` (patch) is given."""

    document: dict | None = None
    ops: list[dict] | None = None
    author: str = ""
    note: str = ""
    source: str = "manual"  # 'manual' | 'chat' | 'import'
    chat_message_id: int | None = None


def _refuse(e: db.DesignError):
    """Map a refused operation to HTTP. 422 carries the validator's errors."""
    detail = {"message": e.message, "errors": e.errors} if e.status == 422 else e.message
    raise HTTPException(e.status, detail)


def _found(con, design_id: str) -> dict:
    found = db.get_design(con, design_id)
    assert found is not None
    return found


@router.put("/active-design")
def set_active_design(design_id: str = Body(..., embed=True), author: str = Body("", embed=True)) -> dict:
    """Choose which design is shown on start-up."""
    try:
        with db.session() as con:
            db.set_active(con, design_id, author=author)
            return _found(con, design_id)
    except db.DesignError as e:
        _refuse(e)


@router.post("/designs/{design_id}/versions")
def save_version(design_id: str, body: SaveRequest) -> dict:
    """Validate and store a new immutable version. 409 for built-in designs
    (duplicate first), 422 with errors when validation fails."""
    try:
        with db.session() as con:
            version = db.save_version(con, design_id, document=body.document, ops=body.ops, source=body.source,
                                      author=body.author, note=body.note, chat_message_id=body.chat_message_id)
            return _found(con, design_id) | {"version": version}
    except db.DesignError as e:
        _refuse(e)


@router.get("/designs/{design_id}/versions")
def list_versions(design_id: str) -> list[dict]:
    """Version history, newest first, with author, note, source and the sections each touched."""
    try:
        with db.session() as con:
            return db.list_versions(con, design_id)
    except db.DesignError as e:
        _refuse(e)


@router.post("/designs/{design_id}/revert")
def revert(design_id: str, version: int = Body(..., embed=True),
           author: str = Body("", embed=True)) -> dict:
    """Save a new version equal to an old one. History is never rewritten."""
    try:
        with db.session() as con:
            new = db.revert(con, design_id, version, author=author)
            return _found(con, design_id) | {"version": new}
    except db.DesignError as e:
        _refuse(e)


class DuplicateRequest(BaseModel):
    name: str
    author: str = ""


@router.post("/designs/{design_id}/duplicate")
def duplicate(design_id: str, body: DuplicateRequest) -> dict:
    """Copy a design (built-in or not) so it can be edited."""
    try:
        with db.session() as con:
            new_id = db.duplicate(con, design_id, body.name, author=body.author)
            return _found(con, new_id)
    except db.DesignError as e:
        _refuse(e)


@router.delete("/designs/{design_id}")
def delete_design(design_id: str) -> dict:
    try:
        with db.session() as con:
            db.delete_design(con, design_id)
        return {"deleted": design_id}
    except db.DesignError as e:
        _refuse(e)


@router.get("/designs/{design_id}/export")
def export_design(design_id: str) -> dict:
    """The design, its metadata and its whole version history, as JSON."""
    try:
        with db.session() as con:
            return db.export_design(con, design_id)
    except db.DesignError as e:
        _refuse(e)


@router.post("/designs/import")
def import_design(document: dict = Body(...)) -> dict:
    """Import an exported design (or a bare design document) as a new design."""
    try:
        with db.session() as con:
            new_id = db.import_design(con, document)
            return _found(con, new_id)
    except db.DesignError as e:
        _refuse(e)
