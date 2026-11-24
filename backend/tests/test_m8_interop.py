"""M8 acceptance: FHIR R4 and HL7 v2 interfaces.

Brief: docs/briefs/M8-interop.md
"Compatible" here means: resources are shaped and coded to the standards and these
example exchanges work. It is not a conformance certificate against a specific EPR.
"""

from app import registry
from tests.conftest import todo

UCUM = "http://unitsofmeasure.org"
LOINC = "http://loinc.org"
SNOMED = "http://snomed.info/sct"
VITALS = "http://terminology.hl7.org/CodeSystem/observation-category"


def _entries(bundle):
    assert bundle["resourceType"] == "Bundle" and bundle["type"] == "searchset"
    return [e["resource"] for e in bundle.get("entry", [])]


def _codes(resource):
    return {(c["system"], c["code"]) for c in resource["code"]["coding"]}


# ----------------------------------------------------------------------- FHIR

@todo("M8")
def test_capability_statement(client):
    r = client.get("/fhir/metadata")
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/fhir+json")
    cs = r.json()
    assert cs["resourceType"] == "CapabilityStatement" and cs["fhirVersion"] == "4.0.1"
    types = {res["type"] for res in cs["rest"][0]["resource"]}
    assert {"Patient", "Observation", "DiagnosticReport", "Device", "RiskAssessment"} <= types


@todo("M8")
def test_patient_read_and_search_by_nhs_number(client):
    p = client.get("/fhir/Patient/scn-pneumonia").json()
    assert p["resourceType"] == "Patient" and p["birthDate"] == "1956-08-15" and p["gender"] == "male"
    assert p["name"][0]["family"] == "SMITH"
    ident = next(i for i in p["identifier"] if i["system"] == registry.NHS_NUMBER_SYSTEM)
    assert ident["value"] == "9990000018"
    found = _entries(client.get("/fhir/Patient", params={
        "identifier": f"{registry.NHS_NUMBER_SYSTEM}|9990000018"}).json())
    assert [x["id"] for x in found] == ["scn-pneumonia"]
    missing = client.get("/fhir/Patient/nobody")
    assert missing.status_code == 404 and missing.json()["resourceType"] == "OperationOutcome"


@todo("M8")
def test_vital_sign_observations(client):
    obs = _entries(client.get("/fhir/Observation", params={
        "patient": "scn-pneumonia", "category": "vital-signs", "code": f"{LOINC}|8867-4"}).json())
    assert obs
    o = obs[0]
    assert o["status"] == "final" and o["subject"]["reference"] == "Patient/scn-pneumonia"
    assert (LOINC, "8867-4") in _codes(o)
    assert o["category"][0]["coding"][0] == {"system": VITALS, "code": "vital-signs",
                                             "display": "Vital Signs"}
    q = o["valueQuantity"]
    assert q["system"] == UCUM and q["code"] == "/min" and isinstance(q["value"], (int, float))
    assert o["effectiveDateTime"].endswith(("Z", "+00:00"))


@todo("M8")
def test_blood_pressure_panel_oxygen_and_news2(client):
    all_obs = _entries(client.get("/fhir/Observation", params={
        "patient": "scn-pneumonia", "category": "vital-signs", "_count": 500}).json())
    bp = next(o for o in all_obs if (LOINC, "85354-9") in _codes(o))
    comp = {c["code"]["coding"][0]["code"]: c["valueQuantity"] for c in bp["component"]}
    assert {"8480-6", "8462-4"} <= set(comp) and comp["8480-6"]["code"] == "mm[Hg]"
    o2 = next(o for o in all_obs if (LOINC, "3151-8") in _codes(o))
    assert o2["valueQuantity"]["code"] == "L/min"
    news = _entries(client.get("/fhir/Observation", params={
        "patient": "scn-pneumonia", "category": "survey"}).json())
    total = next(o for o in news if (SNOMED, "1104051000000101") in _codes(o))
    assert isinstance(total["valueInteger"], int) and total["derivedFrom"]


