"""LLM providers for redesign-by-chat and for explaining findings (milestone M5).

Two wire formats:
  * Anthropic Messages API (Claude)            -> AnthropicProvider
  * OpenAI-compatible chat completions         -> OpenAICompatibleProvider
    used for Edinburgh ELM (https://elm.edina.ac.uk/api/v1, bearer token,
    GET /models, POST /chat/completions) and any other compatible gateway.

ELM does not publish its model list, so models are always fetched live from
``GET {base_url}/models``; never hard-code an ELM model id.

Privacy rule: redesign requests send the design document and the user's words
only. Patient data is never included in a redesign prompt.

Implementers: read the current Claude API reference before writing
AnthropicProvider (model ids, tool-use format, error shapes); do not rely on
memory.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

import httpx

from app import registry
from app.models.design import json_schema

M = "M5"

ELM_BASE_URL = "https://elm.edina.ac.uk/api/v1"
ProviderId = Literal["anthropic", "elm", "openai-compatible"]

#: Neutral tool definition. Providers wrap it in their own envelope.
PROPOSE_PATCH_TOOL = {
    "name": "propose_design_patch",
    "description": (
        "Propose a change to the monitor's design document as an RFC 6902 JSON Patch. "
        "The patch is applied to a copy and validated; the user previews it and decides "
        "whether to apply it."
    ),
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "required": ["summary", "ops"],
        "properties": {
            "summary": {
                "type": "string",
                "description": "One or two plain sentences saying what will change on screen.",
            },
            "ops": {
                "type": "array",
                "minItems": 1,
                "maxItems": 200,
                "items": {
                    "type": "object",
                    "required": ["op", "path"],
                    "properties": {
                        "op": {"enum": ["add", "remove", "replace", "move", "copy", "test"]},
                        "path": {"type": "string", "description": "JSON Pointer"},
                        "from": {"type": "string"},
                        "value": {},
                    },
                },
            },
        },
    },
}

SYSTEM_PROMPT = """\
You help clinicians redesign a bedside patient monitor during a co-design workshop.

You can change ONE thing: the design document, a JSON object that controls the
monitor's appearance and arrangement (theme and colours, screens and layout,
rows, tabs and menus, alarm default limits, how AI findings and forecasts are
displayed). You change it by calling propose_design_patch with a JSON Patch.

Hard rules
- You cannot add, rename or remove clinical parameters, units, codes, scoring
  rules, lab tests, event types or certainty metrics. Those are fixed and are
  listed under "Fixed vocabulary". Refer to them only by the ids given.
- The patched document must validate against the JSON Schema below. If you are
  told a patch was invalid, read the errors and propose a corrected patch.
- These must always remain: the patient name and the clock in the top bar;
  exactly one alarm-silence button and one settings button in the tab bar; a
  menu with id "settings". Menus cannot open other menus (everything stays
  within two touches).
- Monitoring problems (alarm sound paused, standby, connection lost, low battery,
  poor trace) can be moved and recoloured under "safety" and the theme, but there
  is no way to hide them and you must not try. Their colours must stay different
  from each other and from the patient alarm colours.
- Tappable things must stay at least 48 px. Keep text readable against its
  background (aim for a contrast ratio of 4.5:1 or better) and keep alarm
  colours clearly distinguishable from parameter colours.
- Change only what was asked for. Use the smallest patch that does it. Prefer
  "replace" on specific fields to replacing whole sections.
- You have no access to patient data and must not ask for any.

How to respond
- If the request is clear, call propose_design_patch. Put a short plain-language
  summary of what will change on screen in "summary".
- If the request is ambiguous, ask one short question instead of guessing.
- If the request needs something outside the design document (new data, a new
  parameter, a clinical decision), say so plainly and suggest the closest thing
  the design can do.
