# M2: live monitor, alarms and oxygen

Read `docs/HANDOFF.md` (rules) and `docs/human-factors.md` first. Acceptance tests:
`backend/tests/test_m2_monitor.py` and `backend/tests/test_m2_safety.py`.

## Goal

The ICU-style home screen works end to end on simulated patients: moving waveforms
and numbers, alarms with a two-minute silence, per-patient alarm limits set by
tapping a row, and oxygen recorded as flow plus device.

## Backend

| File | Build |
|---|---|
| `app/sources/simulator.py` | `scenario_values`, `synth_ecg`, `synth_pleth`, `synth_resp`, `SimulatorSource`. Deterministic for a given seed. |
| `app/routers/patients.py` | patients list/detail, trend, oxygen get/post, alarm-limit put/delete (the M2 routes only). |
| `app/routers/stream.py` | WebSocket fan-out (one source per patient, many screens), demo controls. |
| `app/routers/alarms.py` | state, silence, unsilence, acknowledge, history. |
| new `app/alarm_engine.py` | Evaluates numerics against limits (patient override, else design default from the active design, else registry default). |
| new `app/store.py` (or similar) | Persistence helpers for patients, settings, oxygen, alarm events, silences, audit. |

Details that matter:

- **Scenario clock.** A scenario's minute 0 is the moment the server first starts
  that patient. `seek`, `speed` and `restart` move it. History (negative minutes)
  is generated on demand from the script, not stored row by row.
- **Numerics** are the interpolated script value plus small noise. **Charted
  observation sets** (used in M3) use the noise-free values rounded to the
  parameter's decimals so they are stable.
- **ECG synthesis**: sinus and brady with P-QRS-T; AF with no P waves, a fine
  fibrillatory baseline and irregular R-R; SVT narrow and regular; VT wide and
  regular; pause flat. Amplitude roughly 1 mV R wave.
- **Alarms**: an alarm starts when a value is outside its limit for 5 consecutive
  seconds (immediately for `vt`, `pause` and falls) and ends after 5 seconds back
  in range. Priority from the limit. Events are stored in `alarm_events`.
- **Silence**: fixed `registry.ALARM_SILENCE_SECONDS`. Stored in `alarm_silences`.
  It silences sound only. A new high-priority alarm during the silence is still
  shown immediately; say in the notes whether it should also break the silence
  (leave it silent for now and flag it as a question for clinicians).
- Every limit change, oxygen entry and silence writes an `audit_log` row.

## Monitoring health (backend)

The display must be able to tell failure modes apart, so the server always says
why a parameter has or has not got a value. Already built: the contracts
(`DeviceStatus`, `SignalStatus`, `SignalQuality`, `DevicesMessage`, technical
alarms), the thresholds in `registry.py`, and `app/signal_quality.py`.

| Build | Detail |
|---|---|
| `SimulatorSource.devices()` | From the scenario's `devices`: battery drains from its starting level; `registry.battery_state` gives the state. |
| `SimulatorSource.signal_status()` | The rules in the `DeviceSource.signal_status` docstring. A device that is `not-paired` gives `standby`, not an error. Manually recorded parameters (oxygen, ACVPU, manual BP) are `ok` with their last charted value. |
| `add_artefact` and scripted/injected faults | Add the artefact to the synthetic waveform and let `signal_quality.assess` grade it. Do not just set a flag. Scenario `faults` play at their scripted times; `POST /api/demo/{id}/fault` injects one on demand. |
| Values | `None` in `NumericsMessage` unless the state is `ok` or `poor-signal`. Send a `NumericsMessage` every second regardless: it is the display's heartbeat. |
| Technical alarms | Raised by the alarm engine from device and signal state using `registry.TECHNICAL_ALARMS` (message templates and priorities). `battery-critical` replaces `battery-low`. Standby raises nothing. |
| `AlarmState.unmonitored` | Parameters with an enabled limit whose state is not `ok` or `poor-signal`. Never raise a patient alarm from missing data. |
| `AlarmState.alarms_off` | Parameters whose limit is disabled for this patient. Disabling is audited. |
| Poor trace and alarms | A patient alarm on a poor trace still fires and is annotated; it is not suppressed. This is an open question for clinicians (see human-factors.md). |

## Frontend

The safety layer in `frontend/src/safety/` is already built and tested: `Numeric`
and `RowStatus` (what shows in place of a number), `SilenceBanner`, `SystemBanner`,
`DeviceChips`, the link watchdog and the display rules in `status.ts`. **Use it;
do not replace it.** Every number on the monitor goes through `<Numeric>`.

| File | Build |
|---|---|
| new `src/app/live.ts` | Zustand store for numerics and waveform ring buffers. WebSocket client with reconnect. Feed `useSafety`: `heartbeat()` on every message, `setDevices()` for `DevicesMessage`, `setAlarms()` for `AlarmMessage`, `setLink("down")` on close. |
| `src/widgets/MonitorRows.tsx` + new `WaveCanvas.tsx`, `TrendTrace.tsx`, `BarTrace.tsx`, `EventsTrace.tsx`, `TimerRow.tsx` | Real traces and live numbers. Canvas sweep with the erase-bar gap (`design.sweep`), or scrolling. Speed in mm/s converted with CSS px per mm. Draw at device pixel ratio; one `requestAnimationFrame` loop for all canvases. |
| `src/layout/TopBar.tsx` | Real patient fields, oxygen, alarm status, SIMULATED badge. |
| `src/alarms/` | `audio.ts`: Web Audio tones by priority. Browsers block sound until a touch, so set `useSafety.sound` to `blocked` until audio is unlocked, register `enableSound`, and set `ready` once a test tone has played; the MONITOR banner then offers "Enable sound". Patient alarm banner (red or yellow by priority, distinct from the MONITOR banner), flashing numerics. `SilenceButton` and `SilenceBanner` exist; drive them from the server's `AlarmState`. |
| traces | Dim a trace while its quality is poor when `design.safety.dim_poor_traces` is on; freeze and grey traces when the link is not live. |
| new `src/studio/AlarmLimitsSheet.tsx` | Opened by tapping a row (row id in `sheetContext`) or from the Patient menu. Large steppers for low and high, bounded by registry min/max, saved on each press. Tap row then tap stepper is two touches. Switching an alarm off needs a confirm step that names the parameter, and the row then shows ALARM OFF. |
| new `src/studio/OxygenSheet.tsx`, `PatientSheet.tsx`, `DemoControlsSheet.tsx` | Oxygen: flow presets (0, 1, 2, 4, 6, 10, 15 and plus/minus) and a device grid from `registry.o2_devices`. Demo: scenario picker, speed, jump, restart, and a "Show a failure" grid from `registry.demo_faults` with a device picker and "Clear". |
| `src/widgets/` alarms, oxygen, patient | Replace the placeholders. |

## Done when

- All `@todo("M2")` tests in both test files pass with the decorator removed; `make test` is green.
- The browser checks that currently drive failure modes through `window.__emus` are
  replaced by the same checks driven through `POST /api/demo/scn-technical/fault`,
  and all still pass. Add: stopping the server greys the screen and shows NO DATA
  within 3 seconds, and it recovers on restart.
- `frontend/e2e/smoke.cjs` additionally checks: numbers are not `--` within 5 s; the
  ECG canvas is not blank; on `scn-vt` after seeking to minute 5.4 an alarm banner
  appears, Silence shows a countdown starting at 2:00, and the banner stays visible;
  a limit can be changed in two touches; oxygen can be set to 4 L/min nasal cannula
  and the top bar shows it.
- Screenshots at 1280x800 and 1024x768 look like a bedside monitor, not a web page.
