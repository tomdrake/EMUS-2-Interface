"""AI interpretation of what is happening now (milestone M7). See docs/briefs/M7-ai-forecast.md.

A provider turns recent data into ``Finding`` objects with certainty and evidence.
The UI never invents findings: it only renders what a provider returns, and shows
the provider's ``ModelInfo.placeholder`` flag as a badge.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

from app.models.clinical import Finding, ModelInfo

M = "M7"


class InterpretationProvider(ABC):
    @abstractmethod
    def model_info(self) -> ModelInfo: ...

    @abstractmethod
    def findings(self, patient_id: str, now: datetime, *,
                 window_hours: int = 24) -> list[Finding]:
        """Active findings plus those resolved within ``window_hours``.

        Resolved findings keep ``offset`` so the UI can say
        'Last run of AF 2 h 14 min ago'. Each finding carries at least one
        CertaintyValue and, where possible, evidence the explain sheet can draw.
        """

    @abstractmethod
    def finding(self, patient_id: str, finding_id: str) -> Finding | None: ...


class ScenarioInterpretation(InterpretationProvider):
    """Findings from scenario ground truth (rhythm spans, events, scripted labs/imaging).

    Certainty values are simulated; ``model_info().placeholder`` is True.
    Rhythm findings must include WaveformEvidence with marks (e.g. 'no P wave',
    'irregular R-R') and a baseline strip from the patient's own sinus rhythm.
    """

    def model_info(self) -> ModelInfo:
        raise NotImplementedError(M)

    def findings(self, patient_id, now, *, window_hours=24):
        raise NotImplementedError(M)

    def finding(self, patient_id, finding_id):
        raise NotImplementedError(M)


class RuleInterpretation(InterpretationProvider):
    """Simple transparent rules over real (MIMIC) data: lab trends across the admission,
    critical values, desaturation episodes, sustained tachycardia. Not validated."""

    def model_info(self) -> ModelInfo:
        raise NotImplementedError(M)

    def findings(self, patient_id, now, *, window_hours=24):
        raise NotImplementedError(M)

    def finding(self, patient_id, finding_id):
        raise NotImplementedError(M)


def _ago(minutes: float) -> str:
    minutes = max(0, round(minutes))
    h, m = divmod(minutes, 60)
    return f"{h} h {m} min" if h else f"{m} min"


def describe_resolved(finding: Finding, now: datetime) -> str:
    """'Last run of AF 2 h 14 min ago' for a resolved finding. Pure function."""
    when = finding.offset or finding.onset
    return f"Last run of {finding.label} {_ago((now - when).total_seconds() / 60)} ago"
