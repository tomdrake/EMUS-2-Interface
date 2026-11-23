"""Shared helper for routes that are scaffolded but not yet implemented."""

from __future__ import annotations

from fastapi import HTTPException


def todo(milestone: str, what: str = ""):
    """Raise HTTP 501 naming the milestone that implements this route."""
    raise HTTPException(status_code=501, detail={
        "error": "not_implemented",
        "milestone": milestone,
        "what": what,
        "brief": f"docs/briefs/{milestone}*.md",
    })
