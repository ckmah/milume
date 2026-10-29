#!/usr/bin/env python3
"""Fail the docs build when a recipe page exceeds payload budgets."""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
MEASURE = FRONTEND / "scripts" / "measure-recipe-payload.mjs"

RECIPES = ("squidpy_color",)
MAX_DATA_BYTES = 10_000_000
MAX_TOTAL_BYTES = 16_000_000
SITE_ROOT = ROOT / "site"
BASE_URL = "http://127.0.0.1:8765"


def _wait_for_server(path: str, timeout_s: float = 30.0) -> None:
    url = f"{BASE_URL}{path}"
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.25)
    raise SystemExit(f"check-recipe-payload: server did not serve {url}")


def measure_recipe(slug: str) -> dict[str, Any]:
    page_path = f"/docs/recipes/{slug}/index.html"
    url = f"{BASE_URL}{page_path}"
    proc = subprocess.run(
        ["node", str(MEASURE), url],
        cwd=FRONTEND,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(proc.stdout)


def evaluate_report(report: dict[str, Any]) -> list[str]:
    """Return human-readable failure lines for one measure report."""
    failures: list[str] = []
    data = int(report["data_transfer_bytes"])
    total = int(report["total_transfer_bytes"])
    if data > MAX_DATA_BYTES:
        failures.append(
            f"data {data:,} B > {MAX_DATA_BYTES:,} B budget "
            f"({data / 1_048_576:.2f} MiB)"
        )
    if total > MAX_TOTAL_BYTES:
        failures.append(
            f"total {total:,} B > {MAX_TOTAL_BYTES:,} B budget "
            f"({total / 1_048_576:.2f} MiB)"
        )
    return failures


def format_breakdown(report: dict[str, Any]) -> str:
    by_cat = report.get("by_category") or {}
    lines = [
        f"  data (widget state + files, excl. runtime/JS): "
        f"{int(report['data_transfer_bytes']):,} B "
        f"({int(report['data_transfer_bytes']) / 1_048_576:.2f} MiB)",
        f"  total transfer: {int(report['total_transfer_bytes']):,} B "
        f"({int(report['total_transfer_bytes']) / 1_048_576:.2f} MiB)",
    ]
    for key in (
        "widget_js",
        "marimo_runtime",
        "widget_state_and_data",
        "zensical_site",
        "fonts",
        "other",
    ):
        if key not in by_cat:
            continue
        val = int(by_cat[key])
        lines.append(f"  {key}: {val:,} B ({val / 1_048_576:.2f} MiB)")
    return "\n".join(lines)


def main() -> int:
    if not SITE_ROOT.is_dir():
        raise SystemExit(f"check-recipe-payload: missing assembled site at {SITE_ROOT}")

    _wait_for_server("/docs/recipes/squidpy_color/index.html")

    failures: list[str] = []
    for slug in RECIPES:
        report = measure_recipe(slug)
        print(f"check-recipe-payload: {slug}")
        print(format_breakdown(report))
        for line in evaluate_report(report):
            failures.append(f"{slug}: {line}")

    if failures:
        print("check-recipe-payload failed:", file=sys.stderr)
        for line in failures:
            print(f"  - {line}", file=sys.stderr)
        return 1

    print("check-recipe-payload ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
