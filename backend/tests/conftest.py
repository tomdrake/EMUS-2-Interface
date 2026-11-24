"""Shared fixtures.

Acceptance tests for milestones that are not built yet are decorated with
``@todo("M2")`` etc. This marks them as a strict expected failure, so the report
lists them as "xfailed" (visibly not done) rather than as passes. If such a test
starts passing while still decorated, the run fails, which forces whoever
implements the feature to remove the decorator. Implementing a feature therefore
means: make its acceptance tests pass, then delete their ``@todo`` line.

Do not weaken, skip or delete an acceptance test to make a run pass. If a test is
wrong, say so in the hand-off notes and fix the test with a reason.
"""

from __future__ import annotations

import copy
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient


def todo(milestone: str):
    def wrap(fn):
        fn = pytest.mark.milestone(milestone)(fn)
        return pytest.mark.xfail(strict=True, reason=f"{milestone} not implemented yet")(fn)
    return wrap


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("EMUS_DB", str(tmp_path / "test.sqlite3"))
    for var in ("ANTHROPIC_API_KEY", "ELM_API_KEY", "ELM_BASE_URL"):
        monkeypatch.delenv(var, raising=False)
    from app.main import create_app
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def icu_design() -> dict:
    from app.defaults import DEFAULT_DESIGNS
    return copy.deepcopy(DEFAULT_DESIGNS["icu-monitor"])


@pytest.fixture()
def now() -> datetime:
    return datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc)
