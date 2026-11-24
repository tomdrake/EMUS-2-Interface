"""Scripted demo scenarios (data only).

Each scenario is a patient plus a timeline in minutes relative to "now" at the
moment playback starts. Negative minutes are history already on the chart;
positive minutes are what will unfold while the workshop watches, and are also
what the placeholder forecaster is allowed to peek at (with noise) so that the
forecast displays have something plausible to show.

The simulator (M2) interpolates linearly between consecutive ``segments`` for
each vital sign, adds physiological noise, and synthesises waveforms for the
segment's ``rhythm``. Rhythm segments are the ground truth that the scenario
interpretation provider (M7) turns into findings.

Everything produced from this file is SIMULATED and must be badged as such.
"""

from __future__ import annotations

from typing import Literal, TypedDict


class Segment(TypedDict, total=False):
    at_min: int                    # values below are reached at this time
    hr: float
    rr: float
    spo2: float
    bp_sys: float
    bp_dia: float
    temp: float
    activity: float                # 0-100
    position: Literal["supine", "left", "right", "prone", "upright", "walking"]
    acvpu: Literal["A", "C", "V", "P", "U"]
    asleep: bool


class RhythmSpan(TypedDict):
    from_min: int
    to_min: int
    rhythm: Literal["sinus", "af", "svt", "vt", "brady", "pause"]


class OxygenStep(TypedDict):
    at_min: int
    flow_l_min: float
    device: str                    # registry.O2_DEVICES key


class LabPoint(TypedDict):
    at_min: int
    test: str                      # registry.LAB_TESTS key
    value: float                   # UK units


class Fault(TypedDict, total=False):
    at_min: float
    fault: str                     # registry.DEMO_FAULTS key
    device: str                    # device id
    minutes: float                 # omitted = until the end


class Scenario(TypedDict):
    id: str
    title: str
    teaching_point: str
    patient: dict                  # models.clinical.Patient fields (id filled from scenario id)
    spo2_scale: Literal[1, 2]
    start_min: int
    end_min: int
    segments: list[Segment]
    rhythms: list[RhythmSpan]      # gaps default to sinus
    oxygen: list[OxygenStep]
    events: list[dict]             # {"at_min": .., "type": "fall"}
    obs_interval_min: int          # charted NEWS2 observation sets
    #: Minutes between cuff blood pressures (default 60); shorter where the patient is unwell.
    bp_interval_min: int
    labs: list[LabPoint]
    #: Results from before this admission, for the "historic normal" baseline.
    historic_labs: list[LabPoint]
    imaging: list[dict]            # ImagingStudy fields with at_min instead of performed_at
    #: Scripted reasons the placeholder forecaster reports (never inferred).
    forecast_story: dict
    #: Devices on this patient (DeviceStatus fields; battery_pct is the level at
    #: minute 0 and drains at battery_drain_pct_per_hour).
    devices: list[dict]
    #: Scripted monitoring problems. Empty for the clinical scenarios.
    faults: list[Fault]


def _pt(family: str, given: str, title: str, dob: str, sex: str, nhs: str, bed: str,
        **extra) -> dict:
    return {"family_name": family, "given_name": given, "title": title, "birth_date": dob,
            "sex": sex, "nhs_number": nhs, "ward": "Ward 204", "bed": bed,
            "origin": "scenario", "simulated": True, **extra}


# NHS numbers below are from the 999 xxx xxxx range reserved for test data.

