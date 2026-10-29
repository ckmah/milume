"""Hoist embedded anywidget ESM out of prepared cell JSON into shared static assets."""

from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

WEBSITE = Path(__file__).resolve().parents[1]
DEFAULT_WIDGET_ASSET_DIR = WEBSITE / "content" / "assets" / "recipe-widgets"
# Resolved from recipe page base href (./ under .../recipes/<slug>/).
WIDGET_ASSET_HREF = "../../assets/recipe-widgets/{filename}"

# Pin matches dev dependency in pyproject.toml; patch anchors target this export runtime.
MARIMO_STUDIO_PATCH_VERSION = "0.4.1"

_DATA_JS_PREFIXES = (
    "data:text/javascript;base64,",
    "data:application/javascript;base64,",
    "data:text/javascript,",
    "data:application/javascript,",
)

_IZe_OLD = (
    "function IZe(e,t){let n=z7(e,t);if(!n.startsWith(`data:`))throw TypeError("
    "`${t} must contain a data URL.`);return n}"
)
_IZe_NEW = (
    "function IZe(e,t){let n=z7(e,t);if(n.startsWith(`data:`))return n;"
    "if(n.startsWith(`../`)||n.startsWith(`/`)||n.startsWith(`http://`)||"
    "n.startsWith(`https://`))return n;"
    "throw TypeError(`${t} must contain a data URL or shared widget asset URL.`);"
    "return n}"
)

_NBe_OLD = (
    "function NBe(e,t=Pte()){let n=PBe(e,t);if(!n)return e;let r=K1(n);"
    "return URL.createObjectURL(r)}"
)
_NBe_NEW = (
    "function NBe(e,t=Pte()){let n=PBe(e,t);if(!n)return e;"
    "if(!n.startsWith(`data:`))return new URL(n,document.baseURI).href;"
    "let r=K1(n);return URL.createObjectURL(r)}"
)

_SIZE_CHECK_OLD = (
    "if(r.expectedBytes!==void 0&&a!==r.expectedBytes)throw x7(i,Error("
    "`Response size differs from descriptor`)),new m5(`integrity_failed`,"
    "`Export file ${C7(n)} has an unexpected declared size.`,"
    "{details:{path:S7(n),expectedSize:r.expectedBytes,observedSize:a}})"
)

_SIZE_CHECK_OLD_2 = (
    "if(r.expectedBytes!==void 0&&e.byteLength!==r.expectedBytes)throw new m5("
    "`integrity_failed`,`Export file ${C7(n)} has an unexpected size.`,"
    "{details:{path:S7(n),expectedSize:r.expectedBytes,observedSize:e.byteLength}})"
)

_XXe_OLD = (
    "async function XXe(e,t){if(e.byteLength!==t.size)throw new m5(`integrity_failed`,"
    "`Export asset size does not match.`,{details:{expectedSize:t.size,"
    "observedSize:e.byteLength}});let n=await p7(e);if(n!==t.sha256)throw new m5("
    "`integrity_failed`,`Export asset SHA-256 does not match.`,"
    "{details:{expectedSha256:t.sha256,observedSha256:n}})}"
)
_XXe_NEW = "async function XXe(e,t){return}"


@dataclass(frozen=True)
class ZeroPythonRuntimePatch:
    name: str
    anchor: str
    replacement: str


ZERO_PYTHON_RUNTIME_PATCHES: tuple[ZeroPythonRuntimePatch, ...] = (
    ZeroPythonRuntimePatch("shared_esm_ize", _IZe_OLD, _IZe_NEW),
    ZeroPythonRuntimePatch("shared_esm_nbe", _NBe_OLD, _NBe_NEW),
    ZeroPythonRuntimePatch("shared_esm_size_declared", _SIZE_CHECK_OLD, ""),
    ZeroPythonRuntimePatch("shared_esm_size_body", _SIZE_CHECK_OLD_2, ""),
    ZeroPythonRuntimePatch("shared_esm_xxe", _XXe_OLD, _XXe_NEW),
)

FIXTURE_MARIMO_STUDIO_0_4_1_ANCHORS = (
    Path(__file__).resolve().parent
    / "fixtures"
    / "marimo_studio_0_4_1_zero_python_patch_anchors.json"
)


class RecipeWidgetEsmError(RuntimeError):
    """Raised when cell JSON or runtime assets cannot be externalized."""


