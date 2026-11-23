"""Design schema: defaults validate, invariants hold, registry is the vocabulary."""

import copy

import pytest
from pydantic import ValidationError

from app import registry
from app.defaults import DEFAULT_DESIGNS, THEME_PRESETS, validated_defaults
from app.models.design import (
    MIN_TEXT_CONTRAST, Design, Theme, contrast_ratio, json_schema, max_touch_depth,
)


def test_all_default_designs_validate():
    designs = validated_defaults()
    assert set(designs) == {"icu-monitor", "news2-chart", "split-side", "split-stacked"}


def test_home_screens_cover_the_required_layouts():
    d = validated_defaults()

    def kinds(design):
        screen = next(s for s in design.screens if s.id == design.home_screen)
        node = screen.layout
        if node.kind == "widget":
            return node.widget.type
        return (node.direction, *sorted(c.widget.type for c in node.children))

    assert kinds(d["icu-monitor"]) == "monitor-rows"
    assert kinds(d["news2-chart"]) == "news2-chart"
    assert kinds(d["split-side"]) == ("horizontal", "monitor-rows", "news2-chart")
    assert kinds(d["split-stacked"]) == ("vertical", "monitor-rows", "news2-chart")


def test_news2_variants_available():
    variants = json_schema()["$defs"]["News2ChartWidget"]["properties"]["variant"]["enum"]
    assert set(variants) == {"bands-light", "bands-dark", "trend-dark"}


@pytest.mark.parametrize("slug", list(DEFAULT_DESIGNS))
def test_everything_is_within_two_touches(slug):
    assert max_touch_depth(validated_defaults()[slug]) <= 2


@pytest.mark.parametrize("slug", list(DEFAULT_DESIGNS))
def test_every_row_type_from_the_brief_is_present(slug):
    rows = validated_defaults()[slug].rows
    params = {r.parameter for r in rows}
    assert {"hr", "spo2", "rr", "bp_sys", "temp", "o2_flow", "activity", "sleep", "falls"} <= params
    assert {r.kind for r in rows} >= {"parameter", "timer", "spacer"}


def test_theme_presets_validate_and_touch_targets_are_large_enough():
    for name, preset in THEME_PRESETS.items():
        theme = Theme.model_validate(preset)
        assert theme.touch_target_px >= 48, name
        assert set(theme.parameter_colours) == set(registry.PARAMETER_IDS), name


def _broken(icu_design, mutate):
    doc = copy.deepcopy(icu_design)
    mutate(doc)
    with pytest.raises(ValidationError) as e:
        Design.model_validate(doc)
    return str(e.value)


def test_patient_name_and_clock_cannot_be_removed(icu_design):
    assert "name" in _broken(icu_design, lambda d: d["top_bar"]["fields"].remove("name"))
    assert "clock" in _broken(icu_design, lambda d: d["top_bar"]["fields"].remove("clock"))


def test_silence_and_settings_buttons_cannot_be_removed_or_duplicated(icu_design):
    def drop(kind):
        def run(d):
            d["tabs"] = [t for t in d["tabs"] if t["action"]["type"] != kind]
            d["top_bar"]["buttons"] = [b for b in d["top_bar"]["buttons"]
                                       if b["action"]["type"] != kind]
        return run
    assert "silence-alarms" in _broken(icu_design, drop("silence-alarms"))
    assert "open-settings" in _broken(icu_design, drop("open-settings"))
    assert "silence-alarms" in _broken(icu_design, lambda d: d["tabs"].__setitem__(0, {
        "id": "silence-2", "label": "Silence", "action": {"type": "silence-alarms"}}))
    # A second settings button in the tab bar duplicates the one in the top bar.
    assert "open-settings" in _broken(icu_design, lambda d: d["tabs"].__setitem__(0, {
        "id": "settings-2", "label": "Settings", "action": {"type": "open-settings"}}))


def test_required_buttons_can_move_between_the_tab_bar_and_the_top_bar(icu_design):
    doc = copy.deepcopy(icu_design)
    settings = next(b for b in doc["top_bar"]["buttons"] if b["action"]["type"] == "open-settings")
    doc["top_bar"]["buttons"].remove(settings)
    doc["tabs"].append(settings)
    silence = next(t for t in doc["tabs"] if t["action"]["type"] == "silence-alarms")
    doc["tabs"].remove(silence)
    doc["top_bar"]["buttons"].append(silence)
    d = Design.model_validate(doc)
    assert max_touch_depth(d) <= 2


