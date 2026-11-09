#!/usr/bin/env python3
"""Deterministic GitHub snapshot for milume agent dashboard. Never fabricates data.

Auth is the gh CLI (GH_TOKEN or GITHUB_TOKEN).
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

REPO = "ckmah/milume"
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "snapshot.json"
TZ = ZoneInfo("America/Los_Angeles")
STUCK_IDLE = timedelta(days=2)
TREND_DAYS = 14
STUCK_CAP = 8
MERGES_LOOKBACK = 5
NEEDS_CLARENCE_LABEL = "needs-clarence"
CI_WORKFLOW = "CI"
E2E_WORKFLOW = "Frontend e2e"


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def gh_json(args: list[str]) -> object:
    cmd = ["gh", *args]
    try:
        proc = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            timeout=90,
        )
    except subprocess.TimeoutExpired:
        die(f"gh timed out: {' '.join(cmd)}")
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        die(f"gh failed ({proc.returncode}): {' '.join(cmd)}\n{err}")
    raw = proc.stdout.strip()
    if not raw:
        return []
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        die(f"invalid JSON from gh: {e}\n{raw[:500]}")


def parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def duration_minutes(started: str | None, updated: str | None) -> float | None:
    a = parse_iso(started)
    b = parse_iso(updated)
    if not a or not b:
        return None
    secs = (b - a).total_seconds()
    if secs < 0:
        return None
    return round(secs / 60.0, 1)


def as_of_now() -> tuple[str, str]:
    now = datetime.now(TZ)
    iso = now.isoformat(timespec="seconds")
    # e.g. Fri Oct 23, 10:40 AM PT
    label = now.strftime("%a %b %-d, %-I:%M %p PT")
    return iso, label


def list_open_prs() -> list[dict]:
    # Keep list fields light — commits+authors blows GraphQL node limits.
    return gh_json(
        [
            "pr",
            "list",
            "--repo",
            REPO,
            "--state",
            "open",
            "--limit",
            "100",
            "--json",
            "number,title,url,headRefName,updatedAt,labels,isDraft",
        ]
    )  # type: ignore[return-value]


def enrich_pr_for_stuck(pr: dict) -> dict:
    """Add commits + statusCheckRollup for one PR (stuck detection only)."""
    detail = gh_json(
        [
            "pr",
            "view",
            str(pr["number"]),
            "--repo",
            REPO,
            "--json",
            "commits,statusCheckRollup",
        ]
    )
    if isinstance(detail, dict):
        pr = {**pr, **detail}
    return pr


def list_open_issues() -> list[dict]:
    return gh_json(
        [
            "issue",
            "list",
            "--repo",
            REPO,
            "--state",
            "open",
            "--limit",
            "100",
            "--json",
            "number,title,url,labels,updatedAt",
        ]
    )  # type: ignore[return-value]


def list_merged_prs(limit: int = 50) -> list[dict]:
    return gh_json(
        [
            "pr",
            "list",
            "--repo",
            REPO,
            "--state",
            "merged",
            "--limit",
            str(limit),
            "--json",
            "number,title,url,mergedAt",
        ]
    )  # type: ignore[return-value]


HISTORY = ROOT / "needs_you_history.json"
HISTORY_DAYS = 30


def list_merged_window(now_utc: datetime, days: int) -> list[dict]:
    """Merged PRs (number, mergedAt, labels) covering at least `days` back."""
    cutoff = now_utc - timedelta(days=days + 1)
    limit = 100
    while True:
        rows = gh_json(["pr", "list", "--repo", REPO, "--state", "merged", "--limit", str(limit),
                        "--json", "number,mergedAt,labels"])
        if not isinstance(rows, list):
            die("merged window: unexpected response")
        times = [parse_iso(r.get("mergedAt")) for r in rows if isinstance(r, dict)]
        times = [t for t in times if t]
        if len(rows) < limit or (times and min(times) < cutoff) or limit >= 1000:
            return rows
        limit *= 2


def merges_by_day(rows: list[dict], now_local: datetime) -> list[dict]:
    counts: dict[str, int] = defaultdict(int)
    for r in rows:
        t = parse_iso(r.get("mergedAt"))
        if t:
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            counts[t.astimezone(TZ).strftime("%Y-%m-%d")] += 1
    today = now_local.date()
    out = []
    for i in range(TREND_DAYS - 1, -1, -1):
        d = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        out.append({"date": d, "count": counts.get(d, 0)})
    return out


def needs_clarence_merged_7d(now_utc: datetime) -> int:
    rows = gh_json(["pr", "list", "--repo", REPO, "--state", "merged", "--label", NEEDS_CLARENCE_LABEL,
                    "--limit", "200", "--json", "number,mergedAt"])
    cutoff = now_utc - timedelta(days=7)
    n = 0
    for r in rows if isinstance(rows, list) else []:
        t = parse_iso(r.get("mergedAt"))
        if t:
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            if t >= cutoff:
                n += 1
    return n


def update_needs_history(now_local: datetime, count: int) -> list[dict]:
    hist: dict[str, int] = {}
    if HISTORY.exists():
        try:
            for e in json.loads(HISTORY.read_text(encoding="utf-8")):
                if isinstance(e, dict) and "date" in e and "needs_clarence" in e:
                    hist[str(e["date"])] = int(e["needs_clarence"])
        except (json.JSONDecodeError, ValueError, TypeError):
            pass
    today = now_local.strftime("%Y-%m-%d")
    hist[today] = count
    keep_from = (now_local.date() - timedelta(days=HISTORY_DAYS - 1)).strftime("%Y-%m-%d")
    entries = [{"date": d, "needs_clarence": hist[d]} for d in sorted(hist) if d >= keep_from]
    tmp = HISTORY.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    tmp.replace(HISTORY)
    return [{"date": e["date"], "count": e["needs_clarence"]} for e in entries]


def label_exists(name: str) -> bool:
    labels = gh_json(["label", "list", "--repo", REPO, "--limit", "100", "--json", "name"])
    if not isinstance(labels, list):
        return False
    return any(isinstance(x, dict) and x.get("name") == name for x in labels)


def list_needs_clarence() -> tuple[list[dict], bool]:
    """Return (items[{number,title,url,kind}], label_present).

    gh issue list includes PRs; de-dupe by number, prefer kind=pr when both appear.
    """
    if not label_exists(NEEDS_CLARENCE_LABEL):
        return [], False
    issues = gh_json(
        [
            "issue",
            "list",
            "--repo",
            REPO,
            "--state",
            "open",
            "--label",
            NEEDS_CLARENCE_LABEL,
            "--limit",
            "100",
            "--json",
            "number,title,url",
        ]
    )
    prs = gh_json(
        [
            "pr",
            "list",
            "--repo",
            REPO,
            "--state",
            "open",
            "--label",
            NEEDS_CLARENCE_LABEL,
            "--limit",
            "100",
            "--json",
            "number,title,url",
        ]
    )
    by_num: dict[int, dict] = {}
    if isinstance(issues, list):
        for item in issues:
            if isinstance(item, dict) and "number" in item:
                n = int(item["number"])
                by_num[n] = {
                    "number": n,
                    "title": item.get("title") or "",
                    "url": item.get("url") or "",
                    "kind": "issue",
                }
    if isinstance(prs, list):
        for item in prs:
            if isinstance(item, dict) and "number" in item:
                n = int(item["number"])
                by_num[n] = {
                    "number": n,
                    "title": item.get("title") or "",
                    "url": item.get("url") or "",
                    "kind": "pr",
                }
    items = [by_num[k] for k in sorted(by_num)]
    return items, True


def count_needs_clarence() -> tuple[int, bool]:
    """Return (count, label_present)."""
    items, ok = list_needs_clarence()
    return len(items), ok


def latest_main_ci() -> dict:
    """Latest CI workflow run on main (completed or in progress)."""
    runs = gh_json(
        [
            "run",
            "list",
            "--repo",
            REPO,
            "--workflow",
            CI_WORKFLOW,
            "--branch",
            "main",
            "--limit",
            "10",
            "--json",
            "databaseId,name,workflowName,conclusion,status,url,createdAt,updatedAt,event",
        ]
    )
    if not isinstance(runs, list) or not runs:
        return {"conclusion": "unknown", "url": "", "name": CI_WORKFLOW}
    # Prefer in-progress, else newest completed (skip cancelled/skipped if something better exists)
    inprog = [
        r
        for r in runs
        if isinstance(r, dict) and r.get("status") in ("in_progress", "queued", "pending", "waiting")
    ]
    pick = inprog[0] if inprog else runs[0]
    status = pick.get("status") or ""
    conclusion = pick.get("conclusion") or ""
    if status in ("in_progress", "queued", "pending", "waiting") and not conclusion:
        conc = "pending"
    elif conclusion == "success":
        conc = "success"
    elif conclusion in ("failure", "timed_out", "startup_failure"):
        conc = "failure"
    elif conclusion in ("cancelled", "skipped", "neutral", "action_required"):
        # fall through: try next completed success/failure if first is skipped
        conc = "unknown"
        for r in runs:
            if not isinstance(r, dict):
                continue
            c = r.get("conclusion") or ""
            if c == "success":
                pick, conc = r, "success"
                break
            if c in ("failure", "timed_out", "startup_failure"):
                pick, conc = r, "failure"
                break
    else:
        conc = "unknown"
    return {
        "conclusion": conc,
        "url": pick.get("url") or "",
        "name": pick.get("workflowName") or pick.get("name") or CI_WORKFLOW,
    }


def pr_last_push(pr: dict) -> datetime | None:
    commits = pr.get("commits") or []
    if not commits:
        return parse_iso(pr.get("updatedAt"))
    last = commits[-1]
    return parse_iso(last.get("committedDate") or last.get("authoredDate"))


def pr_failing_ci(pr: dict) -> bool:
    checks = pr.get("statusCheckRollup") or []
    if not checks:
        return False
    for c in checks:
        if not isinstance(c, dict):
            continue
        conclusion = (c.get("conclusion") or "").upper()
        state = (c.get("state") or "").upper()
        status = (c.get("status") or "").upper()
        # GitHub GraphQL rollup uses conclusion SUCCESS/FAILURE; REST-ish uses state
        if conclusion in ("FAILURE", "TIMED_OUT", "STARTUP_FAILURE") or state in (
            "FAILURE",
            "ERROR",
        ):
            # only count completed failures
            if status in ("", "COMPLETED") or conclusion:
                return True
    return False


def build_stuck(prs: list[dict], now: datetime) -> list[dict]:
    stuck: list[dict] = []
    for raw in prs:
        pr = enrich_pr_for_stuck(raw)
        reasons: list[str] = []
        last = pr_last_push(pr)
        if last is not None:
            # normalize tz
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            idle = now - last.astimezone(timezone.utc)
            if idle > STUCK_IDLE:
                days = idle.total_seconds() / 86400.0
                reasons.append(f"no push >{days:.0f}d" if days >= 3 else "no push >2d")
        if pr_failing_ci(pr):
            reasons.append("failing CI")
        if not reasons:
            continue
        stuck.append(
            {
                "number": pr["number"],
                "title": pr.get("title") or "",
                "url": pr.get("url") or "",
                "branch": pr.get("headRefName") or "",
                "reason": " / ".join(reasons),
            }
        )
        if len(stuck) >= STUCK_CAP:
            break
    return stuck


def build_issues_watch(issues: list[dict]) -> list[dict]:
    items = sorted(
        issues,
        key=lambda x: parse_iso(x.get("updatedAt")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    out = []
    for iss in items:
        labels = []
        for lab in iss.get("labels") or []:
            if isinstance(lab, dict) and lab.get("name"):
                labels.append(lab["name"])
            elif isinstance(lab, str):
                labels.append(lab)
        out.append(
            {
                "number": iss["number"],
                "title": iss.get("title") or "",
                "url": iss.get("url") or "",
                "labels": labels,
                "updated": iss.get("updatedAt") or "",
                "ci_failure": any(
                    ("ci" in l.lower() and "fail" in l.lower()) for l in labels
                )
                or (
                    "nightly" in (iss.get("title") or "").lower()
                    and "fail" in (iss.get("title") or "").lower()
                ),
            }
        )
    return out


def trend_for_workflow(workflow: str, now_utc: datetime) -> list[dict]:
    """Last ~14 calendar days of successful runs as OHLC + volume per local PT day.

    open/close = first/last run that day (chronological); high/low = max/min duration;
    n = run count (volume). minutes stays daily max for peak tiles.
    """
    runs = gh_json(
        [
            "run",
            "list",
            "--repo",
            REPO,
            "--workflow",
            workflow,
            "--branch",
            "main",
            "--status",
            "success",
            "--limit",
            "100",
            "--json",
            "databaseId,createdAt,updatedAt,startedAt,conclusion,status,url,workflowName",
        ]
    )
    if not isinstance(runs, list):
        return []
    cutoff = (now_utc - timedelta(days=TREND_DAYS)).date()
    # date (PT) -> [(started_local_ts, minutes), ...] chronological
    by_day: dict[str, list[tuple[datetime, float]]] = defaultdict(list)
    for r in runs:
        if not isinstance(r, dict):
            continue
        if (r.get("conclusion") or "") != "success":
            continue
        started = r.get("startedAt") or r.get("createdAt")
        updated = r.get("updatedAt")
        mins = duration_minutes(started, updated)
        if mins is None:
            continue
        dt = parse_iso(started)
        if not dt:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        local = dt.astimezone(TZ)
        if local.date() < cutoff:
            continue
        day = local.strftime("%Y-%m-%d")
        by_day[day].append((local, mins))
    points = []
    for day in sorted(by_day.keys()):
        chrono = sorted(by_day[day], key=lambda x: x[0])
        vals = [m for _, m in chrono]
        n = len(vals)
        hi = max(vals)
        lo = min(vals)
        open_m = vals[0]
        close_m = vals[-1]
        mid = vals[n // 2] if n % 2 else round((sorted(vals)[n // 2 - 1] + sorted(vals)[n // 2]) / 2, 1)
        mean = round(sum(vals) / n, 1)
        points.append(
            {
                "date": day,
                "minutes": hi,  # daily max (peak tiles)
                "open_minutes": open_m,
                "high_minutes": hi,
                "low_minutes": lo,
                "close_minutes": close_m,
                "mean_minutes": mean,
                "median_minutes": mid,
                "min_minutes": lo,
                "n": n,
            }
        )
    return points


NIGHTLY_WORKFLOW_FILE = "frontend-e2e.yml"
NIGHTLY_NIGHTS = 14
# Category per job name; setup/bookkeeping jobs fold into "setup".
NIGHTLY_CATEGORIES = ["core", "landmarks", "volume", "marimo", "setup"]


def nightly_category(job_name: str) -> str:
    n = job_name.strip()
    if n.startswith("e2e-core"):
        return "core"
    if n.startswith("e2e-landmarks"):
        inner = n[n.find("(") + 1 : n.rfind(")")] if "(" in n else "default"
        return "landmarks" if inner == "default" else "volume"
    if n.startswith("e2e-marimo"):
        return "marimo"
    return "setup"


def _jobs_for_attempt(run_id: int, attempt: int) -> list[dict]:
    data = gh_json(
        ["api", f"repos/{REPO}/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100"]
    )
    return list(data.get("jobs") or []) if isinstance(data, dict) else []


def nightly_runs(now_utc: datetime) -> list[dict]:
    """Scheduled Frontend e2e runs on main, one per PT night, newest last.

    Per job: name, category, minutes (started->completed), conclusion (latest attempt).
    first_attempt_failed marks jobs/categories that failed before a rerun passed.
    """
    runs = gh_json(
        [
            "run", "list", "--repo", REPO, "--workflow", NIGHTLY_WORKFLOW_FILE,
            "--event", "schedule", "--branch", "main", "--limit", "40",
            "--json", "databaseId,createdAt,conclusion,status,url,attempt",
        ]
    )
    if not isinstance(runs, list):
        return []
    by_night: dict[str, dict] = {}
    for r in runs:
        if not isinstance(r, dict) or r.get("status") != "completed":
            continue
        dt = parse_iso(r.get("createdAt"))
        if not dt:
            continue
        night = dt.astimezone(TZ).strftime("%Y-%m-%d")
        prev = by_night.get(night)
        if prev is None or (parse_iso(prev.get("createdAt")) or dt) < dt:
            by_night[night] = r
    out: list[dict] = []
    for night in sorted(by_night.keys())[-NIGHTLY_NIGHTS:]:
        r = by_night[night]
        rid = int(r["databaseId"])
        attempt = int(r.get("attempt") or 1)
        final = _jobs_for_attempt(rid, attempt)
        earlier_failed: set[str] = set()
        for a in range(1, attempt):
            for j in _jobs_for_attempt(rid, a):
                if j.get("conclusion") == "failure":
                    earlier_failed.add(j.get("name") or "")
        jobs = []
        for j in final:
            name = j.get("name") or ""
            concl = j.get("conclusion") or ""
            if concl == "skipped" or "${{" in name:
                continue
            mins = duration_minutes(j.get("started_at"), j.get("completed_at"))
            jobs.append(
                {
                    "name": name,
                    "category": nightly_category(name),
                    "minutes": mins if mins is not None else 0.0,
                    "conclusion": concl,
                    "first_attempt_failed": name in earlier_failed,
                }
            )
        cats: dict[str, dict] = {}
        for c in NIGHTLY_CATEGORIES:
            cj = [j for j in jobs if j["category"] == c]
            if not cj:
                continue
            if any(j["conclusion"] == "failure" for j in cj):
                status = "failure"
            elif all(j["conclusion"] == "success" for j in cj):
                status = "success"
            else:
                status = sorted({j["conclusion"] for j in cj} - {"success"})[0]
            cats[c] = {
                "status": status,
                "minutes": round(sum(j["minutes"] for j in cj), 1),
                "jobs": len(cj),
                "rerun_fixed": status == "success" and any(j["first_attempt_failed"] for j in cj),
            }
        starts = [parse_iso(j.get("started_at")) for j in final if j.get("conclusion") != "skipped"]
        ends = [parse_iso(j.get("completed_at")) for j in final if j.get("conclusion") != "skipped"]
        starts = [x for x in starts if x]
        ends = [x for x in ends if x]
        out.append(
            {
                "date": night,
                "run_id": rid,
                "url": r.get("url") or "",
                "conclusion": r.get("conclusion") or "",
                "attempts": attempt,
                "first_attempt_failed": bool(earlier_failed),
                "wall_minutes": round((max(ends) - min(starts)).total_seconds() / 60, 1) if starts and ends and attempt == 1 else None,
                "categories": cats,
                "jobs": jobs,
            }
        )
    return out


def build_gates(
    *,
    main_ci: dict,
    needs_clarence: int,
    label_present: bool,
    open_prs: int,
) -> list[dict]:
    gates: list[dict] = []
    ci_ok = main_ci.get("conclusion") == "success"
    gates.append(
        {
            "id": "main_ci_green",
            "label": "Main CI green",
            "done": ci_ok,
            **(
                {}
                if ci_ok
                else {"note": f"conclusion={main_ci.get('conclusion') or 'unknown'}"}
            ),
        }
    )
    if label_present:
        gates.append(
            {
                "id": "no_needs_clarence",
                "label": "No open needs-clarence",
                "done": needs_clarence == 0,
                **({} if needs_clarence == 0 else {"note": f"{needs_clarence} open"}),
            }
        )
    else:
        gates.append(
            {
                "id": "no_needs_clarence",
                "label": "No open needs-clarence",
                "done": False,
                "note": "label needs-clarence not found",
            }
        )
    # open PR count "reasonable" — treat >10 as not done (heuristic, documented)
    pr_ok = open_prs <= 10
    gates.append(
        {
            "id": "open_prs_reasonable",
            "label": "Open PRs ≤ 10",
            "done": pr_ok,
            **({} if pr_ok else {"note": f"{open_prs} open"}),
        }
    )
    return gates


def main() -> None:
    now_local = datetime.now(TZ)
    now_utc = now_local.astimezone(timezone.utc)
    as_of, as_of_label = as_of_now()

    open_prs = list_open_prs()
    if not isinstance(open_prs, list):
        die("open PRs: unexpected response")
    open_issues = list_open_issues()
    if not isinstance(open_issues, list):
        die("open issues: unexpected response")
    merged = list_merged_prs(100)
    if not isinstance(merged, list):
        die("merged PRs: unexpected response")

    cutoff_7d = now_utc - timedelta(days=7)
    merges_7d = 0
    for m in merged:
        mt = parse_iso(m.get("mergedAt") if isinstance(m, dict) else None)
        if mt is None:
            continue
        if mt.tzinfo is None:
            mt = mt.replace(tzinfo=timezone.utc)
        if mt >= cutoff_7d:
            merges_7d += 1

    needs_items, label_ok = list_needs_clarence()
    needs_n = len(needs_items)
    main_ci = latest_main_ci()
    stuck = build_stuck(open_prs, now_utc)
    issues_watch = build_issues_watch(open_issues)

    latest_merges = []
    for m in merged[:MERGES_LOOKBACK]:
        if not isinstance(m, dict):
            continue
        latest_merges.append(
            {
                "number": m["number"],
                "title": m.get("title") or "",
                "url": m.get("url") or "",
                "merged_at": m.get("mergedAt") or "",
            }
        )

    gates = build_gates(
        main_ci=main_ci,
        needs_clarence=needs_n,
        label_present=label_ok,
        open_prs=len(open_prs),
    )

    snap: dict = {
        "as_of": as_of,
        "as_of_label": as_of_label,
        "repo": REPO,
        "metrics": {
            "open_prs": len(open_prs),
            "needs_clarence": needs_n,
            "open_issues": len(open_issues),
            "merges_7d": merges_7d,
            "main_ci": main_ci,
        },
        "gates": gates,
        "latest_merges": latest_merges,
    }
    # omit empty lists rather than inventing
    if stuck:
        snap["stuck"] = stuck
    if needs_items:
        snap["needs_clarence_items"] = needs_items
    if issues_watch:
        snap["open_issues_watch"] = issues_watch
    # Page only needs merges_by_day + needs_you; skip OHLC trend series to cut snapshot size.
    trends: dict = {}
    window = list_merged_window(now_utc, TREND_DAYS)
    trends["merges_by_day"] = merges_by_day(window, now_local)
    if label_ok:
        nc7 = needs_clarence_merged_7d(now_utc)
        snap["metrics"]["needs_clarence_merged_7d"] = nc7
        snap["metrics"]["automation_pct"] = (
            round(100 * (1 - nc7 / merges_7d)) if merges_7d > 0 else None
        )
    trends["needs_you"] = update_needs_history(now_local, needs_n)
    snap["trends"] = trends
    nightly = nightly_runs(now_utc)
    if nightly:
        # Drop per-job arrays; Page uses categories + wall only.
        slim_runs = []
        for r in nightly:
            slim = {k: r[k] for k in r if k != "jobs"}
            slim_runs.append(slim)
        snap["nightly"] = {
            "workflow": NIGHTLY_WORKFLOW_FILE,
            "categories": NIGHTLY_CATEGORIES,
            "runs": slim_runs,
            "latest": {k: slim_runs[-1][k] for k in ("date", "url", "conclusion", "attempts", "first_attempt_failed")},
        }

    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(snap, indent=2) + "\n", encoding="utf-8")
    tmp.replace(OUT)
    print(f"wrote {OUT} as_of={as_of_label}", flush=True)


if __name__ == "__main__":
    main()
