"""Built-in starting designs and theme presets.

These are seeded into the ``designs`` table on first run (see ``app.db.seed``).
Workshop participants duplicate and change them; the originals stay read-only.
Every design here is validated against ``app.models.design.Design`` in tests.
"""

from __future__ import annotations

import copy

from app.models.design import Design

# ----------------------------------------------------------------- theme presets

_ICU_PARAM_COLOURS = {
    "hr": "#3DDC55", "pulse": "#35D0E6", "spo2": "#35D0E6", "rr": "#F2E14B",
    "bp_sys": "#FF5A4D", "bp_dia": "#FF5A4D", "bp_mean": "#FF5A4D",
    "temp": "#F4F4F4", "o2_flow": "#7FB2FF", "fio2": "#7FB2FF", "acvpu": "#D58CFF",
    "news2": "#FFFFFF", "activity": "#FFA94D", "position": "#FFA94D",
    "falls": "#FF7AB6", "sleep": "#9AA7FF", "timer": "#C8CDD3",
}

# Okabe-Ito palette: distinguishable with the common colour-vision deficiencies.
_CB_PARAM_COLOURS = {
    "hr": "#009E73", "pulse": "#56B4E9", "spo2": "#56B4E9", "rr": "#F0E442",
    "bp_sys": "#D55E00", "bp_dia": "#D55E00", "bp_mean": "#D55E00",
    "temp": "#FFFFFF", "o2_flow": "#0086D1", "fio2": "#0086D1", "acvpu": "#CC79A7",
    "news2": "#FFFFFF", "activity": "#E69F00", "position": "#E69F00",
    "falls": "#CC79A7", "sleep": "#56B4E9", "timer": "#BBBBBB",
}

_PAPER_PARAM_COLOURS = {
    "hr": "#2C70AD", "pulse": "#2C70AD", "spo2": "#8E3FD0", "rr": "#357937",
    "bp_sys": "#1F5FBF", "bp_dia": "#1F5FBF", "bp_mean": "#1F5FBF",
    "temp": "#CF281E", "o2_flow": "#1F3F8F", "fio2": "#1F3F8F", "acvpu": "#B42CB4",
    "news2": "#1A1A1A", "activity": "#A55A09", "position": "#A55A09",
    "falls": "#B0246A", "sleep": "#4B55B8", "timer": "#555555",
}

# NEWS2 chart band colours as printed on the RCP chart (white / yellow / orange / red).
_NEWS_BANDS_LIGHT = {
    "score_0": "#FFFFFF", "score_1": "#FFF1B0", "score_2": "#F8C98F", "score_3": "#EC9B85",
    "grid": "#2B2B2B", "header": "#2A5DB8", "header_text": "#FFFFFF",
}
_NEWS_BANDS_DARK = {
    "score_0": "#12161C", "score_1": "#5B5220", "score_2": "#7A4B1E", "score_3": "#8C3329",
    "grid": "#3A424D", "header": "#24407A", "header_text": "#E8EEF7",
}

