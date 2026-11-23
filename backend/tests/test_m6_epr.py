"""M6 acceptance: labs, imaging placeholders, MIMIC-IV demo import and replay.

Brief: docs/briefs/M6-mimic-epr.md
"""

import csv
import gzip

import pytest

from app import registry
from tests.conftest import todo


def _series(client, patient, test):
    body = client.get(f"/api/patients/{patient}/labs").json()
    return next(s for s in body["series"] if s["test"] == test), body


@todo("M6")
def test_lab_series_has_ranges_baselines_and_trend(client):
    wcc, _ = _series(client, "scn-pneumonia", "wcc")
    assert wcc["latest"]["value"] == 18.6 and wcc["latest"]["flag"] == "high"
    assert wcc["latest"]["unit"] == registry.LAB_TESTS["wcc"].unit
    assert (wcc["latest"]["ref_low"], wcc["latest"]["ref_high"]) == (4.0, 11.0)
    assert wcc["latest"]["performed_at"] and wcc["latest"]["collected_at"]
    assert [r["value"] for r in wcc["history"]][-3:] == [11.8, 14.9, 18.6]
    assert wcc["historic_baseline"] == 6.8
    assert wcc["recent_baseline"] == 14.9
    assert wcc["delta_from_recent"] == pytest.approx(3.7)
    assert wcc["delta_from_historic"] == pytest.approx(11.8)
    assert wcc["trend"] == "rising"


@todo("M6")
def test_sex_specific_ranges_are_used(client):
    hb_f, _ = _series(client, "scn-af", "hb")          # female, Hb 104
    assert (hb_f["latest"]["ref_low"], hb_f["latest"]["ref_high"]) == (115, 165)
    assert hb_f["latest"]["flag"] == "low"


@todo("M6")
def test_critical_values_are_pinned(client):
    k, body = _series(client, "scn-vt", "k")
    assert k["latest"]["value"] == 2.4 and k["latest"]["flag"] == "critical-low"
    assert [c["test"] for c in body["critical"]] == ["k"]
    _, stable = _series(client, "scn-stable", "wcc")
    assert stable["critical"] == []


@todo("M6")
def test_imaging_studies_and_placeholder_image(client):
    studies = client.get("/api/patients/scn-pneumonia/imaging").json()
    assert [s["id"] for s in studies] == ["scn-pneumonia-cxr-2", "scn-pneumonia-cxr-1"]
    latest = studies[0]
    assert latest["previous_study_id"] == "scn-pneumonia-cxr-1"
    assert latest["placeholder_image"] is True and latest["performed_where"]
    assert "consolidation" in latest["report"].lower()
    img = client.get(f"/api/imaging/{latest['id']}/image.svg")
    assert img.status_code == 200 and img.headers["content-type"].startswith("image/svg")
    assert "<svg" in img.text
    assert client.get("/api/patients/scn-stable/imaging").json() == []


# ------------------------------------------------------------------- MIMIC

@todo("M6")
def test_unit_conversion_to_uk_units():
    from app import mimic
    assert mimic.to_uk("creat", 1.2) == pytest.approx(106.1, abs=0.1)     # mg/dL -> umol/L
    assert mimic.to_uk("urea", 20) == pytest.approx(7.14, abs=0.01)       # BUN mg/dL -> mmol/L
    assert mimic.to_uk("hb", 10.4) == pytest.approx(104)                  # g/dL -> g/L
    assert mimic.to_uk("glucose", 180) == pytest.approx(9.99, abs=0.02)   # mg/dL -> mmol/L
    assert mimic.to_uk("pco2", 45) == pytest.approx(6.0, abs=0.01)        # mmHg -> kPa
    assert mimic.to_uk("k", 4.1) == 4.1
    assert mimic.fahrenheit_to_celsius(98.6) == pytest.approx(37.0)


@todo("M6")
def test_label_mapping():
    from app import mimic
    assert mimic.map_chart_label("Heart Rate") == "hr"
    assert mimic.map_chart_label("O2 saturation pulseoxymetry") == "spo2"
    assert mimic.map_chart_label("Something Else") is None
    assert mimic.map_lab_label("Creatinine", "Blood") == "creat"
    assert mimic.map_lab_label("Creatinine", "Urine") is None
    assert mimic.acvpu_from_gcs(4, 5, 6) == "A"
    assert mimic.acvpu_from_gcs(4, 4, 6) == "C"
    assert mimic.acvpu_from_gcs(1, 1, 1) == "U"