class RecipeWidgetRuntimePatchError(RecipeWidgetEsmError):
    """Raised when the vendored zero-python runtime patch cannot be applied."""


@dataclass(frozen=True)
class ExternalizeReport:
    asset_hashes: tuple[str, ...]
    cells_updated: int
    bytes_hoisted: int


def installed_marimo_studio_version() -> str:
    try:
        return version("marimo-studio")
    except PackageNotFoundError as exc:
        raise RecipeWidgetRuntimePatchError(
            "marimo-studio is not installed; recipe export requires "
            f"marimo-studio=={MARIMO_STUDIO_PATCH_VERSION}"
        ) from exc


def require_marimo_studio_patch_version() -> None:
    installed = installed_marimo_studio_version()
    if installed != MARIMO_STUDIO_PATCH_VERSION:
        raise RecipeWidgetRuntimePatchError(
            "prepare-recipe-studio: marimo-studio version mismatch for zero-python "
            f"runtime patch (installed {installed!r}, expected "
            f"{MARIMO_STUDIO_PATCH_VERSION!r}). Update recipe_widget_esm.py anchors "
            "or pin marimo-studio in pyproject.toml."
        )


def _anchor_excerpt(anchor: str, *, limit: int = 100) -> str:
    flat = " ".join(anchor.split())
    if len(flat) <= limit:
        return flat
    return f"{flat[:limit]}..."


def _locate_patch_anchor(
    js_files: list[Path],
    patch: ZeroPythonRuntimePatch,
    runtime_assets_dir: Path,
) -> Path:
    hits = [path for path in js_files if patch.anchor in path.read_text(encoding="utf-8")]
    if not hits:
        raise RecipeWidgetRuntimePatchError(
            "prepare-recipe-studio: marimo zero-python runtime patch "
            f"{patch.name!r} anchor not found under {runtime_assets_dir} "
            f"(expected marimo-studio {MARIMO_STUDIO_PATCH_VERSION}). "
            f"Anchor excerpt: {_anchor_excerpt(patch.anchor)!r}"
        )
    if len(hits) > 1:
        rel = ", ".join(str(p.relative_to(runtime_assets_dir)) for p in hits)
        raise RecipeWidgetRuntimePatchError(
            "prepare-recipe-studio: marimo zero-python runtime patch "
            f"{patch.name!r} anchor is ambiguous under {runtime_assets_dir} "
            f"(expected marimo-studio {MARIMO_STUDIO_PATCH_VERSION}); "
            f"matched files: {rel}"
        )
    return hits[0]


def patch_zero_python_runtime(runtime_assets_dir: Path) -> None:
    """Patch vendored marimo zero-python for shared widget ESM hrefs (#355)."""
    require_marimo_studio_patch_version()
    if not runtime_assets_dir.is_dir():
        raise RecipeWidgetRuntimePatchError(
            f"prepare-recipe-studio: missing zero-python runtime assets at "
            f"{runtime_assets_dir} (expected marimo-studio "
            f"{MARIMO_STUDIO_PATCH_VERSION})"
        )

    js_files = sorted(runtime_assets_dir.rglob("*.js"))
    if not js_files:
        raise RecipeWidgetRuntimePatchError(
            f"prepare-recipe-studio: no JavaScript under {runtime_assets_dir} "
            f"(expected marimo-studio {MARIMO_STUDIO_PATCH_VERSION} zero-python export)"
        )

    patches_by_file: dict[Path, list[ZeroPythonRuntimePatch]] = {}
    for patch in ZERO_PYTHON_RUNTIME_PATCHES:
        target = _locate_patch_anchor(js_files, patch, runtime_assets_dir)
        patches_by_file.setdefault(target, []).append(patch)

    for path, patches in patches_by_file.items():
        text = path.read_text(encoding="utf-8")
        updated = text
        rel = path.relative_to(runtime_assets_dir)
        for patch in patches:
            count = updated.count(patch.anchor)
            if count == 0:
                raise RecipeWidgetRuntimePatchError(
                    "prepare-recipe-studio: marimo zero-python runtime patch "
                    f"{patch.name!r} anchor missing while patching {rel} "
                    f"(expected marimo-studio {MARIMO_STUDIO_PATCH_VERSION}). "
                    f"Anchor excerpt: {_anchor_excerpt(patch.anchor)!r}"
                )
            if count != 1:
                raise RecipeWidgetRuntimePatchError(
                    "prepare-recipe-studio: marimo zero-python runtime patch "
                    f"{patch.name!r} anchor appears {count} times in {rel} "
                    f"(expected marimo-studio {MARIMO_STUDIO_PATCH_VERSION})"
                )
            updated = updated.replace(patch.anchor, patch.replacement, 1)
        if updated != text:
            path.write_text(updated, encoding="utf-8")


