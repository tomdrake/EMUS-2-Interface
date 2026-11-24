"""Provider tokens and system settings (M5).

Tokens are write-only from the browser: GET returns whether one is set and its
last four characters, never the value. Environment variables ANTHROPIC_API_KEY,
ELM_API_KEY and ELM_BASE_URL take precedence over stored values.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.routers._stub import todo

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ProviderUpdate(BaseModel):
    api_key: str | None = None    # None = leave unchanged, '' = remove
    base_url: str | None = None
    model: str | None = None


@router.get("/providers")
def providers() -> dict:
    """{'active': 'anthropic'|'elm'|..., 'providers': {id: {'configured': bool,
    'key_hint': '…abcd', 'from_env': bool, 'base_url', 'model'}}}"""
    todo("M5", "provider settings")


@router.put("/providers/{provider_id}")
def update_provider(provider_id: str, body: ProviderUpdate) -> dict:
    todo("M5", "store a provider token")


@router.put("/active-provider")
def set_active_provider(provider_id: str) -> dict:
    todo("M5", "choose the provider used for chat")


@router.get("/providers/{provider_id}/models")
async def provider_models(provider_id: str) -> list[dict]:
    """Models fetched live from the provider (ELM's list is not public)."""
    todo("M5", "list provider models")


@router.post("/providers/{provider_id}/test")
async def test_provider(provider_id: str) -> dict:
    """{'ok': bool, 'message': str}: one cheap call to confirm the token works."""
    todo("M5", "test a provider token")
