"""The chatbot/studio safety boundary: patches can only ever yield a valid Design."""

import copy

from app import patching


def test_valid_patch_is_applied_to_a_copy(icu_design):
    before = copy.deepcopy(icu_design)
    r = patching.apply_patch(icu_design, [
        {"op": "replace", "path": "/theme/colours/background", "value": "#101418"},
        {"op": "replace", "path": "/rows/0/height", "value": 2},
    ])
    assert r.ok, r.errors
    assert r.design["theme"]["colours"]["background"] == "#101418"
    assert r.touched == ["theme", "rows"]
    assert icu_design == before, "the current design must not be mutated"


def test_patch_cannot_introduce_data_structures(icu_design):
    for ops in (
        [{"op": "add", "path": "/parameters", "value": {"glucose": {"unit": "mmol/L"}}}],
        [{"op": "replace", "path": "/rows/0/parameter", "value": "glucose_cgm"}],
        [{"op": "add", "path": "/rows/0/loinc", "value": "8867-4"}],
        [{"op": "add", "path": "/theme/custom_css", "value": "*{display:none}"}],
        [{"op": "replace", "path": "/schema_version", "value": 2}],
    ):
        r = patching.apply_patch(icu_design, ops)
        assert not r.ok and r.errors and r.design is None, ops


def test_patch_cannot_remove_required_controls(icu_design):
    idx = next(i for i, t in enumerate(icu_design["tabs"])
               if t["action"]["type"] == "silence-alarms")
    r = patching.apply_patch(icu_design, [{"op": "remove", "path": f"/tabs/{idx}"}])
    assert not r.ok
    assert any("silence-alarms" in e for e in r.errors)


def test_malformed_patches_fail_cleanly(icu_design):
    for ops in (None, {}, [], "replace everything", [42], [{"op": "explode", "path": "/name"}],
                [{"op": "replace", "path": "name", "value": "x"}],
                [{"op": "replace", "path": "/rows/99/height", "value": 1}],
                [{"op": "remove", "path": "/does/not/exist"}],
                [{"op": "replace", "path": "/name", "value": "x"}] * (patching.MAX_OPS + 1)):
        r = patching.apply_patch(icu_design, ops)
        assert not r.ok and r.errors, ops


def test_errors_point_at_the_problem(icu_design):
    r = patching.apply_patch(icu_design, [
        {"op": "replace", "path": "/theme/colours/text", "value": "red"}])
    assert not r.ok
    assert any(e.startswith("/theme/colours/text") for e in r.errors)


def test_diff_round_trips(icu_design):
    after = copy.deepcopy(icu_design)
    after["theme"]["font_scale"] = 1.25
    after["rows"][1]["visible"] = False
    ops = patching.diff(icu_design, after)
    r = patching.apply_patch(icu_design, ops)
    assert r.ok and r.design["theme"]["font_scale"] == 1.25
    assert r.design["rows"][1]["visible"] is False


def test_validate_design_fills_defaults(icu_design):
    r = patching.validate_design(icu_design)
    assert r.ok
    assert r.design["forecast"]["certainty"]["metric"] == "prediction_interval"