- Write for a busy nurse or doctor: short, plain, no jargon about JSON.
"""


def fixed_vocabulary() -> dict:
    """Ids the model may reference, with labels, so it can map words to ids."""
    return {
        "parameters": {k: v.label for k, v in registry.PARAMETERS.items()},
        "waveforms": {k: v["label"] for k, v in registry.WAVEFORMS.items()},
        "lab_groups": registry.LAB_GROUPS,
        "event_types": {k: v["label"] for k, v in registry.EVENT_TYPES.items()},
        "certainty_metrics": {k: f"{v.label}: {v.tells_you}"
                              for k, v in registry.CERTAINTY_METRICS.items()},
    }


def build_system_prompt(design: dict) -> str:
    """System prompt with schema, fixed vocabulary and the current design."""
    return "\n\n".join([
        SYSTEM_PROMPT,
        "## Fixed vocabulary\n" + json.dumps(fixed_vocabulary(), indent=1),
        "## Design JSON Schema\n" + json.dumps(json_schema(), separators=(",", ":")),
        "## Current design document\n" + json.dumps(design, separators=(",", ":")),
    ])


@dataclass
class ChatTurn:
    role: Literal["user", "assistant"]
    content: str


@dataclass
class Proposal:
    """What a provider returns for one redesign request."""

    text: str = ""                       # assistant's words (question, refusal, or summary)
    ops: list[dict] | None = None        # None when the model asked a question / declined
    summary: str = ""
    model: str = ""
    #: Certainty about the proposal where the endpoint supports it (e.g. token logprobs).
    certainty: list[dict] = field(default_factory=list)
    raw_usage: dict = field(default_factory=dict)


class LLMError(Exception):
    """Provider failure with a message safe to show to the user (no token values)."""

    def __init__(self, message: str, *, status: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status = status
        self.retryable = retryable


class LLMProvider(ABC):
    id: ProviderId

    @abstractmethod
    async def list_models(self) -> list[dict]:
        """[{'id': ..., 'label': ...}] fetched live from the provider."""

    @abstractmethod
    async def propose(self, *, system: str, turns: list[ChatTurn], model: str) -> Proposal:
        """Send the conversation with PROPOSE_PATCH_TOOL available and return the result.

        Must fall back to parsing a fenced ```json {"summary":..,"ops":[..]} ``` block
        from the text when the model or gateway does not support tool calls.
        """

    @abstractmethod
    async def answer(self, *, system: str, turns: list[ChatTurn], model: str) -> str:
        """Plain text answer (used by 'ask about this finding')."""


class AnthropicProvider(LLMProvider):
    id = "anthropic"

    def __init__(self, api_key: str, *, base_url: str = "https://api.anthropic.com",
                 client: "httpx.AsyncClient | None" = None):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.client = client  # injected in tests (httpx.MockTransport)

    async def list_models(self):
        raise NotImplementedError(M)

    async def propose(self, *, system, turns, model):
        raise NotImplementedError(M)

    async def answer(self, *, system, turns, model):
        raise NotImplementedError(M)


class OpenAICompatibleProvider(LLMProvider):
    id = "openai-compatible"

    def __init__(self, api_key: str, *, base_url: str = ELM_BASE_URL,
                 provider_id: ProviderId = "elm",
                 client: "httpx.AsyncClient | None" = None):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.id = provider_id
        self.client = client  # injected in tests (httpx.MockTransport)

    async def list_models(self):
        raise NotImplementedError(M)

    async def propose(self, *, system, turns, model):
        raise NotImplementedError(M)

    async def answer(self, *, system, turns, model):
        raise NotImplementedError(M)


def extract_json_proposal(text: str) -> tuple[str, list[dict]] | None:
    """Fallback parser: find {"summary": ..., "ops": [...]} in model text."""
    raise NotImplementedError(M)


async def propose_validated(provider: LLMProvider, *, design: dict, turns: list[ChatTurn],
                            model: str, max_retries: int = 1):
    """Ask for a patch, apply it with patching.apply_patch, and on validation failure
    feed the errors back for up to ``max_retries`` corrections.

    Returns (Proposal, patching.PatchResult | None).
    """
    raise NotImplementedError(M)
