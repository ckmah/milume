#!/usr/bin/env python3
"""Build dashboard.html + summary.txt from snapshot.json.

Hash ignores as_of so NOCHANGE when metrics/nightly/issues/etc are unchanged.
page_out.tsx is written only when page_template.tsx is present (box/Cursor Page).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
SNAP = ROOT / "snapshot.json"
TEMPLATE = ROOT / "page_template.tsx"
PAGE_OUT = ROOT / "page_out.tsx"
HTML_OUT = ROOT / "dashboard.html"
SUMMARY = ROOT / "summary.txt"
HASH_FILE = ROOT / "content_hash.txt"
LAST_HASH = ROOT / "last_hash.txt"
LAST_DATA = ROOT / "last_data.txt"
DATA_BLOCK = ROOT / "data_block.txt"
EDIT_PAYLOAD = ROOT / "edit_payload.json"
PUBLISH_META = ROOT / "publish_meta.json"
TZ = ZoneInfo("America/Los_Angeles")

DATA_RE = re.compile(
    r"/\* @@DATA_START@@ \*/\nconst DATA = .*?;\n/\* @@DATA_END@@ \*/",
    re.DOTALL,
)


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(1)


def round1(x: float | int | None) -> float | None:
    if x is None:
        return None
    return round(float(x), 1)


def st_overall(run: dict) -> str:
    conc = run.get("conclusion") or ""
    if conc == "failure":
        return "fail"
    if run.get("first_attempt_failed") or int(run.get("attempts") or 1) > 1:
        return "rerun"
    if conc == "success":
        return "pass"
    return "fail"


def st_cat(cat: dict | None) -> dict | None:
    if not cat:
        return None
    minutes = round1(cat.get("minutes"))
    if minutes is None:
        return None
    if cat.get("rerun_fixed"):
        s = "rerun"
    elif (cat.get("status") or "") == "failure":
        s = "fail"
    elif (cat.get("status") or "") == "success":
        s = "pass"
    else:
        s = "fail"
    return {"s": s, "m": minutes}


def short_branch(branch: str) -> str:
    b = branch or ""
    if b.startswith("agent/"):
        b = b[len("agent/") :]
    return b


def fmt_updated(iso: str, now: datetime) -> str:
    dt = parse_iso(iso)
    if not dt:
        return ""
    local = dt.astimezone(TZ)
    if local.date() == now.date():
        return local.strftime("%-I:%M %p").replace(" 0", " ")
    # same year: Mon D
    return local.strftime("%b %-d")


def fmt_merged(iso: str) -> str:
    dt = parse_iso(iso)
    if not dt:
        return ""
    local = dt.astimezone(TZ)
    return local.strftime("%b %-d, %-I:%M %p").replace(" 0", " ")


def parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def priority_of(labels: list[str]) -> str | None:
    for lab in labels:
        low = lab.lower()
        if low.startswith("priority:"):
            p = low.split(":", 1)[1].strip()
            if p in ("high", "medium", "low"):
                return p
    return None


def display_labels(labels: list[str]) -> list[str]:
    out = []
    for lab in labels:
        if lab.lower().startswith("priority:"):
            continue
        out.append(lab)
    return out


def groups_blurb(night: dict) -> str:
    """Match prior dashboard copy: four named groups; missing volume counts as ok."""
    cats = night.get("categories") or {}
    keys = ["core", "landmarks", "volume", "marimo"]
    fails = [k for k in keys if k in cats and (cats[k] or {}).get("status") == "failure"]
    reruns = [k for k in keys if k in cats and (cats[k] or {}).get("rerun_fixed")]
    if fails:
        return f"{len(fails)} group(s) failed"
    if night.get("first_attempt_failed") or reruns:
        return "passed after rerun"
    if (night.get("conclusion") or "") == "success":
        return "all 4 groups passed"
    return "n/a"


def lead_text(needs: int, nightly_ok: bool) -> str:
    if needs == 0 and nightly_ok:
        return "Nothing is waiting on you, and last night's e2e run passed."
    if needs == 0 and not nightly_ok:
        return "Nothing is waiting on you, but last night's e2e run failed."
    if needs == 1 and nightly_ok:
        return "One item is waiting on you, and last night's e2e run passed."
    if needs == 1 and not nightly_ok:
        return "One item is waiting on you, and last night's e2e run failed."
    if nightly_ok:
        return f"{needs} items are waiting on you, and last night's e2e run passed."
    return f"{needs} items are waiting on you, and last night's e2e run failed."


def build_data(snap: dict) -> dict:
    now = datetime.now(TZ)
    metrics = snap.get("metrics") or {}
    nightly = snap.get("nightly") or {}
    runs = nightly.get("runs") or []
    trends = snap.get("trends") or {}
    merges_by_day = {p["date"]: int(p.get("count") or 0) for p in trends.get("merges_by_day") or []}

    nights = []
    for r in runs:
        cats = r.get("categories") or {}
        nights.append(
            {
                "d": r["date"],
                "id": int(r["run_id"]),
                "o": st_overall(r),
                "w": round1(r.get("wall_minutes")),
                "c": st_cat(cats.get("core")),
                "l": st_cat(cats.get("landmarks")),
                "v": st_cat(cats.get("volume")),
                "m": st_cat(cats.get("marimo")),
                "s": st_cat(cats.get("setup")),
            }
        )

    merges = [merges_by_day.get(n["d"], 0) for n in nights]

    issues = []
    for iss in snap.get("open_issues_watch") or []:
        labels = list(iss.get("labels") or [])
        item = {
            "n": int(iss["number"]),
            "t": iss.get("title") or "",
            "l": display_labels(labels),
            "u": fmt_updated(iss.get("updated") or "", now),
        }
        p = priority_of(labels)
        if p:
            item["p"] = p
        if iss.get("ci_failure"):
            item["cf"] = True
        issues.append(item)

    merged = []
    for m in (snap.get("latest_merges") or [])[:5]:
        merged.append(
            {
                "n": int(m["number"]),
                "t": m.get("title") or "",
                "at": fmt_merged(m.get("merged_at") or ""),
            }
        )

    stuck = []
    for s in snap.get("stuck") or []:
        stuck.append(
            {
                "n": int(s["number"]),
                "b": short_branch(s.get("branch") or ""),
                "r": s.get("reason") or "",
            }
        )

    nc_items = []
    for it in snap.get("needs_clarence_items") or []:
        nc_items.append(
            {
                "n": int(it["number"]),
                "t": it.get("title") or "",
                "k": it.get("kind") or "item",
            }
        )

    last = runs[-1] if runs else None
    nightly_ok = bool(last) and (last.get("conclusion") == "success")
    needs_n = int(metrics.get("needs_clarence") or 0)
    night_label = ""
    if last:
        d = last["date"]
        night_label = f"{'Nov' if d[5:7]=='11' else 'Oct' if d[5:7]=='10' else d[5:7]} {int(d[8:])}"

    data = {
        "a": snap.get("as_of_label") or "",
        "m": {
            "n": needs_n,
            "m7": int(metrics.get("merges_7d") or 0),
            "ap": int(metrics["automation_pct"]) if metrics.get("automation_pct") is not None else 0,
            "nc7": int(metrics.get("needs_clarence_merged_7d") or 0),
            "op": int(metrics.get("open_prs") or 0),
            "oi": int(metrics.get("open_issues") or len(issues)),
        },
        "lead": lead_text(needs_n, nightly_ok),
        "st": {
            "op": int(metrics.get("open_prs") or 0),
            "stuck": stuck,
            "night": night_label,
            "nid": int(last["run_id"]) if last else 0,
            "ok": nightly_ok,
            "groups": groups_blurb(last) if last else "n/a",
        },
        "nights": nights,
        "merges": merges,
        "issues": issues,
        "merged": merged,
        "nc": nc_items,
    }
    return data


def stable_for_hash(data: dict) -> dict:
    """Drop as_of so a clock-only refresh is NOCHANGE."""
    out = dict(data)
    out.pop("a", None)
    return out


def data_literal(data: dict) -> str:
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    return f"/* @@DATA_START@@ */\nconst DATA = {body} as Data;\n/* @@DATA_END@@ */"


def last_red_nightly(runs: list[dict]) -> str:
    for r in reversed(runs):
        if r.get("conclusion") == "failure" or st_overall(r) == "fail":
            return r.get("date") or ""
    return "none"


def write_summary(snap: dict, data: dict, status: str, digest: str) -> str:
    """Morning-triage summary: needs-clarence, stale PRs, red nightlies, ci-failure issues."""
    lines = []
    lines.append(f"as_of: {data['a']}")
    lines.append(f"needs_you: {data['m']['n']}")
    if data["nc"]:
        for it in data["nc"]:
            title = it["t"]
            if len(title) > 60:
                title = title[:57] + "..."
            lines.append(f"  #{it['n']} {title} ({it['k']})")
    else:
        lines.append("  (none)")
    lines.append(f"open_prs: {data['m']['op']}")
    last = (snap.get("nightly") or {}).get("latest") or {}
    lines.append(
        f"last_nightly: {last.get('date', 'n/a')} {last.get('conclusion', 'n/a')}"
    )
    stuck = data["st"]["stuck"]
    if stuck:
        lines.append("stale_prs:")
        for s in stuck:
            lines.append(f"  #{s['n']} {s['b']} ({s['r']})")
    else:
        lines.append("stale_prs: none")
    runs = (snap.get("nightly") or {}).get("runs") or []
    reds = [r.get("date") for r in runs if r.get("conclusion") == "failure" or st_overall(r) == "fail"]
    if reds:
        lines.append("red_nightlies: " + ", ".join(reds))
    else:
        lines.append("red_nightlies: none")
    lines.append(f"last_red_nightly: {last_red_nightly(runs)}")
    ci_fail = [i for i in data["issues"] if i.get("cf") or "ci-failure" in (i.get("l") or [])]
    if ci_fail:
        lines.append("ci_failure_issues:")
        for i in ci_fail:
            title = i["t"]
            if len(title) > 60:
                title = title[:57] + "..."
            lines.append(f"  #{i['n']} {title}")
    else:
        lines.append("ci_failure_issues: none")
    lines.append(f"html: {HTML_OUT.name}")
    lines.append(f"status: {status}")
    lines.append(f"hash: {digest[:12]}")
    text = "\n".join(lines) + "\n"
    SUMMARY.write_text(text, encoding="utf-8")
    return text


def esc(s: object) -> str:
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def day_label(d: str) -> str:
    mo = d[5:7]
    mon = {"09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec"}.get(mo, mo)
    return f"{mon} {int(d[8:])}"


def st_color(s: str | None) -> str:
    return {"pass": "#1a7f37", "fail": "#cf222e", "rerun": "#9a6700"}.get(s or "", "transparent")


def write_html(data: dict) -> None:
    """Self-contained static dashboard matching the Page design (light, single scroll)."""
    if os.environ.get("GITHUB_ACTIONS") == "true":
        footer = (
            "Times are PT. Rebuilt by GitHub Actions about every 3 hours. "
            "Zero model tokens."
        )
    else:
        footer = (
            "Times are PT. Run <code>./refresh.sh</code> to rebuild locally. "
            "Zero model tokens."
        )
    m = data["m"]
    nights = data["nights"]
    merges = data["merges"]
    issues = data["issues"]
    merged = data["merged"]
    stuck = data["st"]["stuck"]
    repo = "https://github.com/ckmah/milume"
    runs = f"{repo}/actions/runs"

    def cat_cell(n: dict, key: str) -> str:
        c = n.get(key)
        if not c:
            return '<span class="sq empty" title="not run"></span>'
        s = c["s"]
        return (
            f'<a class="sq {s}" href="{runs}/{n["id"]}" target="_blank" rel="noreferrer" '
            f'title="{esc(day_label(n["d"]))} · {esc(s)}"></a>'
        )

    # Pass strip rows
    strip_rows = [("Whole run", "o")] + [
        ("Core", "c"),
        ("Landmarks", "l"),
        ("Volume", "v"),
        ("Marimo", "m"),
    ]
    strip_html = []
    for name, key in strip_rows:
        cells = []
        for n in nights:
            if key == "o":
                s = n["o"]
                cells.append(
                    f'<a class="sq {s}" href="{runs}/{n["id"]}" target="_blank" rel="noreferrer" '
                    f'title="{esc(day_label(n["d"]))} · {esc(s)}"></a>'
                )
            else:
                cells.append(cat_cell(n, key))
        strip_html.append(
            f'<div class="strip-row"><span class="lab">{esc(name)}</span>{"".join(cells)}</div>'
        )
    ticks = []
    for i, n in enumerate(nights):
        label = day_label(n["d"]) if i in (0, 7, len(nights) - 1) else ""
        ticks.append(f'<span class="tick">{esc(label)}</span>')
    strip_html.append(f'<div class="strip-row"><span class="lab"></span>{"".join(ticks)}</div>')

    def bar_svg(values: list[tuple[float | None, str | None]], unit: str, width: int = 600) -> str:
        H, PAD_L, PAD_R, PAD_T, BASE = 150, 28, 8, 16, 126
        n = max(len(values), 1)
        slot = (width - PAD_L - PAD_R) / n
        bw = min(12, slot * 0.6)
        vals = [v if v is not None else 0.0 for v, _ in values]
        peak = max(vals + [0.1])
        # nice top
        steps = [0.5, 1, 2, 5, 10, 20]
        step = steps[-1]
        for s in steps:
            if int(-(-peak // s)) <= 4:  # ceil
                step = s
                break
        import math
        top = math.ceil(peak / step) * step
        if top <= peak:
            top += step
        def y_of(v: float) -> float:
            return BASE - (v / top) * (BASE - PAD_T)
        def xc(i: int) -> float:
            return PAD_L + slot * i + slot / 2
        parts = [f'<svg viewBox="0 0 {width} {H}" width="100%" role="img">']
        t = 0.0
        while t <= top + 1e-9:
            y = y_of(t)
            stroke = "#d0d7de" if t == 0 else "#eaeef2"
            parts.append(f'<line x1="{PAD_L}" x2="{width-PAD_R}" y1="{y}" y2="{y}" stroke="{stroke}" stroke-width="1"/>')
            parts.append(f'<text x="{PAD_L-6}" y="{y+4}" text-anchor="end" fill="#656d76" font-size="11">{t:g}</text>')
            t += step
        for i in (0, 7, n - 1):
            if i >= len(nights):
                continue
            anchor = "start" if i == 0 else "end" if i == n - 1 else "middle"
            dx = -slot / 2 if i == 0 else slot / 2 if i == n - 1 else 0
            parts.append(
                f'<text x="{xc(i)}" y="{BASE+16}" text-anchor="{anchor}" dx="{dx}" fill="#656d76" font-size="11">{esc(day_label(nights[i]["d"]))}</text>'
            )
        peak_i = vals.index(peak) if peak in vals else 0
        for i, (v, s) in enumerate(values):
            if v is None or v == 0:
                continue
            fill = "#cf222e" if s == "fail" else "#0969da" if s != "rerun" else "#ffffff"
            stroke = f' stroke="#0969da" stroke-width="1.25"' if s == "rerun" else ""
            parts.append(
                f'<rect x="{xc(i)-bw/2}" y="{y_of(v)}" width="{bw}" height="{BASE-y_of(v)}" fill="{fill}"{stroke}>'
                f'<title>{esc(day_label(nights[i]["d"]))}: {v}{unit}</title></rect>'
            )
        parts.append(
            f'<text x="{xc(peak_i)}" y="{y_of(peak)-5}" text-anchor="{"start" if peak_i==0 else "middle"}" '
            f'fill="#656d76" font-size="11">{peak:g}{esc(unit)}</text>'
        )
        parts.append("</svg>")
        return "".join(parts)

    cat_keys = [("Core", "c"), ("Landmarks", "l"), ("Volume", "v"), ("Marimo", "m")]
    cat_svgs = []
    for name, key in cat_keys:
        pts = []
        for n in nights:
            c = n.get(key)
            pts.append((c["m"] if c else None, c["s"] if c else None))
        cat_svgs.append(
            f'<section class="card"><h3>{esc(name)}</h3>{bar_svg(pts, " min", 300)}</section>'
        )

    wall_pts = [(n["w"], n["o"]) for n in nights]
    merge_pts = [(float(merges[i]) if i < len(merges) else 0.0, None) for i in range(len(nights))]

    issue_rows = []
    for i in issues:
        pri = i.get("p") or "none"
        labs = " ".join(f'<span class="chip {esc(l)}">{esc(l if l != "documentation" else "docs")}</span>' for l in (i.get("l") or []))
        if i.get("cf"):
            labs = '<span class="chip ci-failure">ci-failure</span> ' + labs
        issue_rows.append(
            f'<tr><td><a href="{repo}/issues/{i["n"]}" target="_blank" rel="noreferrer">#{i["n"]}</a></td>'
            f'<td>{esc(i["t"])}</td><td>{esc(pri)}</td><td>{labs or "none"}</td><td class="end">{esc(i["u"])}</td></tr>'
        )

    merge_rows = []
    for mrg in merged:
        merge_rows.append(
            f'<tr><td><a href="{repo}/pull/{mrg["n"]}" target="_blank" rel="noreferrer">#{mrg["n"]}</a></td>'
            f'<td>{esc(mrg["t"])}</td><td class="end">{esc(mrg["at"])}</td></tr>'
        )

    stuck_html = "none stuck"
    if stuck:
        bits = [
            f'<a href="{repo}/pull/{s["n"]}" target="_blank" rel="noreferrer">#{s["n"]}</a> {esc(s["b"])} ({esc(s["r"])})'
            for s in stuck
        ]
        stuck_html = "one stuck: " + ", ".join(bits)

    last_tone = "ok" if data["st"]["ok"] else "bad"
    last_label = "Passing" if data["st"]["ok"] else "Failing"
    auto = f'{m["ap"]}% merged without you ({m["nc7"]} needed you)' if m["m7"] else "automation n/a"
    range_lbl = f'{day_label(nights[0]["d"])}–{day_label(nights[-1]["d"])}' if nights else ""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="as-of" content="{esc(data['a'])}"/>
<title>milume agent dashboard</title>
<style>
:root {{ color-scheme: light; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font: 14px/1.45 system-ui, -apple-system, Segoe UI, sans-serif; color: #1f2328; background: #fff; }}
main {{ max-width: 1100px; margin: 0 auto; padding: 24px 20px 48px; }}
h1 {{ font-size: 22px; font-weight: 650; margin: 0 0 4px; }}
.sub {{ color: #656d76; margin: 0 0 16px; }}
.lead {{ margin: 0 0 16px; }}
.metrics {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 0 0 12px; }}
.metric {{ border: 1px solid #d0d7de; border-radius: 12px; padding: 14px 16px; }}
.metric .v {{ font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; }}
.metric .l {{ color: #656d76; font-size: 12px; margin-top: 2px; }}
.metric .d {{ color: #656d76; font-size: 12px; margin-top: 6px; }}
.metric.warn .v {{ color: #9a6700; }}
.metric.ok .v {{ color: #1a7f37; }}
.metric.bad .v {{ color: #cf222e; }}
.statusline {{ display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0 0 24px; color: #1f2328; }}
.statusline .lab {{ color: #656d76; }}
a {{ color: #0969da; text-decoration: none; }}
a:hover {{ text-decoration: underline; }}
section.block {{ margin: 0 0 28px; }}
section.block > h2 {{ font-size: 16px; margin: 0 0 4px; }}
.cap {{ color: #656d76; font-size: 12px; margin: 0 0 12px; }}
.strip {{ display: flex; flex-direction: column; gap: 6px; }}
.strip-row {{ display: grid; grid-template-columns: 96px repeat({len(nights) or 1}, minmax(0,1fr)); gap: 4px; align-items: center; }}
.strip-row .lab {{ color: #656d76; font-size: 12px; }}
.sq {{ display: block; height: 20px; max-width: 20px; margin: 0 auto; border-radius: 4px; width: 100%; }}
.sq.pass {{ background: #1a7f37; }}
.sq.fail {{ background: #cf222e; }}
.sq.rerun {{ background: #9a6700; }}
.sq.empty {{ border: 1px dashed #8c959f; background: transparent; }}
.tick {{ text-align: center; color: #656d76; font-size: 11px; white-space: nowrap; }}
.legend {{ display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 10px; color: #656d76; font-size: 12px; }}
.legend i {{ display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }}
.grid4 {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }}
.grid2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
.card {{ border: 1px solid #d0d7de; border-radius: 12px; padding: 12px 14px 8px; }}
.card h3 {{ margin: 0 0 8px; font-size: 13px; font-weight: 600; }}
table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
th, td {{ text-align: left; padding: 8px 10px; border-bottom: 1px solid #d0d7de; vertical-align: top; }}
th {{ color: #656d76; font-weight: 600; font-size: 12px; }}
td.end, th.end {{ text-align: right; white-space: nowrap; }}
.chip {{ display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; background: #eaeef2; color: #1f2328; margin: 0 2px 2px 0; }}
.chip.bug, .chip.ci-failure {{ background: #ffebe9; color: #cf222e; }}
.chip.documentation, .chip.docs {{ background: #dafbe1; color: #1a7f37; }}
.chip.enhancement {{ background: #ddf4ff; color: #0969da; }}
.footer {{ color: #656d76; margin-top: 8px; }}
@media (max-width: 900px) {{
  .metrics, .grid4, .grid2 {{ grid-template-columns: 1fr 1fr; }}
}}
@media (max-width: 600px) {{
  .metrics, .grid4, .grid2 {{ grid-template-columns: 1fr; }}
  .strip-row {{ grid-template-columns: 72px repeat({len(nights) or 1}, minmax(0,1fr)); }}
}}
</style>
</head>
<body>
<main>
  <h1>milume agent dashboard</h1>
  <p class="sub">ckmah/milume · as of {esc(data['a'])}</p>
  <p class="lead">{esc(data['lead'])}</p>
  <div class="metrics">
    <div class="metric {"warn" if m["n"] else "ok"}"><div class="v">{m["n"]}</div><div class="l">Needs you</div><div class="d">open items labeled needs-clarence</div></div>
    <div class="metric"><div class="v">{m["m7"]}</div><div class="l">PRs merged, 7 days</div><div class="d">{esc(auto)}</div></div>
    <div class="metric"><div class="v">{m["op"]}</div><div class="l">Open PRs</div><div class="d">gate: 10 or fewer</div></div>
    <div class="metric {last_tone}"><div class="v">{esc(last_label)}</div><div class="l">Last nightly</div><div class="d">{esc(data['st']['night'])} run</div></div>
  </div>
  <div class="statusline">
    <span><span class="lab">Open PRs </span>{data['st']['op']}, {stuck_html}</span>
    <span><span class="lab">Last nightly </span><a href="{runs}/{data['st']['nid']}" target="_blank" rel="noreferrer">{esc(data['st']['night'])} run</a>, {esc(data['st']['groups'])}</span>
  </div>

  <section class="block">
    <h2>Nightly e2e, {esc(range_lbl)}</h2>
    <p class="cap">Scheduled frontend-e2e run on main, once a night. Each square links to that night's run.</p>
    <div class="strip">{''.join(strip_html)}</div>
    <div class="legend">
      <span><i style="background:#1a7f37"></i>Passed</span>
      <span><i style="background:#9a6700"></i>Passed on rerun</span>
      <span><i style="background:#cf222e"></i>Failed</span>
      <span><i style="border:1px dashed #8c959f;background:transparent"></i>Not run that night</span>
    </div>
  </section>

  <section class="block">
    <h2>Job minutes per night, by test group</h2>
    <p class="cap">Volume adds up its parallel shards and only runs on some nights. Red: failed. Outlined: failed, then passed on rerun.</p>
    <div class="grid4">{''.join(cat_svgs)}</div>
  </section>

  <div class="grid2" style="margin-bottom:28px">
    <section class="card"><h3>Nightly wall time, minutes</h3>{bar_svg(wall_pts, " min", 600)}</section>
    <section class="card"><h3>PRs merged per day</h3>{bar_svg(merge_pts, "", 600)}</section>
  </div>

  <section class="block">
    <h2>Open issues ({m["oi"]})</h2>
    <table>
      <thead><tr><th>Issue</th><th>Title</th><th>Priority</th><th>Labels</th><th class="end">Updated</th></tr></thead>
      <tbody>{''.join(issue_rows)}</tbody>
    </table>
  </section>

  <section class="block">
    <h2>Latest 5 merges</h2>
    <table>
      <thead><tr><th>PR</th><th>Title</th><th class="end">Merged</th></tr></thead>
      <tbody>{''.join(merge_rows)}</tbody>
    </table>
  </section>

  <p class="footer">{footer}</p>
</main>
</body>
</html>
"""
    HTML_OUT.write_text(html, encoding="utf-8")