SCENARIOS: dict[str, Scenario] = {
    "scn-pneumonia": {
        "id": "scn-pneumonia",
        "title": "Pneumonia, deteriorating over six hours",
        "teaching_point": "Forecast and future NEWS: rising RR and falling SpO2 before the "
                          "score crosses 5, with labs and CXR supporting the cause.",
        "patient": _pt("SMITH", "John", "Mr", "1956-08-15", "male", "999 000 0018", "Bed 4",
                       consultant="Dr A. Rahman", allergies=["Penicillin"], weight_kg=82),
        "spo2_scale": 1,
        "start_min": -1440, "end_min": 480,
        "segments": [
            {"at_min": -1440, "hr": 84, "rr": 16, "spo2": 96, "bp_sys": 132, "bp_dia": 78,
             "temp": 37.2, "activity": 20, "position": "upright", "acvpu": "A"},
            {"at_min": -720, "hr": 88, "rr": 17, "spo2": 96, "bp_sys": 128, "bp_dia": 76,
             "temp": 37.6, "activity": 5, "position": "supine", "acvpu": "A", "asleep": True},
            {"at_min": -240, "hr": 94, "rr": 19, "spo2": 95, "bp_sys": 124, "bp_dia": 72,
             "temp": 38.0, "activity": 12, "position": "upright", "acvpu": "A"},
            {"at_min": 0, "hr": 102, "rr": 22, "spo2": 94, "bp_sys": 118, "bp_dia": 68,
             "temp": 38.4, "activity": 8, "position": "upright", "acvpu": "A"},
            {"at_min": 180, "hr": 112, "rr": 26, "spo2": 91, "bp_sys": 106, "bp_dia": 60,
             "temp": 38.9, "activity": 4, "position": "supine", "acvpu": "A"},
            {"at_min": 360, "hr": 124, "rr": 29, "spo2": 89, "bp_sys": 94, "bp_dia": 52,
             "temp": 39.2, "activity": 2, "position": "supine", "acvpu": "C"},
            {"at_min": 480, "hr": 128, "rr": 30, "spo2": 88, "bp_sys": 90, "bp_dia": 50,
             "temp": 39.2, "activity": 2, "position": "supine", "acvpu": "C"},
        ],
        "rhythms": [],
        "oxygen": [{"at_min": -1440, "flow_l_min": 0, "device": "A"},
                   {"at_min": -200, "flow_l_min": 2, "device": "N"},
                   {"at_min": 200, "flow_l_min": 6, "device": "SM"}],
        "events": [],
        "obs_interval_min": 240,
        "bp_interval_min": 30,
        "labs": [
            {"at_min": -1380, "test": "wcc", "value": 11.8}, {"at_min": -660, "test": "wcc", "value": 14.9},
            {"at_min": -60, "test": "wcc", "value": 18.6},
            {"at_min": -1380, "test": "crp", "value": 64}, {"at_min": -660, "test": "crp", "value": 148},
            {"at_min": -60, "test": "crp", "value": 231},
            {"at_min": -1380, "test": "lactate", "value": 1.3}, {"at_min": -60, "test": "lactate", "value": 2.6},
            {"at_min": -1380, "test": "creat", "value": 92}, {"at_min": -60, "test": "creat", "value": 128},
            {"at_min": -1380, "test": "urea", "value": 6.9}, {"at_min": -60, "test": "urea", "value": 10.4},
            {"at_min": -1380, "test": "na", "value": 137}, {"at_min": -60, "test": "na", "value": 134},
            {"at_min": -1380, "test": "k", "value": 4.3}, {"at_min": -60, "test": "k", "value": 4.6},
            {"at_min": -1380, "test": "hb", "value": 138}, {"at_min": -60, "test": "hb", "value": 131},
            {"at_min": -1380, "test": "plt", "value": 268}, {"at_min": -60, "test": "plt", "value": 242},
            {"at_min": -60, "test": "glucose", "value": 8.4}, {"at_min": -1380, "test": "glucose", "value": 6.2},
            # arterial gas 30 minutes ago: the newest result, so "Current"
            {"at_min": -30, "test": "ph", "value": 7.37}, {"at_min": -30, "test": "pco2", "value": 4.8},
            {"at_min": -30, "test": "po2", "value": 8.6}, {"at_min": -30, "test": "be", "value": -2.4},
            {"at_min": -30, "test": "lactate", "value": 2.9},
        ],
        "historic_labs": [
            {"at_min": -130000, "test": "wcc", "value": 6.8}, {"at_min": -130000, "test": "crp", "value": 3},
            {"at_min": -130000, "test": "creat", "value": 88}, {"at_min": -130000, "test": "hb", "value": 142},
        ],
        "imaging": [
            {"id": "scn-pneumonia-cxr-1", "at_min": -1400, "description": "Chest X-ray PA",
             "performed_where": "Emergency Department X-ray",
             "report": "Patchy airspace opacification in the right lower zone. No effusion.",
             "regions": [{"x": 0.16, "y": 0.58, "w": 0.22, "h": 0.2, "label": "Consolidation"}]},
            {"id": "scn-pneumonia-cxr-2", "at_min": -90, "description": "Chest X-ray AP (mobile)",
             "performed_where": "Ward 204 (mobile)",
             "previous_study_id": "scn-pneumonia-cxr-1",
             "report": "Increased right lower zone consolidation, now extending to the mid zone. "
                       "Small right pleural effusion.",
             "regions": [{"x": 0.13, "y": 0.42, "w": 0.28, "h": 0.38, "label": "Consolidation"},
                         {"x": 0.1, "y": 0.8, "w": 0.3, "h": 0.1, "label": "Effusion"}]},
        ],
        "forecast_story": {
            "contributors": [
                {"factor": "Respiratory rate rising for 4 hours", "parameter": "rr",
                 "direction": "raises", "weight": 0.34},
                {"factor": "SpO2 falling despite 2 L/min oxygen", "parameter": "spo2",
                 "direction": "raises", "weight": 0.27},
                {"factor": "CRP and white cells rising this admission", "parameter": None,
                 "direction": "raises", "weight": 0.21},
                {"factor": "Chest X-ray consolidation larger than yesterday", "parameter": None,
                 "direction": "raises", "weight": 0.18},
            ],
            "suggested_causes": [
                {"label": "Worsening pneumonia with sepsis", "probability": 0.62,
                 "rationale": "Fever, rising inflammatory markers and lactate, larger consolidation."},
                {"label": "Parapneumonic effusion", "probability": 0.2,
                 "rationale": "New small effusion on the latest film."},
                {"label": "Pulmonary embolism", "probability": 0.08,
                 "rationale": "Tachycardia and hypoxia, but other findings are explained."},
            ],
            "what_if": {"scenario": "o2-escalation", "label": "Oxygen increased now",
                        "effect": {"spo2": +4, "rr": -2}},
        },
    },
    "scn-af": {
        "id": "scn-af",
        "title": "Paroxysmal AF after surgery",
        "teaching_point": "Rhythm interpretation on the ECG row: an earlier run shown as "
                          "'last run of AF ... ago', then a new run starting during the session.",
        "patient": _pt("OKAFOR", "Grace", "Mrs", "1949-03-02", "female", "999 000 0026", "Bed 7",
                       consultant="Mr D. Fraser", weight_kg=68),
        "spo2_scale": 1,
        "start_min": -720, "end_min": 240,
        "segments": [
            {"at_min": -720, "hr": 76, "rr": 15, "spo2": 97, "bp_sys": 134, "bp_dia": 78,
             "temp": 36.8, "activity": 6, "position": "supine", "acvpu": "A", "asleep": True},
            {"at_min": -160, "hr": 80, "rr": 16, "spo2": 97, "bp_sys": 130, "bp_dia": 76,
             "temp": 36.9, "activity": 15, "position": "upright", "acvpu": "A"},
            {"at_min": -150, "hr": 138, "rr": 19, "spo2": 96, "bp_sys": 112, "bp_dia": 70,
             "temp": 36.9, "activity": 10, "position": "upright", "acvpu": "A"},
            {"at_min": -125, "hr": 132, "rr": 18, "spo2": 96, "bp_sys": 114, "bp_dia": 70,
             "temp": 36.9, "activity": 8, "position": "supine", "acvpu": "A"},
            {"at_min": -120, "hr": 82, "rr": 16, "spo2": 97, "bp_sys": 128, "bp_dia": 76,
             "temp": 36.9, "activity": 8, "position": "supine", "acvpu": "A"},
            {"at_min": 8, "hr": 84, "rr": 16, "spo2": 97, "bp_sys": 128, "bp_dia": 76,
             "temp": 37.0, "activity": 10, "position": "upright", "acvpu": "A"},
            {"at_min": 10, "hr": 144, "rr": 20, "spo2": 95, "bp_sys": 108, "bp_dia": 66,
             "temp": 37.0, "activity": 10, "position": "upright", "acvpu": "A"},
            {"at_min": 240, "hr": 136, "rr": 20, "spo2": 95, "bp_sys": 104, "bp_dia": 64,
             "temp": 37.1, "activity": 6, "position": "supine", "acvpu": "A"},
        ],
        "rhythms": [{"from_min": -150, "to_min": -124, "rhythm": "af"},
                    {"from_min": 9, "to_min": 240, "rhythm": "af"}],
        "oxygen": [{"at_min": -720, "flow_l_min": 0, "device": "A"}],
        "events": [],
        "obs_interval_min": 240,
        "labs": [
            {"at_min": -600, "test": "glucose", "value": 6.1},
            {"at_min": -600, "test": "k", "value": 3.3}, {"at_min": -600, "test": "na", "value": 139},
            {"at_min": -600, "test": "creat", "value": 71}, {"at_min": -600, "test": "hb", "value": 104},
            {"at_min": -600, "test": "wcc", "value": 10.2}, {"at_min": -600, "test": "crp", "value": 48},
            {"at_min": -600, "test": "trop", "value": 11},
        ],
        "historic_labs": [{"at_min": -20000, "test": "k", "value": 4.2},
                          {"at_min": -20000, "test": "hb", "value": 126}],
        "imaging": [],
        "forecast_story": {
            "contributors": [
                {"factor": "AF run 2 hours ago", "parameter": "hr", "direction": "raises", "weight": 0.45},
                {"factor": "Potassium below range (3.3 mmol/L)", "parameter": None,
                 "direction": "raises", "weight": 0.35},
                {"factor": "Day 2 after major surgery", "parameter": None,
                 "direction": "raises", "weight": 0.2},
            ],
            "suggested_causes": [
                {"label": "Post-operative AF, low potassium contributing", "probability": 0.7,
                 "rationale": "Earlier self-terminating run and potassium 3.3 mmol/L."},
            ],
            "what_if": {"scenario": "potassium-replaced", "label": "Potassium replaced",
                        "effect": {"hr": -20}},
        },
    },
    "scn-copd": {
        "id": "scn-copd",
        "title": "COPD on SpO2 scale 2, with a fall",
        "teaching_point": "Scale 2 scoring with oxygen recorded, over-oxygenation scoring, "
                          "sleep and activity rows, and a fall event.",
        "patient": _pt("MACLEOD", "Ian", "Mr", "1951-11-23", "male", "999 000 0034", "Bed 2",
                       consultant="Dr S. Iyer", weight_kg=61),
        "spo2_scale": 2,
        "start_min": -900, "end_min": 240,
        "segments": [
            {"at_min": -900, "hr": 86, "rr": 20, "spo2": 90, "bp_sys": 138, "bp_dia": 82,
             "temp": 36.7, "activity": 4, "position": "upright", "acvpu": "A", "asleep": True},
            {"at_min": -420, "hr": 82, "rr": 19, "spo2": 89, "bp_sys": 134, "bp_dia": 80,
             "temp": 36.6, "activity": 3, "position": "left", "acvpu": "A", "asleep": True},
            {"at_min": -180, "hr": 90, "rr": 21, "spo2": 96, "bp_sys": 136, "bp_dia": 80,
             "temp": 36.8, "activity": 25, "position": "upright", "acvpu": "A"},
            {"at_min": -45, "hr": 108, "rr": 24, "spo2": 91, "bp_sys": 146, "bp_dia": 86,
             "temp": 36.8, "activity": 70, "position": "walking", "acvpu": "A"},
            {"at_min": 0, "hr": 98, "rr": 22, "spo2": 90, "bp_sys": 140, "bp_dia": 84,
             "temp": 36.8, "activity": 10, "position": "upright", "acvpu": "A"},
            {"at_min": 240, "hr": 92, "rr": 21, "spo2": 90, "bp_sys": 138, "bp_dia": 82,
             "temp": 36.8, "activity": 8, "position": "upright", "acvpu": "A"},
        ],
        "rhythms": [],
        "oxygen": [{"at_min": -900, "flow_l_min": 2, "device": "N"},
                   {"at_min": -200, "flow_l_min": 4, "device": "N"},
                   {"at_min": -100, "flow_l_min": 2, "device": "N"}],
        "events": [{"at_min": -40, "type": "fall"}],
        "obs_interval_min": 240,
        "labs": [
            {"at_min": -840, "test": "ph", "value": 7.34}, {"at_min": -840, "test": "pco2", "value": 7.1},
            {"at_min": -840, "test": "po2", "value": 7.6}, {"at_min": -840, "test": "bicarb", "value": 31},
            {"at_min": -840, "test": "wcc", "value": 9.4}, {"at_min": -840, "test": "crp", "value": 22},
            {"at_min": -840, "test": "glucose", "value": 7.3}, {"at_min": -840, "test": "lactate", "value": 1.4},
            {"at_min": -840, "test": "be", "value": 4.1},
        ],
        "historic_labs": [{"at_min": -90000, "test": "pco2", "value": 6.4},
                          {"at_min": -90000, "test": "bicarb", "value": 30}],
        "imaging": [],
        "forecast_story": {
            "contributors": [
                {"factor": "Fall 40 minutes ago", "parameter": "falls", "direction": "raises", "weight": 0.5},
                {"factor": "Walking with SpO2 falling to 88%", "parameter": "spo2",
                 "direction": "raises", "weight": 0.5},
            ],
            "suggested_causes": [
                {"label": "Exertional desaturation", "probability": 0.55,
                 "rationale": "Saturation dropped while walking and recovered at rest."},
            ],
            "what_if": {"scenario": "supervised-mobilising", "label": "Supervised when walking",
                        "effect": {}},
        },
    },
    "scn-vt": {
        "id": "scn-vt",
        "title": "Non-sustained VT with critical potassium",
        "teaching_point": "High-priority rhythm alarm, the 2 minute silence, and a critical "
                          "lab value pinned in Results.",
        "patient": _pt("PATEL", "Anil", "Mr", "1962-06-09", "male", "999 000 0042", "Bed 9",
                       consultant="Dr L. Campbell", weight_kg=90),
        "spo2_scale": 1,
        "start_min": -480, "end_min": 180,
        "segments": [
            {"at_min": -480, "hr": 72, "rr": 14, "spo2": 97, "bp_sys": 122, "bp_dia": 74,
             "temp": 36.6, "activity": 8, "position": "supine", "acvpu": "A"},
            {"at_min": 4, "hr": 74, "rr": 14, "spo2": 97, "bp_sys": 120, "bp_dia": 72,
             "temp": 36.6, "activity": 8, "position": "supine", "acvpu": "A"},
            {"at_min": 5, "hr": 182, "rr": 18, "spo2": 94, "bp_sys": 88, "bp_dia": 54,
             "temp": 36.6, "activity": 8, "position": "supine", "acvpu": "A"},
            {"at_min": 6, "hr": 78, "rr": 16, "spo2": 96, "bp_sys": 116, "bp_dia": 70,
             "temp": 36.6, "activity": 8, "position": "supine", "acvpu": "A"},
            {"at_min": 180, "hr": 76, "rr": 15, "spo2": 97, "bp_sys": 120, "bp_dia": 72,
             "temp": 36.6, "activity": 8, "position": "supine", "acvpu": "A"},
        ],
        "rhythms": [{"from_min": -95, "to_min": -93, "rhythm": "svt"},
                    {"from_min": 5, "to_min": 6, "rhythm": "vt"}],
        "oxygen": [{"at_min": -480, "flow_l_min": 0, "device": "A"}],
        "events": [],
        "obs_interval_min": 240,
        "labs": [
            {"at_min": -420, "test": "k", "value": 2.9}, {"at_min": -30, "test": "k", "value": 2.4},
            {"at_min": -420, "test": "creat", "value": 96}, {"at_min": -420, "test": "na", "value": 136},
            {"at_min": -420, "test": "trop", "value": 38}, {"at_min": -30, "test": "trop", "value": 61},
            {"at_min": -30, "test": "glucose", "value": 5.6},
            {"at_min": -30, "test": "ph", "value": 7.41}, {"at_min": -30, "test": "pco2", "value": 5.1},
            {"at_min": -30, "test": "po2", "value": 12.2}, {"at_min": -30, "test": "be", "value": 0.4},
            {"at_min": -30, "test": "lactate", "value": 1.6},
        ],
        "historic_labs": [{"at_min": -40000, "test": "k", "value": 4.4},
                          {"at_min": -40000, "test": "trop", "value": 9}],
        "imaging": [],
        "forecast_story": {
            "contributors": [
                {"factor": "Potassium 2.4 mmol/L (critical)", "parameter": None,
                 "direction": "raises", "weight": 0.6},
                {"factor": "Troponin rising", "parameter": None, "direction": "raises", "weight": 0.4},
            ],
            "suggested_causes": [
                {"label": "Ventricular arrhythmia from hypokalaemia", "probability": 0.6,
                 "rationale": "Potassium fell from 2.9 to 2.4 mmol/L."},
                {"label": "Myocardial ischaemia", "probability": 0.3,
                 "rationale": "Troponin 38 then 61 ng/L."},
            ],
            "what_if": {"scenario": "potassium-replaced", "label": "Potassium replaced",
                        "effect": {}},
        },
    },
    "scn-stable": {
        "id": "scn-stable",
        "title": "Stable patient",
        "teaching_point": "A quiet baseline for judging layout, colour and legibility.",
        "patient": _pt("WILSON", "Margaret", "Ms", "1970-01-30", "female", "999 000 0050", "Bed 1",
                       consultant="Dr A. Rahman", weight_kg=74),
        "spo2_scale": 1,
        "start_min": -1440, "end_min": 480,
        "segments": [
            {"at_min": -1440, "hr": 72, "rr": 14, "spo2": 98, "bp_sys": 124, "bp_dia": 76,
             "temp": 36.7, "activity": 20, "position": "upright", "acvpu": "A"},
            {"at_min": -600, "hr": 62, "rr": 12, "spo2": 97, "bp_sys": 112, "bp_dia": 68,
             "temp": 36.4, "activity": 2, "position": "left", "acvpu": "A", "asleep": True},
            {"at_min": 0, "hr": 74, "rr": 14, "spo2": 98, "bp_sys": 122, "bp_dia": 74,
             "temp": 36.8, "activity": 25, "position": "upright", "acvpu": "A"},
            {"at_min": 480, "hr": 72, "rr": 14, "spo2": 98, "bp_sys": 124, "bp_dia": 76,
             "temp": 36.8, "activity": 20, "position": "upright", "acvpu": "A"},
        ],
        "rhythms": [],
        "oxygen": [{"at_min": -1440, "flow_l_min": 0, "device": "A"}],
        "events": [],
        "obs_interval_min": 360,
        "labs": [
            {"at_min": -1300, "test": "wcc", "value": 7.1}, {"at_min": -1300, "test": "hb", "value": 133},
            {"at_min": -1300, "test": "na", "value": 140}, {"at_min": -1300, "test": "k", "value": 4.1},
            {"at_min": -1300, "test": "creat", "value": 64}, {"at_min": -1300, "test": "crp", "value": 4},
            {"at_min": -1300, "test": "glucose", "value": 5.4},
        ],
        "historic_labs": [],
        "imaging": [],
        "forecast_story": {"contributors": [], "suggested_causes": [], "what_if": None},
    },
}

