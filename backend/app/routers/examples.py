"""Example data: scripted scenarios at a chosen minute. Placeholder, always badged."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app import examples
from app.models.example import ExampleScenarioInfo, ExampleSnapshot, MeasuredReading
from app.scenarios import SCENARIOS

router = APIRouter(prefix="/api/examples", tags=["examples"])


@router.get("")
def list_examples() -> list[ExampleScenarioInfo]:
    return examples.list_scenarios()


@router.get("/{scenario}/measure")
def measure(scenario: str, kind: str, minute: float = 0.0) -> MeasuredReading:
    """A simulated cuff or thermometer reading: what the scenario says the value is at that minute."""
    if scenario not in SCENARIOS:
        raise HTTPException(404, f"Unknown scenario {scenario}")
    if kind not in ("bp", "temp"):
        raise HTTPException(422, "kind must be 'bp' or 'temp'")
    return examples.measure_now(scenario, kind, minute)


@router.get("/{scenario}")
def get_example(scenario: str, minute: float = 0.0) -> ExampleSnapshot:
    """One stateless snapshot. Nothing is stored; the same minute gives the same picture."""
    if scenario not in SCENARIOS:
        raise HTTPException(404, f"Unknown scenario {scenario}")
    return examples.snapshot(scenario, minute)
