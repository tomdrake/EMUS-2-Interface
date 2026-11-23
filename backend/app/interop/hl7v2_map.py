"""HL7 v2.x mapping (milestone M8). See docs/briefs/M8-interop.md.

Pure functions. No external HL7 library is required: v2 is pipe-delimited and the
subset handled here is small, but escape sequences (\\F\\ \\S\\ \\T\\ \\R\\ \\E\\) and
the MSH-1/MSH-2 delimiters must be honoured rather than assuming '|^~\\&'.

Inbound
  parse(message: str) -> list of segments (each a list of fields -> components)
  adt_to_patient(message) -> Patient            ADT^A01 / A04 / A08: PID, PV1
  oru_to_models(message) -> (patient_id, list[Observation], list[LabResult])
      ORU^R01: OBX-3 code (LOINC preferred) mapped through the registry, OBX-5 value,
      OBX-6 units, OBX-7 reference range, OBX-8 flags, OBX-14 time.
  ack(message, code='AA', text='') -> str       MSA|AA|<MSH-10>

Outbound
  observations_to_oru(patient, observations, *, sending_app='EMUS2') -> str
"""

from __future__ import annotations

M = "M8"


def parse(message: str):
    raise NotImplementedError(M)


def adt_to_patient(message: str):
    raise NotImplementedError(M)


def oru_to_models(message: str):
    raise NotImplementedError(M)


def ack(message: str, code: str = "AA", text: str = "") -> str:
    raise NotImplementedError(M)


def observations_to_oru(patient, observations, *, sending_app: str = "EMUS2") -> str:
    raise NotImplementedError(M)
