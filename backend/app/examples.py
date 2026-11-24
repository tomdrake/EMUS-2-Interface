"""EXAMPLE DATA: one scripted scenario at one chosen minute, built statelessly.

This exists so the interface has something real-looking to show (numbers, strips,
findings, a forecast) before the live simulator (M2) and the causal model (M7)
are built. Nothing here is a measurement or a validated prediction. Every
snapshot is ``placeholder=True`` and the interface badges it EXAMPLE DATA.

How it reads: the waveforms are *synthesised* (``sources.simulator``), then the
interpretation *reads them back* with a short, published rule (``analyse_ecg`` and
``classify_rhythm``). The interpretation is therefore explainable by construction:
each finding lists the rule, what was measured and the weight of each reason. It is
an example of how an explanation could look. It is not a clinical model, and its
certainty values are derived from the rule's own features, not calibrated.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import mean, median, pstdev

from app import clock, news2 as news2_mod, registry
from app.ai import certainty
from app.ai.interpretation import describe_resolved
from app.models.clinical import (
    AlarmEvent, AlarmState, Contributor, DeviceStatus, EventPrediction, Finding, Forecast,
    ForecastBundle, ForecastPoint, ImageEvidence, LabEvidence, ModelInfo, NewsBandProbabilities,
    OxygenTherapy, Patient, SignalQuality, SignalStatus, SuggestedCause, TrendEvidence,
    WaveformEvidence,
)
from app.models.example import (
    ExampleScenarioInfo, ExampleSnapshot, ExampleStrip, FindingData, Highlight, News2Now,
    TimedValue, TraceMark, TrendSeries,
)
from app.scenarios import SCENARIOS
from app import signal_quality
from app.sources.simulator import (
    add_artefact, scenario_values, synth_ecg, synth_pleth, synth_resp,
)

ECG_S, PLETH_S, RESP_S = 30.0, 30.0, 30.0   # live strips; long enough to fill a row at any sweep speed
READ_S = 8.0                                  # the rule reads the most recent 8 s
HORIZONS = (60, 120, 240, 360)
TREND_MINUTES = 1440
TREND_STEP = 10

MODEL = ModelInfo(
    name="Transparent rules (example)", version="0.1", placeholder=True,
    description="Short published rules over synthetic signals, so each finding can be "
                "explained. Not a clinical model; certainty values are not calibrated.",
    supported_certainty=["evidence_agreement", "input_quality", "sensitivity",
                         "prediction_interval", "conformal_interval", "horizon_decay",
                         "calibrated_probability", "ppv_natural_frequency", "time_to_event"])

SHORT = {"af": "AF", "svt": "SVT", "vt": "VT", "brady": "Bradycardia", "pause": "Pause"}
RHYTHM_SEVERITY = {"af": "warning", "svt": "warning", "vt": "critical", "brady": "warning",
                   "pause": "critical"}


# ------------------------------------------------------------------- the ECG rule

@dataclass
class EcgFeatures:
    r_times: list[float]
    rr: list[float]
    rate: float
    rr_cv: float
    p_fraction: float
    qrs_ms: float
    #: False above about 110/min, when the T wave of one beat sits where the next P wave would be.
    p_judged: bool = True


def analyse_ecg(samples: list[float], hz: float) -> EcgFeatures:
    """Measure the strip: R peaks, rate, R-R irregularity, P waves, QRS width."""
    base = median(samples)
    top = max(samples)
    thr = base + 0.6 * (top - base)
    peaks: list[int] = []
    for i in range(1, len(samples) - 1):
        if samples[i] > thr and samples[i] >= samples[i - 1] and samples[i] > samples[i + 1]:
            if not peaks or i - peaks[-1] > 0.2 * hz:
                peaks.append(i)
    r_times = [i / hz for i in peaks]
    rr = [b - a for a, b in zip(r_times, r_times[1:])]
    if len(rr) < 2:
        return EcgFeatures(r_times, rr, 0.0, 0.0, 0.0, 0.0, False)
    rate = 60.0 / mean(rr)
    cv = pstdev(rr) / mean(rr)

    # P wave: a bump 0.12 to 0.21 s before the R peak, clearly above the baseline.
    # Not judged when fast: the previous T wave lands in the same window.
    p_judged = rate <= 110
    with_p, tested = 0, 0
    for i in peaks[1:] if p_judged else []:
        lo, hi = i - int(0.21 * hz), i - int(0.12 * hz)
        if lo < 0:
            continue
        tested += 1
        window = samples[lo:hi + 1]
        if max(window) - base >= 0.09 and window.index(max(window)) not in (0, len(window) - 1):
            with_p += 1
    p_fraction = with_p / tested if tested else 0.0

    # QRS width: how long the first R peak stays above half its height.
    widths = []
    for i in peaks[1:-1] or peaks:
        half = base + 0.5 * (samples[i] - base)
        a = b = i
        while a > 0 and samples[a - 1] >= half:
            a -= 1
        while b < len(samples) - 1 and samples[b + 1] >= half:
            b += 1
        widths.append((b - a + 1) / hz * 1000)
    return EcgFeatures(r_times, rr, rate, cv, p_fraction, median(widths) if widths else 0.0, p_judged)


def classify_rhythm(f: EcgFeatures) -> str:
    """The rule. Wide and fast: VT. Narrow, fast, regular, no P: SVT. Irregular and no P: AF.
    Slow: bradycardia. Otherwise sinus. 'unclear' when there are too few beats."""
    if len(f.rr) < 2:
        return "pause" if not f.r_times else "unclear"
    if f.qrs_ms >= 100 and f.rate >= 120:
        return "vt"
    no_p = not f.p_judged or f.p_fraction < 0.3
    if f.rate >= 150 and f.rr_cv < 0.10 and no_p:
        return "svt"
    if f.rr_cv > 0.12 and no_p:
        return "af"
    if f.rate < 50:
        return "brady"
    return "sinus"


def _windows_agree(samples: list[float], hz: float, reading: str) -> tuple[int, int]:
    """Read three overlapping 5 s windows; how many give the same answer?"""
    n = int(5 * hz)
    starts = [0, (len(samples) - n) // 2, len(samples) - n]
    agree = sum(1 for s in starts if classify_rhythm(analyse_ecg(samples[s:s + n], hz)) == reading)
    return agree, len(starts)


# ------------------------------------------------------------------- faults and devices

def _fault_state(sc: dict, minute: float) -> list[dict]:
    out = []
    for f in sc.get("faults", []):
        end = f["at_min"] + f["minutes"] if f.get("minutes") else math.inf
        if f["at_min"] <= minute < end:
            out.append({**f, "started": f["at_min"], "until": end})
    return out


def _devices(sc: dict, minute: float, faults: list[dict], now: datetime) -> list[DeviceStatus]:
    out = []
    for d in sc["devices"]:
        pct = d.get("battery_pct")
        if pct is not None:
            pct = max(0.0, pct - d.get("battery_drain_pct_per_hour", 0) * max(minute, 0) / 60)
        connection = d["connection"]
        mine = [f for f in faults if f["device"] == d["id"]]
        for f in mine:
            if f["fault"] == "battery-low":
                pct = min(pct if pct is not None else 100, 18.0)
            if f["fault"] == "battery-critical":
                pct = min(pct if pct is not None else 100, 6.0)
            if f["fault"] == "connection-lost":
                connection = "lost"
            if f["fault"] == "not-paired":
                connection = "not-paired"
        lost_for = next((minute - f["started"] for f in mine if f["fault"] == "connection-lost"), 0)
        out.append(DeviceStatus(
            id=d["id"], label=d["label"], kind=d["kind"], connection=connection,
            connected_since=now - timedelta(hours=4) if connection == "connected" else None,
            last_seen=(now - timedelta(minutes=lost_for) if connection == "lost" else
                       now if connection == "connected" else None),
            battery_pct=None if pct is None else round(pct, 0),
            battery=registry.battery_state(pct),
            link_quality=0.0 if connection != "connected" else 0.9,
            parameters=d["parameters"], waveforms=d["waveforms"], simulated=True))
    return out


def _device_for(devices: list[DeviceStatus], parameter: str) -> DeviceStatus | None:
    return next((d for d in devices if parameter in d.parameters), None)


# ----------------------------------------------------------------- strips and marks

def _tag(strip: list[float], faults: list[dict], device: str, hz: float, t0: float,
         seed: int) -> list[float]:
    for f in faults:
        if f["device"] != device:
            continue
        if f["fault"] in ("noise", "motion", "low-perfusion", "sensor-off"):
            return add_artefact(strip, f["fault"], hz, t0, seed)
    return strip


def _quality(waveform: str, samples: list[float], hz: float) -> SignalQuality:
    return signal_quality.assess(waveform, samples, hz)


def _ecg_marks(reading: str, f: EcgFeatures, dur: float, fid: str | None) -> list[TraceMark]:
    marks: list[TraceMark] = []
    if reading == "af":
        if f.p_judged:
            marks.append(TraceMark(kind="bracket", start_s=0.0, end_s=dur, label="No P waves",
                                   finding_id=fid))
        if len(f.r_times) >= 4:
            marks.append(TraceMark(kind="bracket", start_s=f.r_times[0], end_s=f.r_times[3],
                                   label="Irregular R-R", finding_id=fid))
    elif reading == "svt":
        marks.append(TraceMark(kind="bracket", start_s=0.0, end_s=dur, label="Regular, narrow, fast",
                               finding_id=fid))
    elif reading == "vt":
        r = f.r_times[1] if len(f.r_times) > 1 else 0.5
        marks.append(TraceMark(kind="bracket", start_s=max(r - f.qrs_ms / 2000, 0),
                               end_s=r + f.qrs_ms / 2000 + 0.04, label="Wide QRS", finding_id=fid))
        marks.append(TraceMark(kind="bracket", start_s=0.0, end_s=dur, label="Regular, fast",
                               finding_id=fid))
    elif reading == "brady":
        marks.append(TraceMark(kind="bracket", start_s=0.0, end_s=dur, label="Slow", finding_id=fid))
    elif reading == "pause":
        marks.append(TraceMark(kind="bracket", start_s=0.0, end_s=dur, label="No beats", finding_id=fid))
    return marks


def _technical_mark(q: SignalQuality, dur: float) -> list[TraceMark]:
    if q.grade == "good":
        return []
    return [TraceMark(kind="bracket", start_s=0.0, end_s=dur, tone="technical",
                      label=f"Poor trace: {q.label.lower()}" if q.label else "Poor trace")]


def _ecg_strip(sc_id: str, minute: float, faults: list[dict], seconds: float = ECG_S,
               ends_before: float = 0.0, seed: int = 1, fid: str | None = None,
               rhythm_override: str | None = None, use_faults: bool = True) -> ExampleStrip:
    hz = registry.WAVEFORMS["ecg"]["hz"]
    t_end = minute * 60 - ends_before
    t0 = t_end - seconds
    v = scenario_values(sc_id, t_end / 60)
    rhythm = rhythm_override or v["rhythm"]
    rate = {"vt": 180, "svt": max(v["hr"], 170), "pause": 0}.get(rhythm, v["hr"])
    n = int(seconds * hz)
    samples = synth_ecg(rhythm, rate, hz, n, t0, seed)
    if use_faults:
        samples = _tag(samples, faults, "anne-chest", hz, t0, seed)
    # The rule reads, and the quality check grades, the most recent READ_S seconds.
    read = min(seconds, READ_S)
    tail = samples[-int(read * hz):]
    q = _quality("ecg", tail, hz)
    feats = analyse_ecg(tail, hz)
    reading = classify_rhythm(feats) if q.grade == "good" else None
    shift = seconds - read
    marks = _technical_mark(q, seconds) if q.grade != "good" else \
        [m.model_copy(update={"start_s": m.start_s + shift, "end_s": m.end_s + shift})
         for m in _ecg_marks(reading or "", feats, read, fid)]
    return ExampleStrip(waveform="ecg", hz=hz, seconds=seconds, ends_s_before_now=ends_before,
                        samples=samples, quality=q, reading=reading, marks=marks)


def _simple_strip(waveform: str, sc_id: str, minute: float, faults: list[dict], device: str,
                  seconds: float, seed: int = 1) -> ExampleStrip:
    hz = registry.WAVEFORMS[waveform]["hz"]
    t0 = minute * 60 - seconds
    v = scenario_values(sc_id, minute)
    n = int(seconds * hz)
    if waveform == "pleth":
        samples = synth_pleth(v["hr"], v["spo2"], hz, n, t0)
    else:
        samples = synth_resp(v["rr"], hz, n, t0)
    samples = _tag(samples, faults, device, hz, t0, seed)
    q = _quality(waveform, samples[-int(min(seconds, READ_S) * hz):], hz)
    return ExampleStrip(waveform=waveform, hz=hz, seconds=seconds, samples=samples, quality=q,
                        marks=_technical_mark(q, seconds))


# ------------------------------------------------------------------------- findings

def _ts(now: datetime, minute: float, at: float) -> datetime:
    return now + timedelta(minutes=at - minute)


def _certainty_rhythm(strip: ExampleStrip, agree: int, windows: int, criteria: tuple[int, int]):
    return [
        certainty.build("evidence_agreement", agreeing=criteria[0], considered=criteria[1]),
        certainty.build("input_quality", present=strip.quality.sqi),
        certainty.build("sensitivity", flipped=windows - agree, perturbations=windows),
    ]


def _rhythm_reasons(reading: str, f: EcgFeatures) -> tuple[list[tuple[str, bool, float]], str]:
    """(reason, met, margin) for each criterion of the rule, and the rule in words."""
    if reading == "af":
        items = [(f"R-R intervals vary by {f.rr_cv * 100:.0f}% (rule: more than 12%)",
                  f.rr_cv > 0.12, f.rr_cv - 0.12)]
        if f.p_judged:
            items.insert(0, ("No P waves before the QRS complexes", f.p_fraction < 0.3, 0.3 - f.p_fraction))
        return (items, "AF when R-R intervals vary by more than 12% and P waves are absent "
                       "(P waves cannot be judged above 110 beats a minute, so then the rule uses R-R alone).")
    if reading == "svt":
        return ([(f"Rate {f.rate:.0f}/min (rule: 150 or more)", f.rate >= 150, (f.rate - 150) / 100),
                 (f"Regular R-R (varies {f.rr_cv * 100:.0f}%, rule: under 10%)", f.rr_cv < 0.10,
                  0.10 - f.rr_cv),
                 ("Narrow QRS", f.qrs_ms < 100, (100 - f.qrs_ms) / 100)],
                "SVT when the rate is 150 or more, R-R is regular and the QRS is narrow.")
    if reading == "vt":
        return ([(f"Wide QRS ({f.qrs_ms:.0f} ms, rule: 100 or more)", f.qrs_ms >= 100,
                  (f.qrs_ms - 100) / 100),
                 (f"Rate {f.rate:.0f}/min (rule: 120 or more)", f.rate >= 120, (f.rate - 120) / 100)],
                "VT when the QRS is 100 ms or wider and the rate is 120 or more.")
    if reading == "brady":
        return ([(f"Rate {f.rate:.0f}/min (rule: under 50)", f.rate < 50, (50 - f.rate) / 50)],
                "Bradycardia when the rate is under 50.")
    return ([("No criterion met", True, 0.0)], "")


def _weights(items: list[tuple[str, bool, float]]) -> list[Contributor]:
    """Reasons with weights summing to 1. The rules here need every criterion met, so no
    criterion outweighs another and the weights are equal; a trained model would differ."""
    met = [t for t, ok, _m in items if ok]
    return [Contributor(factor=t, direction="raises", weight=round(1 / len(met), 3)) for t in met]


def _features_text(f: EcgFeatures) -> dict[str, str]:
    return {"Mean rate": f"{f.rate:.0f} /min",
            "R-R variation": f"{f.rr_cv * 100:.0f}%",
            "P waves present": f"{f.p_fraction * 100:.0f}% of beats" if f.p_judged else "not judged above 110 /min",
            "QRS width": f"{f.qrs_ms:.0f} ms",
            "Beats measured": str(len(f.r_times))}


def _tail(strip: ExampleStrip, seconds: float) -> ExampleStrip:
    """The last ``seconds`` of a strip, with its marks moved to match (the evidence the Why sheet draws)."""
    if strip.seconds <= seconds:
        return strip
    shift = strip.seconds - seconds
    marks = [m.model_copy(update={"start_s": max(0.0, m.start_s - shift), "end_s": max(0.0, m.end_s - shift)})
             for m in strip.marks if m.end_s > shift]
    return strip.model_copy(update={"samples": strip.samples[-int(seconds * strip.hz):],
                                    "seconds": seconds, "marks": marks})


def _rhythm_finding(sc_id: str, span: dict, minute: float, now: datetime, strip: ExampleStrip,
                    active: bool, baseline: ExampleStrip | None):
    fid = f"{sc_id}-{span['rhythm']}-{span['from_min']}"
    for m in strip.marks:
        m.finding_id = fid
    strip = _tail(strip, READ_S)
    reading = strip.reading or "unclear"
    f = analyse_ecg(strip.samples, strip.hz)
    items, rule = _rhythm_reasons(reading, f)
    reasons = _weights(items)
    agree, wins = _windows_agree(strip.samples, strip.hz, reading)
    cert = _certainty_rhythm(strip, agree, wins, (sum(1 for _, ok, _m in items if ok), len(items)))
    label = SHORT.get(span["rhythm"], span["rhythm"])
    onset = _ts(now, minute, span["from_min"])
    offset = None if active else _ts(now, minute, span["to_min"])
    why = "; ".join(r.factor for r in reasons)
    finding = Finding(
        id=fid, parameter="hr", domain="rhythm", code=span["rhythm"], label=label,
        status="active" if active else "resolved", onset=onset, offset=offset,
        severity=RHYTHM_SEVERITY.get(span["rhythm"], "info") if active else "info",
        summary="", explanation=f"{label} because: {why}." if why else "",
        certainty=cert, evidence=[WaveformEvidence(
            waveform="ecg", start=now - timedelta(seconds=strip.seconds + strip.ends_s_before_now),
            end=now - timedelta(seconds=strip.ends_s_before_now), marks=[m.model_dump() for m in strip.marks],
            baseline_start=now - timedelta(hours=3) if baseline else None,
            baseline_end=now - timedelta(hours=3) + timedelta(seconds=ECG_S) if baseline else None,
            caption=f"{label}: " + (", ".join(m.label for m in strip.marks) or "no marks"))],
        model=MODEL, generated_at=now)
    ago = int(max(0, (now - onset).total_seconds() // 60))
    finding.summary = ((f"{label} now, just started" if ago < 1 else f"{label} now, started {ago} min ago") if active
                       else describe_resolved(finding, now))
    data = FindingData(finding_id=fid, strip=strip, baseline_strip=baseline,
                       rr_intervals_s=[round(x, 3) for x in f.rr],
                       features=_features_text(f), rule=rule, reasons=reasons)
    return finding, data


def _sinus_tach_finding(sc_id: str, strip: ExampleStrip, f: EcgFeatures, now: datetime):
    fid = f"{sc_id}-sinus-tachycardia"
    ev = _tail(strip, READ_S)
    agree, wins = _windows_agree(ev.samples, ev.hz, "sinus")
    items = [(f"Rate {f.rate:.0f}/min (rule: 100 or more)", True, 1.0),
             (f"Regular R-R (varies {f.rr_cv * 100:.0f}%)", f.rr_cv <= 0.12, 1.0),
             ("QRS narrow", f.qrs_ms < 100, 1.0)]
    finding = Finding(
        id=fid, parameter="hr", domain="rhythm", code="sinus-tachycardia", label="Fast regular rhythm",
        status="active", onset=now - timedelta(seconds=READ_S), severity="info",
        summary=f"Fast regular rhythm, {f.rate:.0f}/min",
        explanation=f"Rhythm is regular with narrow QRS and a rate of {f.rate:.0f}/min. "
                    "The cause is not read from the ECG: check the patient.",
        certainty=_certainty_rhythm(ev, agree, wins, (sum(1 for _, ok, _m in items if ok), len(items))),
        evidence=[WaveformEvidence(waveform="ecg", start=now - timedelta(seconds=READ_S), end=now, marks=[],
                                   caption="Fast regular rhythm")],
        model=MODEL, generated_at=now)
    data = FindingData(finding_id=fid, strip=ev, rr_intervals_s=[round(x, 3) for x in f.rr],
                       features=_features_text(f),
                       rule="Fast regular rhythm when the rate is 100 or more, R-R varies by 12% or less and the QRS is narrow.",
                       reasons=_weights(items))
    return finding, data


def _poor_trace_finding(sc_id: str, strip: ExampleStrip, now: datetime):
    q = strip.quality
    fid = f"{sc_id}-poor-trace-{strip.waveform}"
    param = registry.WAVEFORMS[strip.waveform]["parameter"]
    label = registry.WAVEFORMS[strip.waveform]["label"]
    finding = Finding(
        id=fid, parameter=param, domain="rhythm" if strip.waveform == "ecg" else "overall",
        code="poor-trace", label=f"Poor {label} trace", status="active",
        onset=now - timedelta(seconds=strip.seconds), severity="info",
        summary=f"{q.label or 'Poor trace'}: AI reading paused. {q.advice}.",
        explanation="Interpreting a noisy trace could mislead, so the AI does not read it. "
                    "Rhythm findings return when the trace is clean.",
        certainty=[certainty.build("input_quality", present=q.sqi)],
        evidence=[], model=MODEL, generated_at=now)
    data = FindingData(finding_id=fid, strip=strip, features={"Signal quality": f"{q.sqi:.2f}",
                                                              "Issue": q.label or q.issue or ""},
                       rule="The trace is graded first. Below the 'poor' threshold, interpretation is paused.",
                       reasons=[Contributor(factor=q.label or "Poor trace", direction="raises", weight=1.0)])
    return finding, data


def _trend_points(sc_id: str, parameter: str, minute: float, minutes: int = TREND_MINUTES,
                  step: int = TREND_STEP) -> list[TimedValue]:
    out = []
    start = SCENARIOS[sc_id]["start_min"]
    for off in range(-minutes, 1, step):
        if minute + off < start:
            continue          # nothing was scripted before the scenario began
        v = scenario_values(sc_id, minute + off).get(parameter)
        if isinstance(v, (int, float)):
            out.append(TimedValue(t=float(off), v=round(v, 1)))
    return out


def _trend_finding(sc_id, minute, now, *, code, label, parameter, domain, severity, summary,
                   explanation, rows, reasons, agree, considered, quality):
    fid = f"{sc_id}-{code}"
    finding = Finding(
        id=fid, parameter=parameter, domain=domain, code=code, label=label, status="active",
        onset=now - timedelta(minutes=60), severity=severity, summary=summary,
        explanation=explanation,
        certainty=[certainty.build("evidence_agreement", agreeing=agree, considered=considered),
                   certainty.build("input_quality", present=quality)],
        evidence=[TrendEvidence(parameter=parameter, start=now - timedelta(minutes=240), end=now,
                                caption=label)],
        model=MODEL, generated_at=now)
    data = FindingData(finding_id=fid, features=rows, rule=explanation.split(". ")[0] + ".",
                       reasons=reasons, values=_trend_points(sc_id, parameter, minute))
    return finding, data


def _vitals_findings(sc, minute, now, v, quality: dict[str, float]):
    sc_id = sc["id"]
    out = []
    scale = sc["spo2_scale"]
    spo2 = v["spo2"]
    before = scenario_values(sc_id, minute - 60)["spo2"]
    low = 94 if scale == 1 else 88
    if spo2 < low or (before - spo2) >= 3:
        drop = before - spo2
        out.append(_trend_finding(
            sc_id, minute, now, code="desaturation", label="Falling oxygen saturation",
            parameter="spo2", domain="oxygenation", severity="critical" if spo2 < low - 3 else "warning",
            summary=(f"SpO2 {spo2:.0f}%, down {drop:.0f} points in the last hour" if drop >= 3
                     else f"SpO2 {spo2:.0f}%, below {low}%"),
            explanation=f"Rule: SpO2 below {low}% or down 3 points in an hour. "
                        f"It is {spo2:.0f}% now and was {before:.0f}% an hour ago.",
            rows={"SpO2 now": f"{spo2:.0f}%", "SpO2 an hour ago": f"{before:.0f}%",
                  "Threshold": f"{low}% (scale {scale})",
                  "On oxygen": f"{v['oxygen']['flow_l_min']:g} L/min" if v["oxygen"]["flow_l_min"] else "Room air"},
            reasons=_weights([(f"Below {low}%", spo2 < low, (low - spo2) / 10),
                              (f"Down {drop:.0f} points in an hour", drop >= 3, drop / 10)]),
            agree=int(spo2 < low) + int(drop >= 3), considered=2, quality=quality.get("spo2", 1.0)))
    rr = v["rr"]
    rr_before = scenario_values(sc_id, minute - 120)["rr"]
    if rr >= 24:
        rise = rr - rr_before
        rising = rise >= 3
        out.append(_trend_finding(
            sc_id, minute, now, code="fast-breathing",
            label="Fast and rising breathing rate" if rising else "Fast breathing rate",
            parameter="rr", domain="respiration", severity="critical" if rr >= 27 else "warning",
            summary=(f"RR {rr:.0f}/min, up from {rr_before:.0f} two hours ago" if rising
                     else f"RR {rr:.0f}/min, 24 or more"),
            explanation=f"Rule: RR 24 or more. It is {rr:.0f}/min now and was {rr_before:.0f}/min two hours ago.",
            rows={"RR now": f"{rr:.0f} /min", "RR two hours ago": f"{rr_before:.0f} /min"},
            reasons=_weights([("RR 24 or more", True, 1.0),
                              (f"Up {rise:.0f} in two hours", rising, 1.0)]),
            agree=1 + int(rising), considered=2, quality=quality.get("rr", 1.0)))
    sys_, sys_before = v["bp_sys"], scenario_values(sc_id, minute - 180)["bp_sys"]
    if sys_ < 105 and sys_before - sys_ >= 15:
        out.append(_trend_finding(
            sc_id, minute, now, code="bp-falling", label="Falling blood pressure",
            parameter="bp_sys", domain="haemodynamic", severity="critical" if sys_ < 95 else "warning",
            summary=f"Systolic {sys_:.0f} mmHg, down {sys_before - sys_:.0f} in three hours",
            explanation=f"Rule: systolic under 105 and down 15 or more in three hours. "
                        f"It is {sys_:.0f} now and was {sys_before:.0f} three hours ago.",
            rows={"Systolic now": f"{sys_:.0f} mmHg", "Three hours ago": f"{sys_before:.0f} mmHg"},
            reasons=_weights([("Systolic under 105", True, (105 - sys_) / 30),
                              (f"Down {sys_before - sys_:.0f} in three hours", True, (sys_before - sys_) / 40)]),
            agree=2, considered=2, quality=0.9))
    temp = v["temp"]
    if temp >= 38.0:
        out.append(_trend_finding(
            sc_id, minute, now, code="fever", label="Raised temperature", parameter="temp",
            domain="temperature", severity="warning",
            summary=f"Skin temperature {temp:.1f} °C",
            explanation=f"Rule: temperature 38.0 °C or more. It is {temp:.1f} °C. "
                        "Skin temperature reads lower than core temperature.",
            rows={"Temperature": f"{temp:.1f} °C"},
            reasons=_weights([("38.0 °C or more", True, (temp - 38) / 2)]),
            agree=1, considered=1, quality=0.9))
    return out


def _lab_findings(sc, minute, now):
    out = []
    labs = [x for x in sc["labs"] if x["at_min"] <= minute]
    for test, code, label in (("wcc", "wcc-rising", "White cell count rising"),
                              ("crp", "crp-rising", "CRP rising")):
        series = sorted([x for x in labs if x["test"] == test], key=lambda x: x["at_min"])
        if len(series) >= 2 and series[-1]["value"] >= 1.25 * series[0]["value"]:
            first, last = series[0], series[-1]
            fid = f"{sc['id']}-{code}"
            out.append((Finding(
                id=fid, parameter=None, domain="lab", code=code, label=label, status="active",
                onset=_ts(now, minute, last["at_min"]), severity="warning",
                summary=f"{label}: {first['value']:g} to {last['value']:g}",
                explanation=f"Rule: latest result at least 25% above the first this admission. "
                            f"{first['value']:g} then {last['value']:g}.",
                certainty=[certainty.build("evidence_agreement", agreeing=len(series), considered=len(series))],
                evidence=[LabEvidence(test=test, caption=label)], model=MODEL, generated_at=now),
                FindingData(finding_id=fid, features={"First": f"{first['value']:g}",
                                                      "Latest": f"{last['value']:g}",
                                                      "Change": f"{(last['value'] / first['value'] - 1) * 100:.0f}%"},
                            rule="Latest result at least 25% above the first this admission.",
                            reasons=[Contributor(factor=f"{series[0]['value']:g} to {series[-1]['value']:g}",
                                                 direction="raises", weight=1.0)],
                            values=[TimedValue(t=float(x["at_min"] - minute), v=x["value"]) for x in series])))
    k = sorted([x for x in labs if x["test"] == "k"], key=lambda x: x["at_min"])
    if k and (k[-1]["value"] < 2.5 or k[-1]["value"] > 6.5):
        fid = f"{sc['id']}-k-critical"
        out.append((Finding(
            id=fid, parameter=None, domain="lab", code="k-critical", label="Critical potassium",
            status="active", onset=_ts(now, minute, k[-1]["at_min"]), severity="critical",
            summary=f"Potassium {k[-1]['value']:g} mmol/L (critical)",
            explanation="Rule: potassium under 2.5 or over 6.5 mmol/L is critical.",
            certainty=[certainty.build("evidence_agreement", agreeing=1, considered=1)],
            evidence=[LabEvidence(test="k", caption="Critical potassium")], model=MODEL, generated_at=now),
            FindingData(finding_id=fid, features={"Latest": f"{k[-1]['value']:g} mmol/L"},
                        rule="Potassium under 2.5 or over 6.5 mmol/L is critical.",
                        reasons=[Contributor(factor=f"{k[-1]['value']:g} mmol/L", direction="raises", weight=1.0)],
                        values=[TimedValue(t=float(x["at_min"] - minute), v=x["value"]) for x in k])))
    return out


def _imaging_findings(sc, minute, now):
    out = []
    for s in sc["imaging"]:
        if s["at_min"] <= minute and s.get("previous_study_id"):
            fid = f"{sc['id']}-cxr-larger"
            out.append((Finding(
                id=fid, parameter=None, domain="imaging", code="cxr-larger",
                label="Consolidation larger than before", status="active",
                onset=_ts(now, minute, s["at_min"]), severity="warning",
                summary="Chest X-ray: consolidation larger than the previous film",
                explanation="Taken from the scripted report; no image analysis is run in this example.",
                certainty=[certainty.build("evidence_agreement", agreeing=1, considered=1)],
                evidence=[ImageEvidence(study_id=s["id"], compare_study_id=s["previous_study_id"],
                                        regions=s["regions"], caption="Compared with the previous film")],
                model=MODEL, generated_at=now),
                FindingData(finding_id=fid, features={"Study": s["description"]},
                            rule="Scripted report text, not image analysis.",
                            reasons=[Contributor(factor="Radiology report says larger", direction="raises", weight=1.0)])))
    return out


# ------------------------------------------------------------------------- forecast

def _news(v: dict, scale: int) -> news2_mod.News2Result:
    return news2_mod.news2(rr=v["rr"], spo2=v["spo2"], on_oxygen=v["oxygen"]["flow_l_min"] > 0,
                           bp_sys=v["bp_sys"], pulse=v["hr"], acvpu=v["acvpu"], temp=v["temp"],
                           spo2_scale=scale)


def _phi(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _forecast_bundle(sc, minute, now, quality: float) -> ForecastBundle:
    sc_id, scale, story = sc["id"], sc["spo2_scale"], sc["forecast_story"]
    contributors = [Contributor(factor=c["factor"], parameter=c["parameter"], direction=c["direction"],
                                weight=c["weight"]) for c in story["contributors"]]
    causes = [SuggestedCause(**c) for c in story["suggested_causes"]]
    wi = story.get("what_if")

    def point_values(param: str, horizon: int) -> float:
        fut = scenario_values(sc_id, minute + horizon)
        return float(_news(fut, scale).total) if param == "news2" else float(fut[param])

    spans = {"news2": 6.0, "rr": 12.0, "spo2": 8.0, "hr": 40.0}
    forecasts: list[Forecast] = []
    for param in ("news2", "rr", "spo2", "hr"):
        pts = []
        base_sd = {"news2": 0.7, "rr": 1.5, "spo2": 1.0, "hr": 5.0}[param]
        for h in HORIZONS:
            val = point_values(param, h)
            sd = base_sd * (1 + h / 120)
            iv = {k: (round(val - z * sd, 1), round(val + z * sd, 1))
                  for k, z in (("50", 0.674), ("80", 1.282), ("95", 1.96))}
            pts.append(ForecastPoint(horizon_min=h, at=now + timedelta(minutes=h), value=round(val, 1),
                                     intervals=iv))
        last = pts[-1]
        lo, hi = last.intervals["80"]
        forecasts.append(Forecast(
            parameter=param, generated_at=now, points=pts,
            certainty=[certainty.build("prediction_interval", lo=lo, hi=hi, reference_width=spans[param]),
                       certainty.build("conformal_interval", lo=last.intervals["95"][0],
                                       hi=last.intervals["95"][1], reference_width=spans[param] * 1.5,
                                       coverage=0.95),
                       certainty.build("input_quality", present=quality),
                       certainty.build("horizon_decay", horizon_min=HORIZONS[-1], tau_min=720),
                       certainty.build("evidence_agreement", agreeing=len(contributors),
                                       considered=max(len(contributors), 1))],
            contributors=contributors if param in ("news2", "rr", "spo2") else [],
            suggested_causes=causes if param == "news2" else [], model=MODEL))
        if wi and param in ("spo2", "rr") and any(k == param for k in wi["effect"]):
            shift = wi["effect"][param]
            forecasts.append(Forecast(
                parameter=param, generated_at=now, scenario=wi["scenario"], scenario_label=wi["label"],
                points=[ForecastPoint(horizon_min=p.horizon_min, at=p.at,
                                      value=round(p.value + shift * min(1, p.horizon_min / 120), 1),
                                      intervals={k: (round(a + shift * min(1, p.horizon_min / 120), 1),
                                                     round(b + shift * min(1, p.horizon_min / 120), 1))
                                                 for k, (a, b) in p.intervals.items()}) for p in pts],
                certainty=forecasts[-1].certainty, model=MODEL))

    sd_news = {h: 0.7 * (1 + h / 120) for h in HORIZONS}
    bands, events = [], []
    for h in HORIZONS:
        val = point_values("news2", h)
        sd = sd_news[h]
        high = 1 - _phi((6.5 - val) / sd)
        high_or_med = 1 - _phi((4.5 - val) / sd)
        bands.append(NewsBandProbabilities(horizon_min=h, low=round(1 - high_or_med, 3),
                                           medium=round(high_or_med - high, 3), high=round(high, 3)))
    minutes_to = None
    for off in range(0, 361, 10):
        if point_values("news2", off) >= 5:
            minutes_to = float(off)
            break
    p5 = bands[-1].medium + bands[-1].high
    p7 = bands[-1].high
    for event, p in (("news2_ge_5", p5), ("news2_ge_7", p7)):
        if p < 0.05:
            continue
        label = registry.EVENT_TYPES[event]["label"]
        t_med = minutes_to if (event == "news2_ge_5" and minutes_to is not None) else 240.0
        events.append(EventPrediction(
            id=f"{sc_id}-{event}", event=event, label=label, horizon_min=360,
            probability=round(p, 3), expected_at=now + timedelta(minutes=t_med),
            earliest_at=now + timedelta(minutes=max(0.0, t_med - 60)),
            latest_at=now + timedelta(minutes=min(360.0, t_med + 90)),
            certainty=[certainty.build("calibrated_probability", p=p),
                       certainty.build("ppv_natural_frequency", ppv=p),
                       certainty.build("time_to_event", q25_min=max(0, t_med - 60), median_min=t_med,
                                       q75_min=min(360, t_med + 90), horizon_min=360)],
            contributors=contributors, suggested_causes=causes, model=MODEL, generated_at=now))
    return ForecastBundle(
        patient_id=sc_id, generated_at=now, model=MODEL, forecasts=forecasts, news_bands=bands,
        minutes_to_news_threshold={"5": minutes_to}, events=events)


# ------------------------------------------------------------------------- the snapshot

def list_scenarios() -> list[ExampleScenarioInfo]:
    out = []
    for sc in SCENARIOS.values():
        hl: list[tuple[int, str]] = [(0, "Now")]
        for r in sc["rhythms"]:
            # A run shorter than two minutes can only be caught at its first minute.
            at = r["from_min"] if r["to_min"] - r["from_min"] < 2 else r["from_min"] + 1
            hl.append((at, f"{SHORT.get(r['rhythm'], r['rhythm'])} starts"))
        for f in sc.get("faults", []):
            hl.append((int(f["at_min"]) + 1, registry.DEMO_FAULTS[f["fault"]]))
        for e in sc["events"]:
            hl.append((e["at_min"] + 1, "Fall"))
        hl.append((sc["end_min"], "End"))
        out.append(ExampleScenarioInfo(
            id=sc["id"], title=sc["title"], teaching_point=sc["teaching_point"],
            start_min=sc["start_min"], end_min=sc["end_min"],
            highlights=[Highlight(minute=m, label=l) for m, l in sorted(set(hl))]))
    return out


def snapshot(scenario_id: str, minute: float, now: datetime | None = None) -> ExampleSnapshot:
    sc = SCENARIOS[scenario_id]
    minute = max(sc["start_min"], min(sc["end_min"], float(minute)))
    now = now or clock.now()
    v = scenario_values(scenario_id, minute)
    faults = _fault_state(sc, minute)
    devices = _devices(sc, minute, faults, now)

    # ---- strips (a strip is only drawn while its device is sending)
    chest, limb = (next((d for d in devices if d.id == i), None) for i in ("anne-chest", "anne-limb"))
    strips: list[ExampleStrip] = []
    seed = int(abs(minute) * 7) % 1000 + 1
    if chest and chest.connection == "connected":
        strips.append(_ecg_strip(scenario_id, minute, faults, seed=seed))
        strips.append(_simple_strip("resp", scenario_id, minute, faults, "anne-chest", RESP_S, seed))
    if limb and limb.connection == "connected":
        strips.append(_simple_strip("pleth", scenario_id, minute, faults, "anne-limb", PLETH_S, seed))
    by_wave = {s.waveform: s for s in strips}
    quality = [s.quality for s in strips]

    # ---- signal states: the server says why a number is, or is not, shown
    signals: dict[str, SignalStatus] = {}
    since = now - timedelta(minutes=5)
    wave_for = {"hr": "ecg", "spo2": "pleth", "pulse": "pleth", "rr": "resp"}
    for pid in registry.PARAMETER_IDS:
        dev = _device_for(devices, pid)
        state, advice, issue, q = "ok", "", None, None
        if dev is None:
            state = "ok" if pid in ("o2_flow", "acvpu", "news2", "sleep") else "standby"
        elif dev.connection == "not-paired":
            state = "standby"
        elif dev.connection == "lost":
            state, advice = "connection-lost", "Check the sensor is in range and charged"
        elif any(f["fault"] == "sensor-off" and f["device"] == dev.id for f in faults):
            state, advice = "sensor-off", registry.SIGNAL_ISSUES["flatline"]["advice"]
        else:
            s = by_wave.get(wave_for.get(pid, ""))
            if s and s.quality.grade != "good":
                state, issue, q = "poor-signal", s.quality.issue, s.quality.sqi
                advice = s.quality.advice
            elif s:
                q = s.quality.sqi
        signals[pid] = SignalStatus(parameter=pid, state=state, since=since,
                                    device_id=dev.id if dev else None, quality=q, issue=issue,
                                    advice=advice)
        # Last valid value for a lost signal, so the design can show it as old.
        if state in ("connection-lost", "sensor-off"):
            signals[pid].last_value = round(float(v[pid]), 0) if isinstance(v.get(pid), (int, float)) else None
            signals[pid].last_value_at = now - timedelta(minutes=2)

    # ---- numerics
    ox = v["oxygen"]
    numerics = {
        "hr": round(v["hr"]), "pulse": round(v["hr"]), "spo2": round(v["spo2"]), "rr": round(v["rr"]),
        "bp_sys": round(v["bp_sys"]), "bp_dia": round(v["bp_dia"]),
        "bp_mean": round((v["bp_sys"] + 2 * v["bp_dia"]) / 3),
        "temp": round(v["temp"], 1), "activity": round(v["activity"]), "position": v["position"],
        "o2_flow": ox["flow_l_min"], "acvpu": v["acvpu"],
        "falls": sum(1 for e in sc["events"] if e["type"] == "fall" and e["at_min"] <= minute),
        "sleep": "Asleep" if v["asleep"] else "Awake",
    }
    n2 = _news(v, sc["spo2_scale"])
    numerics["news2"] = n2.total
    oxygen = OxygenTherapy(at=now, flow_l_min=ox["flow_l_min"], device=ox["device"], source="simulated")

    # ---- alarms: patient alarms from limits, technical alarms from the monitoring itself
    active: list[AlarmEvent] = []
    alarms_off: list[str] = []
    unmonitored: list[str] = []
    for pid in ("hr", "spo2", "rr", "bp_sys", "temp"):
        p = registry.PARAMETERS[pid]
        sig = signals[pid]
        if sig.state in ("standby", "connection-lost", "sensor-off"):
            unmonitored.append(pid)
            continue
        val = float(numerics[pid])
        for kind, limit in (("low", p.default_low), ("high", p.default_high)):
            if limit is None:
                continue
            if (kind == "low" and val < limit) or (kind == "high" and val > limit):
                active.append(AlarmEvent(
                    id=f"{scenario_id}-{pid}-{kind}", parameter=pid, kind=kind,
                    priority=p.default_priority,
                    message=f"{p.short} {'low' if kind == 'low' else 'high'} {val:g}",
                    value=val, limit=limit, started_at=now - timedelta(minutes=1)))
    for d in devices:
        if d.battery in ("low", "critical"):
            t = registry.TECHNICAL_ALARMS[f"battery-{d.battery}"]
            active.append(AlarmEvent(
                id=f"{scenario_id}-{d.id}-battery", kind="technical", technical=f"battery-{d.battery}",
                device_id=d.id, priority=t["priority"],
                message=t["message"].format(device=d.label, battery=int(d.battery_pct or 0)),
                started_at=now - timedelta(minutes=1)))
        if d.connection == "lost":
            t = registry.TECHNICAL_ALARMS["connection-lost"]
            active.append(AlarmEvent(
                id=f"{scenario_id}-{d.id}-lost", kind="technical", technical="connection-lost",
                device_id=d.id, priority=t["priority"],
                message=t["message"].format(device=d.label, parameters=", ".join(
                    registry.PARAMETERS[p].short for p in d.parameters[:3])),
                started_at=now - timedelta(minutes=1)))
        if any(f["fault"] == "sensor-off" and f["device"] == d.id for f in faults):
            t = registry.TECHNICAL_ALARMS["sensor-off"]
            active.append(AlarmEvent(
                id=f"{scenario_id}-{d.id}-off", kind="technical", technical="sensor-off", device_id=d.id,
                priority=t["priority"], message=t["message"].format(device=d.label, parameters="ECG and RR"),
                started_at=now - timedelta(minutes=1)))
    for s in strips:
        if s.quality.grade != "good" and s.quality.issue != "flatline":
            t = registry.TECHNICAL_ALARMS["poor-signal"]
            active.append(AlarmEvent(
                id=f"{scenario_id}-{s.waveform}-poor", kind="technical", technical="poor-signal",
                parameter=registry.WAVEFORMS[s.waveform]["parameter"], priority=t["priority"],
                message=t["message"].format(parameter=registry.WAVEFORMS[s.waveform]["label"],
                                            advice=s.quality.advice),
                started_at=now - timedelta(minutes=1)))
    alarm_state = AlarmState(active=active, alarms_off=alarms_off, unmonitored=unmonitored)  # type: ignore[arg-type]

    # ---- findings: read from the synthesised signals by the rules above
    findings: list[Finding] = []
    data: dict[str, FindingData] = {}
    ecg = by_wave.get("ecg")
    sinus_from = min((r["from_min"] for r in sc["rhythms"]), default=minute) - 30
    baseline = _ecg_strip(scenario_id, sinus_from, [], seconds=READ_S, ends_before=0, seed=3,
                          rhythm_override="sinus", use_faults=False)
    for span in sc["rhythms"]:
        if span["from_min"] > minute:
            continue
        active_now = minute < span["to_min"]
        if active_now:
            if ecg is None or ecg.quality.grade != "good":
                continue
            strip = ecg
        else:
            mid = (span["from_min"] + span["to_min"]) / 2
            strip = _ecg_strip(scenario_id, mid, [], seconds=READ_S, ends_before=0, seed=5,
                               rhythm_override=span["rhythm"], use_faults=False)
            strip.ends_s_before_now = (minute - mid) * 60
        if strip.reading in (None, "sinus", "unclear"):
            continue
        f, d = _rhythm_finding(scenario_id, span, minute, now, strip, active_now, baseline)
        findings.append(f)
        data[f.id] = d
    if ecg is not None and ecg.reading == "sinus":
        feats = analyse_ecg(ecg.samples[-int(READ_S * ecg.hz):], ecg.hz)
        if feats.rate >= 100:
            f, d = _sinus_tach_finding(scenario_id, ecg, feats, now)
            findings.append(f)
            data[f.id] = d
    for s in strips:
        if s.quality.grade != "good" and s.quality.issue != "flatline":
            f, d = _poor_trace_finding(scenario_id, s, now)
            findings.append(f)
            data[f.id] = d
    qual = {"spo2": by_wave["pleth"].quality.sqi if "pleth" in by_wave else 0.0,
            "rr": by_wave["resp"].quality.sqi if "resp" in by_wave else 0.0}
    extra = []
    if signals["spo2"].state in ("ok", "poor-signal") and signals["rr"].state in ("ok", "poor-signal"):
        extra += _vitals_findings(sc, minute, now, v, qual)
    extra += _lab_findings(sc, minute, now) + _imaging_findings(sc, minute, now)
    for item in extra:
        f, d = item if isinstance(item, tuple) else item
        findings.append(f)
        data[f.id] = d
    if any(e["type"] == "fall" and 0 <= minute - e["at_min"] <= 120 for e in sc["events"]):
        e = next(e for e in sc["events"] if e["type"] == "fall" and 0 <= minute - e["at_min"] <= 120)
        fid = f"{scenario_id}-fall"
        findings.append(Finding(
            id=fid, parameter="falls", domain="activity", code="fall", label="Fall detected",
            status="resolved", onset=_ts(now, minute, e["at_min"]), offset=_ts(now, minute, e["at_min"]),
            severity="warning", summary=f"Fall {int(minute - e['at_min'])} min ago",
            explanation="Rule: the chest sensor reported a fall event.",
            certainty=[certainty.build("evidence_agreement", agreeing=1, considered=1)],
            evidence=[], model=MODEL, generated_at=now))
        data[fid] = FindingData(finding_id=fid, features={"Event": "Fall reported by chest sensor"},
                                rule="The chest sensor reported a fall event.",
                                reasons=[Contributor(factor="Fall event from the device", direction="raises",
                                                     weight=1.0)])
    order = {"active": 0, "resolved": 1}
    findings.sort(key=lambda f: (order[f.status], {"critical": 0, "warning": 1, "info": 2}[f.severity]))

    # ---- trends and forecast
    trends = {}
    for pid in ("hr", "rr", "spo2", "bp_sys", "bp_dia", "temp", "pulse", "activity"):
        src = "hr" if pid == "pulse" else pid
        dev = _device_for(devices, pid)
        trends[pid] = TrendSeries(parameter=pid, unit=registry.PARAMETERS[pid].unit,
                                  points=_trend_points(scenario_id, src, minute),
                                  device_id=dev.id if dev else None,
                                  quality=signals[pid].quality)
    all_q = [s.quality.sqi for s in strips] or [0.0]
    forecast = _forecast_bundle(sc, minute, now, mean(all_q))

    return ExampleSnapshot(
        scenario_id=scenario_id, title=sc["title"], minute=minute, generated_at=now, model=MODEL,
        patient=Patient(id=scenario_id, **sc["patient"]), numerics=numerics, oxygen=oxygen,
        news2=News2Now(total=n2.total, risk=n2.risk, complete=n2.complete, components=n2.components,
                       response=n2.response),
        devices=devices, signals=signals, quality=quality, alarms=alarm_state, strips=strips,
        trends=trends, findings=findings, finding_data=data, forecast=forecast)
