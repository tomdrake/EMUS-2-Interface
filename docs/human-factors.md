# Human factors and safety design

How the monitor tells a clinician that something is wrong **with the monitoring**
as opposed to wrong with the patient, and how it avoids the errors that matter
most: a blank that could mean several things, a stale value read as current, and
alarms that people believe are on when they are not.

This is design intent for a co-design prototype, to be challenged in workshops.
It is not a usability-engineering file and nothing here has been validated.

## Principles

1. **No blank and no dashes.** Wherever a number would be, there is either a
   current number or a word saying why there is not one. `--` is never shown.
2. **Each failure mode reads differently.** Word first, then colour and outline.
   Never colour alone, so it works for colour-blind users and in bright light.
3. **The server states the reason; the screen never guesses.** A missing value is
   not interpreted. Each parameter carries an explicit signal state.
4. **Nothing stale looks live.** A value is shown only while its signal is good.
   If the screen itself stops receiving data, everything on it is greyed and
   labelled NO DATA within three seconds.
5. **Alarm state is always in words.** Sound paused, sound unavailable, an alarm
   switched off for one parameter, and "not monitored" are four different
   statements, each visible without opening a menu.
6. **Monitoring problems never look like patient alarms.** They have their own
   colour, a MONITOR tag and their own wording.
7. **A poor trace is flagged, not hidden and not trusted.** The number stays, with
   a question mark and what to check. A dangerous rhythm must never be dismissed
   as artefact.
8. **Mistakes fail safe.** A second press on Silence resumes sound. Switching an
   alarm off takes a deliberate confirmation and leaves a mark on the row.
9. **These things can be restyled but not removed.** The design studio and the
   chatbot can move and recolour them; they cannot hide them or make two states
   look the same.

## What appears in place of a number

| State | Shown | Look | Means | Value shown? |
|---|---|---|---|---|
| `ok` | the number | parameter colour | Valid and current | Yes |
| `standby` | **STANDBY** | grey, dashed outline | Selected for display but no device connected or started. Nothing is wrong; nothing is being measured | No |
| `acquiring` | **SEARCHING** | grey, dashed outline | Device connected, looking for a signal | No |
| `poor-signal` | number with **?**, and **POOR TRACE** plus what to check on the row | technical colour, number dimmed | A value exists but the trace is noisy | Yes, flagged |
| `sensor-off` | **CHECK SENSOR** | technical colour, solid outline | Device is connected but the sensor or lead is off the patient | No |
| `connection-lost` | **CONNECTION LOST** with a running timer | technical colour, solid outline | The device was sending and has stopped | No (optionally the last value, struck through, with its age) |
| `invalid` | **-?-** | technical colour | A measurement was made but is out of measurable range, or the server said "fine" and sent nothing | No |
| screen not receiving | **NO DATA** on every number, screen greyed | grey | This screen has lost contact with the server | No |

Standby wording can be changed in the design to NOT CONNECTED or OFF. It is a
fixed list so it can never be set to something that reads like a value.

## Alarm sound

| Situation | What the clinician sees |
|---|---|
| Ready | Silence button with a yellow outline and icon; top bar says "Alarms on" |
| Sound paused (two minutes) | Button solid yellow with the time left; a full-width yellow banner: **ALARM SOUND PAUSED 1:45, Alarms still show on screen**, with a Resume sound button; top bar says "Sound paused 1:45" |
| This screen cannot play sound | MONITOR banner: "This screen cannot play alarm sounds. Tap to enable"; top bar says "Sound off". Browsers block audio until someone touches the page, so this is a real failure mode for a tablet |
| Sound not yet confirmed | Top bar says "Sound not confirmed" rather than claiming alarms are on |
| Alarm switched off for one parameter | "ALARM OFF" beside that number |
| Alarm enabled but no valid data | "Not monitored: SpO2, PR" in the MONITOR banner |

