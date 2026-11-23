#!/usr/bin/env python
"""Download and import the open-access MIMIC-IV demo (run via `make mimic`).

Thin CLI over ``app.mimic``. Data is written to data/mimic-iv-demo/ (git-ignored)
and imported into the monitor's SQLite database.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def main() -> int:
    from app import db, mimic

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dir", type=Path, default=ROOT / "data" / "mimic-iv-demo")
    ap.add_argument("--max-stays", type=int, default=10)
    ap.add_argument("--no-download", action="store_true")
    args = ap.parse_args()

    db.init_db()
    if not args.no_download:
        mimic.download(args.dir)
    report = mimic.import_demo(args.dir, max_stays=args.max_stays)
    print(json.dumps(report, indent=2))
    return 1 if report.get("missing_labels") else 0


if __name__ == "__main__":
    raise SystemExit(main())
