"""Sibel Health ANNE One adapter (stub).

What is known (public sources, Nov 2026):
  * ANNE One streams ECG, heart rate, respiratory rate, SpO2, pulse rate, skin
    temperature, body position, activity and fall detection.
  * It is certified to the IEEE 11073 SDC family (BICEPS / MDPWS / SDC).
  * The SDK is released to partners only; there is no public API documentation.
  * It does not measure blood pressure; sleep staging is not a device output.

Until SDK or SDC consumer access is arranged this class only documents the mapping
the real adapter must perform. Two integration routes are expected:
  1. Sibel SDK (Bluetooth to a host app) pushing samples to POST /api/ingest/...
  2. An SDC consumer that subscribes to the device's metrics and waveform streams.

Mapping to registry ids:
  ECG waveform -> 'ecg' | HR -> 'hr' | RR -> 'rr' | SpO2 -> 'spo2' | PR -> 'pulse'
  skin temperature -> 'temp' (flag as skin, not core) | body position -> 'position'
  activity -> 'activity' | fall detection -> 'falls' event
"""

from __future__ import annotations

from app.sources.base import DeviceSource, SourceInfo


class SibelAnneOneSource(DeviceSource):
    INFO = SourceInfo(
        id="anne-one", label="Sibel ANNE One", simulated=False,
        parameters=("hr", "rr", "spo2", "pulse", "temp", "position", "activity", "falls"),
        waveforms=("ecg", "pleth", "resp"),
    )

    def __init__(self, *args, **kwargs):
        raise NotImplementedError(
            "ANNE One integration needs the Sibel SDK or an IEEE 11073 SDC consumer; "
            "see the module docstring.")
