"""Live feed over WebSocket, and demo/replay controls (M2)."""

from __future__ import annotations

from fastapi import APIRouter, Body, WebSocket

from app.routers._stub import todo

router = APIRouter(tags=["stream"])


@router.websocket("/api/stream/{patient_id}")
async def stream(ws: WebSocket, patient_id: str) -> None:
    """Sends JSON ``models.clinical.StreamMessage`` objects.

    One DeviceSource per patient is shared by all connected screens. On connect the
    server sends a StatusMessage, DevicesMessage, the current AlarmMessage and
    FindingsMessage, then live NumericsMessage (1 Hz) and WaveformMessage (~5 Hz
    frames). A NumericsMessage is sent every second even when every value is None:
    it is the heartbeat the display uses to detect that it has stopped updating.
    """
    await ws.accept()
    await ws.send_json({"type": "status", "source": "none", "connected": False,
                        "simulated": True, "replay_at": None, "replay_speed": 1.0,
                        "detail": "stream not implemented (M2)"})
    await ws.close(code=1013, reason="not implemented (M2)")


@router.get("/api/demo/scenarios")
def list_scenarios() -> list[dict]:
    """id, title and teaching point for each scripted scenario."""
    todo("M2", "list scenarios")


@router.post("/api/demo/{patient_id}/seek")
def seek(patient_id: str, minutes: float = Body(..., embed=True)) -> dict:
    todo("M2", "jump the scenario/replay clock")


@router.post("/api/demo/{patient_id}/speed")
def speed(patient_id: str, factor: float = Body(..., embed=True)) -> dict:
    todo("M2", "set replay speed (1x to 120x)")


@router.post("/api/demo/{patient_id}/fault")
def inject_fault(patient_id: str, fault: str = Body(..., embed=True),
                 device_id: str | None = Body(None, embed=True),
                 seconds: float | None = Body(None, embed=True)) -> dict:
    """Force a failure mode (registry.DEMO_FAULTS) so it can be shown in a workshop.
    422 for an unknown fault or device. Returns the patient's devices and signals."""
    todo("M2", "inject a demo fault")


@router.delete("/api/demo/{patient_id}/fault")
def clear_faults(patient_id: str) -> dict:
    todo("M2", "clear injected faults")


@router.post("/api/demo/{patient_id}/restart")
def restart(patient_id: str) -> dict:
    todo("M2", "restart the scenario from 'now'")
