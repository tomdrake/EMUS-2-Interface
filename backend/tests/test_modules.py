"""Modules: sizes, the grid widget, per-module content, and the default layouts."""

import copy

import pytest
from pydantic import ValidationError

from app import registry
from app.defaults import DEFAULT_DESIGNS, validated_defaults
from app.models.design import Design, ModuleContent, Row, json_schema


def _broken(icu_design, mutate):
    doc = copy.deepcopy(icu_design)
    mutate(doc)
    with pytest.raises(ValidationError) as e:
        Design.model_validate(doc)
    return str(e.value)


def _grid(doc, screen=0):
    return doc["screens"][screen]["layout"]["widget"]


def test_next_obs_due_is_gone_from_every_default():
    for slug, doc in DEFAULT_DESIGNS.items():
        text = repr(doc).lower()
        assert "next obs" not in text and "obs-timer" not in text, slug
        assert not [r for r in doc["rows"] if r.get("kind") == "timer"], slug


def test_module_sizes_cover_single_double_and_small():
    sizes = registry.MODULE_SIZES
    assert set(sizes) == {"compact", "tile", "tall", "wide", "large", "row", "row-tall"}
    assert (sizes["compact"]["cols"], sizes["compact"]["rows"]) == (1, 1)          # small square
    assert sizes["row"]["rows"] == 1 and sizes["row-tall"]["rows"] == 2           # single and double height
    assert sizes["row"]["full"] and sizes["row-tall"]["full"] and not sizes["wide"]["full"]
    assert (sizes["tall"]["cols"], sizes["tall"]["rows"]) == (1, 2)
    assert (sizes["large"]["cols"], sizes["large"]["rows"]) == (2, 2)


def test_every_size_always_has_room_for_the_number_and_content_only_grows():
    for sid, spec in registry.MODULE_SIZES.items():
        assert "number" in spec["fits"], sid
        assert set(spec["fits"]) <= set(registry.MODULE_CONTENT), sid
        assert spec["flow"] in ("tile-only", "split", "stack", "row"), sid
    area = lambda s: (registry.MODULE_SIZES[s]["cols"] or 8) * registry.MODULE_SIZES[s]["rows"]
    # a bigger module never has less room than a smaller one of the same shape
    assert len(registry.MODULE_SIZES["row-tall"]["fits"]) >= len(registry.MODULE_SIZES["row"]["fits"])
    assert len(registry.MODULE_SIZES["large"]["fits"]) > len(registry.MODULE_SIZES["tall"]["fits"])
    assert area("compact") < area("tile") < area("large") < area("row-tall")


def test_the_sizes_reach_the_frontend():
    pub = registry.as_public_dict()
    assert pub["module_sizes"] == registry.MODULE_SIZES
    assert pub["module_content"] == list(registry.MODULE_CONTENT)
    assert set(json_schema()["$defs"]["GridItem"]["properties"]["size"]["enum"]) == set(registry.MODULE_SIZES)


def test_default_monitor_is_eight_full_width_rows_in_order():
    for slug in ("icu-monitor", "news2-chart"):
        doc = DEFAULT_DESIGNS[slug]
        grid = next(sc for sc in doc["screens"] if sc["id"] == "monitor")["layout"]["widget"]
        assert [(i["row_id"], i["size"]) for i in grid["items"]] == [
            (r, "row") for r in ("ecg", "spo2", "resp", "bp", "temp", "oxygen", "activity", "falls")]


def test_modular_example_shows_every_kind_of_size_and_all_its_rows():
    d = validated_defaults()["icu-modules"]
    monitor = next(s for s in d.screens if s.id == "monitor").layout.widget
    sizes = {i.row_id: i.size for i in monitor.items}
    assert sizes == {"ecg": "row-tall", "spo2": "large", "resp": "large", "bp": "tall", "temp": "tall",
                     "oxygen": "compact", "activity": "compact", "falls": "tile", "sleep": "tile"}
    assert {"compact", "tile", "tall", "large", "row-tall"} <= set(sizes.values())
    assert monitor.columns == 6
    visible = {r.id for r in d.rows if r.visible}
    assert set(sizes) <= visible


def test_modular_example_fills_its_grid_exactly():
    """30 cells in 6 columns and 5 rows, with no gaps: it should look finished."""
    d = validated_defaults()["icu-modules"]
    monitor = next(s for s in d.screens if s.id == "monitor").layout.widget
    cells = 0
    for item in monitor.items:
        spec = registry.MODULE_SIZES[item.size]
        cells += (monitor.columns if spec["full"] else spec["cols"]) * spec["rows"]
    assert cells == monitor.columns * 5


def test_a_module_needs_a_row_and_a_row_appears_once(icu_design):
    assert "unknown row" in _broken(icu_design, lambda d: _grid(d)["items"].append({"row_id": "ghost", "size": "row"}))
    assert "twice" in _broken(icu_design, lambda d: _grid(d)["items"].append({"row_id": "ecg", "size": "tile"}))


def test_sizes_must_exist_and_the_grid_must_have_sensible_columns(icu_design):
    _broken(icu_design, lambda d: _grid(d)["items"][0].__setitem__("size", "giant"))
    doc = copy.deepcopy(icu_design)
    _grid(doc)["columns"] = 4
    _grid(doc)["items"][0]["size"] = "wide"                      # 3 of 4 columns: fine
    Design.model_validate(doc)
    _broken(icu_design, lambda d: _grid(d).__setitem__("columns", 3))   # below the minimum
    _broken(icu_design, lambda d: _grid(d).__setitem__("columns", 13))
    # the widest fixed size always fits the narrowest grid, so no design can be left with one that does not
    assert max(s["cols"] for s in registry.MODULE_SIZES.values() if not s["full"]) <= 4


def test_any_size_can_be_set_on_any_module(icu_design):
    for size in registry.MODULE_SIZES:
        doc = copy.deepcopy(icu_design)
        _grid(doc)["items"][0]["size"] = size
        Design.model_validate(doc)


def test_module_content_defaults_and_is_per_module(icu_design):
    c = ModuleContent()
    assert (c.trace, c.ai, c.certainty, c.explain, c.forecast) == (True, True, True, False, False)
    doc = copy.deepcopy(icu_design)
    doc["rows"][0]["content"] = {"ai": False, "explain": True}
    d = Design.model_validate(doc)
    assert d.rows[0].content.ai is False and d.rows[0].content.explain is True
    assert d.rows[1].content.ai is True, "turning AI off on one module leaves the others"
    _broken(icu_design, lambda x: x["rows"][0].__setitem__("content", {"ai": "maybe"}))
    _broken(icu_design, lambda x: x["rows"][0].__setitem__("content", {"telepathy": True}))


def test_rows_no_longer_carry_a_fixed_height_or_the_old_flags():
    fields = set(Row.model_fields)
    assert not {"height", "show_ai", "show_forecast"} & fields
    assert "content" in fields


def test_the_old_rows_widget_is_gone(icu_design):
    def swap(d):
        w = _grid(d)
        w["type"] = "monitor-rows"
        w["row_ids"] = [i["row_id"] for i in w["items"]]
        del w["items"]
    _broken(icu_design, swap)
