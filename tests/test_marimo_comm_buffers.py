"""Marimo forwards anywidget comm buffers as DataView; see comm-buffer.ts."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

_FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
_COMM_BUFFER_TEST = _FRONTEND / "src/widgets/volume-cube/comm-buffer.test.mjs"


def test_comm_buffer_decodes_marimo_dataview() -> None:
    """Regression for marimo Inspect JSON parse failures (empty metadata reads)."""
    proc = subprocess.run(
        ["npx", "tsx", str(_COMM_BUFFER_TEST)],
        cwd=_FRONTEND,
        check=False,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