The pause is always two minutes and affects sound only. It does not hide patient
alarms, technical alarms or the not-monitored list.

## Devices

Each device (chest sensor, limb sensor, BP cuff, flow meter) shows in the top bar
with words as well as a battery symbol: "71%", "battery low 18%", "battery
critical 6%", "no signal 0:42", "standby". Problems are listed first. A low battery
or lost connection also appears on the rows that device feeds, and is always
raised as a technical alarm:

| Technical alarm | Priority | Example |
|---|---|---|
| Display not updating | High | This screen has lost contact with the monitor server. Values are not updating |
| Connection lost | Medium | Limb sensor: connection lost. Not monitoring SpO2, PR |
| Sensor off | Medium | Chest sensor: check sensor. Not monitoring HR, RR |
| Battery critical (10% or less) | Medium | Limb sensor: battery 6%. Replace or charge now |
| Alarm sound off | Medium | This screen cannot play alarm sounds. Tap to enable |
| Battery low (20% or less) | Low | Limb sensor: battery 18% |
| Poor trace | Low | HR: poor trace. Patient moving; recheck when still |

## Trace quality

`backend/app/signal_quality.py` grades the last few seconds of each waveform as
good, poor or unusable and names the likely problem with a suggestion:

| Problem | Says | Suggests |
|---|---|---|
| Noise | Noisy trace | Check electrode or sensor contact |
| Movement | Movement artefact | Patient moving; recheck when still |
| Wandering baseline | Wandering baseline | Check electrode contact |
| Weak signal | Weak signal | Check sensor position |
| Low perfusion (pleth) | Low perfusion | Check sensor site; try another site |
| Flat line | No signal | Check the sensor is attached |
| Clipped | Signal clipped | Check sensor position |

Suggestions say what to check, never what the diagnosis is. Where the device
reports its own quality or lead-off flags, those are used in preference.

The built-in check is a simple, explainable heuristic tuned on synthetic signals.
It is tested to grade wide-complex tachycardia and coarse fibrillation as real
signal rather than artefact, because calling a dangerous rhythm a "poor trace" is
the worst mistake it could make. It must be re-tuned on real ANNE One recordings
before anyone relies on it.

## Fixed, whatever the design says

- The paused-sound banner shows for as long as sound is paused.
- Technical alarms, battery warnings and lost signals are always shown.
- The technical colour differs from the high and medium patient alarm colours,
  and the paused, technical and standby colours are visible against the background.
- Thresholds (`registry.py`): connection lost after 5 s without data; screen stale
  after 3 s; battery low at 20%, critical at 10%; trace poor below 0.6, unusable
  below 0.3.

## Showing it in a workshop

Scenario **Monitoring problems, patient well** (`scn-technical`) plays each failure
in turn on a well patient: BP on standby throughout, then low battery, movement
artefact, low perfusion, sensor off, connection lost, and critical battery. Demo
controls can also inject any single failure on any scenario (milestone M2).

## Questions to put to clinicians

1. Is STANDBY the right word for "selected but not connected"? NOT CONNECTED and
   OFF are the alternatives offered.
2. After a lost connection, should the last value be hidden, or shown struck
   through with its age? (Both are available; hidden is the default.)
3. Should a new high-priority alarm break a two-minute pause and sound anyway?
4. Should a poor trace suppress a heart-rate alarm, delay it, or only annotate it?
   The prototype only annotates.
5. Is yellow right for "sound paused", given yellow also means a medium-priority
   alarm on many monitors?
6. How long without data before "connection lost"? Five seconds is a placeholder.
7. Where should battery state live: top bar only, or also on the rows?

## Sources and caveats

Flash rates in the stylesheet (fast for high priority, slow for medium, steady for
low) and the separation of technical from physiological alarms follow
IEC 60601-1-8 as I recall it; the figures should be checked against the standard
before being relied on. The prototype has not been assessed against IEC 62366-1
(usability engineering) or any alarm-system standard.
