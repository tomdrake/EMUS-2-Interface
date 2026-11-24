"""Replay of imported MIMIC-IV demo stays (milestone M6). See docs/briefs/M6-mimic-epr.md.

Reads observations, labs and oxygen that ``scripts/import_mimic_demo.py`` wrote to
SQLite and replays one ICU stay against the wall clock (time-shifted so a chosen
point in the stay is 'now'), with a speed control.

MIMIC-IV demo has no waveforms for these patients: waveforms are synthesised from
the recorded numerics (sinus rhythm only) and the source reports ``simulated=True``
for waveforms while numerics and labs are real recorded data.
"""

from __future__ import annotations

from app.sources.base import DeviceSource

M = "M6"


class MimicReplaySource(DeviceSource):
    def __init__(self, patient_id: str, *, speed: float = 1.0):
        raise NotImplementedError(M)
