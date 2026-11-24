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
6. **Monitoring problems never look like patient alarms.** They are tagged
   MONITOR rather than PATIENT, carry no priority mark, are framed with a dashed
   line, and use their own wording. Colour does not separate them: text takes the
   colour of its row (see below), a choice made so the screen has one colour code,
   not two. The word, mark and frame carry the difference.
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

Every row has **one tile**, holding all of that row's values (SpO2 and PR share one;
blood pressure reads "120/80 (93)"). All tiles are the same width and height, and a
tile never changes size whatever it holds. Each tile carries the battery and
wireless state of the device that measures its values, in its bottom corner.
If every value in a tile is in the same state (a limb sensor that lost its link
takes SpO2 and PR with it) the word is shown once across the tile; if they differ,
each value shows its own.

**Colour.** Everything in a row (its name, its trace marks, its tile, the device
marks, the status words) is drawn in that row's colour, the same colour as its
waveform. A problem is told apart from a healthy tile by its word, a frame and a
"!" glyph, never by a different colour:

- STANDBY, SEARCHING: thin frame, lighter weight.
- CHECK SENSOR, CONNECTION LOST, -?-: bold frame and a "!" in a circle.
- POOR TRACE: dashed frame and a "?" after the number.

Because text takes its row colour, every row colour must be readable on the
background: the design refuses any colour below 4.5:1 contrast in either the dark
or the light theme. Alarm colours stay on small marks and frames, not on text.

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

## The notification ticker

One box lists everything that needs attention. It is always on screen and always
the same size: bottom left of the tab bar by default, or the bottom right, the top
bar, or a fixed strip (a design choice; removing it is not).

- Nothing to report: **No Notifications**.
- Otherwise it is a **ticker**: items take turns, most serious first (newest
  first within a priority, or simply newest first), each tagged **PATIENT** or
  **MONITOR**, with "1/3" saying which of how many is showing. Vertical (the
  default) rolls one item up at a time; horizontal scrolls the text sideways when it
  does not fit.
- A **high-priority patient alarm stops the ticker** and is held still until it
  clears, so a serious alarm is never off screen between turns. Monitoring problems
  and lower-priority alarms do not hold it.
- **It never opens by itself.** Touching it opens the full list as an overlay that
  does not dim or move the monitor, with how long ago each item started. The ticker
  waits while the list is open.
- Patient alarms carry their priority as marks, **!!!** high, **!!** medium, **!**
  low (IEC 60601-1-8 as recalled; check the standard). A patient alarm also frames
  the box in the alarm colour. Monitoring items have no mark and a dashed frame.
- An item takes the colour of the row it is about. An item about several rows (a
  sensor that feeds more than one) is neutral with a small dot in each row's colour.
- New items are announced once to screen readers; the rotation is not.
- With reduced motion set, items swap without sliding or scrolling and nothing
  flashes.

## Alarm sound

| Situation | What the clinician sees |
|---|---|
| Ready | Silence button with a yellow outline and icon; top bar says "Alarms On" |
| Sound paused (two minutes) | Button solid yellow with the time left; a solid yellow **SOUND PAUSED 1:45** mark inside the notification box beside its headline; top bar says "Sound Paused 1:45". The list says "Alarm sound paused for 1:45. Alarms still show on screen" with a Resume Sound button |
| This screen cannot play sound | A MONITOR notification: "This screen cannot play alarm sounds. Tap to enable"; top bar says "Sound Off". Browsers block audio until someone touches the page, so this is a real failure mode for a tablet |
| Sound not yet confirmed | Top bar says "Sound Not Confirmed" rather than claiming alarms are on |
| Alarm switched off for one parameter | "ALARM OFF" in that value's tile heading (yellow, the one exception to row colour) |
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
  not removed. It never opens by itself and always holds a high-priority patient
  alarm.
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

## Example data and the AI

