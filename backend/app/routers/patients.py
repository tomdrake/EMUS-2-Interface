"""Patients, observations, NEWS2 columns, oxygen, labs and imaging (M2, M3, M6)."""

from __future__ import annotations

from fastapi import APIRouter, Body

from app.models.clinical import AlarmLimit, OxygenTherapy
from app.routers._stub import todo

router = APIRouter(prefix="/api", tags=["patients"])


@router.get("/patients")
def list_patients() -> list[dict]:
    """Scenario patients are always present; MIMIC patients appear after `make mimic`."""
    todo("M2", "list patients (scenarios seeded at start-up)")


@router.get("/patients/{patient_id}")
def get_patient(patient_id: str) -> dict:
    """Patient, PatientSettings, current oxygen, and the source's SourceInfo."""
    todo("M2", "patient detail")


@router.put("/patients/{patient_id}/spo2-scale")
def set_spo2_scale(patient_id: str, scale: int = Body(..., embed=True),
                   by: str = Body("", embed=True)) -> dict:
    todo("M3", "switch SpO2 scale 1/2 (audited)")


@router.get("/patients/{patient_id}/trend")
def get_trend(patient_id: str, parameter: str, minutes: int = 60, max_points: int = 600) -> dict:
    """Down-sampled history for a row's trend trace: {'points': [[iso, value], ...]}."""
    todo("M2", "trend history for a parameter")


@router.get("/patients/{patient_id}/observation-sets")
def get_observation_sets(patient_id: str, hours: int = 24, source: str = "charted",
                         interval_min: int = 60) -> list[dict]:
    """NEWS2 chart columns, oldest first, each scored (see models.clinical.ObservationSet).
    source='continuous' derives a column every ``interval_min`` from the wearable feed."""
    todo("M3", "NEWS2 columns")


@router.post("/patients/{patient_id}/observation-sets")
def add_observation_set(patient_id: str, values: dict = Body(...)) -> dict:
    """Manual observation entry (BP, temperature, ACVPU ...); scored and stored."""
    todo("M3", "chart a manual observation set")


@router.get("/patients/{patient_id}/oxygen")
def get_oxygen(patient_id: str, hours: int = 24) -> dict:
    """{'current': OxygenTherapy | null, 'history': [...]}."""
    todo("M2", "oxygen therapy")


@router.post("/patients/{patient_id}/oxygen")
def set_oxygen(patient_id: str, body: OxygenTherapy) -> dict:
    todo("M2", "record oxygen flow and device")


@router.put("/patients/{patient_id}/alarm-limits/{parameter}")
def set_alarm_limit(patient_id: str, parameter: str, body: AlarmLimit) -> dict:
    """Per-patient override; validated against the registry min/max. Audited."""
    todo("M2", "set an alarm limit")


@router.delete("/patients/{patient_id}/alarm-limits/{parameter}")
def reset_alarm_limit(patient_id: str, parameter: str) -> dict:
    todo("M2", "reset a limit to the design default")


@router.get("/patients/{patient_id}/labs")
def get_labs(patient_id: str) -> dict:
    """{'series': [LabSeries], 'critical': [LabResult]} with UK units and ranges."""
    todo("M6", "lab results")


@router.get("/patients/{patient_id}/imaging")
def get_imaging(patient_id: str) -> list[dict]:
    todo("M6", "imaging studies")


@router.get("/imaging/{study_id}/image.svg")
def get_placeholder_image(study_id: str):
    """Schematic placeholder chest film (SVG). Real images need credentialed MIMIC-CXR."""
    todo("M6", "placeholder image")