THEME_PRESETS: dict[str, dict] = {
    "icu-dark": {
        "preset": "icu-dark", "mode": "dark",
        "colours": {
            "background": "#000000", "surface": "#0E1116", "surface_alt": "#1A1F27",
            "text": "#F2F4F7", "text_muted": "#9AA4B2", "border": "#2A313C",
            "accent": "#4C8DFF", "alarm_high": "#FF2D2D", "alarm_medium": "#FFC400",
            "alarm_low": "#35D0E6", "silenced": "#FFC400", "technical": "#35D0E6", "inactive": "#8A94A3",
            "ai_highlight": "#3B2F6B", "forecast": "#B79CFF",
        },
        "parameter_colours": _ICU_PARAM_COLOURS,
        "news_bands": _NEWS_BANDS_DARK,
        "font_family": "system", "font_scale": 1.0, "numeric_scale": 1.0,
        "trace_width": 2.0, "touch_target_px": 56, "corner_radius_px": 8,
        "density": "comfortable",
    },
    "news-paper": {
        "preset": "news-paper", "mode": "light",
        "colours": {
            "background": "#FFFFFF", "surface": "#F5F7FA", "surface_alt": "#E6EBF2",
            "text": "#14181F", "text_muted": "#566070", "border": "#B9C2CF",
            "accent": "#2A5DB8", "alarm_high": "#C8102E", "alarm_medium": "#B36B00",
            "alarm_low": "#00708A", "silenced": "#F2B600", "technical": "#00708A", "inactive": "#6B7480",
            "ai_highlight": "#E8DEFF", "forecast": "#6A3FC9",
        },
        "parameter_colours": _PAPER_PARAM_COLOURS,
        "news_bands": _NEWS_BANDS_LIGHT,
        "font_family": "system", "font_scale": 1.0, "numeric_scale": 1.0,
        "trace_width": 2.0, "touch_target_px": 56, "corner_radius_px": 6,
        "density": "comfortable",
    },
    "high-contrast": {
        "preset": "high-contrast", "mode": "dark",
        "colours": {
            "background": "#000000", "surface": "#000000", "surface_alt": "#1C1C1C",
            "text": "#FFFFFF", "text_muted": "#D0D0D0", "border": "#FFFFFF",
            "accent": "#FFFF00", "alarm_high": "#FF3B30", "alarm_medium": "#FFD60A",
            "alarm_low": "#40E0FF", "silenced": "#FFD60A", "technical": "#40E0FF", "inactive": "#D0D0D0",
            "ai_highlight": "#4B2E83", "forecast": "#D9C2FF",
        },
        "parameter_colours": {**_ICU_PARAM_COLOURS, "temp": "#FFFFFF", "timer": "#FFFFFF"},
        "news_bands": {**_NEWS_BANDS_DARK, "grid": "#FFFFFF", "score_0": "#000000"},
        "font_family": "atkinson-hyperlegible", "font_scale": 1.15, "numeric_scale": 1.15,
        "trace_width": 3.0, "touch_target_px": 64, "corner_radius_px": 4,
        "density": "large",
    },
    "colour-blind-safe": {
        "preset": "colour-blind-safe", "mode": "dark",
        "colours": {
            "background": "#000000", "surface": "#0E1116", "surface_alt": "#1A1F27",
            "text": "#F2F4F7", "text_muted": "#9AA4B2", "border": "#2A313C",
            "accent": "#56B4E9", "alarm_high": "#D55E00", "alarm_medium": "#F0E442",
            "alarm_low": "#56B4E9", "silenced": "#F0E442", "technical": "#56B4E9", "inactive": "#9AA4B2",
            "ai_highlight": "#4A2C4F", "forecast": "#CC79A7",
        },
        "parameter_colours": _CB_PARAM_COLOURS,
        "news_bands": {
            "score_0": "#12161C", "score_1": "#4D4A14", "score_2": "#5A3B00",
            "score_3": "#6B2A00", "grid": "#3A424D", "header": "#1D2A44",
            "header_text": "#E8EEF7",
        },
        "font_family": "system", "font_scale": 1.0, "numeric_scale": 1.0,
        "trace_width": 2.5, "touch_target_px": 56, "corner_radius_px": 8,
        "density": "comfortable",
    },
}

# ------------------------------------------------------------------------- rows

_ROWS: list[dict] = [
    {"id": "ecg", "parameter": "hr", "trace": "waveform", "waveform": "ecg", "numerics": ["hr"],
     "height_scale": 1.25},
    {"id": "spo2", "parameter": "spo2", "trace": "waveform", "waveform": "pleth",
     "numerics": ["spo2", "pulse"], "height_scale": 1.25},
    {"id": "resp", "parameter": "rr", "trace": "waveform", "waveform": "resp", "numerics": ["rr"]},
    {"id": "bp", "parameter": "bp_sys", "label": "Blood Pressure", "trace": "trend",
     "numerics": ["bp_sys", "bp_dia", "bp_mean"], "trend_window_min": 240,
     "content": {"readings": True}, "height_scale": 1.5},
    {"id": "temp", "parameter": "temp", "trace": "trend", "numerics": ["temp"],
     "trend_window_min": 240},
    {"id": "oxygen", "parameter": "o2_flow", "trace": "bar", "numerics": ["o2_flow"],
     "content": {"forecast": False, "ai": False}, "height_scale": 1.25},
    {"id": "activity", "parameter": "activity", "trace": "bar", "numerics": ["position"],
     "trend_window_min": 240, "content": {"forecast": False, "ai": False}, "height_scale": 1.25},
    {"id": "sleep", "parameter": "sleep", "trace": "events", "trend_window_min": 720,
     "content": {"forecast": False}, "visible": False},
    {"id": "falls", "parameter": "falls", "trace": "events", "trend_window_min": 720, "numerics": ["falls"],
     "content": {"ai": False}, "height_scale": 1.25},
    {"id": "news", "parameter": "news2", "label": "NEWS2", "trace": "news", "numerics": ["news2"],
     "content": {"forecast": False, "ai": False}, "height_scale": 1.25},
]

