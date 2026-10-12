"""Shared molab onboarding copy for marimo notebooks in demos/.

First cell of every demo must be a native marimo *markdown* cell (bare ``mo.md(...)``
with ``mo`` injected from a later cell), not ``import marimo`` plus ``mo.md`` in the
same code cell. ``marimo export md`` emits that cell as raw markdown for Preview.
"""

MOLAB_RUN_ON_SERVER_BODY = (
    "Switch from **Preview** to **Run on Server** so this notebook runs properly. "
    "The widget needs a live kernel to download data and render; Preview alone will "
    "not run this notebook."
)

MOLAB_RUN_ON_SERVER_MARKDOWN = f"> **molab:** {MOLAB_RUN_ON_SERVER_BODY}"