def _gz(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


@pytest.fixture()
def mimic_dir(tmp_path):
    """A tiny directory laid out like MIMIC-IV demo v2.2 (column names as published).

    Check the real files' headers when running `make mimic`; if they differ from this
    fixture, fix the fixture and say so in the hand-off notes."""
    d = tmp_path / "mimic"
    _gz(d / "hosp/patients.csv.gz",
        ["subject_id", "gender", "anchor_age", "anchor_year", "anchor_year_group", "dod"],
        [[10000001, "F", 67, 2150, "2011 - 2013", ""]])
    _gz(d / "hosp/admissions.csv.gz",
        ["subject_id", "hadm_id", "admittime", "dischtime", "admission_type"],
        [[10000001, 20000001, "2150-03-01 08:00:00", "2150-03-05 12:00:00", "EW EMER."]])
    _gz(d / "icu/icustays.csv.gz",
        ["subject_id", "hadm_id", "stay_id", "first_careunit", "last_careunit", "intime", "outtime", "los"],
        [[10000001, 20000001, 30000001, "MICU", "MICU", "2150-03-01 10:00:00", "2150-03-02 10:00:00", 1.0]])
    _gz(d / "icu/d_items.csv.gz",
        ["itemid", "label", "abbreviation", "linksto", "category", "unitname", "param_type"],
        [[1, "Heart Rate", "HR", "chartevents", "Routine Vital Signs", "bpm", "Numeric"],
         [2, "O2 saturation pulseoxymetry", "SpO2", "chartevents", "Respiratory", "%", "Numeric"],
         [3, "Temperature Fahrenheit", "Temp F", "chartevents", "Routine Vital Signs", "°F", "Numeric"],
         [4, "O2 Flow", "O2 Flow", "chartevents", "Respiratory", "L/min", "Numeric"],
         [5, "O2 Delivery Device(s)", "O2 Device", "chartevents", "Respiratory", "", "Text"]])
    chart = ["subject_id", "hadm_id", "stay_id", "charttime", "storetime", "itemid", "value", "valuenum", "valueuom"]
    rows = []
    for h in range(10, 16):
        t = f"2150-03-01 {h}:00:00"
        rows += [[10000001, 20000001, 30000001, t, t, 1, 80 + h, 80 + h, "bpm"],
                 [10000001, 20000001, 30000001, t, t, 2, 96, 96, "%"]]
    rows += [[10000001, 20000001, 30000001, "2150-03-01 12:00:00", "", 3, 100.4, 100.4, "°F"],
             [10000001, 20000001, 30000001, "2150-03-01 12:00:00", "", 4, 2, 2, "L/min"],
             [10000001, 20000001, 30000001, "2150-03-01 12:00:00", "", 5, "Nasal cannula", "", ""]]
    _gz(d / "icu/chartevents.csv.gz", chart, rows)
    _gz(d / "hosp/d_labitems.csv.gz", ["itemid", "label", "fluid", "category"],
        [[100, "Creatinine", "Blood", "Chemistry"], [101, "Potassium", "Blood", "Chemistry"]])
    _gz(d / "hosp/labevents.csv.gz",
        ["labevent_id", "subject_id", "hadm_id", "specimen_id", "itemid", "charttime", "storetime",
         "value", "valuenum", "valueuom", "ref_range_lower", "ref_range_upper", "flag"],
        [[1, 10000001, 20000001, 1, 100, "2150-03-01 11:00:00", "", "1.2", 1.2, "mg/dL", 0.4, 1.1, "abnormal"],
         [2, 10000001, 20000001, 2, 101, "2150-03-01 11:00:00", "", "4.1", 4.1, "mEq/L", 3.3, 5.1, ""]])
    return d


@todo("M6")
def test_import_and_replay_of_a_mimic_stay(client, mimic_dir):
    from app import mimic
    report = mimic.import_demo(mimic_dir, max_stays=5)
    assert report["patients"] == 1 and report["observations"] >= 13 and report["labs"] == 2
    assert "Respiratory Rate" in report["missing_labels"], "absent expected labels are reported"

    imported = [p for p in client.get("/api/patients").json() if p["origin"] == "mimic-demo"]
    assert len(imported) == 1
    pid = imported[0]["id"]
    detail = client.get(f"/api/patients/{pid}").json()
    assert detail["patient"]["sex"] == "female"
    assert detail["patient"]["nhs_number"].replace(" ", "").startswith("999")
    assert detail["source"]["supports_replay"] is True

    creat, _ = _series(client, pid, "creat")
    assert creat["latest"]["value"] == pytest.approx(106, abs=1) and creat["latest"]["unit"] == "µmol/L"

    client.post(f"/api/demo/{pid}/seek", json={"minutes": 180})      # 13:00 in the stay
    o2 = client.get(f"/api/patients/{pid}/oxygen").json()["current"]
    assert o2["flow_l_min"] == 2 and o2["device"] == "N"
    trend = client.get(f"/api/patients/{pid}/trend", params={"parameter": "temp", "minutes": 240}).json()
    assert any(v == pytest.approx(38.0, abs=0.05) for _, v in trend["points"])
