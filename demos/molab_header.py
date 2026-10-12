"""Shared molab onboarding copy for marimo notebooks in demos/."""

MOLAB_RUN_ON_SERVER_BODY = (
    "Switch from **Preview** to **Run on Server** so this notebook runs properly. "
    "The widget needs a live kernel to download data and render; Preview alone will "
    "not run this notebook."
)


def molab_run_on_server_callout(mo):
    """First-cell callout shown on every molab demo notebook."""
    return mo.callout(
        mo.md(MOLAB_RUN_ON_SERVER_BODY),
        kind="info",
        title="molab",
    )
