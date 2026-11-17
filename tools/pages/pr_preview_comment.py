#!/usr/bin/env python3
"""Upsert the sticky harness-preview comment on a pull request."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

MARKER = "<!-- milume-pr-preview -->"


def gh(*args: str, input_text: str | None = None) -> str:
    env = os.environ.copy()
    token = env.get("GH_TOKEN") or env.get("GITHUB_TOKEN")
    if token:
        env["GH_TOKEN"] = token
    result = subprocess.run(
        ["gh", *args],
        check=True,
        text=True,
        input=input_text,
        capture_output=True,
        env=env,
    )
    return result.stdout


def pages_base(pr: str) -> str:
    repo = os.environ.get("GITHUB_REPOSITORY", "ckmah/milume")
    owner, name = repo.split("/", 1)
    return f"https://{owner}.github.io/{name}/pr/{pr}/"


def body_for(pr: str, sha: str, removed: bool) -> str:
    if removed:
        return (
            f"{MARKER}\n"
            "## Harness preview\n\n"
            f"The preview for `{sha}` was removed. `/pr/{pr}/` is no longer published.\n"
        )
    base = pages_base(pr)
    return (
        f"{MARKER}\n"
        "## Harness preview\n\n"
        f"Head `{sha}`\n\n"
        f"- [Widget harness]({base})\n"
        f"- [Design system]({base}design-system/)\n\n"
        "These previews are ephemeral. Closing the PR deletes the directory.\n"
    )


def comment_id(repo: str, pr: str) -> str | None:
    raw = gh(
        "api",
        "--paginate",
        f"repos/{repo}/issues/{pr}/comments",
        "--jq",
        f'.[] | select(.body | contains("{MARKER}")) | .id',
    )
    ids = [line.strip() for line in raw.splitlines() if line.strip()]
    return ids[0] if ids else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pr", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--removed", action="store_true")
    args = parser.parse_args()
    if not args.pr.isdigit():
        sys.exit("pr_preview_comment: PR number must be digits")
    repo = os.environ.get("GITHUB_REPOSITORY", "ckmah/milume")
    payload = json.dumps({"body": body_for(args.pr, args.sha, args.removed)})
    existing = comment_id(repo, args.pr)
    if existing:
        gh("api", "--method", "PATCH", f"repos/{repo}/issues/comments/{existing}", "--input", "-", input_text=payload)
        print(f"updated comment {existing}")
    else:
        gh("api", "--method", "POST", f"repos/{repo}/issues/{args.pr}/comments", "--input", "-", input_text=payload)
        print("created preview comment")


if __name__ == "__main__":
    main()