@todo("M8")
def test_laboratory_observations_carry_ranges_and_flags(client):
    labs = _entries(client.get("/fhir/Observation", params={
        "patient": "scn-vt", "category": "laboratory"}).json())
    k = [o for o in labs if (LOINC, "2823-3") in _codes(o)]
    latest = max(k, key=lambda o: o["effectiveDateTime"])
    assert latest["valueQuantity"]["value"] == 2.4 and latest["valueQuantity"]["unit"] == "mmol/L"
    rng = latest["referenceRange"][0]
    assert (rng["low"]["value"], rng["high"]["value"]) == (3.5, 5.3)
    assert latest["interpretation"][0]["coding"][0]["code"] == "LL"


@todo("M8")
def test_predictions_as_risk_assessments_and_reports(client):
    risks = _entries(client.get("/fhir/RiskAssessment", params={"patient": "scn-pneumonia"}).json())
    assert risks
    r = risks[0]
    assert r["subject"]["reference"] == "Patient/scn-pneumonia" and r["status"] == "preliminary"
    pred = r["prediction"][0]
    assert 0 <= pred["probabilityDecimal"] <= 1 and pred["outcome"]["text"]
    assert "placeholder" in r["method"]["text"].lower()
    reports = _entries(client.get("/fhir/DiagnosticReport", params={"patient": "scn-pneumonia"}).json())
    assert len(reports) == 2 and "consolidation" in reports[0]["conclusion"].lower()
    devices = _entries(client.get("/fhir/Device", params={"patient": "scn-pneumonia"}).json())
    assert devices and devices[0]["resourceType"] == "Device"


@todo("M8")
def test_bundle_ingest(client):
    bundle = {"resourceType": "Bundle", "type": "transaction", "entry": [
        {"resource": {"resourceType": "Patient", "id": "ext-1",
                      "identifier": [{"system": registry.NHS_NUMBER_SYSTEM, "value": "9990000999"}],
                      "name": [{"family": "TEST", "given": ["Fhir"]}], "gender": "female",
                      "birthDate": "1980-02-03"},
         "request": {"method": "PUT", "url": "Patient/ext-1"}},
        {"resource": {"resourceType": "Observation", "status": "final",
                      "code": {"coding": [{"system": LOINC, "code": "8867-4"}]},
                      "subject": {"reference": "Patient/ext-1"},
                      "effectiveDateTime": "2026-11-23T10:00:00Z",
                      "valueQuantity": {"value": 91, "unit": "/min", "system": UCUM, "code": "/min"}},
         "request": {"method": "POST", "url": "Observation"}},
        {"resource": {"resourceType": "Observation", "status": "final",
                      "code": {"coding": [{"system": LOINC, "code": "00000-0"}]},
                      "subject": {"reference": "Patient/ext-1"},
                      "effectiveDateTime": "2026-11-23T10:00:00Z",
                      "valueQuantity": {"value": 1}},
         "request": {"method": "POST", "url": "Observation"}},
    ]}
    r = client.post("/fhir", json=bundle)
    assert r.status_code == 200
    body = r.json()
    assert body["resourceType"] == "Bundle" and body["type"] == "transaction-response"
    assert "00000-0" in str(body), "unknown codes are reported back, not dropped silently"
    assert client.get("/fhir/Patient/ext-1").json()["name"][0]["family"] == "TEST"
    hr = _entries(client.get("/fhir/Observation", params={
        "patient": "ext-1", "code": f"{LOINC}|8867-4"}).json())
    assert [o["valueQuantity"]["value"] for o in hr] == [91]
    bad = client.post("/fhir", json={"resourceType": "Patient"})
    assert bad.status_code == 400 and bad.json()["resourceType"] == "OperationOutcome"


# --------------------------------------------------------------------- HL7 v2