def test_default_top_bar_has_patient_theme_and_cog_buttons():
    for slug, d in validated_defaults().items():
        by_id = {b.id: b for b in d.top_bar.buttons}
        assert list(by_id) == ["new-patient", "discharge", "theme", "settings"], slug
        assert by_id["settings"].icon == "settings" and by_id["settings"].action.type == "open-settings"
        assert by_id["theme"].action.type == "toggle-theme"
        assert by_id["new-patient"].action.sheet == "new-patient"
        assert by_id["discharge"].action.sheet == "discharge-patient"
        assert not [t for t in d.tabs if t.action.type == "open-settings"], "settings left the tab bar"
        assert d.top_bar.height_px >= 48


def test_dark_and_light_themes_are_a_pair(icu_design):
    for slug, d in validated_defaults().items():
        assert {d.theme.mode, d.alt_theme.mode} == {"dark", "light"}, slug
    assert "one dark and one light" in _broken(
        icu_design, lambda d: d["alt_theme"].__setitem__("mode", "dark"))
    red = icu_design["alt_theme"]["colours"]["alarm_high"]
    assert "alt_theme" in _broken(
        icu_design, lambda d: d["alt_theme"]["colours"].__setitem__("technical", red))


def test_notification_box_can_move_but_not_be_removed(icu_design):
    positions = json_schema()["$defs"]["NotificationsDisplay"]["properties"]["position"]["enum"]
    assert set(positions) == {"tab-bar-left", "tab-bar-right", "top-bar", "strip-top",
                              "strip-above-tabs"}
    assert "none" not in positions and "hidden" not in positions
    for position in positions:
        doc = copy.deepcopy(icu_design)
        doc["notifications"] = {"position": position, "order": "recent-first"}
        Design.model_validate(doc)
    _broken(icu_design, lambda d: d.__setitem__("notifications", {"position": "none"}))
    _broken(icu_design, lambda d: d.__setitem__("notifications", {"empty_text": ""}))
    assert validated_defaults()["icu-monitor"].notifications.empty_text == "No Notifications"


def test_labels_methods_and_tiles(icu_design):
    d = validated_defaults()["icu-monitor"]
    assert d.labels.auto_capitalise and d.labels.show_method
    assert d.safety.device_status == "tiles", "battery and link sit with the value they measure"
    doc = copy.deepcopy(icu_design)
    doc["rows"][2]["method"] = "Pleth"          # Respiratory Rate - Pleth
    doc["rows"][0]["label"] = "Heart Rate"
    assert d.tiles.equal_row_heights, "tiles are identical by default"
    doc["tiles"] = {"width_px": 180, "equal_row_heights": False}
    Design.model_validate(doc)
    _broken(icu_design, lambda x: x.__setitem__("tiles", {"width_px": 40}))
    _broken(icu_design, lambda x: x["rows"][0].__setitem__("method", ""))


def test_registry_labels_are_title_case_with_a_method():
    small = {"and", "of", "the", "or", "to", "in", "on", "for", "with", "by", "at", "a", "an"}
    for p in registry.PARAMETERS.values():
        for word in p.label.replace("(", " ").replace(")", " ").split():
            assert word in small or word[0].isupper() or word[0].isdigit(), (p.id, p.label)
    assert registry.PARAMETERS["hr"].method == "ECG"
    assert registry.PARAMETERS["spo2"].method == "Pleth"
    assert all(p.method for p in registry.PARAMETERS.values() if p.kind != "utility")


def test_settings_menu_must_exist(icu_design):
    err = _broken(icu_design, lambda d: d.__setitem__(
        "menus", [m for m in d["menus"] if m["id"] != "settings"]))
    assert "settings" in err


def test_menus_cannot_nest(icu_design):
    _broken(icu_design, lambda d: d["menus"][0]["items"].append(
        {"id": "deeper", "label": "Deeper", "action": {"type": "menu", "menu_id": "patient"}}))


def test_unknown_parameter_is_rejected(icu_design):
    _broken(icu_design, lambda d: d["rows"][0].__setitem__("parameter", "glucose_cgm"))


