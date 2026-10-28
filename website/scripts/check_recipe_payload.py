#!/usr/bin/env python3
"""Fail the docs build when a recipe page exceeds the transfer budget."""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
MEASURE = FRONTEND / "scripts" / "measure-recipe-payload.mjs"

RECIPES = ("squidpy_color",)
MAX_BYTES = 10_000_000
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


def measure_recipe(slug: str) -> dict:
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


def main() -> int:
    if not SITE_ROOT.is_dir():
        raise SystemExit(f"check-recipe-payload: missing assembled site at {SITE_ROOT}")

    _wait_for_server("/docs/recipes/squidpy_color/index.html")

    failures: list[str] = []
    for slug in RECIPES:
        report = measure_recipe(slug)
        total = int(report["total_transfer_bytes"])
        print(
            f"check-recipe-payload: {slug} total={total:,} B buckets={report.get('by_bucket')}"
        )
        if total > MAX_BYTES:
            failures.append(f"{slug}: {total:,} B > {MAX_BYTES:,} B budget")

    if failures:
        print("check-recipe-payload failed:", file=sys.stderr)
        for line in failures:
            print(f"  - {line}", file=sys.stderr)
        return 1

    print("check-recipe-payload ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
