#!/usr/bin/env python3
"""Record the last published DATA block + hash after a successful Page write."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HASH_FILE = ROOT / "content_hash.txt"
DATA_BLOCK = ROOT / "data_block.txt"
LAST_HASH = ROOT / "last_hash.txt"
LAST_DATA = ROOT / "last_data.txt"


def main() -> int:
    if not HASH_FILE.is_file() or not DATA_BLOCK.is_file():
        print("missing content_hash.txt or data_block.txt; run render_page.py first", file=sys.stderr)
        return 1
    LAST_HASH.write_text(HASH_FILE.read_text(encoding="utf-8"), encoding="utf-8")
    LAST_DATA.write_text(DATA_BLOCK.read_text(encoding="utf-8").rstrip("\n") + "\n", encoding="utf-8")
    print(f"published hash={LAST_HASH.read_text().strip()[:12]} data_bytes={LAST_DATA.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