# ------------------------------------------------------------------ devices

def standard_devices(*, chest: float = 78, limb: float = 64, cuff: bool = True) -> list[dict]:
    """The usual kit: ANNE chest and limb sensors and a BP cuff."""
    return [
        {"id": "anne-chest", "label": "Chest sensor", "kind": "anne-chest",
         "parameters": ["hr", "rr", "temp", "activity", "position", "falls"],
         "waveforms": ["ecg", "resp"], "battery_pct": chest, "battery_drain_pct_per_hour": 3.0,
         "connection": "connected"},
        {"id": "anne-limb", "label": "Limb sensor", "kind": "anne-limb",
         "parameters": ["spo2", "pulse"], "waveforms": ["pleth"],
         "battery_pct": limb, "battery_drain_pct_per_hour": 3.5, "connection": "connected"},
        {"id": "bp-cuff", "label": "BP cuff", "kind": "bp-cuff",
         "parameters": ["bp_sys", "bp_dia", "bp_mean"], "waveforms": [],
         "battery_pct": 90 if cuff else None, "battery_drain_pct_per_hour": 0.5,
         "connection": "connected" if cuff else "not-paired"},
    ]


for _s in SCENARIOS.values():
    _s.setdefault("devices", standard_devices())
    _s.setdefault("faults", [])
    _s.setdefault("bp_interval_min", 60)

