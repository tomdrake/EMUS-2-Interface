"""Data contracts: what flows between devices, the EPR, the AI layers and the UI.

These are the "underlying data structures". They are NOT part of the design
document and cannot be changed from the design studio or the chatbot. Changing
anything here is a deliberate engineering change: update the docs in
``docs/causal-model-contract.md`` and regenerate the frontend types.

Times are timezone-aware UTC ISO-8601 strings on the wire.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

from app import registry
from app.models.design import CertaintyMetricId, EventTypeId, ParameterId, WaveformId

LabTestId = Literal[*registry.LAB_TEST_IDS]  # type: ignore[valid-type]
Source = Literal["anne-one", "manual", "derived", "epr", "flow-meter", "simulated"]
Priority = Literal["high", "medium", "low"]
SignalState = Literal[*registry.SIGNAL_STATE_IDS]  # type: ignore[valid-type]
SignalIssue = Literal[*registry.SIGNAL_ISSUE_IDS]  # type: ignore[valid-type]
TechnicalAlarmId = Literal[*registry.TECHNICAL_ALARM_IDS]  # type: ignore[valid-type]
DeviceKind = Literal[*registry.DEVICE_KIND_IDS]  # type: ignore[valid-type]
DemoFault = Literal[*registry.DEMO_FAULT_IDS]  # type: ignore[valid-type]


class _Model(BaseModel):
    # In the serialisation schema (used to generate frontend types) fields with
    # defaults are marked required, because the server always sends them.
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)


# ---------------------------------------------------------------------- patient

class Patient(_Model):
    id: str
    family_name: str
    given_name: str
    title: str | None = None
    birth_date: str | None = Field(None, description="YYYY-MM-DD")
    sex: Literal["male", "female", "other", "unknown"] = "unknown"
    nhs_number: str | None = None
    ward: str | None = None
    bed: str | None = None
    consultant: str | None = None
    allergies: list[str] = Field(default_factory=list)
    weight_kg: float | None = None
    admitted_at: datetime | None = None
    #: 'mimic-demo' | 'scenario' | 'fhir' | 'hl7v2'
    origin: str = "scenario"
    #: True for anything not from a real device or record. Drives the SIMULATED badge.
    simulated: bool = True


class PatientSettings(_Model):
    """Per-patient clinical settings. Stored as patient data, never in a design."""

    spo2_scale: Literal[1, 2] = 1
    alarm_limits: dict[ParameterId, "AlarmLimit"] = Field(default_factory=dict)


class AlarmLimit(_Model):
    low: float | None = None
    high: float | None = None
    priority: Priority = "medium"
    enabled: bool = True


class OxygenTherapy(_Model):
    at: datetime
    flow_l_min: float = Field(ge=0, le=70, description="0 = room air")
    device: Literal[*registry.O2_DEVICES] = "A"  # type: ignore[valid-type]
    fio2_pct: float | None = Field(None, ge=21, le=100)
    source: Literal["manual", "flow-meter", "simulated"] = "manual"
    recorded_by: str | None = None


# ----------------------------------------------------------------- observations

class Observation(_Model):
    """One numeric or coded value at one time."""

    parameter: ParameterId
    at: datetime
    value: float | None = None
    value_code: str | None = Field(None, description="e.g. ACVPU level, body position")
    source: Source = "simulated"
    device_id: str | None = None
    quality: float | None = Field(None, ge=0, le=1, description="Signal quality 0-1")


class ObservationSet(_Model):
    """A charted set of observations (one NEWS2 column)."""

    at: datetime
    values: dict[ParameterId, float | str | None]
    oxygen: OxygenTherapy | None = None
    news2_total: int | None = None
    news2_components: dict[str, int] = Field(default_factory=dict)
    news2_risk: Literal["low", "low-medium", "medium", "high"] | None = None
    news2_complete: bool = True
    monitoring_hours: float | None = None
    escalated: bool | None = None
    recorded_by: str | None = None
    source: Literal["charted", "continuous"] = "charted"


class WaveformFrame(_Model):
    waveform: WaveformId
    t0: datetime
    hz: float
    samples: list[float]


# ------------------------------------------------- devices and signal status

class DeviceStatus(_Model):
    """One physical device feeding this patient's monitor."""

    id: str
    label: str
    kind: DeviceKind
    #: 'not-paired' = never connected this session (its parameters show STANDBY).
    #: 'lost' = was connected and has stopped sending (CONNECTION LOST).
    connection: Literal["connected", "connecting", "lost", "not-paired"]
    connected_since: datetime | None = None
    last_seen: datetime | None = None
    battery_pct: float | None = Field(None, ge=0, le=100)
    battery: Literal["ok", "low", "critical", "charging", "unknown"] = "unknown"
    #: Wireless link quality 0-1 where the device reports one.
    link_quality: float | None = Field(None, ge=0, le=1)
    parameters: list[ParameterId] = Field(default_factory=list)
    waveforms: list[WaveformId] = Field(default_factory=list)
    simulated: bool = True


