"""Contracts for the EXAMPLE DATA snapshot.

A snapshot is one scripted scenario at one chosen minute, built statelessly, so the
interface has numbers, strips, findings and a forecast to show before the live
simulator (M2) and the causal model (M7) exist. Every snapshot is marked
``placeholder`` and the interface badges it EXAMPLE DATA.

These reuse the data contracts in ``models.clinical`` unchanged; they only add the
parts that are specific to showing a moment in time (strips with marks, trends and
the reasons behind a finding).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.models.clinical import (
    AlarmState, Contributor, DeviceStatus, Finding, ForecastBundle, ModelInfo, OxygenTherapy,
    Patient, SignalQuality, SignalStatus, _Model,
)
from app.models.design import ParameterId, WaveformId


class TraceMark(_Model):
    """A bracket or flag drawn on a strip to say what the AI saw there."""

    kind: Literal["bracket", "flag"]
    #: Seconds from the start of the strip.
    start_s: float
    end_s: float
    label: str
    #: 'finding' = what the interpretation saw; 'technical' = a problem with the trace.
    tone: Literal["finding", "technical"] = "finding"
    finding_id: str | None = None


class ExampleStrip(_Model):
    waveform: WaveformId
    hz: float
    seconds: float
    #: Where the last sample sits relative to the snapshot's minute, in seconds
    #: (0 for the live strip; negative for an earlier episode).
    ends_s_before_now: float = 0.0
    samples: list[float]
    quality: SignalQuality
    #: What the rule reads from this strip ('af', 'sinus' ...); None for pleth and resp.
    reading: str | None = None
    marks: list[TraceMark] = Field(default_factory=list)
    caption: str = ""


class FindingData(_Model):
    """Everything the Why sheet draws for one finding."""

    finding_id: str
    strip: ExampleStrip | None = None
    #: A strip of this patient's own normal rhythm, for comparison.
    baseline_strip: ExampleStrip | None = None
    rr_intervals_s: list[float] = Field(default_factory=list)
    #: What the rule measured, in words and numbers: {'Mean rate': '131 /min', ...}.
    features: dict[str, str] = Field(default_factory=dict)
    #: The rule itself, in one or two sentences a clinician can check.
    rule: str = ""
    #: Reasons with weights summing to 1.
    reasons: list[Contributor] = Field(default_factory=list)
    #: Values behind a trend or lab finding, [minutes before now, value].
    values: list[tuple[float, float]] = Field(default_factory=list)


class TrendSeries(_Model):
    parameter: ParameterId
    unit: str
    #: [minutes relative to now (negative = past), value]
    points: list[tuple[float, float]]
    #: Device behind the numbers and the mean signal quality over the window.
    device_id: str | None = None
    quality: float | None = Field(None, ge=0, le=1)


class ExampleScenarioInfo(_Model):
    id: str
    title: str
    teaching_point: str
    start_min: int
    end_min: int
    #: Minutes worth jumping to, with a short reason ('AF starts', 'VT').
    highlights: list[tuple[int, str]] = Field(default_factory=list)


class News2Now(_Model):
    total: int | None
    risk: str | None
    complete: bool
    components: dict[str, int]
    response: str = ""


class ExampleSnapshot(_Model):
    scenario_id: str
    title: str
    minute: float
    generated_at: datetime
    #: Always true: nothing in a snapshot is a real measurement or a validated prediction.
    placeholder: bool = True
    badge: str = "EXAMPLE DATA"
    model: ModelInfo
    patient: Patient
    numerics: dict[ParameterId, float | str | None]
    oxygen: OxygenTherapy
    news2: News2Now
    devices: list[DeviceStatus]
    signals: dict[ParameterId, SignalStatus]
    quality: list[SignalQuality]
    alarms: AlarmState
    strips: list[ExampleStrip]
    trends: dict[ParameterId, TrendSeries]
    findings: list[Finding]
    finding_data: dict[str, FindingData]
    forecast: ForecastBundle