#: The monitor rows, top to bottom, each full width: the familiar bedside monitor.
_MONITOR_ROW_IDS = ["ecg", "spo2", "resp", "bp", "temp"]
#: The line under them, in a nine-column grid: O2 flow, activity and falls (two columns each) and NEWS (three).
_MONITOR_LINE = [("oxygen", "tile"), ("activity", "tile"), ("falls", "tile"), ("news", "wide")]
_COMPACT_ROW_IDS = ["ecg", "spo2", "resp", "bp", "temp", "oxygen"]

#: A mixed layout for showing what modules can be: 6 columns, 5 rows of cells.
#: Rows 1-2: ECG double height, full width. Rows 3-4: two large, two tall. Row 5: two
#: small squares and two tiles.
_MODULAR_ITEMS = [("ecg", "row-tall"), ("spo2", "large"), ("resp", "large"), ("bp", "tall"),
                  ("temp", "tall"), ("oxygen", "compact"), ("activity", "compact"),
                  ("falls", "tile"), ("sleep", "tile")]
_MODULAR_ROW_OVERRIDES = {
    "sleep": {"visible": True},
    # the modular example is a grid of equal cells, so its rows stay at the standard height
    "ecg": {"content": {"explain": True, "forecast": True}, "height_scale": 1.0},
    "spo2": {"content": {"explain": True}, "height_scale": 1.0},
    "bp": {"height_scale": 1.0},
    "oxygen": {"height_scale": 1.0}, "activity": {"height_scale": 1.0}, "falls": {"height_scale": 1.0},
    "resp": {"content": {"explain": True}},
}

# ---------------------------------------------------------------------- screens


def _w(widget: dict) -> dict:
    return {"kind": "widget", "widget": widget}


def _split(direction: str, ratio: float, a: dict, b: dict) -> dict:
    return {"kind": "split", "direction": direction, "ratio": ratio, "children": [a, b]}


def _news(widget_id: str, variant: str) -> dict:
    return _w({"id": widget_id, "type": "news2-chart", "variant": variant})


def _grid(widget_id: str, items: list[tuple[str, str]], columns: int = 8) -> dict:
    return _w({"id": widget_id, "type": "monitor-grid", "columns": columns,
               "items": [{"row_id": r, "size": size} for r, size in items]})


def _rows(widget_id: str, ids: list[str]) -> dict:
    """Full-width rows: the familiar monitor."""
    return _grid(widget_id, [(i, "row") for i in ids])


def _monitor(widget_id: str) -> dict:
    """The monitor home screen: full-width traces, then one line of small boxes."""
    return _grid(widget_id, [(i, "row") for i in _MONITOR_ROW_IDS] + _MONITOR_LINE, columns=9)


def _screens(news_variant: str, monitor: dict | None = None) -> list[dict]:
    return [
        {"id": "monitor", "name": "Monitor", "layout": monitor or _monitor("monitor-rows")},
        {"id": "news2", "name": "NEWS2", "layout": _news("news2-full", news_variant)},
        {"id": "split-h", "name": "Split (Side by Side)",
         "layout": _split("horizontal", 0.5, _news("news2-left", news_variant),
                          _rows("rows-right", _COMPACT_ROW_IDS))},
        {"id": "split-v", "name": "Split (Stacked)",
         "layout": _split("vertical", 0.55, _rows("rows-top", _COMPACT_ROW_IDS),
                          _news("news2-bottom", news_variant))},
        {"id": "abcde", "name": "ABCDE",
         "layout": _split("horizontal", 0.5,
                          _w({"id": "abcde-panel", "type": "abcde"}),
                          _w({"id": "news2-abcde", "type": "news2-chart", "variant": news_variant, "hours_visible": 12}))},
        {"id": "epr", "name": "Results",
         "layout": _split("horizontal", 0.6,
                          _w({"id": "labs", "type": "epr-labs", "title": "Laboratory"}),
                          _w({"id": "imaging", "type": "epr-imaging", "title": "Imaging"}))},
        {"id": "predict", "name": "AI and Predictions",
         "layout": _split("horizontal", 0.5,
                          _split("vertical", 0.5,
                                 _w({"id": "forecast", "type": "forecast-panel",
                                     "title": "Forecast"}),
                                 _w({"id": "timeline", "type": "events-timeline",
                                     "title": "Events"})),
                          _w({"id": "ai-summary", "type": "ai-summary",
                              "title": "What the AI Sees Now"}))},
        {"id": "alarms", "name": "Alarms",
         "layout": _w({"id": "alarms-panel", "type": "alarms", "view": "both"})},
    ]