ADT = "\r".join([
    "MSH|^~\\&|EPR|RIE|EMUS2|W204|20261123100000||ADT^A01|MSG0001|P|2.5",
    "PID|1||9990000777^^^NHS^NH~H123456^^^RIE^MR||MACDONALD^Flora^^^Mrs||19480412|F",
    "PV1|1|I|W204^^B6",
])
ORU = "\r".join([
    "MSH|^~\\&|LAB|RIE|EMUS2|W204|20261123103000||ORU^R01|MSG0002|P|2.5",
    "PID|1||9990000777^^^NHS^NH||MACDONALD^Flora",
    "OBR|1|||24323-8^Comprehensive metabolic panel^LN|||20261123101500",
    "OBX|1|NM|2823-3^Potassium^LN||6.7|mmol/L|3.5-5.3|HH|||F|||20261123101500",
    "OBX|2|NM|8867-4^Heart rate^LN||118|/min|||||F|||20261123101500",
    "OBX|3|NM|99999-9^Mystery^LN||1|||||F|||20261123101500",
])


@todo("M8")
def test_parser_honours_delimiters_and_escapes():
    from app.interop import hl7v2_map as h
    msg = h.parse("MSH|^~\\&|A|B|||20260101||ADT^A08|X1|P|2.5\rPID|1||1^^^NHS^NH||O\\T\\BRIEN^Pat")
    pid = next(s for s in msg if s[0] == "PID")
    assert pid[5][0][0] == "O&BRIEN"
    odd = h.parse("MSH#^~\\&#A#B###20260101##ADT^A08#X2#P#2.5\rPID#1##5^^^NHS^NH")
    assert next(s for s in odd if s[0] == "PID")[3][0][0] == "5"


@todo("M8")
def test_adt_then_oru_over_http(client):
    ack = client.post("/hl7v2", content=ADT, headers={"content-type": "x-application/hl7-v2+er7"})
    assert ack.status_code == 200
    lines = ack.text.split("\r")
    assert lines[0].startswith("MSH|^~\\&|EMUS2") and "|ACK" in lines[0]
    assert lines[1].startswith("MSA|AA|MSG0001")
    found = client.get("/fhir/Patient", params={
        "identifier": f"{registry.NHS_NUMBER_SYSTEM}|9990000777"}).json()["entry"]
    pid = found[0]["resource"]["id"]
    assert found[0]["resource"]["name"][0]["family"] == "MACDONALD"

    ack2 = client.post("/hl7v2", content=ORU)
    assert ack2.text.split("\r")[1].startswith("MSA|AA|MSG0002")
    assert "99999-9" in ack2.text, "the unmapped OBX is named in the acknowledgement"
    k, body = None, client.get(f"/api/patients/{pid}/labs").json()
    k = next(s for s in body["series"] if s["test"] == "k")
    assert k["latest"]["value"] == 6.7 and k["latest"]["flag"] == "critical-high"
    hr = client.get(f"/api/patients/{pid}/trend", params={"parameter": "hr", "minutes": 100000}).json()
    assert 118 in [v for _, v in hr["points"]]


@todo("M8")
def test_bad_messages_are_rejected_with_an_error_ack(client):
    r = client.post("/hl7v2", content="this is not HL7")
    assert r.status_code == 400
    unknown_patient = ORU.replace("9990000777", "9990000000")
    r = client.post("/hl7v2", content=unknown_patient)
    assert r.text.split("\r")[1].startswith("MSA|AE|MSG0002")
    unsupported = ADT.replace("ADT^A01", "SIU^S12")
    assert client.post("/hl7v2", content=unsupported).text.split("\r")[1].startswith("MSA|AR|")


@todo("M8")
def test_oru_export(client):
    r = client.get("/api/patients/scn-stable/hl7v2/oru", params={"minutes": 30})
    assert r.status_code == 200
    segs = r.text.split("\r")
    assert segs[0].startswith("MSH|^~\\&|EMUS2") and "ORU^R01" in segs[0]
    assert any(s.startswith("PID|") and "9990000050" in s for s in segs)
    obx = [s.split("|") for s in segs if s.startswith("OBX|")]
    assert any(f[3].startswith("8867-4^") and f[6] == "/min" for f in obx)
    assert any(f[3].startswith("59408-5^") for f in obx)


def test_anne_one_adapter_declares_what_the_device_provides():
    from app.sources.sibel_anne import SibelAnneOneSource
    info = SibelAnneOneSource.INFO
    assert {"hr", "rr", "spo2", "temp", "position", "activity", "falls"} <= set(info.parameters)
    assert "bp_sys" not in info.parameters and info.simulated is False
