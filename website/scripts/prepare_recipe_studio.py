#!/usr/bin/env python3
"""Copy marimo-studio export assets into Zensical content and write Jinja partials."""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEBSITE = ROOT / "website"
OVERRIDES = WEBSITE / "overrides" / "partials"

HEAD_MARKERS = (
    "<base href=",
    "data-marimo-studio-runtime",
    "__MARIMO_MOUNT_CONFIG__",
    'href="./_marimo-studio/',
    'src="./_marimo-studio/',
)


def extract_runtime_head(html: str) -> str:
    """Keep studio-injected runtime tags; drop authored page head (UnoCSS, title, etc.)."""
    chunks: list[str] = []
    for line in html.splitlines():
        if any(marker in line for marker in HEAD_MARKERS):
            chunks.append(line)
    if not chunks:
        raise SystemExit("prepare-recipe-studio: no marimo-studio runtime tags found in export")
    return "\n".join(chunks) + "\n"


def extract_body_fragment(html: str) -> str:
    """Extract marimo cells and runtime footer hosts from the exported view."""
    cells = re.findall(r"<marimo-cell[\s\S]*?</marimo-cell>", html)
    if not cells:
        raise SystemExit("prepare-recipe-studio: no <marimo-cell> hosts found in export")
    footer: list[str] = []
    for pattern in (
        r'<div id="marimo-runtime-root"[\s\S]*?</div>',
        r"<marimo-filename[\s\S]*?</marimo-filename>",
    ):
        match = re.search(pattern, html)
        if match:
            footer.append(match.group(0))
    section = (
        '<section class="milume-recipe-studio-grid" aria-label="Notebook results">\n'
        + "\n".join(cells)
        + "\n</section>\n"
        + "\n".join(footer)
        + "\n"
    )
    return section


def prepare(slug: str, export_dir: Path, *, content_root: Path) -> None:
    index = export_dir / "index.html"
    if not index.is_file():
        raise SystemExit(f"prepare-recipe-studio: missing {index}")

    marimo_src = export_dir / "_marimo-studio"
    if not marimo_src.is_dir():
        raise SystemExit(f"prepare-recipe-studio: missing {marimo_src}")

    html = index.read_text(encoding="utf-8")
    head = extract_runtime_head(html)
    body = extract_body_fragment(html)

    recipe_dir = content_root / slug
    recipe_dir.mkdir(parents=True, exist_ok=True)
    marimo_dest = recipe_dir / "_marimo-studio"
    if marimo_dest.exists():
        shutil.rmtree(marimo_dest)
    shutil.copytree(marimo_src, marimo_dest)

    OVERRIDES.mkdir(parents=True, exist_ok=True)
    (OVERRIDES / f"recipe-studio-{slug}-head.html").write_text(head, encoding="utf-8")
    (OVERRIDES / f"recipe-studio-{slug}-body.html").write_text(body, encoding="utf-8")

    total = sum(f.stat().st_size for f in recipe_dir.rglob("*") if f.is_file())
    print(f"prepare-recipe-studio: {slug} assets -> {recipe_dir} ({total:,} bytes on disk)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug")
    parser.add_argument("export_dir", type=Path)
    parser.add_argument(
        "--content-root",
        type=Path,
        default=WEBSITE / "content" / "recipes",
    )
    args = parser.parse_args(argv)
    prepare(args.slug, args.export_dir.resolve(), content_root=args.content_root.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
