#!/usr/bin/env python3
"""Write static redirect stubs into an assembled GitHub Pages site tree."""
from __future__ import annotations

import argparse
import os
import tomllib
from pathlib import Path
from urllib.parse import urljoin

SITE_DOCS_URL = "https://ckmah.github.io/milume/docs/"
REDIRECTS_FILE = Path(__file__).resolve().parent.parent / "docs-redirects.toml"


def _redirect_page(*, target_href: str, canonical: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url={target_href}">
  <link rel="canonical" href="{canonical}">
  <title>Redirecting…</title>
  <script>location.replace({target_href!r});</script>
</head>
<body>
  <p>Redirecting to <a href="{target_href}">the updated page</a>.</p>
</body>
</html>
"""


def _relative_dir_href(from_file: Path, to_dir: Path) -> str:
    rel = os.path.relpath(to_dir.resolve(), from_file.parent.resolve())
    return Path(rel).as_posix().rstrip("/") + "/"


def load_redirect_map(path: Path = REDIRECTS_FILE) -> dict[str, str]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    raw = data.get("redirects", {})
    if not isinstance(raw, dict):
        raise SystemExit(f"{path}: [redirects] must be a table")
    return {str(k).strip("/"): str(v).strip("/").rstrip("/") + "/" for k, v in raw.items()}


def write_docs_redirects(site_root: Path, *, redirects_path: Path | None = None) -> list[tuple[str, str]]:
    docs_root = site_root / "docs"
    if not docs_root.is_dir():
        raise SystemExit(f"docs tree missing: {docs_root}")

    redirect_map = load_redirect_map(redirects_path or REDIRECTS_FILE)
    written: list[tuple[str, str]] = []

    for from_rel, to_rel in sorted(redirect_map.items()):
        to_dir = docs_root / to_rel.rstrip("/")
        target_index = to_dir / "index.html"
        if not target_index.is_file():
            raise SystemExit(
                f"redirect target missing ({target_index}); run export-recipes before redirects"
            )

        canonical = urljoin(SITE_DOCS_URL, to_rel)

        dir_index = docs_root / from_rel / "index.html"
        dir_index.parent.mkdir(parents=True, exist_ok=True)
        dir_target = _relative_dir_href(dir_index, to_dir)
        dir_index.write_text(
            _redirect_page(target_href=dir_target, canonical=canonical),
            encoding="utf-8",
        )

        flat_html = docs_root / f"{from_rel}.html"
        flat_target = _relative_dir_href(flat_html, to_dir)
        flat_html.write_text(
            _redirect_page(target_href=flat_target, canonical=canonical),
            encoding="utf-8",
        )

        written.append((from_rel, to_rel))

    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "site_root",
        type=Path,
        help="Assembled Pages root (contains docs/)",
    )
    parser.add_argument(
        "--redirects",
        type=Path,
        default=REDIRECTS_FILE,
        help="TOML redirect map (default: website/docs-redirects.toml)",
    )
    args = parser.parse_args()
    pairs = write_docs_redirects(args.site_root, redirects_path=args.redirects)
    for old, new in pairs:
        print(f"docs-redirects: {old} -> {new}")


if __name__ == "__main__":
    main()
