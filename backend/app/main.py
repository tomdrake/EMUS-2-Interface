"""FastAPI application.

Development: uvicorn on :8000 with the Vite dev server proxying /api, /fhir, /hl7v2.
Production:  `make build` then uvicorn serves frontend/dist at / so a tablet on the
same network can open http://<laptop>:8000.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import db
from app.routers import (
    alarms, chat, designs, examples, fhir, findings, hl7v2, patients, predictions, settings,
    stream,
)

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="EMUS-2 co-design patient monitor",
        version="0.1.0",
        description="Prototype for co-design workshops. Not a medical device.",
        lifespan=lifespan,
    )
    for module in (designs, examples, patients, stream, alarms, findings, predictions, chat,
                   settings, fhir, hl7v2):
        app.include_router(module.router)

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "version": app.version}

    if DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            file = DIST / path
            return FileResponse(file if path and file.is_file() else DIST / "index.html")

    return app


app = create_app()
