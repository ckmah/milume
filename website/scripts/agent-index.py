#!/usr/bin/env python3
"""Mirror markdown sources and write llms.txt indexes for GitHub Pages."""

from __future__ import annotations

from pathlib import Path

SITE_URL = "https://ckmah.github.io/milume"
DOCS = f"{SITE_URL}/docs"


def mirror_markdown(content_dir: Path, docs_out: Path) -> list[tuple[str, Path]]:
    """Copy content/*.md into site/docs with stable .md URLs."""
    mirrored: list[tuple[str, Path]] = []
    for src in sorted(content_dir.rglob("*.md")):
        rel = src.relative_to(content_dir)
        dest = docs_out / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        text = src.read_text(encoding="utf-8")
        dest.write_text(text, encoding="utf-8")
        url_path = "/".join(rel.with_suffix("").parts)
        mirrored.append((f"{DOCS}/{url_path}.md", dest))
    return mirrored


def write_llms(site_root: Path, landing_md: Path, mirrored: list[tuple[str, Path]]) -> None:
    landing_text = landing_md.read_text(encoding="utf-8").strip()
    lines = [
        "# milume",
        "> Interactive notebook widgets for spatial omics (LandmarksWidget, GalleryWidget).",
        "",
        "## Site",
        f"- [Landing]({SITE_URL}/)",
        f"- [Docs home]({DOCS}/)",
        f"- [llms-full.txt]({SITE_URL}/llms-full.txt)",
        "",
        "## Docs (markdown)",
    ]
    for url, _ in mirrored:
        title = url.rsplit("/", 1)[-1].removesuffix(".md").replace("-", " ").title()
        lines.append(f"- [{title}]({url})")

    lines.extend(["", "## Landing (markdown)", f"- [index.md]({SITE_URL}/index.md)", ""])
    site_root.joinpath("llms.txt").write_text("\n".join(lines), encoding="utf-8")

    full_parts = [landing_text, "", "---", ""]
    for url, path in mirrored:
        full_parts.append(f"# {url}")
        full_parts.append("")
        full_parts.append(path.read_text(encoding="utf-8").strip())
        full_parts.append("")
    site_root.joinpath("llms-full.txt").write_text("\n".join(full_parts).strip() + "\n", encoding="utf-8")


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    website = root / "website"
    site = root / "site"
    content = website / "content"
    docs_out = site / "docs"
    landing_md = website / "landing" / "index.md"

    mirrored = mirror_markdown(content, docs_out)
    site.joinpath("index.md").write_text(landing_md.read_text(encoding="utf-8"), encoding="utf-8")
    write_llms(site, landing_md, mirrored)


if __name__ == "__main__":
    main()
