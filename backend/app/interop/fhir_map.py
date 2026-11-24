"""FHIR R4 mapping (milestone M8). See docs/briefs/M8-interop.md and docs/interop.md.

Pure functions between ``app.models.clinical`` objects and FHIR R4 JSON dicts.

Outbound
  patient_to_fhir(Patient) -> Patient          (NHS number: registry.NHS_NUMBER_SYSTEM)
  observation_to_fhir(Observation, patient_id) -> Observation
      category vital-signs, code from registry.PARAMETERS[...].coding, UCUM unit,
      device reference when device_id is set.
  bp_to_fhir(sys, dia, mean, at, patient_id) -> Observation (panel 85354-9 with components)
  oxygen_to_fhir(OxygenTherapy, patient_id) -> Observation (3151-8, device as component)
  news2_to_fhir(ObservationSet, patient_id) -> Observation (total score, components, derivedFrom)
  lab_to_fhir(LabResult, patient_id) -> Observation (category laboratory, referenceRange,
      interpretation H/L/HH/LL)
  imaging_to_fhir(ImagingStudy, patient_id) -> DiagnosticReport
  forecast_to_fhir(EventPrediction, patient_id) -> RiskAssessment
      (prediction.probabilityDecimal, whenRange, method = model name/version)
  finding_to_fhir(Finding, patient_id) -> Observation (category 'survey', note = summary,
      derivedFrom evidence; mark as AI-generated via an extension)
  capability_statement() -> CapabilityStatement

Inbound
  bundle_to_models(bundle) -> (list[Patient], list[Observation], list[LabResult])
      Accepts transaction/batch/collection Bundles; maps by LOINC/SNOMED code using the
      registry; unknown codes are returned in an OperationOutcome warning, not dropped
      silently.

Codes marked provisional in the registry must be verified before this milestone is done.
"""

from __future__ import annotations

M = "M8"


def capability_statement() -> dict:
    raise NotImplementedError(M)


def patient_to_fhir(patient) -> dict:
    raise NotImplementedError(M)


def observation_to_fhir(obs, patient_id: str) -> dict:
    raise NotImplementedError(M)


def bp_to_fhir(sys, dia, mean, at, patient_id: str) -> dict:
    raise NotImplementedError(M)


def oxygen_to_fhir(o2, patient_id: str) -> dict:
    raise NotImplementedError(M)


def news2_to_fhir(obs_set, patient_id: str) -> dict:
    raise NotImplementedError(M)


def lab_to_fhir(lab, patient_id: str) -> dict:
    raise NotImplementedError(M)


def imaging_to_fhir(study, patient_id: str) -> dict:
    raise NotImplementedError(M)


def forecast_to_fhir(event, patient_id: str) -> dict:
    raise NotImplementedError(M)


def finding_to_fhir(finding, patient_id: str) -> dict:
    raise NotImplementedError(M)


def bundle_to_models(bundle: dict):
    raise NotImplementedError(M)


def operation_outcome(severity: str, code: str, diagnostics: str) -> dict:
    """Small helper used by the stub routes too."""
    return {"resourceType": "OperationOutcome",
            "issue": [{"severity": severity, "code": code, "diagnostics": diagnostics}]}
