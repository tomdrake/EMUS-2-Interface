"""Device/data source contract.

A source produces the live feed for one patient. The stream router (M2) owns one
source per patient and fans its messages out to every connected screen.

Implementations:
  * ``simulator.SimulatorSource``   scripted scenarios (M2)
  * ``mimic_replay.MimicReplaySource``  recorded MIMIC-IV demo stays (M6)
  * ``sibel_anne.SibelAnneOneSource``   Sibel ANNE One wearable (stub until SDK access)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import AsyncIterator

from app.models.clinical import (
    ObservationSet, OxygenTherapy, Patient, StreamMessage,
)


@dataclass(frozen=True)
class SourceInfo:
    id: str
    label: str
    #: True unless the data comes from a real device or record.
    simulated: bool
    #: Registry parameter ids this source can provide.
    parameters: tuple[str, ...]
    waveforms: tuple[str, ...]
    #: Numerics cadence in seconds.
    numerics_period_s: float = 1.0
    supports_replay: bool = False


class DeviceSource(ABC):
    """One patient's feed. Implementations must be cancellable at any await."""

    @abstractmethod
    def info(self) -> SourceInfo: ...

    @abstractmethod
    def patient(self) -> Patient: ...

    @abstractmethod
    def stream(self) -> AsyncIterator[StreamMessage]:
        """Yield NumericsMessage about once a second and WaveformMessage frames of
        roughly 200 ms, in real time, until cancelled. Must also yield a
        StatusMessage first and whenever connection or replay state changes."""

    @abstractmethod
    def history(self, parameter: str, start: datetime, end: datetime,
                max_points: int = 600) -> list[tuple[datetime, float | None]]:
        """Down-sampled trend for a row's trend trace."""

    @abstractmethod
    def observation_sets(self, start: datetime, end: datetime) -> list[ObservationSet]:
        """Charted observation sets (NEWS2 columns) in the window, scored."""

    @abstractmethod
    def oxygen(self, at: datetime) -> OxygenTherapy | None:
        """Oxygen therapy in force at ``at``."""

    # Replay control: only meaningful when info().supports_replay.
    def now(self) -> datetime:
        """The source's idea of 'now' (replay clock or wall clock)."""
        from datetime import timezone
        return datetime.now(timezone.utc)

    def seek(self, minutes_from_start: float) -> None:
        raise NotImplementedError

    def set_speed(self, factor: float) -> None:
        raise NotImplementedError
