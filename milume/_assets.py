"""Resolve anywidget frontend assets (bundled React).

Authoring reload uses anywidget's file watcher, not the Vite dev server:

1. ``npm run watch`` (or ``npm run watch:landmarks``) rewrites the bundle on save
2. ``ANYWIDGET_HMR=1`` on the Python/marimo process watches that Path and swaps ESM

``_esm`` / ``_css`` must stay as ``pathlib.Path`` (never ``.read_text()``) so
anywidget can watch them. See https://anywidget.dev/en/getting-started/
"""

from __future__ import annotations

from pathlib import Path

_BUNDLED_DIR = Path(__file__).parent / "static" / "bundled"


def widget_esm(name: str) -> Path:
    """Return bundled React ESM path (anywidget-HMR-friendly)."""
    path = _BUNDLED_DIR / f"{name}.mjs"
    if not path.exists():
        msg = (
            f"Missing bundled widget {name!r} at {path}. "
            f"Run: cd frontend && npm install && npm run build"
        )
        raise FileNotFoundError(msg)
    return path


def widget_css() -> Path:
    """Return shared bundled CSS path (Tailwind + all React widget styles)."""
    path = _BUNDLED_DIR / "widgets.css"
    if not path.exists():
        msg = (
            f"Missing bundled widget CSS at {path}. "
            f"Run: cd frontend && npm install && npm run build"
        )
        raise FileNotFoundError(msg)
    return path
