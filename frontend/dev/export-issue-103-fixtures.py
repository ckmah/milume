#!/usr/bin/env python3
"""Export harness fixtures for issue #103 platform screenshots (real fixtures)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from milume import LandmarksWidget
from milume.fixture_export import FIXTURE_SYNC_KEYS, widget_fixture_snapshot  # noqa: E402
from tests.platform_fixtures import read_cosmx, read_xenium  # noqa: E402

DEV = Path(__file__).resolve().parent

FIXTURE_KEYS = list(FIXTURE_SYNC_KEYS)


def _export(widget: LandmarksWidget, dest: Path) -> None:
    payload = {k: getattr(widget, k) for k in FIXTURE_KEYS}
    dest.write_text(json.dumps(payload))
    print(f"wrote {dest} ({dest.stat().st_size // 1024} KiB)")


def main() -> None:
    xenium = read_xenium()
    _export(LandmarksWidget(xenium), DEV / "issue-103-xenium-fixture.json")

    cosmx = read_cosmx()
    _export(LandmarksWidget(cosmx, spatial_key="global"), DEV / "issue-103-cosmx-fixture.json")


if __name__ == "__main__":
    main()
