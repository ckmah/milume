#!/usr/bin/env bash
# Push generated dashboard files to origin/gh-pages under dashboard/.
# Creates an orphan gh-pages branch if it does not exist.
# Usage: push_gh_pages.sh <dir-with-dashboard.html-and-summary.txt>
set -euo pipefail
SRC="$(cd "${1:?source dir required}" && pwd)"
if [[ ! -f "$SRC/dashboard.html" || ! -f "$SRC/summary.txt" || ! -f "$SRC/content_hash.txt" ]]; then
  echo "push_gh_pages.sh: missing dashboard.html, summary.txt, or content_hash.txt in $SRC" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch --depth 1 origin gh-pages
  git worktree add "$WORK" origin/gh-pages
else
  git worktree add --detach "$WORK"
  git -C "$WORK" checkout --orphan gh-pages
  git -C "$WORK" rm -rf --ignore-unmatch . >/dev/null 2>&1 || true
  find "$WORK" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
fi

mkdir -p "$WORK/dashboard"
cp "$SRC/dashboard.html" "$WORK/dashboard/index.html"
cp "$SRC/summary.txt" "$WORK/dashboard/summary.txt"
cp "$SRC/content_hash.txt" "$WORK/dashboard/content_hash.txt"
if [[ -f "$SRC/needs_you_history.json" ]]; then
  cp "$SRC/needs_you_history.json" "$WORK/dashboard/needs_you_history.json"
fi
cat > "$WORK/README.md" << 'MD'
Generated milume agent dashboard (`dashboard/index.html`, `dashboard/summary.txt`).

Served at https://ckmah.github.io/milume/dashboard/ by overlaying these files
onto the existing workflow-built docs site. Do not edit by hand; the Dashboard
workflow refreshes this branch.
MD

git -C "$WORK" add dashboard README.md
if git -C "$WORK" diff --cached --quiet; then
  echo "gh-pages: no file changes"
  exit 0
fi
git -C "$WORK" commit -m "chore(dashboard): refresh $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git -C "$WORK" push origin HEAD:gh-pages
echo "gh-pages: pushed"
