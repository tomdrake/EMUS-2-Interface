"""Design documents: registry, schema, read access (done) and versioned writes (M4)."""

from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, Field

from app import db, patching, registry
from app.defaults import THEME_PRESETS
from app.models.design import json_schema, max_touch_depth, Design
from app.routers._stub import todo

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


# ------------------------------------------------------------------ M4 (stubs)

class SaveRequest(BaseModel):
    """Exactly one of ``document`` (full replacement) or ``ops`` (patch) is given."""

    document: dict | None = None
    ops: list[dict] | None = None
    author: str = ""
    note: str = ""
    source: str = "manual"  # 'manual' | 'chat' | 'import'
    chat_message_id: int | None = None


@router.put("/active-design")
def set_active_design(design_id: str = Body(..., embed=True)) -> dict:
    todo("M4", "choose which design is shown on start-up")


@router.post("/designs/{design_id}/versions")
def save_version(design_id: str, body: SaveRequest) -> dict:
    """Validate and store a new immutable version. 409 for built-in designs
    (duplicate first), 422 with errors when validation fails."""
    todo("M4", "save a new design version")


@router.get("/designs/{design_id}/versions")
def list_versions(design_id: str) -> list[dict]:
    todo("M4", "version history with author, note, source and touched sections")


@router.post("/designs/{design_id}/revert")
def revert(design_id: str, version: int = Body(..., embed=True),
           author: str = Body("", embed=True)) -> dict:
    todo("M4", "revert by saving a new version equal to an old one")


class DuplicateRequest(BaseModel):
    name: str
    author: str = ""


@router.post("/designs/{design_id}/duplicate")
def duplicate(design_id: str, body: DuplicateRequest) -> dict:
    todo("M4", "copy a design so it can be edited")


@router.delete("/designs/{design_id}")
def delete_design(design_id: str) -> dict:
    todo("M4", "delete a non-builtin design")


@router.get("/designs/{design_id}/export")
def export_design(design_id: str) -> dict:
    todo("M4", "export design JSON with its version history")


@router.post("/designs/import")
def import_design(document: dict = Body(...)) -> dict:
    todo("M4", "import a design JSON as a new design")
