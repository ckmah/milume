#!/usr/bin/env bash
# Fetch GitHub snapshot + render static dashboard.html + summary.txt.
# Zero model tokens. Does not publish; the Dashboard workflow publishes to Pages.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
python3 "$ROOT/fetch_snapshot.py" >/dev/null
python3 "$ROOT/render_page.py"
# render_page.py prints summary.txt to stdout
# On PUBLISH, stamp last_hash so a no-op re-run reports NOCHANGE (HTML already rewritten).
if grep -q '^status: PUBLISH$' "$ROOT/summary.txt" 2>/dev/null; then
  python3 "$ROOT/mark_published.py" >/dev/null
fi
