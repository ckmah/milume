#!/usr/bin/env python3
"""Cloudflare Web Analytics beacon (cookieless) for Pages assemble."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js"
LANDING_MARKER = "<!-- milume:cf-beacon -->"

WEBSITE_DIR = Path(__file__).resolve().parent.parent
PARTIAL_PATH = WEBSITE_DIR / "overrides" / "partials" / "cf-beacon.html"


def read_token() -> str | None:
    raw = os.environ.get("CF_BEACON_TOKEN", "")
    token = raw.strip()
    return token or None


def script_tag(token: str | None) -> str:
    if not token:
        return ""
    payload = json.dumps({"token": token}, separators=(",", ":"))
    return (
        f'<script defer src="{BEACON_SRC}" '
        f"data-cf-beacon='{payload}'></script>"
    )


def write_zensical_partial(path: Path | None = None) -> None:
    target = path or PARTIAL_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f"{script_tag(read_token())}\n", encoding="utf-8")


def inject_landing_html(html: str, token: str | None = None) -> str:
    tag = script_tag(token if token is not None else read_token())
    if LANDING_MARKER in html:
        return html.replace(LANDING_MARKER, tag, 1)
    if not tag:
        return html
    return re.sub(r"(</body>)", f"{tag}\n  </body>", html, count=1, flags=re.IGNORECASE)


def inject_landing_file(index_path: Path) -> None:
    text = index_path.read_text(encoding="utf-8")
    index_path.write_text(inject_landing_html(text), encoding="utf-8")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--zensical-partial",
        action="store_true",
        help="Write overrides/partials/cf-beacon.html from CF_BEACON_TOKEN",
    )
    parser.add_argument(
        "--landing",
        type=Path,
        metavar="INDEX_HTML",
        help="Inject beacon into landing index.html before </body>",
    )
    args = parser.parse_args()
    if args.zensical_partial:
        write_zensical_partial()
    if args.landing:
        inject_landing_file(args.landing)
    if not args.zensical_partial and not args.landing:
        parser.error("pass --zensical-partial and/or --landing")


if __name__ == "__main__":
    main()