_TABS: list[dict] = [
    {"id": "monitor", "label": "Monitor", "icon": "monitor",
     "action": {"type": "screen", "screen_id": "monitor"}},
    {"id": "abcde", "label": "ABCDE", "icon": "heart",
     "action": {"type": "screen", "screen_id": "abcde"}},
    {"id": "news2", "label": "NEWS2", "icon": "chart",
     "action": {"type": "screen", "screen_id": "news2"}},
    {"id": "split", "label": "Split", "icon": "split",
     "action": {"type": "menu", "menu_id": "views"}},
    {"id": "results", "label": "Results", "icon": "labs",
     "action": {"type": "screen", "screen_id": "epr"}},
    {"id": "predict", "label": "Predict", "icon": "forecast",
     "action": {"type": "screen", "screen_id": "predict"}},
    {"id": "alarms", "label": "Alarms", "icon": "alarm",
     "action": {"type": "screen", "screen_id": "alarms"}},
    {"id": "patient", "label": "Patient", "icon": "patient",
     "action": {"type": "menu", "menu_id": "patient"}},
    {"id": "measure-bp", "label": "Measure BP", "icon": "bp-cuff",
     "action": {"type": "sheet", "sheet": "measure-bp"}},
    {"id": "measure-temp", "label": "Measure Temp", "icon": "thermometer",
     "action": {"type": "sheet", "sheet": "measure-temp"}},
    {"id": "overview", "label": "AI Overview", "icon": "ai",
     "action": {"type": "toggle-ai-overlay"}},
    {"id": "silence", "label": "Silence 2 Min", "icon": "alarm-off",
     "action": {"type": "silence-alarms"}},
]

# Top right: admit and discharge, day / night, and settings (a cog).
_TOP_BUTTONS: list[dict] = [
    {"id": "new-patient", "label": "New Patient", "icon": "new-patient",
     "action": {"type": "sheet", "sheet": "new-patient"}},
    {"id": "discharge", "label": "Discharge", "icon": "discharge",
     "action": {"type": "sheet", "sheet": "discharge-patient"}},
    {"id": "theme", "label": "Dark / Light", "icon": "theme",
     "action": {"type": "toggle-theme"}},
    {"id": "ai", "label": "AI", "icon": "ai", "action": {"type": "toggle-ai"}},
    {"id": "settings", "label": "Settings", "icon": "settings",
     "action": {"type": "open-settings"}},
]

_MENUS: list[dict] = [
    {"id": "views", "title": "Views", "items": [
        {"id": "side", "label": "NEWS2 Beside Monitor", "icon": "split",
         "action": {"type": "screen", "screen_id": "split-h"}},
        {"id": "stacked", "label": "Monitor Above NEWS2", "icon": "split",
         "action": {"type": "screen", "screen_id": "split-v"}},
        {"id": "news-variant", "label": "NEWS2 Chart Style", "icon": "chart",
         "action": {"type": "sheet", "sheet": "news2-variant"}},
        {"id": "home", "label": "Choose Home Screen", "icon": "layout",
         "action": {"type": "sheet", "sheet": "home-screen"}},
        {"id": "underlying-data", "label": "Underlying Data", "icon": "info",
         "action": {"type": "sheet", "sheet": "underlying-data"}},
        {"id": "ai-toggle", "label": "AI On / Off", "icon": "ai", "action": {"type": "toggle-ai"}},
    ]},
    {"id": "patient", "title": "Patient", "items": [
        {"id": "details", "label": "Patient Details", "icon": "patient",
         "action": {"type": "sheet", "sheet": "patient"}},
        {"id": "observations", "label": "Record Observations", "icon": "chart",
         "action": {"type": "sheet", "sheet": "record-observations"}},
        {"id": "oxygen", "label": "Oxygen", "icon": "oxygen",
         "action": {"type": "sheet", "sheet": "oxygen"}},
        {"id": "limits", "label": "Alarm Limits", "icon": "alarm",
         "action": {"type": "sheet", "sheet": "alarm-limits"}},
        {"id": "horizon", "label": "Forecast Horizon", "icon": "forecast",
         "action": {"type": "sheet", "sheet": "forecast-horizon"}},
    ]},
    # Opened by the Settings button. Every design-studio section is one more touch.
    {"id": "settings", "title": "Settings", "items": [
        {"id": "appearance", "label": "Appearance", "icon": "palette",
         "action": {"type": "sheet", "sheet": "studio-appearance"}},
        {"id": "layout", "label": "Screens and Layout", "icon": "layout",
         "action": {"type": "sheet", "sheet": "studio-layout"}},
        {"id": "edit-layout", "label": "Edit Layout", "icon": "monitor",
         "action": {"type": "edit-layout"}},
        {"id": "navigation", "label": "Tabs and Menus", "icon": "layout",
         "action": {"type": "sheet", "sheet": "studio-navigation"}},
        {"id": "alarm-defaults", "label": "Alarm Defaults", "icon": "alarm",
         "action": {"type": "sheet", "sheet": "studio-alarms"}},
        {"id": "forecast", "label": "AI and Certainty", "icon": "forecast",
         "action": {"type": "sheet", "sheet": "studio-forecast"}},
        {"id": "explanations", "label": "Explanation Examples", "icon": "ai",
         "action": {"type": "sheet", "sheet": "explanation-examples"}},
        {"id": "assistant", "label": "Redesign With AI", "icon": "chat",
         "action": {"type": "sheet", "sheet": "assistant"}},
        {"id": "versions", "label": "Versions", "icon": "history",
         "action": {"type": "sheet", "sheet": "versions"}},
        {"id": "tokens", "label": "API Tokens", "icon": "settings",
         "action": {"type": "sheet", "sheet": "api-tokens"}},
        {"id": "demo", "label": "Demo Controls", "icon": "info",
         "action": {"type": "sheet", "sheet": "demo-controls"}},
        {"id": "about", "label": "About", "icon": "info",
         "action": {"type": "sheet", "sheet": "about"}},
    ]},
]

