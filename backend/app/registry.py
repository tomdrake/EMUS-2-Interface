"""Read-only clinical registry: parameters, codes, units, default limits, UK lab ranges.

This module is the boundary between *design* (what clinicians and the chatbot may
change) and *data structures* (what they may not). A design document only refers
to ids defined here. Nothing in this file is editable at runtime.

Coding notes
------------
* Vital-sign LOINC codes follow the FHIR R4 vital-signs profile.
* Entries with ``provisional=True`` were written from memory and MUST be checked
  against a terminology server (NHS England Terminology Server / LOINC) in
  milestone M8 before any real integration.
* Lab reference ranges are typical UK adult ranges (Pathology Harmony where one
  exists). Local laboratory ranges take precedence when a result carries its own
  range. Critical ("phone") limits are modelled on RCPath guidance on
  communicating critical results and are provisional for the same reason.
* This is a co-design prototype. None of this is validated for clinical use.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

LOINC = "http://loinc.org"
SNOMED = "http://snomed.info/sct"
UCUM = "http://unitsofmeasure.org"
NHS_NUMBER_SYSTEM = "https://fhir.nhs.uk/Id/nhs-number"

#: Alarm priority marks shown beside patient alarm text (IEC 60601-1-8 as recalled:
#: three, two and one exclamation marks; check against the standard). They carry
#: priority in shape, so text can stay the row colour.
ALARM_PRIORITY_MARKS: dict[str, str] = {"high": "!!!", "medium": "!!", "low": "!"}

#: Alarm audio is silenced for exactly this long. Deliberately not design-editable.
ALARM_SILENCE_SECONDS = 120

# ------------------------------------------------------- fixed safety behaviour
# None of these are design-editable. See docs/human-factors.md.

#: No data from a device for this long -> its signals become 'connection-lost'.
CONNECTION_LOST_AFTER_S = 5
#: The screen has had no message from the server for this long -> everything on
#: screen is marked stale ("NO DATA"). Guards against a frozen display that looks live.
DISPLAY_STALE_AFTER_S = 3
#: A value from a continuous parameter older than this is never shown as current.
VALUE_STALE_AFTER_S = 10
BATTERY_LOW_PCT = 20
BATTERY_CRITICAL_PCT = 10
#: Signal quality index (0-1) below which a trace is "poor" / "unusable".
SQI_POOR_BELOW = 0.6
SQI_UNUSABLE_BELOW = 0.3

Priority = Literal["high", "medium", "low"]
Source = Literal["anne-one", "manual", "derived", "epr", "flow-meter", "simulated"]


@dataclass(frozen=True)
class Coding:
    system: str
    code: str
    display: str
    provisional: bool = False


@dataclass(frozen=True)
class Parameter:
    """One monitorable item. ``id`` is what design rows reference."""

    id: str
    label: str
    short: str
    unit: str  # display unit
    ucum: str | None
    coding: Coding | None
    kind: Literal["continuous", "intermittent", "event", "state", "utility"]
    #: Where the value is expected to come from in the target system.
    sources: tuple[Source, ...]
    decimals: int = 0
    default_low: float | None = None
    default_high: float | None = None
    default_priority: Priority = "medium"
    #: Hard bounds for alarm-limit steppers and input validation.
    min_value: float | None = None
    max_value: float | None = None
    #: Waveforms that can be drawn for this parameter.
    waveforms: tuple[str, ...] = ()
    #: Feeds the NEWS2 aggregate score.
    news2: bool = False
    #: Default "method of collection" shown after the label, e.g. "Heart Rate - ECG".
    #: A row can override it (Row.method); a row drawing a waveform uses that
    #: waveform's label instead.
    method: str = ""
    note: str = ""
    #: The y range of this parameter's trend and of anything drawn against it (an overlay on a
    #: waveform, a spark). None = the usual alarm span with a margin.
    trend_range: tuple[float, float] | None = None


def _p(*args, **kw) -> Parameter:
    return Parameter(*args, **kw)


_PARAMETERS: tuple[Parameter, ...] = (
    _p("hr", "Heart Rate", "HR", "bpm", "/min",
       Coding(LOINC, "8867-4", "Heart rate"), "continuous", ("anne-one", "simulated"),
       default_low=50, default_high=120, default_priority="high",
       min_value=20, max_value=250, waveforms=("ecg",), news2=True,
       method="ECG"),
    _p("pulse", "Pulse Rate", "PR", "bpm", "/min",
       Coding(LOINC, "8889-8", "Heart rate by Pulse oximeter"), "continuous",
       ("anne-one", "simulated"), default_low=50, default_high=120,
       min_value=20, max_value=250, waveforms=("pleth",),
       method="Pleth"),
    _p("spo2", "Oxygen Saturation", "SpO2", "%", "%",
       Coding(LOINC, "59408-5", "Oxygen saturation in Arterial blood by Pulse oximetry"),
       "continuous", ("anne-one", "simulated"), default_low=90, default_high=None,
       default_priority="high", min_value=50, max_value=100, waveforms=("pleth",), news2=True,
       method="Pleth", trend_range=(50, 100)),
    _p("rr", "Respiratory Rate", "RR", "/min", "/min",
       Coding(LOINC, "9279-1", "Respiratory rate"), "continuous", ("anne-one", "simulated"),
       default_low=8, default_high=25, min_value=0, max_value=70,
       waveforms=("resp",), news2=True,
       method="Chest Sensor"),
    _p("bp_sys", "Systolic Blood Pressure", "SYS", "mmHg", "mm[Hg]",
       Coding(LOINC, "8480-6", "Systolic blood pressure"), "intermittent",
       ("manual", "simulated"), default_low=90, default_high=180, default_priority="high",
       min_value=40, max_value=280, news2=True,
       note="ANNE One does not measure BP; cuff device or manual entry.",
       method="Cuff", trend_range=(40, 200)),
    _p("bp_dia", "Diastolic Blood Pressure", "DIA", "mmHg", "mm[Hg]",
       Coding(LOINC, "8462-4", "Diastolic blood pressure"), "intermittent",
       ("manual", "simulated"), default_low=40, default_high=110,
       min_value=20, max_value=180,
       method="Cuff"),
    _p("bp_mean", "Mean Arterial Pressure", "MAP", "mmHg", "mm[Hg]",
       Coding(LOINC, "8478-0", "Mean blood pressure"), "intermittent",
       ("manual", "derived", "simulated"), default_low=65, default_high=120,
       min_value=30, max_value=200,
       method="Cuff"),
    _p("temp", "Temperature", "Temp", "°C", "Cel",
       Coding(LOINC, "8310-5", "Body temperature"), "continuous",
       ("anne-one", "manual", "simulated"), decimals=1,
       default_low=35.0, default_high=38.5, default_priority="low",
       min_value=30.0, max_value=43.0, news2=True,
       note="ANNE One reports skin temperature (LOINC 39106-0, provisional); "
            "NEWS2 expects core temperature.",
       method="Skin Sensor", trend_range=(34, 41)),
    _p("o2_flow", "Oxygen Flow", "O2", "L/min", "L/min",
       Coding(LOINC, "3151-8", "Inhaled oxygen flow rate"), "state",
       ("manual", "flow-meter", "simulated"), decimals=1,
       min_value=0, max_value=70, news2=True,
       note="0 L/min means room air. Device recorded alongside (see O2_DEVICES).",
       method="Manual"),
    _p("fio2", "Inspired Oxygen Fraction", "FiO2", "%", "%",
       Coding(LOINC, "3150-0", "Inhaled oxygen concentration"), "state",
       ("manual", "flow-meter", "simulated"), min_value=21, max_value=100,
       method="Manual"),
    _p("acvpu", "Consciousness (ACVPU)", "ACVPU", "", None,
       Coding(SNOMED, "1104441000000107",
              "ACVPU (Alert Confusion Voice Pain Unresponsive) scale score", provisional=True),
       "intermittent", ("manual", "simulated"), news2=True,
       method="Manual"),
    _p("news2", "NEWS2 Total", "NEWS2", "", "{score}",
       Coding(SNOMED, "1104051000000101",
              "Royal College of Physicians NEWS2 (National Early Warning Score 2) total score",
              provisional=True),
       "intermittent", ("derived",), default_high=5, default_priority="medium",
       min_value=0, max_value=20,
       method="Calculated"),
    _p("activity", "Activity", "Act", "", None, None, "continuous",
       ("anne-one", "simulated"), min_value=0, max_value=100,
       note="Accelerometer-derived activity level, 0-100. No standard code chosen yet.",
       method="Accelerometer"),
    _p("position", "Body Position", "Position", "", None,
       Coding(LOINC, "8361-8", "Body position with respect to gravity", provisional=True),
       "state", ("anne-one", "simulated"),
       method="Accelerometer"),
    _p("falls", "Falls", "Falls", "", None, None, "event", ("anne-one", "simulated"),
       default_priority="high", note="Fall-detection events from the wearable.",
       method="Accelerometer"),
    _p("sleep", "Sleep", "Sleep", "", None, None, "state", ("derived", "simulated"),
       note="Sleep/wake staging derived from activity, HR and RR. Not provided by ANNE One.",
       method="Derived"),
    _p("timer", "Timer", "Timer", "min", "min", None, "utility", ("manual",),
       note="Count-up/count-down, e.g. time to next observations."),
)

PARAMETERS: dict[str, Parameter] = {p.id: p for p in _PARAMETERS}
PARAMETER_IDS: tuple[str, ...] = tuple(PARAMETERS)

BP_PANEL = Coding(LOINC, "85354-9", "Blood pressure panel with all children optional")

WAVEFORMS: dict[str, dict] = {
    # id -> nominal sample rate (Hz), display defaults and the scale drawn on the trace;
    # device adapters may differ.
    #
    # `scale.calibrated` is true only where the signal has a physical amplitude. The
    # ECG is in millivolts, so a 1 mV bar means something. Pleth and respiration have
    # no absolute amplitude: they are normalised and auto-gained, so their scale is
    # arbitrary units and says nothing about size, only shape.
    "ecg": {"label": "ECG", "hz": 250, "unit": "mV", "parameter": "hr",
            "scale": {"unit": "mV", "calibrated": True, "gains_mm_per_unit": [5, 10, 20],
                      "default_gain": 10, "tick": 0.5, "baseline": "isoelectric",
                      #: The visible window: a normal R wave is about 1 mV and an S
                      #: wave about -0.5 mV. Larger signals are clipped at the edge.
                      "range": [-0.5, 1.0]}},
    "pleth": {"label": "Pleth", "hz": 62.5, "unit": "a.u.", "parameter": "spo2",
              #: The row also draws this parameter's trend on a right-hand axis in its own units.
              "overlay_parameter": "spo2",
              "scale": {"unit": "a.u.", "calibrated": False, "gains_mm_per_unit": [],
                        "default_gain": None, "tick": 0.5, "baseline": "mean",
                        "range": [-1.0, 1.0]}},
    "resp": {"label": "Resp", "hz": 25, "unit": "a.u.", "parameter": "rr",
             "scale": {"unit": "a.u.", "calibrated": False, "gains_mm_per_unit": [],
                       "default_gain": None, "tick": 0.5, "baseline": "mean",
                       "range": [-1.0, 1.0]}},
}
WAVEFORM_IDS: tuple[str, ...] = tuple(WAVEFORMS)

# ------------------------------------------------------------------ module sizes

#: What a module can show. 'spark' is a small trend with no axes; 'trace' is the full
#: waveform or trend with its scale. A module shows the biggest form of each that fits.
MODULE_CONTENT: tuple[str, ...] = ("number", "spark", "trace", "ai", "certainty", "explain", "forecast",
                                   "readings")

#: Sizes of a module in the monitor grid, in grid cells. 'full' sizes span every column.
#: `flow` is how the parts are arranged: the number alone ('tile-only'); the number on the
#: left half with its detail on the right ('split': tile, wide, large); the number above its
#: detail where the module is too narrow to split ('stack': tall); or a trace beside its tile
#: (the familiar monitor row, 'row'). `fits` lists the content
#: that has room at that size; whatever the design asks for beyond it is dropped, lowest
#: priority first, and the customisation tool says so.
MODULE_SIZES: dict[str, dict] = {
    "compact": {"label": "Small Square", "cols": 1, "rows": 1, "full": False, "flow": "tile-only",
                "fits": ["number"]},
    "tile": {"label": "Tile", "cols": 2, "rows": 1, "full": False, "flow": "split",
             "fits": ["number", "spark", "ai"]},
    "tall": {"label": "Tall", "cols": 1, "rows": 2, "full": False, "flow": "stack",
             "fits": ["number", "spark", "ai", "certainty", "readings"]},
    "wide": {"label": "Wide", "cols": 3, "rows": 1, "full": False, "flow": "split",
             "fits": ["number", "trace", "ai"]},
    "large": {"label": "Large", "cols": 2, "rows": 2, "full": False, "flow": "split",
              "fits": ["number", "trace", "ai", "certainty", "explain", "readings"]},
    "row": {"label": "Full Row", "cols": 0, "rows": 1, "full": True, "flow": "row",
            "fits": ["number", "trace", "ai", "certainty"]},
    "row-tall": {"label": "Full Row Double", "cols": 0, "rows": 2, "full": True, "flow": "row",
                 "fits": ["number", "trace", "ai", "certainty", "explain", "forecast", "readings"]},
}
MODULE_SIZE_IDS: tuple[str, ...] = tuple(MODULE_SIZES)

#: NEWS2 chart oxygen delivery device codes (RCP NEWS2 observation chart).
O2_DEVICES: dict[str, str] = {
    "A": "Air",
    "N": "Nasal cannula",
    "SM": "Simple mask",
    "V24": "Venturi 24%",
    "V28": "Venturi 28%",
    "V35": "Venturi 35%",
    "V40": "Venturi 40%",
    "V60": "Venturi 60%",
    "RM": "Reservoir mask",
    "H28": "Humidified 28%",
    "H35": "Humidified 35%",
    "H40": "Humidified 40%",
    "H60": "Humidified 60%",
    "TM": "Tracheostomy mask",
    "CP": "CPAP",
    "NIV": "Non-invasive ventilation",
    "HFNO": "High-flow nasal oxygen",
}

ACVPU_LEVELS: tuple[str, ...] = ("A", "C", "V", "P", "U")


# ------------------------------------------------ signal states and technical alarms

#: Why a number is or is not on screen. Each state has its own word, icon and
#: colour so that "no number" can never mean two different things.
SIGNAL_STATES: dict[str, dict] = {
    "ok": {"text": "", "shows_value": True, "tone": "normal",
           "meaning": "Valid, current value."},
    "standby": {"text": "STANDBY", "shows_value": False, "tone": "inactive",
                "meaning": "Selected for display but no device is connected or started. "
                           "Nothing is wrong; nothing is being measured."},
    "acquiring": {"text": "SEARCHING", "shows_value": False, "tone": "inactive",
                  "meaning": "Device connected and looking for a signal."},
    "poor-signal": {"text": "POOR TRACE", "shows_value": True, "tone": "technical",
                    "meaning": "A value is available but the trace is noisy; treat with caution."},
    "sensor-off": {"text": "CHECK SENSOR", "shows_value": False, "tone": "technical",
                   "meaning": "Device connected but the sensor or lead is off the patient."},
    "connection-lost": {"text": "CONNECTION LOST", "shows_value": False, "tone": "technical",
                        "meaning": "The device was sending data and has stopped."},
    "invalid": {"text": "-?-", "shows_value": False, "tone": "technical",
                "meaning": "A measurement was made but is outside the measurable range."},
}
SIGNAL_STATE_IDS: tuple[str, ...] = tuple(SIGNAL_STATES)

#: What is wrong with a trace, and what to suggest. Wording is for a nurse at the
#: bedside: say what to check, never what the diagnosis is.
SIGNAL_ISSUES: dict[str, dict] = {
    "noise": {"label": "Noisy trace", "advice": "Check electrode or sensor contact"},
    "motion": {"label": "Movement artefact", "advice": "Patient moving; recheck when still"},
    "baseline-wander": {"label": "Wandering baseline", "advice": "Check electrode contact"},
    "low-amplitude": {"label": "Weak signal", "advice": "Check sensor position"},
    "low-perfusion": {"label": "Low perfusion", "advice": "Check sensor site; try another site"},
    "flatline": {"label": "No signal", "advice": "Check the sensor is attached"},
    "saturated": {"label": "Signal clipped", "advice": "Check sensor position"},
}
SIGNAL_ISSUE_IDS: tuple[str, ...] = tuple(SIGNAL_ISSUES)

#: Technical alarms: something is wrong with the monitoring, not with the patient.
#: Shown in their own colour with a device icon, never styled as a patient alarm.
TECHNICAL_ALARMS: dict[str, dict] = {
    "connection-lost": {"label": "Connection lost", "priority": "medium",
                        "message": "{device}: connection lost. Not monitoring {parameters}."},
    "sensor-off": {"label": "Sensor off", "priority": "medium",
                   "message": "{device}: check sensor. Not monitoring {parameters}."},
    "battery-critical": {"label": "Battery critical", "priority": "medium",
                         "message": "{device}: battery {battery}%. Replace or charge now."},
    "battery-low": {"label": "Battery low", "priority": "low",
                    "message": "{device}: battery {battery}%."},
    "poor-signal": {"label": "Poor trace", "priority": "low",
                    "message": "{parameter}: poor trace. {advice}."},
    # Raised by the display itself, not the server:
    "display-disconnected": {"label": "Display not updating", "priority": "high",
                             "message": "This screen has lost contact with the monitor server. "
                                        "Values are not updating."},
    "sound-unavailable": {"label": "Alarm sound off", "priority": "medium",
                          "message": "This screen cannot play alarm sounds. Tap to enable."},
}
TECHNICAL_ALARM_IDS: tuple[str, ...] = tuple(TECHNICAL_ALARMS)

DEVICE_KINDS: dict[str, str] = {
    "anne-chest": "ANNE chest sensor",
    "anne-limb": "ANNE limb sensor",
    "bp-cuff": "Blood pressure cuff",
    "flow-meter": "Oxygen flow meter",
    "other": "Other device",
}
DEVICE_KIND_IDS: tuple[str, ...] = tuple(DEVICE_KINDS)

#: Faults the demo controls can inject so each failure mode can be shown on demand.
DEMO_FAULTS: dict[str, str] = {
    "battery-low": "Battery low",
    "battery-critical": "Battery critical",
    "connection-lost": "Wireless connection lost",
    "sensor-off": "Sensor off the patient",
    "noise": "Noisy trace",
    "motion": "Movement artefact",
    "low-perfusion": "Low perfusion (pleth)",
    "not-paired": "Device not connected (standby)",
}
DEMO_FAULT_IDS: tuple[str, ...] = tuple(DEMO_FAULTS)


def battery_state(pct: float | None, charging: bool = False) -> str:
    """'unknown' | 'charging' | 'ok' | 'low' | 'critical'."""
    if pct is None:
        return "unknown"
    if charging:
        return "charging"
    if pct <= BATTERY_CRITICAL_PCT:
        return "critical"
    if pct <= BATTERY_LOW_PCT:
        return "low"
    return "ok"


# --------------------------------------------------------------------------- labs

@dataclass(frozen=True)
class LabTest:
    id: str
    label: str
    group: str
    unit: str
    loinc: str
    low: float | None
    high: float | None
    #: Sex-specific ranges override low/high when the patient's sex is known.
    low_m: float | None = None
    high_m: float | None = None
    low_f: float | None = None
    high_f: float | None = None
    critical_low: float | None = None
    critical_high: float | None = None
    decimals: int = 1
    provisional: bool = True  # every lab row needs checking in M6/M8
    #: Multiply a MIMIC (US conventional) value by this to get the UK unit.
    mimic_factor: float = 1.0
    mimic_labels: tuple[str, ...] = field(default_factory=tuple)


LAB_GROUPS: dict[str, str] = {
    "fbc": "Full blood count",
    "ue": "Urea & electrolytes",
    "lft": "Liver function",
    "inflammation": "Inflammation",
    "gas": "Blood gas",
    "cardiac": "Cardiac",
    "coag": "Coagulation",
    "glucose": "Glucose",
}

_LABS: tuple[LabTest, ...] = (
    LabTest("wcc", "White cell count", "fbc", "×10⁹/L", "6690-2", 4.0, 11.0,
            critical_low=1.0, critical_high=30.0, mimic_labels=("White Blood Cells",)),
    LabTest("neut", "Neutrophils", "fbc", "×10⁹/L", "751-8", 2.0, 7.5,
            critical_low=0.5, mimic_labels=("Absolute Neutrophil Count",)),
    LabTest("hb", "Haemoglobin", "fbc", "g/L", "718-7", 115, 180,
            low_m=130, high_m=180, low_f=115, high_f=165, critical_low=70,
            decimals=0, mimic_factor=10.0, mimic_labels=("Hemoglobin",)),
    LabTest("plt", "Platelets", "fbc", "×10⁹/L", "777-3", 150, 400,
            critical_low=30, decimals=0, mimic_labels=("Platelet Count",)),
    LabTest("na", "Sodium", "ue", "mmol/L", "2951-2", 133, 146,
            critical_low=120, critical_high=160, decimals=0, mimic_labels=("Sodium",)),
    LabTest("k", "Potassium", "ue", "mmol/L", "2823-3", 3.5, 5.3,
            critical_low=2.5, critical_high=6.5, mimic_labels=("Potassium",)),
    LabTest("urea", "Urea", "ue", "mmol/L", "22664-7", 2.5, 7.8,
            critical_high=30.0, mimic_factor=0.357, mimic_labels=("Urea Nitrogen",)),
    LabTest("creat", "Creatinine", "ue", "µmol/L", "14682-9", 45, 104,
            low_m=59, high_m=104, low_f=45, high_f=84, critical_high=354,
            decimals=0, mimic_factor=88.4, mimic_labels=("Creatinine",)),
    LabTest("bicarb", "Bicarbonate", "ue", "mmol/L", "1963-8", 22, 29,
            critical_low=10, decimals=0, mimic_labels=("Bicarbonate",)),
    LabTest("bili", "Bilirubin", "lft", "µmol/L", "14631-6", None, 21,
            decimals=0, mimic_factor=17.1, mimic_labels=("Bilirubin, Total",)),
    LabTest("alt", "ALT", "lft", "U/L", "1742-6", None, 40, decimals=0,
            mimic_labels=("Alanine Aminotransferase (ALT)",)),
    LabTest("alp", "ALP", "lft", "U/L", "6768-6", 30, 130, decimals=0,
            mimic_labels=("Alkaline Phosphatase",)),
    LabTest("alb", "Albumin", "lft", "g/L", "1751-7", 35, 50, decimals=0,
            mimic_factor=10.0, mimic_labels=("Albumin",)),
    LabTest("crp", "CRP", "inflammation", "mg/L", "1988-5", None, 5,
            critical_high=300, decimals=0, mimic_labels=("C-Reactive Protein",)),
    LabTest("lactate", "Lactate", "gas", "mmol/L", "2524-7", 0.5, 2.0,
            critical_high=4.0, mimic_labels=("Lactate",)),
    LabTest("ph", "pH", "gas", "", "2744-1", 7.35, 7.45,
            critical_low=7.2, critical_high=7.6, decimals=2, mimic_labels=("pH",)),
    LabTest("pco2", "pCO₂", "gas", "kPa", "2019-8", 4.7, 6.0,
            critical_high=9.0, mimic_factor=0.1333, mimic_labels=("pCO2",)),
    LabTest("po2", "pO₂", "gas", "kPa", "2703-7", 11.0, 13.0,
            critical_low=8.0, mimic_factor=0.1333, mimic_labels=("pO2",)),
    LabTest("be", "Base excess", "gas", "mmol/L", "1925-7", -2, 2,
            mimic_labels=("Base Excess",)),
    LabTest("trop", "Troponin T (hs)", "cardiac", "ng/L", "67151-1", None, 14,
            decimals=0, mimic_factor=1000.0, mimic_labels=("Troponin T",)),
    LabTest("inr", "INR", "coag", "", "6301-6", 0.8, 1.2,
            critical_high=6.5, mimic_labels=("INR(PT)",)),
    LabTest("glucose", "Glucose", "glucose", "mmol/L", "14749-6", 4.0, 11.0,
            critical_low=2.5, critical_high=25.0, mimic_factor=0.0555,
            mimic_labels=("Glucose",)),
)

LAB_TESTS: dict[str, LabTest] = {t.id: t for t in _LABS}
LAB_TEST_IDS: tuple[str, ...] = tuple(LAB_TESTS)
LAB_GROUP_IDS: tuple[str, ...] = tuple(LAB_GROUPS)


def lab_range(test_id: str, sex: str | None = None) -> tuple[float | None, float | None]:
    """Reference range for a test, sex-specific where defined."""
    t = LAB_TESTS[test_id]
    if sex == "male" and (t.low_m is not None or t.high_m is not None):
        return t.low_m, t.high_m
    if sex == "female" and (t.low_f is not None or t.high_f is not None):
        return t.low_f, t.high_f
    return t.low, t.high


def lab_flag(test_id: str, value: float, sex: str | None = None) -> str:
    """Return 'critical-low' | 'low' | 'normal' | 'high' | 'critical-high'."""
    t = LAB_TESTS[test_id]
    if t.critical_low is not None and value <= t.critical_low:
        return "critical-low"
    if t.critical_high is not None and value >= t.critical_high:
        return "critical-high"
    low, high = lab_range(test_id, sex)
    if low is not None and value < low:
        return "low"
    if high is not None and value > high:
        return "high"
    return "normal"


# ------------------------------------------------------------- predicted events

EVENT_TYPES: dict[str, dict] = {
    "news2_ge_5": {"label": "NEWS2 5 or more", "parameter": "news2"},
    "news2_ge_7": {"label": "NEWS2 7 or more", "parameter": "news2"},
    "desaturation": {"label": "Desaturation", "parameter": "spo2"},
    "hypotension": {"label": "Hypotension", "parameter": "bp_sys"},
    "tachyarrhythmia": {"label": "AF / tachyarrhythmia", "parameter": "hr"},
    "o2_escalation": {"label": "Oxygen escalation", "parameter": "o2_flow"},
    "sepsis": {"label": "Suspected sepsis", "parameter": None},
    "aki": {"label": "Acute kidney injury", "parameter": None},
    "fall": {"label": "Fall", "parameter": "falls"},
}
EVENT_TYPE_IDS: tuple[str, ...] = tuple(EVENT_TYPES)

#: Rhythm / finding labels the interpretation layer may emit for the ECG row.
RHYTHM_LABELS: dict[str, str] = {
    "sinus": "Sinus rhythm",
    "af": "Atrial fibrillation",
    "svt": "Supraventricular tachycardia",
    "vt": "Ventricular tachycardia",
    "brady": "Bradycardia",
    "pause": "Pause",
}


# --------------------------------------------------------------- certainty menu

@dataclass(frozen=True)
class CertaintyMetric:
    id: str
    group: str
    label: str
    tells_you: str
    #: What kinds of output the metric can describe.
    applies_to: tuple[Literal["forecast", "event", "finding", "llm"], ...]
    note: str = ""


_CERTAINTY: tuple[CertaintyMetric, ...] = (
    CertaintyMetric("prediction_interval", "Forecast spread", "Prediction interval",
                    "Range the value is expected to fall in (80% / 95%).", ("forecast",)),
    CertaintyMetric("conformal_interval", "Forecast spread", "Conformal interval",
                    "Range with a coverage guarantee checked on held-out patients.",
                    ("forecast",)),
    CertaintyMetric("ensemble_disagreement", "Forecast spread", "Model disagreement",
                    "How much repeated model runs (ensemble / MC dropout) disagree.",
                    ("forecast", "event", "finding")),
    CertaintyMetric("posterior_interval", "Forecast spread", "Posterior credible interval",
                    "Range from a Bayesian causal model's posterior.", ("forecast",)),
    CertaintyMetric("calibrated_probability", "Event probability", "Calibrated probability",
                    "Chance of the event within the horizon, calibrated on validation data.",
                    ("event", "finding")),
    CertaintyMetric("ppv_natural_frequency", "Event probability", "How often this is right",
                    "Of patients flagged like this, how many went on to have the event "
                    "(e.g. 6 in 10).", ("event", "finding")),
    CertaintyMetric("time_to_event", "Event probability", "Timing spread",
                    "Median and interquartile range of when the event is expected.",
                    ("event",)),
    CertaintyMetric("input_quality", "Data behind it", "Data completeness and quality",
                    "How much recent, artefact-free data fed the output.",
                    ("forecast", "event", "finding")),
    CertaintyMetric("population_similarity", "Data behind it", "Similarity to training patients",
                    "Whether this patient resembles those the model learned from.",
                    ("forecast", "event", "finding")),
    CertaintyMetric("horizon_decay", "Data behind it", "Distance into the future",
                    "Certainty falling the further ahead the forecast looks.",
                    ("forecast", "event")),
    CertaintyMetric("sensitivity", "Causal robustness", "Stability",
                    "Whether small plausible changes to the inputs flip the output.",
                    ("forecast", "event")),
    CertaintyMetric("evidence_agreement", "Causal robustness", "Agreement of evidence",
                    "How many independent signals point the same way.",
                    ("forecast", "event", "finding")),
    CertaintyMetric("token_logprob", "Language model", "Token probability",
                    "Probability the language model assigned to its answer tokens.",
                    ("llm", "finding"),
                    note="Only where the endpoint returns log-probabilities."),
    CertaintyMetric("self_consistency", "Language model", "Self-consistency",
                    "Agreement across repeated samples of the same question.",
                    ("llm", "finding")),
    CertaintyMetric("semantic_entropy", "Language model", "Semantic entropy",
                    "Spread of meaning across sampled answers.", ("llm",)),
    CertaintyMetric("verbalised_confidence", "Language model", "Stated confidence",
                    "The model's own stated confidence. Weakest; tends to overstate.",
                    ("llm", "finding")),
)

CERTAINTY_METRICS: dict[str, CertaintyMetric] = {m.id: m for m in _CERTAINTY}
CERTAINTY_METRIC_IDS: tuple[str, ...] = tuple(CERTAINTY_METRICS)


def as_public_dict() -> dict:
    """Serialisable registry for the frontend (GET /api/registry)."""
    from dataclasses import asdict

    return {
        "alarm_silence_seconds": ALARM_SILENCE_SECONDS,
        "safety": {
            "connection_lost_after_s": CONNECTION_LOST_AFTER_S,
            "display_stale_after_s": DISPLAY_STALE_AFTER_S,
            "value_stale_after_s": VALUE_STALE_AFTER_S,
            "battery_low_pct": BATTERY_LOW_PCT,
            "battery_critical_pct": BATTERY_CRITICAL_PCT,
            "sqi_poor_below": SQI_POOR_BELOW,
            "sqi_unusable_below": SQI_UNUSABLE_BELOW,
        },
        "signal_states": SIGNAL_STATES,
        "signal_issues": SIGNAL_ISSUES,
        "technical_alarms": TECHNICAL_ALARMS,
        "device_kinds": DEVICE_KINDS,
        "demo_faults": DEMO_FAULTS,
        "parameters": {k: asdict(v) for k, v in PARAMETERS.items()},
        "waveforms": WAVEFORMS,
        "alarm_priority_marks": ALARM_PRIORITY_MARKS,
        "module_sizes": MODULE_SIZES,
        "module_content": list(MODULE_CONTENT),
        "o2_devices": O2_DEVICES,
        "acvpu_levels": list(ACVPU_LEVELS),
        "lab_groups": LAB_GROUPS,
        "lab_tests": {k: asdict(v) for k, v in LAB_TESTS.items()},
        "event_types": EVENT_TYPES,
        "rhythm_labels": RHYTHM_LABELS,
        "certainty_metrics": {k: asdict(v) for k, v in CERTAINTY_METRICS.items()},
    }