def test_unknown_fields_are_rejected_everywhere(icu_design):
    _broken(icu_design, lambda d: d.__setitem__("patients", []))
    _broken(icu_design, lambda d: d["rows"][0].__setitem__("loinc", "1234-5"))
    _broken(icu_design, lambda d: d["theme"].__setitem__("css", "body{display:none}"))


def test_dangling_references_are_rejected(icu_design):
    _broken(icu_design, lambda d: d.__setitem__("home_screen", "nowhere"))
    _broken(icu_design, lambda d: d["tabs"][0]["action"].__setitem__("screen_id", "nowhere"))
    _broken(icu_design, lambda d: d["screens"][0]["layout"]["widget"]["row_ids"].append("ghost"))


def test_duplicate_ids_are_rejected(icu_design):
    _broken(icu_design, lambda d: d["rows"].append(copy.deepcopy(d["rows"][0])))
    _broken(icu_design, lambda d: d["screens"].append(copy.deepcopy(d["screens"][0])))


def test_waveform_must_match_parameter(icu_design):
    _broken(icu_design, lambda d: d["rows"][0].__setitem__("waveform", "resp"))


def test_alarm_defaults_respect_registry_bounds(icu_design):
    _broken(icu_design, lambda d: d["alarm_defaults"]["spo2"].__setitem__("low", 20))
    _broken(icu_design, lambda d: d["alarm_defaults"]["hr"].update(low=130, high=120))


def test_touch_target_cannot_go_below_48(icu_design):
    _broken(icu_design, lambda d: d["theme"].__setitem__("touch_target_px", 30))


def test_safety_states_can_be_restyled_but_not_hidden_or_confused(icu_design):
    from app.models.design import NotificationsDisplay, SafetyDisplay
    fields = set(SafetyDisplay.model_fields) | set(NotificationsDisplay.model_fields)
    assert not {f for f in fields if f.startswith(("hide", "enabled", "show_technical"))}, \
        "no switch may hide the notification box, the paused state or technical alarms"
    doc = copy.deepcopy(icu_design)
    doc["safety"] = {"standby_text": "NOT CONNECTED", "stale_values": "dim-with-age",
                     "device_status": "tiles-and-top-bar"}
    Design.model_validate(doc)
    # Standby wording is a fixed choice: it cannot be set to something value-like.
    _broken(icu_design, lambda d: d.__setitem__("safety", {"standby_text": "--"}))
    _broken(icu_design, lambda d: d.__setitem__("safety", {"standby_text": "98"}))
    _broken(icu_design, lambda d: d.__setitem__("safety", {"device_status": "none"}))


def test_state_colours_must_stay_distinct_and_visible(icu_design):
    red = icu_design["theme"]["colours"]["alarm_high"]
    err = _broken(icu_design, lambda d: d["theme"]["colours"].__setitem__("technical", red))
    assert "technical" in err
    bg = icu_design["theme"]["colours"]["background"]
    assert "silenced" in _broken(
        icu_design, lambda d: d["theme"]["colours"].__setitem__("silenced", bg))
    assert "inactive" in _broken(
        icu_design, lambda d: d["theme"]["colours"].__setitem__("inactive", bg))


def test_sweep_speed_is_one_of_the_standard_speeds(icu_design):
    _broken(icu_design, lambda d: d.__setitem__("sweep", {"speed_mm_s": 30}))
    doc = copy.deepcopy(icu_design)
    doc["sweep"] = {"speed_mm_s": 12.5, "mode": "scroll"}
    Design.model_validate(doc)


def test_forecast_options_cover_the_agreed_menu():
    defs = json_schema()["$defs"]
    f = defs["Forecast"]["properties"]
    assert set(f["news_number"]["enum"]) == {
        "none", "value-range", "band-probabilities", "time-to-threshold"}
    assert set(f["trend"]["enum"]) == {
        "none", "dashed", "dashed-fan", "fading-dashes", "ghost-columns"}
    assert set(f["events"]["items"]["enum"]) == {"cards", "timeline", "row-chips", "threshold-text"}
    assert "what_if" in f
    c = defs["CertaintyDisplay"]["properties"]
    assert set(c["metric"]["enum"]) == set(registry.CERTAINTY_METRIC_IDS)
    assert set(c["display"]["enum"]) == {
        "percent", "natural-frequency", "interval", "badge", "bars", "opacity", "dash-density"}