Until live data and the causal model are connected, the monitor can show **example data**:
a scripted scenario at a minute chosen in Demo Controls. Anything that looks alive but is
not is labelled: a blue **EXAMPLE DATA** badge in the top bar, and a small Example mark on
every module. Turning example data off returns the screen to NO DATA and STANDBY.

The AI chip on a module says what the interpretation found about that item and how sure it
is, **and of what** ("80% agreement", never a bare percentage). Rules the example follows:

- A trace that is poor is not interpreted. The chip says so, and the trace carries a dashed
  technical bracket ("Poor trace: movement"). That bracket is about the trace, not the AI,
  so it stays when AI is turned off.
- No signal means "AI paused", never "nothing flagged".
- "Nothing flagged" is not clearance. It appears only for items the interpretation reads,
  and a high number is never met with it (RR 29 reads "Fast breathing rate").
- Findings below the design's confidence floor are hidden, except poor-trace warnings.
- A finding's Why sheet shows the rule, what was measured, and the reasons with weights.
  The example rules need every criterion met, so the weights are equal; a trained model's
  would differ.
- AI On / Off is a choice of this screen (like dark / light), kept locally; it changes no layout.

## Editing the screen

Edit Layout, and every settings sheet, change the screen **while it is open**: the blue bar
(EDITING LAYOUT or UNSAVED CHANGES) and the side panel take room, and modules shrink to suit. It
is for workshops, not for a bedside, and the bar says so whenever something is unsaved.

- Edits show at once and are saved only on request, as a new version with who and why. A save
  never replaces history, and built-in designs are read-only, so saving one makes a copy.
- A design that would be unsafe or unreadable (a colour below 4.5:1 contrast in either theme, a
  missing silence button) cannot be saved, and the bar says why as soon as it happens.
- Editing never changes data: it only moves and configures rows that point at the registry.
- Undo steps back one edit at a time. Discard returns to the saved design.

## Traces

Each waveform and trend carries the marks needed to read it (a design choice, all on
by default; see `traces` in the design):

- **ECG**: a dashed line at 0 mV (the isoelectric baseline), an axis in mV, and a
  calibration bar exactly 1 mV tall at the gain drawn. The gain is written as just
  "10 mm/mV" in thin light text; it is 10 where the row is tall enough and falls
  back to 5 or 2.5 where it is not, and the text always states the gain actually
  drawn. The x scale is written as a number in the same thin light text ("25 mm/s"),
  with no horizontal bar. Tapping it opens the four speeds (6.25, 12.5, 25, 50 mm/s);
  one touch to open, one to choose, per trace.
- **Pleth and respiration**: a dashed line at the mean and an axis in arbitrary
  units. They have no absolute amplitude, so there is no calibration bar.
- **Trends**: gridlines and labels in the parameter's own unit, and the time window
  as the x scale ("4 h"), tappable to choose 15 min, 1 h, 4 h, 12 h or 24 h.

The x scale a clinician chooses is a preference of this screen, per trace, kept
locally like dark / light. It does not create a design version; the design supplies
the starting value.

Two honest limits. Millimetres are nominal: a CSS millimetre is not a physical one
on any particular screen, so "5 mm/mV" names the gain rather than promising a size on
the glass; the 1 mV bar is the true scale. The word "nominal" is not written on the
traces.
And the dashed ECG line is the display zero, not an estimate of the patient's
isoelectric level: on a drifting trace it will show the drift.

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
9. With all text in the row colour, is a problem tile easy enough to pick out by its
   word, frame and "!"? (The alternative is a single accent colour for problems.)
10. Should the ticker also hold a high-priority monitoring problem, or only patient
    alarms? Should a held alarm show its row name as well as the message?
11. Discharge clears the monitor for the next patient. What should the confirmation
   ask for so it cannot be done to the wrong patient by mistake?

## Sources and caveats

Flash rates in the stylesheet (fast for high priority, slow for medium, steady for
low) and the separation of technical from physiological alarms follow
IEC 60601-1-8 as I recall it; the figures should be checked against the standard
before being relied on. The prototype has not been assessed against IEC 62366-1
(usability engineering) or any alarm-system standard.
