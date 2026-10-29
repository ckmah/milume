#!/usr/bin/env python3
"""Post-process marimo-studio exports for Zensical recipe pages."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEBSITE = ROOT / "website"
OVERRIDES = WEBSITE / "overrides" / "partials"
SHARED_RUNTIME = WEBSITE / "content" / "assets" / "marimo-studio-zero-python"

from recipe_widget_esm import (  # noqa: E402
    externalize_cell_json_files,
    inject_modulepreload,
    modulepreload_tags,
    patch_zero_python_runtime,
)

HEAD_MARKERS = (
    "<base href=",
    "data-marimo-studio-runtime",
    "__MARIMO_MOUNT_CONFIG__",
    "./_marimo-studio/assets/",
)

RUNTIME_PATH_FROM_RECIPE = "../../assets/marimo-studio-zero-python"


class RecipeStudioExportError(RuntimeError):
    """Raised when a studio export cannot be integrated into Zensical."""


def extract_runtime_head(html: str, *, runtime_href: str) -> str:
    chunks: list[str] = []
    for line in html.splitlines():
        if not any(marker in line for marker in HEAD_MARKERS):
            continue
        if "./_marimo-studio/assets/" in line:
            line = line.replace("./_marimo-studio/assets/", f"{runtime_href}/assets/")
        if "./_marimo-studio/assets" in line:
            line = line.replace("./_marimo-studio/assets", f"{runtime_href}/assets")
        chunks.append(line)
    if not any("data-marimo-studio-runtime" in c for c in chunks):
        raise RecipeStudioExportError(
            "prepare-recipe-studio: export HTML has no marimo-studio runtime tags "
            "(marimo-studio upgrade or export failure)"
        )
    return "\n".join(chunks) + "\n"


def extract_body_fragment(html: str) -> str:
    cells = re.findall(r"<marimo-cell[\s\S]*?</marimo-cell>", html)
    if not cells:
        raise RecipeStudioExportError(
            "prepare-recipe-studio: export HTML has no <marimo-cell> hosts "
            "(view source or marimo-studio upgrade)"
        )
    footer: list[str] = []
    for pattern in (
        r'<div id="marimo-runtime-root"[\s\S]*?</div>',
        r"<marimo-filename[\s\S]*?</marimo-filename>",
    ):
        match = re.search(pattern, html)
        if match:
            footer.append(match.group(0))

    rendered: list[str] = ['<div class="milume-recipe-studio-host">']
    for cell_html in cells:
        name_match = re.search(r'name="([^"]+)"', cell_html)
        name = name_match.group(1) if name_match else ""
        if name == "landmark_map":
            rendered.append('<div class="milume-recipe-studio-wide">')
            rendered.append(cell_html)
            rendered.append("</div>")
        else:
            rendered.append('<div class="milume-recipe-studio-prose">')
            rendered.append(cell_html)
            rendered.append("</div>")
    rendered.append("</div>")
    rendered.extend(footer)
    return "\n".join(rendered) + "\n"


def install_shared_runtime(export_dir: Path) -> None:
    src_assets = export_dir / "_marimo-studio" / "assets"
    if not src_assets.is_dir():
        raise RecipeStudioExportError(f"missing studio assets dir: {src_assets}")
    SHARED_RUNTIME.mkdir(parents=True, exist_ok=True)
    dest_assets = SHARED_RUNTIME / "assets"
    if dest_assets.exists():
        shutil.rmtree(dest_assets)
    shutil.copytree(src_assets, dest_assets)


def install_view_state(export_dir: Path, recipe_dir: Path) -> None:
    views_src = export_dir / "_marimo-studio" / "views"
    if not views_src.is_dir():
        raise RecipeStudioExportError(f"missing studio views dir: {views_src}")
    marimo_dest = recipe_dir / "_marimo-studio"
    if marimo_dest.exists():
        shutil.rmtree(marimo_dest)
    marimo_dest.mkdir(parents=True)
    shutil.copytree(views_src, marimo_dest / "views")


def prune_shared_runtime_chunks(loaded_urls: list[str]) -> tuple[int, int]:
    """Delete chunk files under shared runtime that were not loaded."""
    chunks_dir = SHARED_RUNTIME / "assets" / "zero-python" / "chunks"
    if not chunks_dir.is_dir():
        return 0, 0
    loaded_names = {
        Path(url.split("?")[0]).name
        for url in loaded_urls
        if "/zero-python/chunks/" in url or "chunks%2F" in url
    }
    kept = 0
    removed = 0
    for path in chunks_dir.glob("*.js"):
        if path.name in loaded_names:
            kept += 1
            continue
        path.unlink()
        removed += 1
    return kept, removed


def prepare(
    slug: str,
    export_dir: Path,
    *,
    content_root: Path,
    loaded_urls: list[str] | None = None,
) -> None:
    index = export_dir / "index.html"
    if not index.is_file():
        raise RecipeStudioExportError(f"prepare-recipe-studio: missing {index}")

    install_shared_runtime(export_dir)
    patch_zero_python_runtime(SHARED_RUNTIME / "assets")
    if loaded_urls:
        prune_shared_runtime_chunks(loaded_urls)

    recipe_dir = content_root / slug
    install_view_state(export_dir, recipe_dir)
    esm_report = externalize_cell_json_files(recipe_dir / "_marimo-studio" / "views")

    html = index.read_text(encoding="utf-8")
    head = extract_runtime_head(html, runtime_href=RUNTIME_PATH_FROM_RECIPE)
    head = inject_modulepreload(head, modulepreload_tags(esm_report.asset_hashes))
    body = extract_body_fragment(html)

    OVERRIDES.mkdir(parents=True, exist_ok=True)
    (OVERRIDES / f"recipe-studio-{slug}-head.html").write_text(head, encoding="utf-8")
    (OVERRIDES / f"recipe-studio-{slug}-body.html").write_text(body, encoding="utf-8")

    recipe_bytes = sum(f.stat().st_size for f in recipe_dir.rglob("*") if f.is_file())
    shared_bytes = sum(f.stat().st_size for f in SHARED_RUNTIME.rglob("*") if f.is_file())
    print(
        f"prepare-recipe-studio: {slug} view={recipe_bytes:,} B "
        f"shared_runtime={shared_bytes:,} B "
        f"hoisted_esm={esm_report.bytes_hoisted:,} B "
        f"widget_assets={len(esm_report.asset_hashes)}"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug", nargs="?")
    parser.add_argument("export_dir", type=Path, nargs="?")
    parser.add_argument(
        "--content-root",
        type=Path,
        default=WEBSITE / "content" / "recipes",
    )
    parser.add_argument(
        "--loaded-urls",
        type=Path,
        help="JSON list of network URLs from a headless page load (for chunk pruning)",
    )
    parser.add_argument(
        "--prune-shared-only",
        action="store_true",
        help="Only prune shared runtime chunks (after a preview load)",
    )
    args = parser.parse_args(argv)
    if args.prune_shared_only:
        if not args.loaded_urls:
            print("--prune-shared-only requires --loaded-urls", file=sys.stderr)
            return 1
        loaded = json.loads(args.loaded_urls.read_text(encoding="utf-8"))
        kept, removed = prune_shared_runtime_chunks(loaded)
        print(f"prepare-recipe-studio: pruned {removed} chunks, kept {kept}")
        return 0

    if not args.slug or not args.export_dir:
        parser.error("slug and export_dir are required unless --prune-shared-only")
    loaded: list[str] | None = None
    if args.loaded_urls:
        loaded = json.loads(args.loaded_urls.read_text(encoding="utf-8"))
    try:
        prepare(
            args.slug,
            args.export_dir.resolve(),
            content_root=args.content_root.resolve(),
            loaded_urls=loaded,
        )
    except RecipeStudioExportError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
