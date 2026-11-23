"""FHIR R4 REST facade (M8). Read access and Bundle ingest."""

from __future__ import annotations

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from app.interop.fhir_map import operation_outcome

router = APIRouter(prefix="/fhir", tags=["fhir"])
FHIR_JSON = "application/fhir+json"


def _todo(what: str) -> JSONResponse:
    return JSONResponse(
        operation_outcome("error", "not-supported", f"{what}: not implemented (M8)"),
        status_code=501, media_type=FHIR_JSON)


@router.get("/metadata")
def metadata():
    return _todo("CapabilityStatement")


@router.get("/Patient/{patient_id}")
def read_patient(patient_id: str):
    return _todo("Patient read")


@router.get("/Patient")
def search_patient(identifier: str | None = None):
    return _todo("Patient search")


@router.get("/Observation")
def search_observation(patient: str, category: str | None = None, code: str | None = None,
                       date: str | None = None, _count: int = 100):
    """category: vital-signs | laboratory | survey. Returns a searchset Bundle."""
    return _todo("Observation search")


@router.get("/DiagnosticReport")
def search_diagnostic_report(patient: str):
    return _todo("DiagnosticReport search")


@router.get("/Device")
def search_device(patient: str | None = None):
    return _todo("Device search")


@router.get("/RiskAssessment")
def search_risk_assessment(patient: str):
    return _todo("RiskAssessment search")


@router.post("")
def ingest_bundle(bundle: dict = Body(...)):
    """Accept a transaction/batch/collection Bundle of Patient and Observation resources."""
    return _todo("Bundle ingest")