def main() -> int:
    if not SNAP.is_file():
        die(f"missing {SNAP}")
    snap = json.loads(SNAP.read_text(encoding="utf-8"))
    data = build_data(snap)
    literal = data_literal(data)
    digest = hashlib.sha256(
        json.dumps(stable_for_hash(data), separators=(",", ":"), sort_keys=True).encode()
    ).hexdigest()
    HASH_FILE.write_text(digest + "\n", encoding="utf-8")
    DATA_BLOCK.write_text(literal + "\n", encoding="utf-8")

    page = ""
    if TEMPLATE.is_file():
        tmpl = TEMPLATE.read_text(encoding="utf-8")
        if not DATA_RE.search(tmpl):
            die("template missing DATA markers")
        page = DATA_RE.sub(literal, tmpl, count=1)
        PAGE_OUT.write_text(page, encoding="utf-8")

    write_html(data)

    prev = LAST_HASH.read_text(encoding="utf-8").strip() if LAST_HASH.is_file() else ""
    nochange = bool(prev) and prev == digest
    status = "NOCHANGE" if nochange else "PUBLISH"

    # edit payload for the agent (cursor tools cannot take $file:)
    old_literal = LAST_DATA.read_text(encoding="utf-8").rstrip("\n") if LAST_DATA.is_file() else ""
    if nochange:
        payload = {"mode": "noop", "reason": "hash_match", "hash": digest}
    elif old_literal and old_literal != literal:
        payload = {
            "mode": "edit",
            "canvas_id": "65cc46a1-e9ff-4ec1-9615-55bd4f0b48f9",
            "old_string": old_literal,
            "new_string": literal,
            "hash": digest,
            "data_bytes": len(literal.encode()),
        }
    else:
        payload = {
            "mode": "full",
            "canvas_id": "65cc46a1-e9ff-4ec1-9615-55bd4f0b48f9",
            "page_out": str(PAGE_OUT),
            "hash": digest,
            "page_bytes": len(page.encode()),
                "html_bytes": HTML_OUT.stat().st_size if HTML_OUT.is_file() else 0,
            "data_bytes": len(literal.encode()),
            "note": "Primary deliverable is dashboard.html (zero model tokens). Page publish optional/skip.",
        }
    EDIT_PAYLOAD.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    PUBLISH_META.write_text(
        json.dumps(
            {
                "status": status,
                "hash": digest,
                "data_bytes": len(literal.encode()),
                "page_bytes": len(page.encode()),
                "html_bytes": HTML_OUT.stat().st_size if HTML_OUT.is_file() else 0,
                "as_of": data["a"],
                "mode": payload["mode"],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    text = write_summary(snap, data, status, digest)
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
