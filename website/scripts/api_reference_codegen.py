#!/usr/bin/env python3
"""Generate readable API markdown snippets from milume source (no import)."""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import griffe

from agent_md_format import format_agent_docstring, numpy_doc_to_markdown

ROOT = Path(__file__).resolve().parents[2]
LANDMARKS_PATH = ROOT / "milume" / "landmarks.py"
SPATIALDATA_PATH = ROOT / "milume" / "spatialdata_landmarks.py"

_SECTION_RE = re.compile(r"^\s*# --- (.+?) ---\s*$")
# One-line meanings for public traitlets (kept in sync with milume/landmarks.py).
_PUBLIC_MEANINGS: dict[str, str] = {
    "selections": "Region dicts; join to adata via `get_obs_names` / `assign_obs_mask`.",
    "landmarks": "Committed landmark annotations (round-trip with GeoDataFrame helpers).",
    "selected_kind": 'Active item kind (`""` when none).',
    "selected_index": "Index of active selection or landmark (`-1` when none).",
    "selected_type_indices": "Legend indices for multi type focus when kind is `type`.",
    "inspect_cx": "Inspect cube centre X (µm); `None` until placed.",
    "inspect_cy": "Inspect cube centre Y (µm); `None` until placed.",
    "inspect_size_um": "Inspect window side length (µm; 300 µm square).",
    "volume": "SpatialData Inspect cube config (Python-set).",
    "volume_cut": "µm cut box; browser writes on slider release.",
    "active_category": "Category column mirrored from colour chrome.",
    "active_genes": "View-only gene picks mirrored from chrome.",
}

# Sub-groups within the public notebook API (order matters).
_PUBLIC_SUBGROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "Selection & landmarks",
        (
            "selections",
            "landmarks",
            "selected_kind",
            "selected_index",
            "selected_type_indices",
        ),
    ),
    (
        "Inspect (SpatialData)",
        ("inspect_cx", "inspect_cy", "inspect_size_um", "volume", "volume_cut"),
    ),
    (
        "View & coloring",
        ("active_category", "active_genes"),
    ),
)

_ADVANCED_SECTIONS: tuple[tuple[str, str], ...] = (
    ("Raster & render mode", "Raster bins + similarity query"),
    ("Volume (SpatialData)", "3D cube"),
)

_NOTEBOOK_METHODS = (
    "set_points",
    "set_expression",
    "set_render_mode",
    "set_raster_basis",
    "clear_raster_query",
    "set_color",
    "category_colors",
    "clear_selections",
    "clear_landmarks",
    "clear",
    "select_type",
    "get_focus_obs_names",
    "get_obs_names",
    "assign_obs_mask",
)

_GDF_FUNCTIONS = (
    "landmarks_to_geodataframe",
    "geodataframe_to_landmarks",
)


@dataclass(frozen=True)
class TraitletRow:
    name: str
    type_label: str
    default_label: str
    meaning: str
    section: str
    lineno: int


def _landmarks_api_doc() -> str:
    tree = ast.parse(LANDMARKS_PATH.read_text(encoding="utf-8"))
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "_LANDMARKS_API_DOC":
                value = ast.literal_eval(node.value)
                if not isinstance(value, str):
                    raise TypeError("_LANDMARKS_API_DOC must be a string")
                return value.strip()
    raise RuntimeError("_LANDMARKS_API_DOC not found")


def _section_by_line(source: str) -> dict[int, str]:
    sections: dict[int, str] = {}
    current = "Module"
    for lineno, line in enumerate(source.splitlines(), start=1):
        match = _SECTION_RE.match(line)
        if match:
            current = match.group(1).strip()
        sections[lineno] = current
    return sections


def _line_comment(source: str, lineno: int, end_lineno: int | None) -> str:
    """End-of-line comments on the assignment (skip section banners)."""
    lines = source.splitlines()
    last = end_lineno or lineno
    parts: list[str] = []
    for ln in range(lineno, min(last, len(lines)) + 1):
        line = lines[ln - 1]
        if "#" not in line or line.strip().startswith("#"):
            continue
        text = line.split("#", 1)[1].strip()
        if text.startswith("---") or text.endswith("---"):
            continue
        parts.append(text)
    return " ".join(parts)


