"""Alarm state, the two-minute silence, and history (M2)."""

from __future__ import annotations

from fastapi import APIRouter, Body

from app.routers._stub import todo

router = APIRouter(prefix="/api", tags=["alarms"])


@router.get("/patients/{patient_id}/alarms")
def alarm_state(patient_id: str) -> dict:
    """models.clinical.AlarmState: active alarms and ``silenced_until``."""
    todo("M2", "alarm state")


@router.post("/patients/{patient_id}/alarms/silence")
def silence(patient_id: str, by: str = Body("", embed=True)) -> dict:
    """Silence audio for registry.ALARM_SILENCE_SECONDS (120 s) from now.

    Visual alarm indication continues. A second call while silenced restarts the
    120 s. Returns AlarmState. The duration is fixed and is not a parameter.
    """
    todo("M2", "silence alarms for two minutes")


@router.delete("/patients/{patient_id}/alarms/silence")
def unsilence(patient_id: str) -> dict:
    todo("M2", "end the silence early")


@router.post("/patients/{patient_id}/alarms/{alarm_id}/acknowledge")
def acknowledge(patient_id: str, alarm_id: str, by: str = Body("", embed=True)) -> dict:
    todo("M2", "acknowledge an alarm")


@router.get("/patients/{patient_id}/alarms/history")
def history(patient_id: str, hours: int = 24) -> list[dict]:
    todo("M2", "alarm history")
