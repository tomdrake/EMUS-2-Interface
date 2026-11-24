"""Patients, observations, NEWS2 columns, oxygen, labs and imaging (M2, M3, M6)."""

from __future__ import annotations

from fastapi import APIRouter, Body
from pydantic import BaseModel

from app.models.clinical import AlarmLimit, OxygenTherapy
from app.routers._stub import todo

router = APIRouter(prefix="/api", tags=["patients"])


@router.get("/patients")
def list_patients(include_discharged: bool = False) -> list[dict]:
    """Scenario patients are always present; MIMIC patients appear after `make mimic`.
    Discharged patients are left out unless ``include_discharged`` is true."""
    todo("M2", "list patients (scenarios seeded at start-up)")


@router.get("/patients/{patient_id}")
def get_patient(patient_id: str) -> dict:
    """{'patient', 'settings', 'oxygen', 'source': SourceInfo, 'devices': [DeviceStatus],
    'signals': {parameter: SignalStatus}}."""
    todo("M2", "patient detail")


class AdmitRequest(BaseModel):
    family_name: str
    given_name: str
    title: str | None = None
    birth_date: str | None = None
    sex: str = "unknown"
    nhs_number: str | None = None
    ward: str | None = None
    bed: str | None = None
    #: Scenario to play for this patient (demo), or None for no feed yet: every
    #: modality then shows STANDBY until a device is connected.
    scenario_id: str | None = None
    by: str = ""


@router.post("/patients")
def admit_patient(body: AdmitRequest) -> dict:
    """New patient on this monitor. Starts with default alarm limits and SpO2 scale 1.

    Never carries anything over from the previous patient: limits, scale, silence,
    oxygen and trends all start fresh. 422 if the NHS number is malformed; 409 if a
    current (not discharged) patient already has that NHS number. Audited.
    Returns the same shape as GET /api/patients/{id}.
    """
    todo("M2", "admit a new patient")


@router.post("/patients/{patient_id}/discharge")
def discharge_patient(patient_id: str, by: str = Body("", embed=True),
                      confirm: bool = Body(False, embed=True)) -> dict:
    """Stop monitoring this patient and clear the screen for the next one.

    Requires ``confirm: true`` (400 otherwise): the sheet makes the user confirm by
    name. Sets ``discharged_at``, ends the stream, ends any silence, closes active
    alarms. The record is kept, not deleted. Audited. 409 if already discharged.
    """
    todo("M2", "discharge a patient")


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