class SignalQuality(_Model):
    """Assessment of one stretch of one waveform (see app.signal_quality)."""

    waveform: WaveformId
    sqi: float = Field(ge=0, le=1, description="1 = clean, 0 = unusable")
    grade: Literal["good", "poor", "unusable"]
    issue: SignalIssue | None = None
    label: str = ""
    advice: str = ""
    #: 'device' when the device reported it; 'heuristic' for the built-in check.
    assessed_by: Literal["device", "heuristic"] = "heuristic"


class SignalStatus(_Model):
    """Why a parameter's number is, or is not, on screen right now.

    The display never infers this from a missing value: the server always says
    which state applies, so STANDBY, CONNECTION LOST and CHECK SENSOR cannot be
    confused with each other or with a blank.
    """

    parameter: ParameterId
    state: SignalState
    since: datetime
    device_id: str | None = None
    quality: float | None = Field(None, ge=0, le=1)
    issue: SignalIssue | None = None
    #: Short clinician-facing advice, e.g. 'Check electrode or sensor contact'.
    advice: str = ""
    #: Last valid value and when, so a lost signal can show "last 96 % 2 min ago"
    #: (only when the design asks for it; never styled as a current value).
    last_value: float | str | None = None
    last_value_at: datetime | None = None


# ------------------------------------------------------------------------- labs

class LabResult(_Model):
    test: LabTestId
    value: float
    unit: str
    collected_at: datetime
    reported_at: datetime | None = None
    #: Range carried by the result itself; else the registry range is used.
    ref_low: float | None = None
    ref_high: float | None = None
    flag: Literal["critical-low", "low", "normal", "high", "critical-high"] = "normal"
    specimen: str | None = None
    #: Where it was done: laboratory name or 'point of care'.
    performed_at: str | None = None
    location: str | None = Field(None, description="Ward/department at collection")
    source: Source = "epr"


class LabSeries(_Model):
    """Everything the labs widget needs for one test."""

    test: LabTestId
    latest: LabResult
    history: list[LabResult]
    #: Median of results before this admission (the patient's historic normal).
    historic_baseline: float | None = None
    #: Previous result this admission.
    recent_baseline: float | None = None
    delta_from_historic: float | None = None
    delta_from_recent: float | None = None
    trend: Literal["rising", "falling", "stable", "unknown"] = "unknown"


class ImagingStudy(_Model):
    id: str
    modality: Literal["CR", "DX", "CT", "US", "MR"] = "DX"
    description: str
    performed_at: datetime
    performed_where: str | None = None
    report: str = ""
    reported_by: str | None = None
    #: URL of the image; a schematic placeholder in the prototype.
    image_url: str | None = None
    previous_study_id: str | None = None
    placeholder_image: bool = True


# --------------------------------------------------------------------- certainty