SCENARIOS["scn-technical"] = {
    "id": "scn-technical",
    "title": "Monitoring problems, patient well",
    "teaching_point": "Telling failure modes apart: a modality on standby, a low battery, a "
                      "noisy trace, a sensor off and a lost wireless connection each look and "
                      "read differently, and none of them looks like a patient alarm.",
    "patient": _pt("FERGUSON", "Alan", "Mr", "1958-09-14", "male", "999 000 0069", "Bed 6",
                   consultant="Dr S. Iyer", weight_kg=79),
    "spo2_scale": 1,
    "start_min": -240, "end_min": 30,
    "segments": [
        {"at_min": -240, "hr": 70, "rr": 14, "spo2": 97, "bp_sys": 126, "bp_dia": 78,
         "temp": 36.7, "activity": 15, "position": "upright", "acvpu": "A"},
        {"at_min": 30, "hr": 72, "rr": 14, "spo2": 97, "bp_sys": 126, "bp_dia": 78,
         "temp": 36.7, "activity": 15, "position": "upright", "acvpu": "A"},
    ],
    "rhythms": [],
    "oxygen": [{"at_min": -240, "flow_l_min": 0, "device": "A"}],
    "events": [],
    "obs_interval_min": 240,
    "bp_interval_min": 60,
    # Bloods 50 hours ago: too old to show as recent, inside the 72 hour window.
    "labs": [{"at_min": -3000, "test": "glucose", "value": 5.8}, {"at_min": -3000, "test": "wcc", "value": 7.0},
             {"at_min": -3000, "test": "k", "value": 4.2}, {"at_min": -3000, "test": "ph", "value": 7.40},
             {"at_min": -3000, "test": "lactate", "value": 1.1}],
    "historic_labs": [], "imaging": [],
    "forecast_story": {"contributors": [], "suggested_causes": [], "what_if": None},
    # No cuff connected: blood pressure is selected for display but on STANDBY.
    # The limb sensor starts just above the low-battery threshold.
    "devices": standard_devices(chest=71, limb=21, cuff=False),
    "faults": [
        {"at_min": 1, "fault": "battery-low", "device": "anne-limb"},
        {"at_min": 3, "fault": "motion", "device": "anne-chest", "minutes": 2},
        {"at_min": 7, "fault": "low-perfusion", "device": "anne-limb", "minutes": 2},
        {"at_min": 10, "fault": "sensor-off", "device": "anne-chest", "minutes": 2},
        {"at_min": 13, "fault": "connection-lost", "device": "anne-limb", "minutes": 3},
        {"at_min": 17, "fault": "battery-critical", "device": "anne-limb"},
    ],
}

DEFAULT_SCENARIO = "scn-pneumonia"
SCENARIO_IDS: tuple[str, ...] = tuple(SCENARIOS)
