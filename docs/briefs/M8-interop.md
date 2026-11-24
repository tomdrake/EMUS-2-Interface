# M8: FHIR R4 and HL7 v2 interfaces

Read `docs/HANDOFF.md` first. Needs M2, M6, M7. Acceptance tests:
`backend/tests/test_m8_interop.py`.

## Goal

Other systems can read what the monitor holds as FHIR R4 resources and can send it
patients and results as FHIR Bundles or HL7 v2 messages. This is mapping and
example exchange, not a conformance certificate: say so wherever it is described.

## Backend

| File | Build |
|---|---|
| `app/interop/fhir_map.py` | The mapping functions listed in the module docstring. |
| `app/interop/hl7v2_map.py` | Parser, ADT and ORU mapping, ACK, ORU export. |
| `app/routers/fhir.py`, `hl7v2.py` | The stubbed routes. |
| new `docs/interop.md` | What is supported, code tables, example requests and messages, known gaps. |

FHIR:

- Content type `application/fhir+json`. Errors are `OperationOutcome` with the
  right HTTP status. Search results are `searchset` Bundles with `total`.
- Patient: NHS number under `registry.NHS_NUMBER_SYSTEM` with spaces removed.
- Vital signs: category `vital-signs`, registry coding, UCUM units, UTC times.
  Blood pressure as one panel Observation with components. Oxygen flow as its own
  Observation with the device as a component. NEWS2 total as category `survey`
  with component scores and `derivedFrom` the observations it was scored from.
- Laboratory: category `laboratory`, `referenceRange`, `interpretation`
  (`L`, `H`, `LL`, `HH`) from the registry flag.
- Findings: Observation marked as AI-generated (an extension with the model name,
  version and placeholder flag). Event predictions: `RiskAssessment` with status
  `preliminary`, `prediction.probabilityDecimal`, `whenRange`, and `method.text`
  naming the model and saying when it is a placeholder.
- Imaging: `DiagnosticReport` with the report text as `conclusion`. Device: the
  patient's source as a `Device`.
- Bundle ingest: transaction, batch and collection; Patient and Observation.
  Unknown codes are reported in the response, never dropped silently.
- Where UK Core profiles apply, follow them and list them in `docs/interop.md`;
  where you are unsure a profile detail is right, say so there instead of guessing.

HL7 v2:

- Read delimiters from MSH-1 and MSH-2 and honour escape sequences.
- ADT A01, A04, A08 create or update the patient (NHS number from PID-3 with
  assigning authority NHS / type NH). ORU^R01 OBX rows map by LOINC through the
  registry (vital signs and labs); units are checked against the expected unit.
- ACK: `AA` when everything was stored, with unmapped OBX codes named in an ERR or
  MSA-3 text; `AE` for a known message that could not be applied (unknown patient);
  `AR` for unsupported message types. Non-HL7 bodies get HTTP 400.
- Export recent observations as ORU^R01.

Registry codes marked `provisional` must be checked against a terminology source
in this milestone. If the environment cannot reach one, leave them provisional and
list them in `docs/interop.md` under "to verify"; do not mark them verified.

ANNE One: update `app/sources/sibel_anne.py` and `docs/interop.md` with the
IEEE 11073 SDC route (what a consumer would subscribe to and how metrics map to
registry ids). No implementation without SDK or device access.

## Done when

- All `@todo("M8")` tests pass with the decorator removed; `make test` is green.
- If the `fhir.resources` package installs, add a test that parses every outbound
  resource type with it; if it does not, say so in the notes.
- `docs/interop.md` exists with copy-and-paste examples that work against `make serve`.