def _traitlet_type_label(call: ast.Call) -> str:
    name = ""
    if isinstance(call.func, ast.Attribute):
        name = call.func.attr
    inner = ""
    if call.args:
        arg0 = call.args[0]
        if isinstance(arg0, ast.Call) and isinstance(arg0.func, ast.Attribute):
            inner = arg0.func.attr
    if name == "List" and inner:
        return f"List[{inner}]"
    if name == "Tuple" and call.args:
        return "Tuple[float, float]" if len(call.args) >= 2 else "Tuple"
    if name == "Enum" and call.args and isinstance(call.args[0], ast.List):
        elts = []
        for elt in call.args[0].elts:
            if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                elts.append(elt.value)
        if elts:
            return f"Enum({', '.join(elts)})"
    if name == "Unicode":
        return "str"
    if name == "Int":
        return "int"
    if name == "Float":
        return "float"
    if name == "Bool":
        return "bool"
    if name == "Dict":
        return "dict"
    return name or "traitlet"


def _unwrap_traitlet_call(node: ast.Call) -> ast.Call:
    """Return the inner traitlets.*(...) call when wrapped in .tag(...)."""
    if isinstance(node.func, ast.Attribute) and node.func.attr == "tag":
        if isinstance(node.func.value, ast.Call):
            return _unwrap_traitlet_call(node.func.value)
    return node


def _default_label(node: ast.Call) -> str:
    inner = _unwrap_traitlet_call(node)
    for kw in inner.keywords:
        if kw.arg == "default_value":
            return _format_ast_default(kw.value)
    type_name = ""
    if isinstance(inner.func, ast.Attribute):
        type_name = inner.func.attr
    if type_name in {"Int", "Float", "Bool"} and len(inner.args) == 1:
        return _format_ast_default(inner.args[0])
    if type_name == "Unicode" and len(inner.args) == 1:
        return _format_ast_default(inner.args[0])
    if type_name == "Unicode" and not inner.args and not inner.keywords:
        return '`""`'
    return "—"


def _format_ast_default(node: ast.AST) -> str:
    if isinstance(node, ast.Constant):
        if node.value is None:
            return "`None`"
        if isinstance(node.value, str):
            return f'`"{node.value}"`' if node.value else '`""`'
        if isinstance(node.value, bool):
            return "`True`" if node.value else "`False`"
        if isinstance(node.value, (int, float)):
            return f"`{node.value}`"
        if isinstance(node.value, (list, tuple)):
            if not node.value:
                return "`[]`" if isinstance(node.value, list) else "`()`"
            return f"`{node.value!r}`"
    if isinstance(node, ast.List):
        if not node.elts:
            return "`[]`"
    if isinstance(node, ast.Tuple):
        if not node.elts:
            return "`()`"
        parts = [_format_ast_default(e) for e in node.elts]
        return ", ".join(parts)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        if isinstance(node.operand, ast.Constant) and isinstance(node.operand.value, (int, float)):
            return f"`{-node.operand.value}`"
    return "—"


def _parse_traitlets(source: str) -> list[TraitletRow]:
    tree = ast.parse(source)
    sections = _section_by_line(source)
    rows: list[TraitletRow] = []
    for node in tree.body:
        if not isinstance(node, ast.ClassDef) or node.name != "LandmarksWidget":
            continue
        for stmt in node.body:
            if not isinstance(stmt, ast.Assign) or len(stmt.targets) != 1:
                continue
            target = stmt.targets[0]
            if not isinstance(target, ast.Name):
                continue
            if not isinstance(stmt.value, ast.Call):
                continue
            trait_call = _unwrap_traitlet_call(stmt.value)
            func = trait_call.func
            if not (isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name)):
                continue
            if func.value.id != "traitlets":
                continue
            name = target.id
            meaning = _line_comment(source, stmt.lineno, stmt.end_lineno)
            rows.append(
                TraitletRow(
                    name=name,
                    type_label=_traitlet_type_label(trait_call),
                    default_label=_default_label(stmt.value),
                    meaning=meaning
                    or _PUBLIC_MEANINGS.get(name)
                    or "Synced widget state.",
                    section=sections.get(stmt.lineno, "Other"),
                    lineno=stmt.lineno,
                )
            )
    rows.sort(key=lambda r: r.lineno)
    return rows


def _short_api_heading(name: str) -> str:
    """TOC-friendly heading; full signature lives in the body below."""
    return f"### `{name}()`"


def _signature_fence(signature: str, *, is_method: bool) -> list[str]:
    sig = signature.strip()
    if is_method and not sig.startswith("def "):
        sig = f"def {sig}"
    elif not is_method and not sig.startswith("def "):
        sig = f"def {sig}"
    return ["", "```python", sig, "```", ""]


