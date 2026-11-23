"""MIMIC-IV demo import logic (milestone M6). CLI wrapper: scripts/import_mimic_demo.py.

Source: MIMIC-IV Clinical Database Demo v2.2, open access (ODbL) at
https://physionet.org/content/mimic-iv-demo/2.2/ . 100 patients, de-identified,
dates shifted into the future. No waveforms, no radiology reports or images.

Rules
  * Map items by LABEL through d_items / d_labitems, never by hard-coded itemid.
    CHART_LABELS below is the expected label -> registry id mapping; the importer
    must report any expected label it does not find instead of silently skipping.
  * Convert US conventional units to UK units with registry.LAB_TESTS[...].mimic_factor
    and convert Fahrenheit to Celsius. Keep the original value and unit in the audit detail.
  * Oxygen: 'O2 Flow' (L/min) and 'O2 Delivery Device(s)' -> OxygenTherapy with a
    registry.O2_DEVICES code (DEVICE_MAP); unknown devices are imported as flow only.
  * ACVPU is approximated from GCS (15 = 'A'; verbal 4 = 'C'; otherwise by eye response)
    and flagged as derived.
  * Patients get synthetic names and 999-range NHS numbers; ``simulated`` is False for
    numerics/labs but the record is marked origin='mimic-demo'.
"""

from __future__ import annotations

from pathlib import Path

M = "M6"
BASE_URL = "https://physionet.org/files/mimic-iv-demo/2.2"
FILES = ("hosp/patients.csv.gz", "hosp/admissions.csv.gz", "hosp/labevents.csv.gz",
         "hosp/d_labitems.csv.gz", "icu/icustays.csv.gz", "icu/chartevents.csv.gz",
         "icu/d_items.csv.gz")

#: chartevents label (as in d_items.label) -> registry parameter id. Verify on import.
CHART_LABELS: dict[str, str] = {
    "Heart Rate": "hr",
    "Respiratory Rate": "rr",
    "O2 saturation pulseoxymetry": "spo2",
    "Non Invasive Blood Pressure systolic": "bp_sys",
    "Non Invasive Blood Pressure diastolic": "bp_dia",
    "Non Invasive Blood Pressure mean": "bp_mean",
    "Arterial Blood Pressure systolic": "bp_sys",
    "Arterial Blood Pressure diastolic": "bp_dia",
    "Arterial Blood Pressure mean": "bp_mean",
    "Temperature Celsius": "temp",
    "Temperature Fahrenheit": "temp",
    "O2 Flow": "o2_flow",
    "Inspired O2 Fraction": "fio2",
}

#: Substrings of 'O2 Delivery Device(s)' values -> registry.O2_DEVICES code.
DEVICE_MAP: dict[str, str] = {
    "None": "A", "Nasal cannula": "N", "Face tent": "SM", "Simple": "SM",
    "Venti mask": "V35", "Non-rebreather": "RM", "High flow nasal cannula": "HFNO",
    "Bipap mask": "NIV", "CPAP mask": "CP", "Trach mask": "TM", "Aerosol-cool": "H35",
}


def to_uk(test_id: str, value: float) -> float:
    """Convert a MIMIC lab value to the UK unit for ``test_id`` (registry factor)."""
    raise NotImplementedError(M)


def fahrenheit_to_celsius(f: float) -> float:
    raise NotImplementedError(M)


def map_chart_label(label: str) -> str | None:
    raise NotImplementedError(M)


def map_lab_label(label: str, fluid: str | None = None) -> str | None:
    """d_labitems label (+ fluid, to tell blood from urine) -> registry lab test id."""
    raise NotImplementedError(M)


def acvpu_from_gcs(eye: int | None, verbal: int | None, motor: int | None) -> str | None:
    raise NotImplementedError(M)


def download(dest: Path) -> list[Path]:
    """Fetch FILES into ``dest`` (skip those already present). Returns local paths."""
    raise NotImplementedError(M)


def import_demo(source_dir: Path, *, max_stays: int = 10) -> dict:
    """Import ICU stays with the richest vitals coverage into the configured database.

    Returns a report: {'patients': n, 'observations': n, 'labs': n,
    'missing_labels': [...], 'unmapped_devices': [...]}.
    """
    raise NotImplementedError(M)
