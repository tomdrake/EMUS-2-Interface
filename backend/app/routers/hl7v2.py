"""HL7 v2 over HTTP (M8): ORU^R01 and ADT^A01/A04/A08 in, ORU^R01 out."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse

router = APIRouter(tags=["hl7v2"])
HL7 = "x-application/hl7-v2+er7"


@router.post("/hl7v2")
async def receive(request: Request) -> PlainTextResponse:
    """Body is one ER7 message. Responds with an ACK (AA / AE / AR)."""
    return PlainTextResponse("not implemented (M8)", status_code=501)


@router.get("/api/patients/{patient_id}/hl7v2/oru")
def export_oru(patient_id: str, minutes: int = 60) -> PlainTextResponse:
    return PlainTextResponse("not implemented (M8)", status_code=501)
