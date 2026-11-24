"""Is this trace good enough to trust? A simple, transparent check.

Used to tell the clinician "poor trace, check the sensor" instead of presenting
a noisy waveform (and numbers or AI findings derived from it) as if it were clean.

Order of preference for quality information:
  1. what the device itself reports (lead-off, signal quality flags) -> assessed_by='device'
  2. this heuristic, on the last few seconds of samples        -> assessed_by='heuristic'

The heuristic looks for four things, each explainable in a sentence:
  flat        the signal barely moves                          -> sensor off
  clipped     many samples sit at the top or bottom            -> saturated
  noisy       sample-to-sample jitter is large                 -> noise
  wandering   the baseline drifts (ECG only)                   -> baseline wander / motion

It is NOT a validated signal-quality index. Thresholds were chosen on synthetic
signals and must be tuned on real ANNE One recordings before anyone relies on
them. Pure functions, standard library only.
"""

from __future__ import annotations

from statistics import median

from app import registry
from app.models.clinical import SignalQuality

MIN_SECONDS = 2.0

#: Peak-to-peak size of a normal signal, in the waveform's own units
#: (ECG in mV; pleth and resp are normalised to about 1 by the device adapter).
EXPECTED_AMPLITUDE = {"ecg": 1.0, "pleth": 1.0, "resp": 1.0}
FLAT_FRACTION = 0.02       # below this share of the expected size: no signal
WEAK_FRACTION = 0.15       # below this: weak signal
CLIP_FRACTION = 0.08       # share of samples pinned at an extreme: clipped ...
CLIP_DISTANCE = 0.25       # ... when that extreme is this far (share of span) from rest
NOISE_FULL_SCALE = 0.40    # jitter index at which the noise score reaches 0
WANDER_FULL_SCALE = 0.60   # wander index at which the wander score reaches 0
# Long enough to span several beats even in a fast wide-complex rhythm, so that
# ventricular tachycardia is not mistaken for a wandering baseline.
WANDER_WINDOW_S = 1.2


def _percentile(sorted_values: list[float], q: float) -> float:
    i = min(len(sorted_values) - 1, max(0, round(q * (len(sorted_values) - 1))))
    return sorted_values[i]


def _clamp01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def jitter_index(samples: list[float], span: float) -> float:
    """Median absolute second difference, as a share of the signal's span.

    A smooth trace (or a flat ECG baseline between beats) has almost none;
    random noise adds about 1.65 x its standard deviation.
    """
    if len(samples) < 3 or span <= 0:
        return 0.0
    d2 = [abs(samples[i + 1] - 2 * samples[i] + samples[i - 1]) for i in range(1, len(samples) - 1)]
    return median(d2) / span


def wander_index(samples: list[float], hz: float, span: float) -> float:
    """How far the baseline moves, as a share of the span. The median of each
    window sits on the baseline because beats occupy little of it."""
    width = max(3, int(WANDER_WINDOW_S * hz))
    if span <= 0 or len(samples) < 2 * width:
        return 0.0
    medians = [median(samples[i:i + width]) for i in range(0, len(samples) - width + 1, width)]
    return (max(medians) - min(medians)) / span


def assess(waveform: str, samples: list[float], hz: float) -> SignalQuality:
    """Grade the last few seconds of one waveform."""
    if waveform not in registry.WAVEFORMS:
        raise KeyError(waveform)
    if len(samples) < MIN_SECONDS * hz:
        raise ValueError(f"need at least {MIN_SECONDS} s of samples to judge a trace")

    def result(sqi: float, issue: str | None) -> SignalQuality:
        sqi = round(_clamp01(sqi), 3)
        grade = ("unusable" if sqi < registry.SQI_UNUSABLE_BELOW
                 else "poor" if sqi < registry.SQI_POOR_BELOW else "good")
        if grade == "good":
            issue = None
        info = registry.SIGNAL_ISSUES.get(issue or "", {})
        return SignalQuality(waveform=waveform, sqi=sqi, grade=grade, issue=issue,
                             label=info.get("label", ""), advice=info.get("advice", ""))

    ordered = sorted(samples)
    low, high = _percentile(ordered, 0.005), _percentile(ordered, 0.995)
    span = high - low
    expected = EXPECTED_AMPLITUDE[waveform]

    if span < FLAT_FRACTION * expected:
        return result(0.0, "flatline")

    # Clipped: many samples pinned at an extreme that is well away from the resting
    # level. (A clean ECG rests on its baseline, which may also be its minimum; that
    # is not clipping.)
    top, bottom = ordered[-1], ordered[0]
    rest = median(samples)
    edge = 0.005 * (top - bottom)
    for extreme, pinned in ((top, sum(1 for x in samples if x >= top - edge)),
                            (bottom, sum(1 for x in samples if x <= bottom + edge))):
        if pinned / len(samples) > CLIP_FRACTION and abs(extreme - rest) > CLIP_DISTANCE * span:
            return result(0.2, "saturated")

    scores: dict[str, float] = {}
    scores["noise"] = 1.0 - jitter_index(samples, span) / NOISE_FULL_SCALE
    if waveform == "ecg":
        scores["baseline-wander"] = 1.0 - wander_index(samples, hz, span) / WANDER_FULL_SCALE
    if span < WEAK_FRACTION * expected:
        scores["low-perfusion" if waveform == "pleth" else "low-amplitude"] = 0.5

    issue = min(scores, key=scores.get)  # type: ignore[arg-type]
    sqi = scores[issue]
    # Noise and a wandering baseline together are what movement looks like.
    if (waveform == "ecg" and scores["noise"] < registry.SQI_POOR_BELOW
            and scores["baseline-wander"] < registry.SQI_POOR_BELOW):
        issue = "motion"
    return result(sqi, issue)


def worst(qualities: list[SignalQuality]) -> SignalQuality | None:
    return min(qualities, key=lambda q: q.sqi) if qualities else None
