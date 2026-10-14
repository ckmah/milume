#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from cf_beacon import (
    BEACON_SRC,
    inject_landing_html,
    script_tag,
    write_zensical_partial,
)

ROOT = Path(__file__).resolve().parent.parent.parent
WEBSITE = ROOT / "website"
LANDING_INDEX = WEBSITE / "landing" / "index.html"
SYNC_API = WEBSITE / "scripts" / "sync-api-docs.py"


def _zensical_build() -> Path:
    subprocess.run(
        ["uv", "run", "--directory", str(ROOT), "python", str(SYNC_API)],
        check=True,
    )
    subprocess.run(["zensical", "build", "--clean"], cwd=WEBSITE, check=True)
    return WEBSITE / "dist"


def test_script_tag_empty() -> None:
    assert script_tag("") == ""
    assert script_tag(None) == ""


def test_script_tag_renders_once() -> None:
    tag = script_tag("dummy-token-abc")
    assert tag.count("<script") == 1
    assert BEACON_SRC in tag
    assert '"token":"dummy-token-abc"' in tag
    assert "data-cf-beacon='{\"token\":\"dummy-token-abc\"}'" in tag


def test_landing_inject_no_token() -> None:
    html = LANDING_INDEX.read_text(encoding="utf-8")
    out = inject_landing_html(html, token=None)
    assert "cloudflareinsights.com" not in out
    assert out.count(BEACON_SRC) == 0


def test_landing_inject_with_token() -> None:
    html = LANDING_INDEX.read_text(encoding="utf-8")
    out = inject_landing_html(html, token="dummy-token-abc")
    assert out.count(BEACON_SRC) == 1


@pytest.fixture
def restore_cf_partial() -> None:
    partial = WEBSITE / "overrides" / "partials" / "cf-beacon.html"
    before = partial.read_text(encoding="utf-8")
    yield
    partial.write_text(before, encoding="utf-8")


def test_zensical_build_beacon_absent_without_token(
    restore_cf_partial: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("CF_BEACON_TOKEN", raising=False)
    write_zensical_partial()
    if (WEBSITE / "dist").exists():
        shutil.rmtree(WEBSITE / "dist")
    dist = _zensical_build()
    landing_html = (dist / "index.html").read_text(encoding="utf-8")
    install_html = (dist / "install" / "index.html").read_text(encoding="utf-8")
    assert BEACON_SRC not in landing_html
    assert BEACON_SRC not in install_html


def test_zensical_build_beacon_once_with_token(
    restore_cf_partial: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = "dummy-cf-beacon-token"
    monkeypatch.setenv("CF_BEACON_TOKEN", token)
    write_zensical_partial()
    if (WEBSITE / "dist").exists():
        shutil.rmtree(WEBSITE / "dist")
    dist = _zensical_build()
    landing_html = (dist / "index.html").read_text(encoding="utf-8")
    install_html = (dist / "install" / "index.html").read_text(encoding="utf-8")
    assert landing_html.count(BEACON_SRC) == 1
    assert install_html.count(BEACON_SRC) == 1
    assert token in landing_html
    assert token in install_html
