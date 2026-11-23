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
7. **Nothing that arrives may move the screen.** Alarms and problems go to one
   notification box that is always present and always the same size, and to
   tiles that never change size. A clinician's eye should never have to re-find a
   number because a banner pushed it down.
8. **A poor trace is flagged, not hidden and not trusted.** The number stays, with
   a question mark and what to check. A dangerous rhythm must never be dismissed
   as artefact.
9. **Mistakes fail safe.** A second press on Silence resumes sound. Switching an
   alarm off takes a deliberate confirmation and leaves a mark on the row.
10. **These things can be restyled but not removed.** The design studio and the
   chatbot can move and recolour them; they cannot hide them or make two states
   look the same.

## What appears in place of a number

Every number sits in a **tile**. All tiles are the same width and height, and a
tile never changes size whatever it holds. Each tile carries the battery and
wireless state of the device that measures that value, in its bottom corner.

| State | Shown | Look | Means | Value shown? |
|---|---|---|---|---|
| `ok` | the number | parameter colour | Valid and current | Yes |
| `standby` | **STANDBY** | grey, thin outline | Selected for display but no device connected or started. Nothing is wrong; nothing is being measured | No |
| `acquiring` | **SEARCHING** | grey, thin outline | Device connected, looking for a signal | No |
| `poor-signal` | number with **?**, and **POOR TRACE** plus what to check on the row | technical colour, number dimmed | A value exists but the trace is noisy | Yes, flagged |
| `sensor-off` | **CHECK SENSOR** | technical colour, bold outline | Device is connected but the sensor or lead is off the patient | No |
| `connection-lost` | **CONNECTION LOST** with a running timer | technical colour, bold outline | The device was sending and has stopped | No (optionally the last value, struck through, with its age) |
| `invalid` | **-?-** | technical colour | A measurement was made but is out of measurable range, or the server said "fine" and sent nothing | No |
| screen not receiving | **NO DATA** on every number, screen greyed | grey | This screen has lost contact with the server | No |

Standby wording can be changed in the design to NOT CONNECTED or OFF. It is a
fixed list so it can never be set to something that reads like a value.

## The notification box

One box lists everything that needs attention. It is always on screen and always
the same size: bottom left of the tab bar by default, or the bottom right, the top
bar, or a fixed strip (a design choice; removing it is not).

- Nothing to report: **No Notifications**.
- Otherwise the most important item, tagged **PATIENT** or **MONITOR**, and a
  count of the rest ("+2"). Most serious first, newest first within a priority
  (or simply newest first, as a design choice).
- Touching it opens the full list as an overlay that does not dim or move the
  monitor, with how long ago each item started.
- Its colour follows its headline: red or yellow fill for a high or medium patient
  alarm, the technical colour for monitoring problems.

## Alarm sound

| Situation | What the clinician sees |
|---|---|
| Ready | Silence button with a yellow outline and icon; top bar says "Alarms On" |
| Sound paused (two minutes) | Button solid yellow with the time left; a solid yellow **SOUND PAUSED 1:45** mark inside the notification box beside its headline; top bar says "Sound Paused 1:45". The list says "Alarm sound paused for 1:45. Alarms still show on screen" with a Resume Sound button |
| This screen cannot play sound | A MONITOR notification: "This screen cannot play alarm sounds. Tap to enable"; top bar says "Sound Off". Browsers block audio until someone touches the page, so this is a real failure mode for a tablet |
| Sound not yet confirmed | Top bar says "Sound Not Confirmed" rather than claiming alarms are on |
| Alarm switched off for one parameter | "ALARM OFF" in that tile |
| Alarm enabled but no valid data | A MONITOR notification: "Not monitored: SpO2, PR" |

The pause is always two minutes and affects sound only. It does not hide patient
alarms, monitoring problems or the not-monitored list, and it does not move
anything on screen.

## Devices

The battery and wireless state of each device shows **in the tile of every value
that device measures**: the ECG sensor's battery and link are in the Heart Rate
tile, the limb sensor's in the SpO2 and PR tiles, the cuff's in the Blood Pressure
tile. A battery symbol and link bars, plus a word when something is wrong:
"LOW 18%", "BATT 6%", "NO LINK". A device that has never connected shows hollow
link bars and its tile says STANDBY. A summary of all devices can also be put in
the top bar as a design choice. A low battery or lost connection is always raised
as a notification as well:

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

- The notification box is always on screen and the same size; it can be moved,
  not removed.
- The sound-paused mark shows for as long as sound is paused.
- Technical alarms, battery warnings and lost signals are always shown.
- Tiles are one size and never resize; notifications never move the layout.
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
7. Is the notification box best at the bottom left, or nearer the top? Is a small
   yellow mark enough to say sound is paused, now that it no longer takes a full
   banner?
8. Battery and link now sit in each tile. Is that the right amount, or is a single
   summary in the top bar easier?
9. Discharge clears the monitor for the next patient. What should the confirmation
   ask for so it cannot be done to the wrong patient by mistake?

## Sources and caveats

Flash rates in the stylesheet (fast for high priority, slow for medium, steady for
low) and the separation of technical from physiological alarms follow
IEC 60601-1-8 as I recall it; the figures should be checked against the standard
before being relied on. The prototype has not been assessed against IEC 62366-1
(usability engineering) or any alarm-system standard.
