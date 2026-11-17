#!/usr/bin/env bash
# Publish onto origin/gh-pages without touching the other roots.
#   publish_gh_pages.sh site <site-dir>
#   publish_gh_pages.sh preview <pr> <dir>
#   publish_gh_pages.sh delete <pr>
#   publish_gh_pages.sh sweep
# site replaces everything except pr/ and dashboard/. preview and delete only touch pr/<n>/.
# Retries the whole fetch/commit/push so a concurrent writer does not drop files.
set -euo pipefail

MODE="${1:?mode required: site|preview|delete|sweep}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="${GITHUB_REPOSITORY:-ckmah/milume}"
cd "$REPO_ROOT"

if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  GIT_AUTHOR=(-c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com")
else
  GIT_AUTHOR=()
fi

SWEEP_LIST="$(mktemp)"
trap 'rm -f "$SWEEP_LIST"' EXIT

apply_changes() {
  local work="$1"
  touch "$work/.nojekyll"
  case "$MODE" in
    site)
      local src="$2"
      if [[ ! -f "$src/index.html" ]]; then
        echo "publish_gh_pages.sh: site dir has no index.html ($src)" >&2
        return 1
      fi
      shopt -s dotglob nullglob
      local entry base
      for entry in "$work"/*; do
        base="$(basename "$entry")"
        if [[ "$base" == ".git" || "$base" == "pr" || "$base" == "dashboard" ]]; then
          continue
        fi
        rm -rf "$entry"
      done
      shopt -u dotglob nullglob
      tar -C "$src" --exclude=./pr --exclude=./dashboard --exclude=pr --exclude=dashboard -cf - . | tar -C "$work" -xf -
      touch "$work/.nojekyll"
      ;;
    preview)
      local pr="$2" src="$3"
      if [[ ! "$pr" =~ ^[0-9]+$ ]]; then
        echo "publish_gh_pages.sh: bad PR number: $pr" >&2
        return 1
      fi
      if [[ ! -f "$src/index.html" ]]; then
        echo "publish_gh_pages.sh: preview dir needs index.html" >&2
        return 1
      fi
      rm -rf "$work/pr/$pr"
      mkdir -p "$work/pr/$pr"
      cp -a "$src"/. "$work/pr/$pr/"
      ;;
    delete)
      local pr="$2"
      if [[ ! "$pr" =~ ^[0-9]+$ ]]; then
        echo "publish_gh_pages.sh: bad PR number: $pr" >&2
        return 1
      fi
      rm -rf "$work/pr/$pr"
      rmdir "$work/pr" 2>/dev/null || true
      ;;
    sweep)
      local dir n state
      : > "$SWEEP_LIST"
      if [[ -d "$work/pr" ]]; then
        for dir in "$work"/pr/*; do
          [[ -d "$dir" ]] || continue
          n="$(basename "$dir")"
          [[ "$n" =~ ^[0-9]+$ ]] || continue
          state="$(gh pr view "$n" --repo "$REPO" --json state --jq .state 2>/dev/null || echo MISSING)"
          if [[ "$state" != "OPEN" ]]; then
            rm -rf "$dir"
            printf '%s\n' "$n" >> "$SWEEP_LIST"
          fi
        done
        rmdir "$work/pr" 2>/dev/null || true
      fi
      ;;
    *)
      echo "publish_gh_pages.sh: unknown mode $MODE" >&2
      return 1
      ;;
  esac
}

message_for() {
  # $1 is the PR number for preview/delete. Script args are not in scope here.
  case "$MODE" in
    site) echo "chore(pages): publish site" ;;
    preview) echo "chore(pages): preview pr $1" ;;
    delete) echo "chore(pages): remove preview pr $1" ;;
    sweep) echo "chore(pages): sweep closed PR previews" ;;
  esac
}

WORK=""
cleanup() {
  if [[ -n "${WORK}" ]]; then
    git worktree remove --force "$WORK" >/dev/null 2>&1 || rm -rf "$WORK"
    git worktree prune >/dev/null 2>&1 || true
  fi
  rm -f "$SWEEP_LIST"
}
trap cleanup EXIT

attempt=1
while [[ "$attempt" -le 5 ]]; do
  cleanup
  WORK="$(mktemp -d)"
  if ! git fetch --depth 1 origin gh-pages; then
    echo "publish_gh_pages.sh: origin/gh-pages is missing" >&2
    exit 1
  fi
  git worktree add --detach "$WORK" origin/gh-pages
  apply_changes "$WORK" "${2:-}" "${3:-}"
  msg="$(message_for "${2:-}")"
  if git -C "$WORK" add -A && git -C "$WORK" diff --cached --quiet; then
    echo "gh-pages: no file changes"
    break
  fi
  git -C "$WORK" "${GIT_AUTHOR[@]}" commit -m "$msg"
  if git -C "$WORK" push origin HEAD:gh-pages; then
    echo "gh-pages: pushed ($msg)"
    break
  fi
  echo "gh-pages: push rejected, retry $attempt" >&2
  attempt=$((attempt + 1))
  sleep $((attempt * 2))
done
if [[ "$attempt" -gt 5 ]]; then
  echo "publish_gh_pages.sh: push failed after retries" >&2
  exit 1
fi

if [[ "$MODE" == "sweep" && -s "$SWEEP_LIST" ]]; then
  while IFS= read -r n; do
    [[ -n "$n" ]] || continue
    sha="$(gh pr view "$n" --repo "$REPO" --json headRefOid --jq .headRefOid 2>/dev/null || echo unknown)"
    python3 "$REPO_ROOT/tools/pages/pr_preview_comment.py" --removed --pr "$n" --sha "$sha" || true
  done < "$SWEEP_LIST"
fi
