"""Forecasts, future NEWS and event predictions (M7)."""

from __future__ import annotations

from fastapi import APIRouter

from app.routers._stub import todo

router = APIRouter(prefix="/api", tags=["ai"])


@router.get("/patients/{patient_id}/forecast")
def forecast(patient_id: str, horizons: str = "60,120,240,360",
             parameters: str = "news2,hr,rr,spo2,bp_sys,temp",
             news_threshold: int = 5, what_if: bool = False) -> dict:
    """models.clinical.ForecastBundle from the configured PredictionProvider."""
    todo("M7", "forecast bundle")


@router.get("/prediction-model")
def model_info() -> dict:
    """ModelInfo of the active provider (placeholder flag drives the on-screen badge)."""
    todo("M7", "prediction model info")
