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
    AlarmState, Contributor, DeviceStatus, Finding, ForecastBundle, LabResult, ModelInfo,
    ObservationSet, OxygenTherapy, Patient, SignalQuality, SignalStatus, _Model,
)
from app.models.design import ParameterId, WaveformId


class TimedValue(_Model):
    """A value at a time, in minutes relative to now (negative = past)."""

    t: float
    v: float


class Highlight(_Model):
    minute: int
    label: str


class TraceMark(_Model):
    """A bracket or flag drawn on a strip to say what the AI saw there."""

    #: "box" tints the part of the trace a feature was found in (the AI overview overlay);
    #: "bracket" and "flag" mark a stretch or a point.
    kind: Literal["bracket", "flag", "box"]
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
    values: list[TimedValue] = Field(default_factory=list)


class TrendSeries(_Model):
    parameter: ParameterId
    unit: str
    #: [minutes relative to now (negative = past), value]
    points: list[TimedValue]
    #: Device behind the numbers and the mean signal quality over the window.
    device_id: str | None = None
    quality: float | None = Field(None, ge=0, le=1)


class BpReading(_Model):
    """One cuff blood pressure."""

    at: datetime
    sys: int
    dia: int
    #: Mean arterial pressure, dia + (sys - dia) / 3, rounded.
    map: int


class TempReading(_Model):
    """One measured (not continuous) temperature."""

    at: datetime
    value: float


class ExampleScenarioInfo(_Model):
    id: str
    title: str
    teaching_point: str
    start_min: int
    end_min: int
    #: Minutes worth jumping to, with a short reason ('AF starts', 'VT').
    highlights: list[Highlight] = Field(default_factory=list)


class Extreme(_Model):
    """The highest and lowest of a parameter over a window ending at the chosen minute."""

    max: float
    min: float
    #: How many minutes the window actually covers (less than 24 h at the start of a scenario).
    window_min: int


class Activity24h(_Model):
    """How long the patient spent standing, walking and moving, over a window ending now."""

    standing_min: int = 0
    walking_min: int = 0
    #: Any movement (activity above the movement threshold), in bed or up.
    movement_min: int = 0
    window_min: int = 0


class MeasuredReading(_Model):
    """A reading taken on request (the Measure BP and Measure Temp buttons). Always a simulated value."""

    kind: Literal["bp", "temp"]
    bp: BpReading | None = None
    temp: TempReading | None = None
    placeholder: bool = True


class News2Now(_Model):
    total: int | None
    risk: str | None
    complete: bool
    components: dict[str, int]
    response: str = ""
    #: What was scored, as shown on screen: whole numbers, and the continuous temperature the tile displays.
    inputs: dict[str, float | int | str | None] = Field(default_factory=dict)
    #: How often to observe, in hours (0 = continuously).
    monitoring_hours: float | None = None


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
    #: The patient's SpO2 scale for NEWS2 (1 for most; 2 only under clinician direction).
    spo2_scale: int = 1
    #: Falls, activity and extremes over the 24 hours to the chosen minute (or since the scenario began).
    falls_24h: int = 0
    activity_24h: Activity24h = Field(default_factory=Activity24h)
    extremes_24h: dict[ParameterId, Extreme] = Field(default_factory=dict)
    #: What the rule reads from the ECG ('sinus', 'af', 'vt' ...), or None with no ECG.
    rhythm: str | None = None
    #: Whether breath-to-breath intervals in the respiration strip are even; None with no strip.
    resp_pattern: Literal["regular", "irregular"] | None = None
    devices: list[DeviceStatus]
    signals: dict[ParameterId, SignalStatus]
    quality: list[SignalQuality]
    alarms: AlarmState
    strips: list[ExampleStrip]
    trends: dict[ParameterId, TrendSeries]
    #: Recent cuff pressures, newest first (up to twelve; a card lists the newest five).
    #: Empty with no cuff connected.
    bp_readings: list[BpReading]
    #: Measured temperatures, newest first, as distinct from the continuous skin trend.
    temp_readings: list[TempReading]
    #: Results from the last 72 hours, newest first.
    labs: list[LabResult]
    #: Charted observation sets, oldest first, each scored for NEWS2.
    obs_sets: list[ObservationSet]
    findings: list[Finding]
    finding_data: dict[str, FindingData]
    forecast: ForecastBundle
