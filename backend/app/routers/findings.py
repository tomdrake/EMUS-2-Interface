"""AI findings and explanations (M7)."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from app.ai.llm import LLMProvider
from app.routers._stub import todo
from app.routers.chat import get_llm_provider

router = APIRouter(prefix="/api", tags=["ai"])


@router.get("/patients/{patient_id}/findings")
def list_findings(patient_id: str, window_hours: int = 24) -> dict:
    """{'model': ModelInfo, 'findings': [Finding]}: active first, then resolved."""
    todo("M7", "AI findings")


@router.get("/patients/{patient_id}/findings/{finding_id}")
def get_finding(patient_id: str, finding_id: str) -> dict:
    """Finding plus resolved evidence payloads (waveform samples for the marked strip and
    the baseline strip, lab series, image regions) for the explain sheet."""
    todo("M7", "finding detail with evidence")


@router.post("/patients/{patient_id}/findings/{finding_id}/ask")
async def ask(patient_id: str, finding_id: str, question: str = Body(..., embed=True),
              provider: LLMProvider = Depends(get_llm_provider)) -> dict:
    """Answer a clinician's question about a finding with the configured LLM.

    Sends only that finding and its evidence summary. Returns 403 unless the setting
    'llm_clinical_context' is 'on' (default 'on' in this demo-data prototype) AND the
    patient is simulated/demo data.
    Response: {'answer': str, 'generated': true, 'model': str, 'certainty': [...]}.
    """
    todo("M7", "ask about a finding")
