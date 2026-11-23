"""NEWS2 scoring against the RCP chart, row by row."""

import pytest

from app import news2 as n


@pytest.mark.parametrize("rr,score", [
    (5, 3), (8, 3), (9, 1), (11, 1), (12, 0), (20, 0), (21, 2), (24, 2), (25, 3), (40, 3)])
def test_respiratory_rate(rr, score):
    assert n.score_rr(rr) == score


@pytest.mark.parametrize("spo2,score", [
    (85, 3), (91, 3), (92, 2), (93, 2), (94, 1), (95, 1), (96, 0), (100, 0)])
def test_spo2_scale_1(spo2, score):
    assert n.score_spo2(spo2, 1, on_oxygen=False) == score
    assert n.score_spo2(spo2, 1, on_oxygen=True) == score  # scale 1 ignores oxygen


@pytest.mark.parametrize("spo2,on_o2,score", [
    (80, False, 3), (83, True, 3), (84, True, 2), (85, False, 2), (86, True, 1), (87, False, 1),
    (88, True, 0), (92, True, 0), (88, False, 0), (92, False, 0),
    (93, False, 0), (97, False, 0), (100, False, 0),          # >=93 on air
    (93, True, 1), (94, True, 1), (95, True, 2), (96, True, 2), (97, True, 3), (100, True, 3)])
def test_spo2_scale_2(spo2, on_o2, score):
    assert n.score_spo2(spo2, 2, on_oxygen=on_o2) == score


def test_air_or_oxygen():
    assert n.score_oxygen(False) == 0
    assert n.score_oxygen(True) == 2


@pytest.mark.parametrize("sys,score", [
    (70, 3), (90, 3), (91, 2), (100, 2), (101, 1), (110, 1), (111, 0), (219, 0), (220, 3), (240, 3)])
def test_systolic(sys, score):
    assert n.score_systolic(sys) == score


@pytest.mark.parametrize("pulse,score", [
    (30, 3), (40, 3), (41, 1), (50, 1), (51, 0), (90, 0), (91, 1), (110, 1),
    (111, 2), (130, 2), (131, 3), (180, 3)])
def test_pulse(pulse, score):
    assert n.score_pulse(pulse) == score


@pytest.mark.parametrize("level,score", [("A", 0), ("C", 3), ("V", 3), ("P", 3), ("U", 3),
                                         ("a", 0), ("Alert", 0), ("confusion", 3)])
def test_consciousness(level, score):
    assert n.score_consciousness(level) == score


@pytest.mark.parametrize("bad", ["", "X", "?"])
def test_consciousness_rejects_unknown(bad):
    with pytest.raises(ValueError):
        n.score_consciousness(bad)


@pytest.mark.parametrize("temp,score", [
    (34.0, 3), (35.0, 3), (35.1, 1), (36.0, 1), (36.1, 0), (38.0, 0), (38.1, 1), (39.0, 1),
    (39.1, 2), (41.0, 2)])
def test_temperature(temp, score):
    assert n.score_temperature(temp) == score


# Columns read from the example NEWS2 chart supplied with the project brief.
@pytest.mark.parametrize("obs,total", [
    (dict(rr=12, spo2=95, on_oxygen=False, bp_sys=175, pulse=100, acvpu="A", temp=37.1), 2),
    (dict(rr=25, spo2=94, on_oxygen=False, bp_sys=158, pulse=97, acvpu="A", temp=36.5), 5),
    (dict(rr=18, spo2=95, on_oxygen=False, bp_sys=190, pulse=104, acvpu="A", temp=36.4), 2),
    (dict(rr=14, spo2=96, on_oxygen=True, bp_sys=160, pulse=99, acvpu="A", temp=37.0), 3),
    (dict(rr=11, spo2=97, on_oxygen=True, bp_sys=134, pulse=104, acvpu="C", temp=36.2), 7),
])
def test_example_chart_columns(obs, total):
    assert n.news2(**obs).total == total


def test_risk_bands_and_red_score():
    low = n.news2(rr=16, spo2=97, on_oxygen=False, bp_sys=120, pulse=70, acvpu="A", temp=36.8)
    assert (low.total, low.risk, low.red_score, low.monitoring_hours) == (0, "low", False, 12)

    low4 = n.news2(rr=22, spo2=95, on_oxygen=False, bp_sys=120, pulse=95, acvpu="A", temp=36.8)
    assert (low4.total, low4.risk, low4.monitoring_hours) == (4, "low", 4)

    red = n.news2(rr=26, spo2=97, on_oxygen=False, bp_sys=120, pulse=70, acvpu="A", temp=36.8)
    assert (red.total, red.risk, red.red_score, red.monitoring_hours) == (3, "low-medium", True, 1)

    medium = n.news2(rr=22, spo2=93, on_oxygen=False, bp_sys=120, pulse=95, acvpu="A", temp=36.8)
    assert (medium.total, medium.risk) == (5, "medium")

    high = n.news2(rr=26, spo2=91, on_oxygen=True, bp_sys=95, pulse=120, acvpu="A", temp=38.5)
    assert high.total == 3 + 3 + 2 + 2 + 2 + 0 + 1
    assert (high.risk, high.monitoring_hours) == ("high", 0)


def test_missing_inputs_are_reported_not_hidden():
    r = n.news2(rr=16, spo2=97, on_oxygen=False, bp_sys=None, pulse=70, acvpu=None, temp=36.8)
    assert not r.complete
    assert set(r.missing) == {"bp_sys", "acvpu"}
    assert r.total == 0


def test_scale_2_changes_the_total():
    obs = dict(rr=18, on_oxygen=True, bp_sys=130, pulse=80, acvpu="A", temp=36.8)
    assert n.news2(spo2=90, spo2_scale=1, **obs).total == 3 + 2
    assert n.news2(spo2=90, spo2_scale=2, **obs).total == 0 + 2
    assert n.news2(spo2=98, spo2_scale=2, **obs).total == 3 + 2  # over-oxygenated