def _table(rows: list[TraitletRow]) -> str:
    if not rows:
        return ""
    lines = [
        '<div class="milume-api-traitlet-table" markdown="1">',
        "",
        "| Name | Type | Default | Meaning |",
        "| --- | --- | --- | --- |",
    ]
    for row in rows:
        meaning = row.meaning.replace("|", "\\|")
        lines.append(
            f"| `{row.name}` | {row.type_label} | {row.default_label} | {meaning} |"
        )
    lines.extend(["", "</div>", ""])
    return "\n".join(lines)


def render_constructor_params_markdown() -> str:
    doc = _landmarks_api_doc()
    # Drop the notebook traitlets section; tables replace it.
    trimmed = re.sub(
        r"\nNotebook traitlets\n[-]+\n.*?(?=\nNotes\n[-]+\n)",
        "\n",
        doc,
        count=1,
        flags=re.DOTALL,
    )
    return numpy_doc_to_markdown(trimmed)


def render_traitlets_markdown() -> str:
    source = LANDMARKS_PATH.read_text(encoding="utf-8")
    rows = _parse_traitlets(source)
    by_name = {r.name: r for r in rows}

    parts: list[str] = [
        "These traitlets sync between Python and the browser. "
        "UI-only chrome (modes, sliders, undoredo) is not listed.",
        "",
    ]

    for title, names in _PUBLIC_SUBGROUPS:
        group_rows = [by_name[n] for n in names if n in by_name]
        if not group_rows:
            continue
        parts.extend([f"### {title}", "", _table(group_rows), ""])

    parts.extend(
        [
            "### Advanced synced fields",
            "",
            "Usually driven from notebook methods (`set_render_mode`, `set_raster_basis`, …) "
            "or browser chrome; documented for debugging and extensions.",
            "",
        ]
    )

    for title, section_key in _ADVANCED_SECTIONS:
        group_rows = [r for r in rows if section_key in r.section]
        if not group_rows:
            continue
        parts.extend([f"#### {title}", "", _table(group_rows), ""])

    return "\n".join(parts).strip() + "\n"


def _function_docstring(path: Path, name: str) -> str:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return ast.get_docstring(node) or ""
    raise RuntimeError(f"{name} not found in {path}")


def render_geodataframe_markdown() -> str:
    module = griffe.load("milume", search_paths=[str(ROOT)])
    parts = [
        "Convert `w.landmarks` to a durable GeoPandas table (and back). "
        "Control vertices live in a JSON `vertices` column; `geometry` is a GIS proxy. "
        "The widget does not own SpatialData — assign `sdata['landmarks'] = gdf` in the notebook if needed.",
        "",
        "Requires optional `geopandas` and `shapely`.",
        "",
    ]
    for name in _GDF_FUNCTIONS:
        fn = module.functions[name]
        try:
            sig = fn.signature()
        except (AttributeError, TypeError):
            sig = f"{name}(...)"
        doc = _function_docstring(SPATIALDATA_PATH, name)
        parts.extend(
            [
                _short_api_heading(name),
                *_signature_fence(sig, is_method=False),
                format_agent_docstring(doc.strip()),
                "",
            ]
        )
    return "\n".join(parts).strip() + "\n"


def render_methods_markdown() -> str:
    module = griffe.load("milume.landmarks", search_paths=[str(ROOT)])
    widget = module.classes["LandmarksWidget"]
    parts: list[str] = [
        "Notebook helpers on the widget handle returned by `milume.peek`.",
        "",
    ]
    for name in _NOTEBOOK_METHODS:
        member = widget.members.get(name)
        if member is None:
            continue
        doc = member.docstring.value if member.docstring else ""
        try:
            signature = member.signature()
        except (AttributeError, TypeError):
            signature = f"{name}(...)"
        parts.extend(
            [
                _short_api_heading(name),
                *_signature_fence(signature, is_method=True),
                format_agent_docstring(doc.strip()) if doc.strip() else "",
                "",
            ]
        )
    return "\n".join(parts).strip() + "\n"


def write_snippets(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    mapping = {
        "api-params.md": render_constructor_params_markdown,
        "api-traitlets.md": render_traitlets_markdown,
        "api-geodataframe.md": render_geodataframe_markdown,
        "api-methods.md": render_methods_markdown,
    }
    for filename, fn in mapping.items():
        path = out_dir / filename
        path.write_text(fn() + "\n", encoding="utf-8")
        print(f"api_reference_codegen: wrote {path.relative_to(ROOT)}")
