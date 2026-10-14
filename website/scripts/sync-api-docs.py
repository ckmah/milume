#!/usr/bin/env python3
"""Write generated API markdown snippets before Zensical build."""

from __future__ import annotations

import sys
from pathlib import Path

from api_reference_codegen import write_snippets


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    write_snippets(root / "website" / "snippets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