_TOP_BAR = {"fields": ["name", "nhs_number", "bed", "alarm_status", "clock"],
            "buttons": _TOP_BUTTONS}

_ALARM_DEFAULTS = {
    "hr": {"low": 50, "high": 120, "priority": "high"},
    "spo2": {"low": 90, "priority": "high"},
    "rr": {"low": 8, "high": 25},
    "bp_sys": {"low": 90, "high": 180, "priority": "high"},
    "temp": {"low": 35.0, "high": 38.5, "priority": "low"},
    "news2": {"high": 5},
}


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        out[k] = {**out.get(k, {}), **v} if isinstance(v, dict) else v
    return out


def _design(name: str, description: str, preset: str, home: str, news_variant: str,
            monitor: dict | None = None, row_overrides: dict | None = None) -> dict:
    rows = [_merge(r, (row_overrides or {}).get(r["id"], {})) for r in _ROWS]
    return {
        "schema_version": 1,
        "name": name,
        "description": description,
        "theme": copy.deepcopy(THEME_PRESETS[preset]),
        "alt_theme": copy.deepcopy(THEME_PRESETS[
            "news-paper" if THEME_PRESETS[preset]["mode"] == "dark" else "icu-dark"]),
        "top_bar": copy.deepcopy(_TOP_BAR),
        "tabs": copy.deepcopy(_TABS),
        "menus": copy.deepcopy(_MENUS),
        "screens": _screens(news_variant, monitor),
        "home_screen": home,
        "rows": rows,
        "alarm_defaults": copy.deepcopy(_ALARM_DEFAULTS),
    }


#: slug -> design document (dict). Slugs are stable ids used for seeding.
DEFAULT_DESIGNS: dict[str, dict] = {
    "icu-monitor": _design(
        "ICU Monitor", "Familiar bedside monitor: waveforms and numbers, tabs along the bottom.",
        "icu-dark", "monitor", "bands-dark"),
    "news2-chart": _design(
        "NEWS2 Chart", "The RCP NEWS2 chart as the home screen.",
        "news-paper", "news2", "bands-light"),
    "split-side": _design(
        "NEWS2 Beside Monitor", "NEWS2 chart on the left, continuous observations on the right.",
        "icu-dark", "split-h", "bands-dark"),
    "split-stacked": _design(
        "Monitor Above NEWS2", "Continuous observations above, NEWS2 trend below.",
        "icu-dark", "split-v", "trend-dark"),
    "icu-modules": _design(
        "Modular Example",
        "Modules of different sizes: a double-height ECG, large and tall modules, small squares and tiles.",
        "icu-dark", "monitor", "bands-dark",
        monitor=_grid("monitor-grid", _MODULAR_ITEMS, columns=6),
        row_overrides=_MODULAR_ROW_OVERRIDES),
}


def validated_defaults() -> dict[str, Design]:
    return {slug: Design.model_validate(doc) for slug, doc in DEFAULT_DESIGNS.items()}