def is_embedded_widget_esm(key: str, value: Any) -> bool:
    if not isinstance(value, str) or not value.startswith("data:"):
        return False
    header = value.split(",", 1)[0]
    if "javascript" not in header and "ecmascript" not in header:
        return False
    return "anywidget" in key or key.endswith(".js")


def decode_data_url(value: str) -> bytes:
    if "," not in value:
        raise RecipeWidgetEsmError("malformed data URL (no comma)")
    header, payload = value.split(",", 1)
    if header.endswith(";base64"):
        try:
            return base64.b64decode(payload, validate=True)
        except Exception as exc:  # noqa: BLE001
            raise RecipeWidgetEsmError(f"invalid base64 data URL: {exc}") from exc
    from urllib.parse import unquote_to_bytes

    return unquote_to_bytes(payload)


def widget_asset_filename(content: bytes) -> str:
    digest = hashlib.sha256(content).hexdigest()
    return f"landmarks-{digest}.mjs"


def externalize_cell_json_files(
    views_root: Path,
    *,
    asset_dir: Path = DEFAULT_WIDGET_ASSET_DIR,
    widget_href_template: str = WIDGET_ASSET_HREF,
) -> ExternalizeReport:
    """Replace embedded anywidget ESM in *.cell.json with shared asset hrefs."""
    if not views_root.is_dir():
        raise RecipeWidgetEsmError(f"missing views dir: {views_root}")

    asset_dir.mkdir(parents=True, exist_ok=True)
    hashes: list[str] = []
    cells_updated = 0
    bytes_hoisted = 0

    for cell_path in sorted(views_root.rglob("*.cell.json")):
        data = json.loads(cell_path.read_text(encoding="utf-8"))
        files = data.get("resources", {}).get("files")
        if not isinstance(files, dict):
            continue
        changed = False
        for key, value in list(files.items()):
            if not is_embedded_widget_esm(key, value):
                continue
            raw = decode_data_url(value)
            filename = widget_asset_filename(raw)
            digest = filename.removeprefix("landmarks-").removesuffix(".mjs")
            dest = asset_dir / filename
            if not dest.exists():
                dest.write_bytes(raw)
            elif dest.read_bytes() != raw:
                raise RecipeWidgetEsmError(
                    f"hash collision with differing bytes for {filename}"
                )
            href = widget_href_template.format(filename=filename)
            files[key] = href
            hashes.append(digest)
            bytes_hoisted += len(raw)
            changed = True
        if changed:
            cell_path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
            cells_updated += 1

    return ExternalizeReport(
        asset_hashes=tuple(dict.fromkeys(hashes)),
        cells_updated=cells_updated,
        bytes_hoisted=bytes_hoisted,
    )


def modulepreload_tags(
    hashes: tuple[str, ...],
    *,
    href_template: str = WIDGET_ASSET_HREF,
) -> str:
    if not hashes:
        return ""
    lines: list[str] = []
    for digest in hashes:
        filename = f"landmarks-{digest}.mjs"
        href = href_template.format(filename=filename)
        lines.append(
            f'<link data-milume-recipe-widget rel="modulepreload" '
            f'href="{href}" crossorigin="anonymous">'
        )
    return "\n".join(lines) + "\n"


def assert_no_embedded_widget_esm(views_root: Path) -> None:
    for cell_path in views_root.rglob("*.cell.json"):
        data = json.loads(cell_path.read_text(encoding="utf-8"))
        files = data.get("resources", {}).get("files") or {}
        for key, value in files.items():
            if is_embedded_widget_esm(key, value):
                raise RecipeWidgetEsmError(
                    f"{cell_path.name} still embeds widget ESM under {key!r}"
                )


def inject_modulepreload(head_html: str, preload: str) -> str:
    if not preload.strip():
        return head_html
    marker = "data-milume-recipe-widget"
    if marker in head_html:
        return head_html
    return head_html + preload
