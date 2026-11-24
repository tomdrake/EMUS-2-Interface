"""Redesign by chat (M5)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.ai.llm import LLMProvider
from app.routers._stub import todo

router = APIRouter(prefix="/api", tags=["chat"])


def get_llm_provider() -> LLMProvider:
    """The active provider built from stored settings / environment variables.

    Tests replace this with ``app.dependency_overrides[get_llm_provider]``.
    Raises HTTP 409 with a clear message when no token is configured.
    """
    todo("M5", "build the active LLM provider from settings")


class ChatRequest(BaseModel):
    design_id: str
    message: str
    model: str | None = None      # default: the active provider's stored model
    author: str = ""


@router.post("/chat")
async def chat(body: ChatRequest, provider: LLMProvider = Depends(get_llm_provider)) -> dict:
    """Send a redesign request.

    Response: {'message_id', 'text', 'summary', 'ok', 'errors', 'ops',
               'document' (preview, when ok), 'touched', 'model'}.
    Nothing is saved to the design until /chat/{id}/apply.
    """
    todo("M5", "redesign by chat")


@router.post("/chat/{message_id}/apply")
def apply(message_id: int, author: str = "") -> dict:
    """Save the proposed patch as a new design version (source='chat')."""
    todo("M5", "apply a proposed patch")


@router.post("/chat/{message_id}/discard")
def discard(message_id: int) -> dict:
    todo("M5", "discard a proposed patch")


@router.get("/designs/{design_id}/chat")
def history(design_id: str) -> list[dict]:
    todo("M5", "chat history for a design")