class CertaintyValue(_Model):
    """One certainty metric for one output.

    ``score`` is always normalised so that 1.0 is most certain and 0.0 least,
    whatever the metric, so any display (percent, badge, bars, opacity) can be
    driven by any metric. ``raw`` carries the metric's native values for the
    explanation view.
    """

    metric: CertaintyMetricId
    score: float = Field(ge=0, le=1)
    text: str = Field(description="Clinician-facing phrase, e.g. '6 in 10', '5 to 8'.")
    raw: dict[str, float | str | list[float]] = Field(default_factory=dict)


class ModelInfo(_Model):
    name: str
    version: str
    #: True for the stand-in forecaster / scenario labels. Drives the on-screen badge.
    placeholder: bool
    description: str = ""
    supported_certainty: list[CertaintyMetricId] = Field(default_factory=list)


# ---------------------------------------------------------------------- findings

class WaveformEvidence(_Model):
    type: Literal["waveform"] = "waveform"
    waveform: WaveformId
    start: datetime
    end: datetime
    #: Marked features, e.g. {"at": ..., "label": "no P wave"}.
    marks: list[dict] = Field(default_factory=list)
    baseline_start: datetime | None = Field(
        None, description="A comparison strip from the patient's own normal rhythm.")
    baseline_end: datetime | None = None
    caption: str = ""


class TrendEvidence(_Model):
    type: Literal["trend"] = "trend"
    parameter: ParameterId
    start: datetime
    end: datetime
    caption: str = ""


class LabEvidence(_Model):
    type: Literal["lab"] = "lab"
    test: LabTestId
    caption: str = ""


class ImageEvidence(_Model):
    type: Literal["image"] = "image"
    study_id: str
    #: Normalised boxes [x, y, w, h] in 0-1 image coordinates.
    regions: list[dict] = Field(default_factory=list)
    compare_study_id: str | None = None
    caption: str = ""


Evidence = Annotated[
    Union[WaveformEvidence, TrendEvidence, LabEvidence, ImageEvidence],
    Field(discriminator="type"),
]


class Finding(_Model):
    """An AI interpretation of what is happening (or happened), with its evidence."""

    id: str
    #: Row the finding belongs to; None for whole-patient findings.
    parameter: ParameterId | None = None
    domain: Literal["rhythm", "oxygenation", "respiration", "haemodynamic", "temperature",
                    "activity", "lab", "imaging", "overall"]
    code: str = Field(description="e.g. 'af', 'vt', 'svt', 'desaturation', 'wcc-rising'")
    label: str
    status: Literal["active", "resolved"]
    onset: datetime
    offset: datetime | None = None
    severity: Literal["info", "warning", "critical"] = "info"
    summary: str = Field(description="One sentence shown on the row / card.")
    explanation: str = Field("", description="Why the model says this, in plain language.")
    certainty: list[CertaintyValue] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    model: ModelInfo
    generated_at: datetime


# --------------------------------------------------------------------- forecasts

class ForecastPoint(_Model):
    horizon_min: int
    at: datetime
    value: float
    #: Interval levels present are listed in Forecast.interval_levels.
    intervals: dict[str, tuple[float, float]] = Field(
        default_factory=dict, description="{'50': [lo, hi], '80': [...], '95': [...]}")


class Contributor(_Model):
    """One reason behind a forecast (from the causal model)."""

    factor: str = Field(description="e.g. 'Respiratory rate rising for 90 min'")
    parameter: ParameterId | None = None
    direction: Literal["raises", "lowers"]
    weight: float = Field(ge=0, le=1, description="Share of the predicted change.")
    evidence: list[Evidence] = Field(default_factory=list)


class SuggestedCause(_Model):
    label: str = Field(description="e.g. 'Hospital-acquired pneumonia'")
    probability: float = Field(ge=0, le=1)
    rationale: str = ""


class Forecast(_Model):
    """Expected course of one parameter (or 'news2')."""

    parameter: ParameterId
    generated_at: datetime
    points: list[ForecastPoint]
    #: 'baseline' = no change in care; anything else is a what-if (T5).
    scenario: str = "baseline"
    scenario_label: str = "No change"
    certainty: list[CertaintyValue] = Field(default_factory=list)
    contributors: list[Contributor] = Field(default_factory=list)
    suggested_causes: list[SuggestedCause] = Field(default_factory=list)
    model: ModelInfo