def test_certainty_metric_must_suit_what_it_describes(icu_design):
    doc = copy.deepcopy(icu_design)
    doc["forecast"] = {"certainty": {"metric": "token_logprob"}}  # LLM metric on a numeric forecast
    with pytest.raises(ValidationError):
        Design.model_validate(doc)
    doc["forecast"] = {"certainty": {"metric": "conformal_interval",
                                     "event_metric": "ppv_natural_frequency",
                                     "finding_metric": "token_logprob", "display": "badge"}}
    Design.model_validate(doc)


# ------------------------------------------------- row colour, tiles, ticker, traces

def test_contrast_ratio_matches_wcag():
    assert contrast_ratio("#000000", "#FFFFFF") == pytest.approx(21.0)
    assert contrast_ratio("#FFFFFF", "#FFFFFF") == pytest.approx(1.0)
    assert contrast_ratio("#777777", "#FFFFFF") == pytest.approx(4.48, abs=0.02)   # WCAG's own example


def test_every_row_colour_in_every_preset_is_readable_text():
    """Text takes the row colour, so a colour that cannot be read is a safety fault."""
    for name, preset in THEME_PRESETS.items():
        c = preset["colours"]
        for pid, colour in preset["parameter_colours"].items():
            for ground in (c["background"], c["surface"]):
                assert contrast_ratio(colour, ground) >= MIN_TEXT_CONTRAST, (name, pid, colour)


def test_unreadable_row_colours_are_rejected_in_both_themes(icu_design):
    near_bg = icu_design["theme"]["colours"]["background"]
    assert "parameter_colours.hr" in _broken(
        icu_design, lambda d: d["theme"]["parameter_colours"].__setitem__("hr", "#101010"))
    assert "alt_theme.parameter_colours.hr" in _broken(
        icu_design, lambda d: d["alt_theme"]["parameter_colours"].__setitem__("hr", "#F0F0F0"))
    assert "contrast" in _broken(icu_design, lambda d: d["rows"][0].__setitem__("colour", near_bg))
    doc = copy.deepcopy(icu_design)
    doc["rows"][0]["colour"] = "#FFFFFF"          # white is fine on the dark theme...
    with pytest.raises(ValidationError):           # ...but not on the light one
        Design.model_validate(doc)


def test_one_tile_per_row_is_wide_enough_for_two_values():
    d = validated_defaults()["icu-monitor"]
    assert d.tiles.width_px == 220 and d.tiles.equal_row_heights
    spo2 = next(r for r in d.rows if r.id == "spo2")
    assert list(spo2.numerics) == ["spo2", "pulse"], "SpO2 and PR share a row, so one tile"


def test_ticker_options():
    defs = json_schema()["$defs"]["NotificationsDisplay"]["properties"]
    assert set(defs["ticker"]["enum"]) == {"vertical", "horizontal"}
    assert set(defs["ticker_speed"]["enum"]) == {"slow", "medium", "fast"}
    d = validated_defaults()["icu-monitor"].notifications
    assert (d.ticker, d.ticker_dwell_s, d.position) == ("vertical", 4, "tab-bar-left")


def test_ticker_settings_are_bounded(icu_design):
    doc = copy.deepcopy(icu_design)
    doc["notifications"] = {"ticker": "horizontal", "ticker_speed": "slow", "ticker_dwell_s": 10}
    Design.model_validate(doc)
    _broken(icu_design, lambda d: d.__setitem__("notifications", {"ticker_dwell_s": 1}))
    _broken(icu_design, lambda d: d.__setitem__("notifications", {"ticker_dwell_s": 11}))
    _broken(icu_design, lambda d: d.__setitem__("notifications", {"ticker": "off"}))
    _broken(icu_design, lambda d: d.__setitem__("notifications", {"auto_open": True}))


def test_trace_reference_marks_are_on_by_default_and_gain_is_standard(icu_design):
    t = validated_defaults()["icu-monitor"].traces
    assert (t.show_baseline, t.show_scale, t.show_calibration_bar, t.show_time_scale) == (
        True, True, True, True)
    assert t.ecg_gain_mm_per_mv == 10
    doc = copy.deepcopy(icu_design)
    doc["traces"] = {"ecg_gain_mm_per_mv": 20, "show_baseline": False}
    Design.model_validate(doc)
    _broken(icu_design, lambda d: d.__setitem__("traces", {"ecg_gain_mm_per_mv": 15}))
