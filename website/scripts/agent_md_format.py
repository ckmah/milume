#!/usr/bin/env python3
"""Convert numpy docstrings and Sphinx roles to agent-friendly markdown."""

from __future__ import annotations

import re

_SPHINX_ROLE = re.compile(r":\w+:`([^`]+)`")
_SECTION_RE = re.compile(r"^([A-Za-z][^\n]*)\n([-=]{3,})\s*$", re.MULTILINE)
_DOUBLE_BACKTICK = re.compile(r"``([^`]+)``")


def strip_sphinx_roles(text: str) -> str:
    def _repl(match: re.Match[str]) -> str:
        target = match.group(1).strip()
        if target.startswith("~"):
            target = target[1:]
        leaf = target.split(".")[-1]
        return f"`{leaf}`"

    return _SPHINX_ROLE.sub(_repl, text)


def _normalize_backticks(text: str) -> str:
    return _DOUBLE_BACKTICK.sub(r"`\1`", text)


def _fence_doctest_lines(text: str) -> str:
    lines = text.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.lstrip().startswith(">>>") or (
            line.startswith("    ") and i > 0 and lines[i - 1].lstrip().startswith(">>>")
        ):
            block: list[str] = []
            while i < len(lines):
                cur = lines[i]
                if cur.lstrip().startswith(">>>") or (
                    cur.startswith("    ")
                    and block
                    and (
                        block[-1].lstrip().startswith(">>>")
                        or block[-1].startswith("    ")
                    )
                ):
                    block.append(cur)
                    i += 1
                    continue
                if cur.strip() == "" and block:
                    i += 1
                    continue
                break
            body = []
            for b in block:
                if b.lstrip().startswith(">>> "):
                    body.append(b.lstrip()[4:])
                elif b.lstrip().startswith(">>>"):
                    body.append(b.lstrip()[3:].lstrip())
                elif b.startswith("    "):
                    body.append(b[4:])
                else:
                    body.append(b)
            out.append("```python")
            out.extend(body)
            out.append("```")
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


def _format_field_list_block(body: str) -> str:
    """Numpy-style name / indented description blocks (parameters or traitlets)."""
    lines = body.splitlines()
    items: list[str] = []
    i = 0
    preamble: list[str] = []
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith(" ") or line.startswith("\t"):
            i += 1
            continue
        if preamble and not items:
            pass
        name = line.strip()
        i += 1
        desc_parts: list[str] = []
        while i < len(lines) and (lines[i].startswith(" ") or lines[i].startswith("\t")):
            desc_parts.append(lines[i].strip())
            i += 1
        desc = " ".join(desc_parts)
        items.append(f"- **{name}** — {desc}" if desc else f"- **{name}**")
    intro = "\n".join(preamble).strip()
    block = "\n".join(items)
    if intro and block:
        return f"{intro}\n\n{block}"
    return block or intro


def _format_parameters_block(body: str) -> str:
    chunks = body.split("\n\n", 1)
    if len(chunks) == 2 and not chunks[1].lstrip().startswith("-"):
        intro, rest = chunks
        formatted = _format_field_list_block(rest)
        if formatted:
            return f"{intro.strip()}\n\n{formatted}"
    return _format_field_list_block(body)


def numpy_doc_to_markdown(text: str) -> str:
    text = strip_sphinx_roles(_normalize_backticks(text.strip()))
    if not text:
        return ""

    matches = list(_SECTION_RE.finditer(text))
    if not matches:
        return _fence_doctest_lines(text)

    parts: list[str] = []
    if matches[0].start() > 0:
        parts.append(text[: matches[0].start()].strip())
        parts.append("")

    for i, match in enumerate(matches):
        title = match.group(1).strip()
        body_start = match.end()
        body_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[body_start:body_end].strip()

        parts.append(f"#### {title}")
        parts.append("")
        if title.lower() in {"parameters", "notebook traitlets"}:
            parts.append(_format_parameters_block(body))
        elif title.lower() == "returns":
            parts.append(_format_parameters_block(body) or body)
        elif title.lower() == "examples":
            parts.append(_fence_doctest_lines(body))
        else:
            parts.append(body)
        parts.append("")

    return "\n".join(parts).strip()


def format_agent_docstring(text: str) -> str:
    text = strip_sphinx_roles(_normalize_backticks(text.strip()))
    if _SECTION_RE.search(text):
        return numpy_doc_to_markdown(text)
    return _fence_doctest_lines(text)


def format_agent_markdown(text: str) -> str:
    """Format a full markdown document for agent mirrors."""
    return format_agent_docstring(text)
