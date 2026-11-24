"""Example data: scripted scenarios at a chosen minute. Placeholder, always badged."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app import examples
from app.models.example import ExampleScenarioInfo, ExampleSnapshot
from app.scenarios import SCENARIOS

router = APIRouter(prefix="/api/examples", tags=["examples"])


@router.get("")
def list_examples() -> list[ExampleScenarioInfo]:
    return examples.list_scenarios()


@router.get("/{scenario}")
def get_example(scenario: str, minute: float = 0.0) -> ExampleSnapshot:
    """One stateless snapshot. Nothing is stored; the same minute gives the same picture."""
    if scenario not in SCENARIOS:
        raise HTTPException(404, f"Unknown scenario {scenario}")
    return examples.snapshot(scenario, minute)
