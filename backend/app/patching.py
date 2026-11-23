"""Apply and validate edits to a design document.

This is the safety boundary for chatbot and studio edits. An edit is an RFC 6902
JSON Patch. It is applied to a *copy* of the current design and the result must
validate as a ``Design``; otherwise nothing changes and the caller gets errors it
can show to the user or feed back to the model for one retry.

Because the patch can only ever produce a ``Design``, it cannot add, rename or
remove clinical parameters, codes, units, scoring rules or any other data
structure: those live in ``app.registry`` and ``app.models.clinical``.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field

import jsonpatch
from pydantic import ValidationError

from app.models.design import Design

MAX_OPS = 200
_ALLOWED_OPS = {"add", "remove", "replace", "move", "copy", "test"}


@dataclass
class PatchResult:
    ok: bool
    design: dict | None = None
    errors: list[str] = field(default_factory=list)
    #: Top-level sections of the design that the patch touched.
    touched: list[str] = field(default_factory=list)


def _check_ops(ops: object) -> list[str]:
    if not isinstance(ops, list):
        return ["patch must be a JSON array of operations"]
    if not ops:
        return ["patch is empty"]
    if len(ops) > MAX_OPS:
        return [f"patch has {len(ops)} operations; the limit is {MAX_OPS}"]
    errors: list[str] = []
    for i, op in enumerate(ops):
        if not isinstance(op, dict):
            errors.append(f"op {i}: must be an object")
            continue
        if op.get("op") not in _ALLOWED_OPS:
            errors.append(f"op {i}: unknown operation {op.get('op')!r}")
        path = op.get("path")
        if not isinstance(path, str) or not path.startswith("/"):
            errors.append(f"op {i}: path must be a JSON Pointer starting with '/'")
        elif path == "/schema_version":
            errors.append(f"op {i}: schema_version cannot be changed")
    return errors


def _touched(ops: list[dict]) -> list[str]:
    out: list[str] = []
    for op in ops:
        for key in ("path", "from"):
            p = op.get(key)
            if isinstance(p, str) and p.startswith("/"):
                top = p.split("/")[1]
                if top and top not in out:
                    out.append(top)
    return out


def _format(e: ValidationError) -> list[str]:
    out = []
    for err in e.errors():
        loc = "/" + "/".join(str(x) for x in err["loc"]) if err["loc"] else "(design)"
        out.append(f"{loc}: {err['msg']}")
    return out


def validate_design(doc: object) -> PatchResult:
    """Validate a whole design document (import, manual save)."""
    try:
        design = Design.model_validate(doc)
    except ValidationError as e:
        return PatchResult(False, errors=_format(e))
    return PatchResult(True, design=design.model_dump(mode="json"))


def apply_patch(current: dict, ops: object) -> PatchResult:
    """Apply ``ops`` to a copy of ``current``. Never mutates ``current``."""
    errors = _check_ops(ops)
    if errors:
        return PatchResult(False, errors=errors)
    assert isinstance(ops, list)
    try:
        patched = jsonpatch.apply_patch(copy.deepcopy(current), ops, in_place=False)
    except (jsonpatch.JsonPatchException, jsonpatch.JsonPointerException,
            KeyError, IndexError, TypeError) as e:
        return PatchResult(False, errors=[f"patch could not be applied: {e}"])
    result = validate_design(patched)
    result.touched = _touched(ops)
    return result


def diff(before: dict, after: dict) -> list[dict]:
    """JSON Patch that turns ``before`` into ``after`` (stored with each version)."""
    return jsonpatch.make_patch(before, after).patch
