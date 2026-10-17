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


def public_registry() -> dict[str, str]:
    """``_PUBLIC_TRAITS`` from milume/landmarks.py, read without importing milume."""
    tree = ast.parse(LANDMARKS_PATH.read_text(encoding="utf-8"))
    for node in tree.body:
        target = node.target if isinstance(node, ast.AnnAssign) else (
            node.targets[0] if isinstance(node, ast.Assign) and len(node.targets) == 1 else None
        )
        if isinstance(target, ast.Name) and target.id == "_PUBLIC_TRAITS":
            value = ast.literal_eval(node.value)
            if not isinstance(value, dict):
                raise TypeError("_PUBLIC_TRAITS must be a dict")
            return value
    raise RuntimeError("_PUBLIC_TRAITS not found in milume/landmarks.py")


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
                    meaning=meaning or "Synced widget state.",
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
    registry = public_registry()
    rows = [r for r in _parse_traitlets(LANDMARKS_PATH.read_text(encoding="utf-8")) if r.name in registry]
    order = list(registry)
    rows.sort(key=lambda r: order.index(r.name))
    public = [
        TraitletRow(r.name, r.type_label, r.default_label, registry[r.name], r.section, r.lineno)
        for r in rows
    ]
    parts = [
        "Public traitlets from the registry (`milume.landmarks._PUBLIC_TRAITS`). "
        "Other synced fields are internal plumbing and may change without notice.",
        "",
        _table(public),
    ]
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
    traits = {r.name for r in _parse_traitlets(LANDMARKS_PATH.read_text(encoding="utf-8"))}
    for name in [n for n in public_registry() if n not in traits]:
        member = widget.members.get(name)
        if member is None:
            raise RuntimeError(f"registry entry {name!r} is not a LandmarksWidget member")
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
