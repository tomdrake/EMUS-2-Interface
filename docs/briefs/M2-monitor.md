# M2: live monitor, alarms and oxygen

Read `docs/HANDOFF.md` (rules) first. Acceptance tests: `backend/tests/test_m2_monitor.py`.

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

## Frontend

| File | Build |
|---|---|
| new `src/app/live.ts` | Zustand store for numerics, waveform ring buffers, alarms, status. WebSocket client with reconnect and a visible "disconnected" state. |
| `src/widgets/MonitorRows.tsx` + new `WaveCanvas.tsx`, `TrendTrace.tsx`, `BarTrace.tsx`, `EventsTrace.tsx`, `TimerRow.tsx` | Real traces and live numbers. Canvas sweep with the erase-bar gap (`design.sweep`), or scrolling. Speed in mm/s converted with CSS px per mm. Draw at device pixel ratio; one `requestAnimationFrame` loop for all canvases. |
| `src/layout/TopBar.tsx` | Real patient fields, oxygen, alarm status, SIMULATED badge. |
| `src/alarms/` | `audio.ts` (Web Audio tones by priority; needs one user gesture, so show "Tap to enable sound" until then), alarm banner, flashing numerics, `SilenceButton` driven by server state. |
| new `src/studio/AlarmLimitsSheet.tsx` | Opened by tapping a row (row id in `sheetContext`) or from the Patient menu. Large steppers for low and high, bounded by registry min/max, saved on each press. Tap row then tap stepper is two touches. |
| new `src/studio/OxygenSheet.tsx`, `PatientSheet.tsx`, `DemoControlsSheet.tsx` | Oxygen: flow presets (0, 1, 2, 4, 6, 10, 15 and plus/minus) and a device grid from `registry.o2_devices`. Demo: scenario picker, speed, jump, restart. |
| `src/widgets/` alarms, oxygen, patient | Replace the placeholders. |

## Done when

- All `@todo("M2")` tests pass with the decorator removed; `make test` is green.
- `frontend/e2e/smoke.cjs` additionally checks: numbers are not `--` within 5 s; the
  ECG canvas is not blank; on `scn-vt` after seeking to minute 5.4 an alarm banner
  appears, Silence shows a countdown starting at 2:00, and the banner stays visible;
  a limit can be changed in two touches; oxygen can be set to 4 L/min nasal cannula
  and the top bar shows it.
- Screenshots at 1280x800 and 1024x768 look like a bedside monitor, not a web page.
