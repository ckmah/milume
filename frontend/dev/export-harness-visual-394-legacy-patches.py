#!/usr/bin/env python3
"""Deprecated: use export-harness-visual-394-patches.py (writes legacy + colorApi + shared)."""

from __future__ import annotations

import runpy
from pathlib import Path

if __name__ == "__main__":
    target = Path(__file__).with_name("export-harness-visual-394-patches.py")
    runpy.run_path(str(target), run_name="__main__")
