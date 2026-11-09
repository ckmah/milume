"""Imported automatically when this directory is on PYTHONPATH (see export-recipes.sh)."""

from __future__ import annotations

import os

_bytes = os.environ.get("MILUME_MARIMO_PREPARED_MANIFEST_BYTES")
if _bytes:
    try:
        import marimo_export.manifest as _manifest

        _manifest.MAX_PREPARED_MANIFEST_BYTES = int(_bytes, 10)
    except (ImportError, OSError, ValueError, TypeError):
        pass
