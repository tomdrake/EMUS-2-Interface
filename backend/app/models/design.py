"""The design document: everything about how the monitor looks and is arranged.

This is the ONLY thing the design studio and the chatbot may change. It refers to
clinical items by id (see ``app.registry``) and never defines them. A document
that does not validate here is rejected, which is what keeps redesign away from
the underlying data structures.

JSON uses snake_case throughout. ``scripts/gen_types.py`` exports the JSON Schema
and generates ``frontend/src/design/types.gen.ts`` from it; never edit that file
by hand.

Safety invariants enforced by validators (see ``Design._check``):
  * the top bar always shows the patient name and the clock;
  * monitoring problems (alarm sound paused, standby, connection lost, low battery,
    poor trace) can be restyled but never hidden, and their colours stay distinct;
  * the tab bar always has exactly one alarm-silence button and one settings button;
  * every function is at most two touches from the tab bar (menus cannot nest);
  * ids are unique and every reference resolves.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app import registry

SCHEMA_VERSION = 1

# Enumerations taken from the read-only registry.
ParameterId = Literal[*registry.PARAMETER_IDS]  # type: ignore[valid-type]
WaveformId = Literal[*registry.WAVEFORM_IDS]  # type: ignore[valid-type]
LabGroupId = Literal[*registry.LAB_GROUP_IDS]  # type: ignore[valid-type]
EventTypeId = Literal[*registry.EVENT_TYPE_IDS]  # type: ignore[valid-type]
CertaintyMetricId = Literal[*registry.CERTAINTY_METRIC_IDS]  # type: ignore[valid-type]

Colour = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$",
                              description="Hex colour, #RRGGBB or #RRGGBBAA.")]
Slug = Annotated[str, Field(pattern=r"^[a-z0-9][a-z0-9-]{0,39}$",
                            description="Lowercase id: letters, digits, hyphens.")]
Label = Annotated[str, Field(min_length=1, max_length=40)]

IconId = Literal[
    "monitor", "chart", "split", "labs", "imaging", "ai", "forecast", "alarm",
    "alarm-off", "settings", "patient", "oxygen", "timer", "heart", "lungs",
    "drop", "thermometer", "activity", "sleep", "fall", "palette", "layout",
    "chat", "history", "info", "none",
]


class _Model(BaseModel):
    # In the serialisation schema (used to generate frontend types) fields with
    # defaults are marked required, because the server always sends them.
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)


# ------------------------------------------------------------------------ theme

class ThemeColours(_Model):
    background: Colour
    surface: Colour
    surface_alt: Colour
    text: Colour
    text_muted: Colour
    border: Colour
    accent: Colour
    alarm_high: Colour
    alarm_medium: Colour
    alarm_low: Colour
    silenced: Colour = Field(description="The alarm-sound-paused state: the silence button "
                                         "and its banner. Conventionally yellow.")
    technical: Colour = Field(description="Technical alarms and signal problems (connection, "
                                          "battery, sensor, poor trace). Must differ from the "
                                          "patient alarm colours.")
    inactive: Colour = Field(description="STANDBY and SEARCHING text: nothing is being measured.")
    ai_highlight: Colour = Field(description="Highlight behind AI interpretation text.")
    forecast: Colour = Field(description="Dashed forecast lines and bands. Keep distinct "
                                         "from the NEWS score colours.")


class NewsBandColours(_Model):
    score_0: Colour
    score_1: Colour
    score_2: Colour
    score_3: Colour
    grid: Colour
    header: Colour
    header_text: Colour


class Theme(_Model):
    preset: Literal["icu-dark", "news-paper", "high-contrast", "colour-blind-safe", "custom"]
    colours: ThemeColours
    parameter_colours: dict[ParameterId, Colour] = Field(
        description="Trace and numeric colour per parameter.")
    news_bands: NewsBandColours
    font_family: Literal["system", "inter", "atkinson-hyperlegible", "mono"] = "system"
    font_scale: float = Field(1.0, ge=0.75, le=1.75)
    numeric_scale: float = Field(1.0, ge=0.6, le=2.0, description="Size of the big numbers.")
    trace_width: float = Field(2.0, ge=1.0, le=5.0)
    touch_target_px: int = Field(56, ge=48, le=96,
                                 description="Minimum height/width of anything tappable.")
    corner_radius_px: int = Field(8, ge=0, le=24)
    density: Literal["compact", "comfortable", "large"] = "comfortable"


# ------------------------------------------------------------------------- rows

class Row(_Model):
    """One monitoring item with its trace and numbers."""

    id: Slug
    kind: Literal["parameter", "spacer", "timer"] = "parameter"
    parameter: ParameterId | None = Field(None, description="Required when kind='parameter'.")
    label: Label | None = Field(None, description="Overrides the registry label.")
    colour: Colour | None = Field(None, description="Overrides theme.parameter_colours.")
    trace: Literal["waveform", "trend", "bar", "events", "none"] = "trend"
    waveform: WaveformId | None = Field(None, description="Required when trace='waveform'.")
    trend_window_min: int = Field(60, ge=5, le=1440)
    height: float = Field(1.0, ge=0.25, le=4.0, description="Relative row height.")
    numerics: list[ParameterId] = Field(
        default_factory=list, max_length=4,
        description="Numbers shown at the right of the row, largest first.")
    show_limits: bool = True
    show_ai: bool = Field(True, description="Show AI interpretation text on this row.")
    show_forecast: bool = Field(True, description="Show the dashed expected trend.")
    visible: bool = True

    @model_validator(mode="after")
    def _check(self) -> "Row":
        if self.kind == "parameter" and self.parameter is None:
            raise ValueError("a row of kind 'parameter' needs a parameter id")
        if self.trace == "waveform":
            if self.waveform is None:
                raise ValueError("trace 'waveform' needs a waveform id")
            allowed = registry.PARAMETERS[self.parameter].waveforms if self.parameter else ()
            if self.waveform not in allowed:
                raise ValueError(
                    f"waveform {self.waveform!r} is not available for parameter "
                    f"{self.parameter!r} (allowed: {list(allowed)})")
        return self


SWEEP_SPEEDS = (6.25, 12.5, 25.0, 50.0)


class Sweep(_Model):
    """How waveforms are drawn. The 'sweep break' is the moving erase gap."""

    mode: Literal["erase-bar", "scroll"] = "erase-bar"
    speed_mm_s: float = Field(25, description="One of 6.25, 12.5, 25 or 50 mm/s.",
                              json_schema_extra={"enum": list(SWEEP_SPEEDS)})
    gap_px: int = Field(24, ge=4, le=80, description="Width of the sweep break.")
    show_grid: bool = False

    @model_validator(mode="after")
    def _check(self) -> "Sweep":
        if self.speed_mm_s not in SWEEP_SPEEDS:
            raise ValueError(f"speed_mm_s must be one of {list(SWEEP_SPEEDS)}")
        return self


# ---------------------------------------------------------------------- widgets

class _Widget(_Model):
    id: Slug
    title: Label | None = None


class MonitorRowsWidget(_Widget):
    type: Literal["monitor-rows"] = "monitor-rows"
    row_ids: list[Slug] = Field(description="Rows to show, top to bottom.")
    numerics_side: Literal["left", "right"] = "right"


class News2ChartWidget(_Widget):
    type: Literal["news2-chart"] = "news2-chart"
    variant: Literal["bands-light", "bands-dark", "trend-dark"] = "bands-light"
    hours_visible: int = Field(24, ge=4, le=168)
    show_total_row: bool = True
    show_escalation_rows: bool = True
    show_future: bool = Field(True, description="Append predicted columns (see forecast).")
    column_source: Literal["charted", "continuous"] = Field(
        "charted", description="'charted' = recorded observation sets; "
                               "'continuous' = derived from the wearable every interval.")
    continuous_interval_min: int = Field(60, ge=5, le=240)


class LabsWidget(_Widget):
    type: Literal["epr-labs"] = "epr-labs"
    groups: list[LabGroupId] = Field(default_factory=lambda: list(registry.LAB_GROUP_IDS))
    show_sparklines: bool = True
    baseline: Literal["historic", "recent", "both"] = "both"
    pin_critical: bool = True
    show_reference_range: bool = True


class ImagingWidget(_Widget):
    type: Literal["epr-imaging"] = "epr-imaging"
    show_ai_regions: bool = True
    compare_with_previous: bool = True


class AiSummaryWidget(_Widget):
    type: Literal["ai-summary"] = "ai-summary"
    max_items: int = Field(6, ge=1, le=20)
    include_resolved: bool = True


class ForecastPanelWidget(_Widget):
    type: Literal["forecast-panel"] = "forecast-panel"
    show_news_number: bool = True
    show_events: bool = True
    show_contributors: bool = True


class EventsTimelineWidget(_Widget):
    type: Literal["events-timeline"] = "events-timeline"
    hours_back: int = Field(6, ge=0, le=48)
    hours_ahead: int = Field(6, ge=1, le=24)


class AlarmsWidget(_Widget):
    type: Literal["alarms"] = "alarms"
    view: Literal["limits", "history", "both"] = "both"


class OxygenWidget(_Widget):
    type: Literal["oxygen"] = "oxygen"


class PatientWidget(_Widget):
    type: Literal["patient"] = "patient"


class TextWidget(_Widget):
    type: Literal["text"] = "text"
    body: str = Field("", max_length=600, description="Plain text note. No HTML.")


Widget = Annotated[
    Union[
        MonitorRowsWidget, News2ChartWidget, LabsWidget, ImagingWidget, AiSummaryWidget,
        ForecastPanelWidget, EventsTimelineWidget, AlarmsWidget, OxygenWidget,
        PatientWidget, TextWidget,
    ],
    Field(discriminator="type"),
]


# ----------------------------------------------------------------------- layout

class WidgetNode(_Model):
    kind: Literal["widget"] = "widget"
    widget: Widget


class SplitNode(_Model):
    """Two panes side by side ('horizontal') or stacked ('vertical')."""

    kind: Literal["split"] = "split"
    direction: Literal["horizontal", "vertical"]
    ratio: float = Field(0.5, ge=0.15, le=0.85, description="Share taken by the first pane.")
    children: Annotated[list["LayoutNode"], Field(min_length=2, max_length=2)]


LayoutNode = Annotated[Union[WidgetNode, SplitNode], Field(discriminator="kind")]


class Screen(_Model):
    id: Slug
    name: Label
    layout: LayoutNode


# ------------------------------------------------------------------- navigation

class ScreenAction(_Model):
    type: Literal["screen"] = "screen"
    screen_id: Slug


class MenuAction(_Model):
    type: Literal["menu"] = "menu"
    menu_id: Slug


SheetId = Literal[
    # clinical
    "alarm-limits", "oxygen", "patient", "record-observations", "finding-explain",
    "forecast-horizon", "news2-variant", "home-screen",
    # design studio sections (each one touch from the Settings menu)
    "studio-appearance", "studio-layout", "studio-rows", "studio-navigation",
    "studio-alarms", "studio-forecast", "assistant", "versions",
    # system
    "api-tokens", "demo-controls", "about",
]


class SheetAction(_Model):
    """Opens a built-in panel over the current screen."""

    type: Literal["sheet"] = "sheet"
    sheet: SheetId


class SilenceAction(_Model):
    """Silences alarm audio for registry.ALARM_SILENCE_SECONDS (2 minutes)."""

    type: Literal["silence-alarms"] = "silence-alarms"


class SettingsAction(_Model):
    """Opens the menu whose id is 'settings' (which must exist)."""

    type: Literal["open-settings"] = "open-settings"


TabAction = Annotated[
    Union[ScreenAction, MenuAction, SheetAction, SilenceAction, SettingsAction],
    Field(discriminator="type"),
]
# Menu items cannot open another menu: that is what keeps everything within two touches.
MenuItemAction = Annotated[
    Union[ScreenAction, SheetAction, SilenceAction, SettingsAction],
    Field(discriminator="type"),
]


class Tab(_Model):
    id: Slug
    label: Label
    icon: IconId = "none"
    action: TabAction
    colour: Colour | None = None


class MenuItem(_Model):
    id: Slug
    label: Label
    icon: IconId = "none"
    action: MenuItemAction


class Menu(_Model):
    id: Slug
    title: Label
    items: list[MenuItem] = Field(min_length=1, max_length=12)


SETTINGS_MENU_ID = "settings"

TopBarField = Literal[
    "name", "dob", "age", "sex", "nhs_number", "bed", "ward", "consultant",
    "clock", "date", "alarm_status", "devices", "oxygen", "news2", "allergies", "weight",
]


class TopBar(_Model):
    fields: list[TopBarField] = Field(
        description="Left to right. Must include 'name' and 'clock'.")
    clock_format: Literal["24h", "12h"] = "24h"
    show_seconds: bool = True
    height_px: int = Field(56, ge=40, le=96)


class TabBar(_Model):
    position: Literal["bottom"] = "bottom"
    show_labels: bool = True
    height_px: int = Field(72, ge=56, le=112)


# ----------------------------------------------------------------------- alarms

class AlarmDefault(_Model):
    """Design-level default limits. Per-patient overrides are patient data."""

    low: float | None = None
    high: float | None = None
    priority: Literal["high", "medium", "low"] = "medium"
    enabled: bool = True

    @model_validator(mode="after")
    def _check(self) -> "AlarmDefault":
        if self.low is not None and self.high is not None and self.low >= self.high:
            raise ValueError("alarm low limit must be below the high limit")
        return self


class AlarmPresentation(_Model):
    flash_numerics: bool = True
    banner: Literal["top", "none"] = "top"
    sound: Literal["standard", "soft", "off-in-demo"] = "standard"
    show_silence_countdown: Literal[True] = True


# ------------------------------------------------------- safety presentation

class SafetyDisplay(_Model):
    """How monitoring problems are shown. See docs/human-factors.md.

    Only presentation is adjustable here. That each state is shown, and shown
    differently from every other state, is fixed: there is no option to hide the
    alarm-paused banner, a technical alarm, a battery warning or a lost signal.
    """

    #: Where the "alarm sound paused" banner sits. It is always shown while paused.
    silence_banner: Literal["top", "above-tabs"] = "top"
    silence_banner_pulse: bool = True
    #: Words for a selected modality with no device. Choices only: free text could
    #: be set to something that reads like a value.
    standby_text: Literal["STANDBY", "NOT CONNECTED", "OFF"] = "STANDBY"
    #: After a signal is lost: hide the old number, or show it greyed with its age.
    #: It is never shown as a current value either way.
    stale_values: Literal["hide", "dim-with-age"] = "hide"
    #: Show the "what to check" line under a poor trace or sensor problem.
    show_advice: bool = True
    #: Where device battery and wireless state appear. Low battery and lost
    #: connection are always raised as technical alarms regardless.
    device_status: Literal["top-bar", "top-bar-and-rows"] = "top-bar-and-rows"
    show_battery_percent: bool = True
    #: Dim a trace while its quality is poor so it is not read as clean.
    dim_poor_traces: bool = True


# ---------------------------------------------------------- AI interpretation

class AiDisplay(_Model):
    show_row_chips: bool = True
    show_confidence: bool = True
    highlight_style: Literal["pill", "underline", "glow"] = "pill"
    show_resolved: bool = Field(True, description="e.g. 'Last run of AF 2 h 14 min ago'.")
    resolved_window_hours: int = Field(24, ge=1, le=168)
    min_confidence: float = Field(0.5, ge=0.0, le=1.0)


# --------------------------------------------------------------------- forecast

class CertaintyDisplay(_Model):
    """Which certainty metric drives the display, and how it is shown."""

    metric: CertaintyMetricId = "prediction_interval"
    event_metric: CertaintyMetricId = "calibrated_probability"
    finding_metric: CertaintyMetricId = "calibrated_probability"
    display: Literal[
        "percent", "natural-frequency", "interval", "badge", "bars", "opacity", "dash-density",
    ] = "percent"
    badge_medium_at: float = Field(0.5, ge=0.0, le=1.0)
    badge_high_at: float = Field(0.8, ge=0.0, le=1.0)
    min_to_show: float = Field(0.3, ge=0.0, le=1.0,
                               description="Hide predictions below this certainty.")
    show_metric_name: bool = True

    @model_validator(mode="after")
    def _check(self) -> "CertaintyDisplay":
        if self.badge_medium_at >= self.badge_high_at:
            raise ValueError("badge_medium_at must be below badge_high_at")
        for attr, kind in (("metric", "forecast"), ("event_metric", "event"),
                           ("finding_metric", "finding")):
            m = registry.CERTAINTY_METRICS[getattr(self, attr)]
            if kind not in m.applies_to:
                raise ValueError(f"certainty metric {m.id!r} does not apply to {kind}s")
        return self


HorizonMin = Literal[60, 120, 240, 360, 720]


class Forecast(_Model):
    enabled: bool = True
    horizons_min: list[HorizonMin] = Field(default_factory=lambda: [60, 120, 240, 360],
                                           min_length=1)
    default_horizon_min: HorizonMin = 240
    #: N1 value-range, N2 band-probabilities, N3 time-to-threshold
    news_number: Literal["none", "value-range", "band-probabilities", "time-to-threshold"] = \
        "value-range"
    news_threshold: int = Field(5, ge=1, le=20)
    #: T1 dashed, T2 dashed-fan, T3 fading-dashes, T4 ghost-columns
    trend: Literal["none", "dashed", "dashed-fan", "fading-dashes", "ghost-columns"] = \
        "dashed-fan"
    fan_levels: list[Literal[50, 80, 95]] = Field(default_factory=lambda: [50, 80])
    #: T5 paired "no change" vs "with intervention" lines from the causal model
    what_if: bool = False
    #: E1 cards, E2 timeline, E3 row-chips, E4 threshold-text (any combination)
    events: list[Literal["cards", "timeline", "row-chips", "threshold-text"]] = Field(
        default_factory=lambda: ["cards", "row-chips"])
    event_types: list[EventTypeId] = Field(
        default_factory=lambda: list(registry.EVENT_TYPE_IDS))
    certainty: CertaintyDisplay = Field(default_factory=CertaintyDisplay)
    show_contributors: bool = True
    max_contributors: int = Field(4, ge=1, le=10)

    @model_validator(mode="after")
    def _check(self) -> "Forecast":
        if self.default_horizon_min not in self.horizons_min:
            raise ValueError("default_horizon_min must be one of horizons_min")
        return self


# ----------------------------------------------------------------------- design

class Design(_Model):
    schema_version: Literal[1] = SCHEMA_VERSION
    name: Label
    description: str = Field("", max_length=400)
    theme: Theme
    top_bar: TopBar
    tab_bar: TabBar = Field(default_factory=TabBar)
    tabs: list[Tab] = Field(min_length=2, max_length=9)
    menus: list[Menu] = Field(default_factory=list)
    screens: list[Screen] = Field(min_length=1)
    home_screen: Slug
    rows: list[Row]
    sweep: Sweep = Field(default_factory=Sweep)
    alarm_defaults: dict[ParameterId, AlarmDefault] = Field(default_factory=dict)
    alarm_presentation: AlarmPresentation = Field(default_factory=AlarmPresentation)
    safety: SafetyDisplay = Field(default_factory=SafetyDisplay)
    ai: AiDisplay = Field(default_factory=AiDisplay)
    forecast: Forecast = Field(default_factory=Forecast)

    @model_validator(mode="after")
    def _check(self) -> "Design":
        def unique(kind: str, ids: list[str]) -> set[str]:
            seen: set[str] = set()
            for i in ids:
                if i in seen:
                    raise ValueError(f"duplicate {kind} id {i!r}")
                seen.add(i)
            return seen

        screen_ids = unique("screen", [s.id for s in self.screens])
        menu_ids = unique("menu", [m.id for m in self.menus])
        row_ids = unique("row", [r.id for r in self.rows])
        unique("tab", [t.id for t in self.tabs])

        if self.home_screen not in screen_ids:
            raise ValueError(f"home_screen {self.home_screen!r} is not a screen id")

        # Required chrome: patient identity and time are always on screen.
        for required in ("name", "clock"):
            if required not in self.top_bar.fields:
                raise ValueError(f"top_bar.fields must include {required!r}")

        # Distinct states need distinct colours: a technical problem must not look like
        # a patient alarm, and "alarm sound paused" must not look like nothing.
        c = self.theme.colours
        clash = {c.alarm_high.lower(), c.alarm_medium.lower()} & {c.technical.lower()}
        if clash:
            raise ValueError("theme.colours.technical must differ from the high and medium "
                             "patient alarm colours")
        for token in ("silenced", "technical", "inactive"):
            if getattr(c, token).lower() in (c.background.lower(), c.surface.lower()):
                raise ValueError(f"theme.colours.{token} must be visible against the background")

        # Required controls: exactly one silence button and one settings button.
        tab_actions = [t.action.type for t in self.tabs]
        for required in ("silence-alarms", "open-settings"):
            if tab_actions.count(required) != 1:
                raise ValueError(f"tabs must contain exactly one {required!r} button")

        if SETTINGS_MENU_ID not in menu_ids:
            raise ValueError(f"menus must include one with id {SETTINGS_MENU_ID!r}")

        def check_action(action, where: str) -> None:
            if action.type == "screen" and action.screen_id not in screen_ids:
                raise ValueError(f"{where}: unknown screen {action.screen_id!r}")
            if action.type == "menu" and action.menu_id not in menu_ids:
                raise ValueError(f"{where}: unknown menu {action.menu_id!r}")

        for t in self.tabs:
            check_action(t.action, f"tab {t.id!r}")
        for m in self.menus:
            unique(f"menu {m.id!r} item", [i.id for i in m.items])
            for i in m.items:
                check_action(i.action, f"menu {m.id!r} item {i.id!r}")

        widget_ids: list[str] = []

        def walk(node, where: str) -> None:
            if node.kind == "split":
                for child in node.children:
                    walk(child, where)
                return
            w = node.widget
            widget_ids.append(w.id)
            if w.type == "monitor-rows":
                for rid in w.row_ids:
                    if rid not in row_ids:
                        raise ValueError(f"{where}: widget {w.id!r} uses unknown row {rid!r}")

        for s in self.screens:
            walk(s.layout, f"screen {s.id!r}")
        unique("widget", widget_ids)

        for pid, d in self.alarm_defaults.items():
            p = registry.PARAMETERS[pid]
            for v in (d.low, d.high):
                if v is None:
                    continue
                if (p.min_value is not None and v < p.min_value) or \
                   (p.max_value is not None and v > p.max_value):
                    raise ValueError(
                        f"alarm default for {pid!r} ({v}) is outside "
                        f"{p.min_value}..{p.max_value}")
        return self


def max_touch_depth(design: Design) -> int:
    """Touches needed to reach the deepest function from the tab bar.

    Tab → screen/sheet/action = 1. Tab → menu → item = 2. Menus cannot nest
    (enforced by the MenuItemAction type), so this can never exceed 2.
    """
    depth = 1
    menus = {m.id: m for m in design.menus}
    for t in design.tabs:
        if t.action.type == "menu" and menus[t.action.menu_id].items:
            depth = 2
        if t.action.type == "open-settings" and menus[SETTINGS_MENU_ID].items:
            depth = 2
    return depth


def json_schema() -> dict:
    return Design.model_json_schema()
