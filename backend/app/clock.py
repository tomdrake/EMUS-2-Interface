"""The one place the application reads the wall clock.

Everything time-dependent (alarm silence expiry, scenario playback, 'x ago' text,
forecasts) must call ``clock.now()`` so tests can move time by monkeypatching it.
"""

from __future__ import annotations

from datetime import datetime, timezone


def now() -> datetime:
    return datetime.now(timezone.utc)