class NewsBandProbabilities(_Model):
    """N2: probability of each NEWS2 risk band at a horizon."""

    horizon_min: int
    low: float
    medium: float
    high: float


class EventPrediction(_Model):
    id: str
    event: EventTypeId
    label: str
    horizon_min: int
    probability: float = Field(ge=0, le=1)
    #: Expected time and its spread (E2 timeline whiskers, E4 threshold text).
    expected_at: datetime | None = None
    earliest_at: datetime | None = None
    latest_at: datetime | None = None
    certainty: list[CertaintyValue] = Field(default_factory=list)
    contributors: list[Contributor] = Field(default_factory=list)
    suggested_causes: list[SuggestedCause] = Field(default_factory=list)
    model: ModelInfo
    generated_at: datetime


class ForecastBundle(_Model):
    """Everything the forecast UI needs for one patient at one moment."""

    patient_id: str
    generated_at: datetime
    model: ModelInfo
    forecasts: list[Forecast]
    news_bands: list[NewsBandProbabilities] = Field(default_factory=list)
    #: N3: minutes until NEWS2 is expected to reach the design's threshold, if it is.
    minutes_to_news_threshold: dict[str, float | None] = Field(default_factory=dict)
    events: list[EventPrediction] = Field(default_factory=list)


# ------------------------------------------------------------------------ alarms

class AlarmEvent(_Model):
    id: str
    #: None for device-level technical alarms (battery, connection).
    parameter: ParameterId | None = None
    kind: Literal["low", "high", "event", "technical"]
    #: Set when kind == 'technical'. Technical alarms are about the monitoring,
    #: not the patient, and are displayed differently.
    technical: TechnicalAlarmId | None = None
    device_id: str | None = None
    priority: Priority
    message: str
    value: float | None = None
    limit: float | None = None
    started_at: datetime
    ended_at: datetime | None = None
    acknowledged_at: datetime | None = None


class AlarmState(_Model):
    active: list[AlarmEvent]
    #: Audio is muted until this time; None when not silenced.
    silenced_until: datetime | None = None
    silence_seconds: int = registry.ALARM_SILENCE_SECONDS
    #: Parameters whose alarm is switched off for this patient (shown with a
    #: crossed bell on the row).
    alarms_off: list[ParameterId] = Field(default_factory=list)
    #: Parameters that have an enabled alarm but no valid data, so the alarm
    #: cannot fire. Shown as "NOT MONITORED".
    unmonitored: list[ParameterId] = Field(default_factory=list)


# ------------------------------------------------------------- stream (WebSocket)

class NumericsMessage(_Model):
    type: Literal["numerics"] = "numerics"
    at: datetime
    values: dict[ParameterId, float | str | None]
    quality: dict[ParameterId, float] = Field(default_factory=dict)


class WaveformMessage(_Model):
    type: Literal["waveform"] = "waveform"
    frames: list[WaveformFrame]


class AlarmMessage(_Model):
    type: Literal["alarms"] = "alarms"
    state: AlarmState


class FindingsMessage(_Model):
    type: Literal["findings"] = "findings"
    findings: list[Finding]


class DevicesMessage(_Model):
    """Sent on connect, on any change, and at least every 5 seconds."""

    type: Literal["devices"] = "devices"
    at: datetime
    devices: list[DeviceStatus]
    signals: dict[ParameterId, SignalStatus]
    quality: list[SignalQuality] = Field(default_factory=list)


class StatusMessage(_Model):
    type: Literal["status"] = "status"
    source: str
    connected: bool
    simulated: bool
    #: Replay clock for MIMIC / scenarios; None when live.
    replay_at: datetime | None = None
    replay_speed: float = 1.0


StreamMessage = Annotated[
    Union[NumericsMessage, WaveformMessage, AlarmMessage, FindingsMessage, DevicesMessage,
          StatusMessage],
    Field(discriminator="type"),
]

PatientSettings.model_rebuild()
