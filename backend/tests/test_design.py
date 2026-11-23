"""Design schema: defaults validate, invariants hold, registry is the vocabulary."""

import copy

import pytest
from pydantic import ValidationError

from app import registry
from app.defaults import DEFAULT_DESIGNS, THEME_PRESETS, validated_defaults
from app.models.design import Design, Theme, json_schema, max_touch_depth


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
        return lambda d: d.__setitem__("tabs", [t for t in d["tabs"] if t["action"]["type"] != kind])
    assert "silence-alarms" in _broken(icu_design, drop("silence-alarms"))
    assert "open-settings" in _broken(icu_design, drop("open-settings"))
    assert "silence-alarms" in _broken(icu_design, lambda d: d["tabs"].__setitem__(0, {
        "id": "silence-2", "label": "Silence", "action": {"type": "silence-alarms"}}))


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
