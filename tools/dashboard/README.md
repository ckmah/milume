# milume agent dashboard

Static HTML dashboard of open PRs, needs-clarence items, nightlies, and CI.
Rebuilt on a schedule by GitHub Actions with zero model tokens.

Live URL (after the workflow has published at least once):
<https://ckmah.github.io/milume/dashboard/>

Morning-triage summary: <https://ckmah.github.io/milume/dashboard/summary.txt>

GitHub Pages serves the `gh-pages` branch. This workflow updates only
`dashboard/` on that branch. The docs publish and harness previews live beside
it and are left in place.

## Auth

`fetch_snapshot.py` talks to GitHub only through the `gh` CLI. In Actions that
is `GITHUB_TOKEN` (set as `GH_TOKEN`). Locally, `gh auth` is enough.

Permissions used by the workflow: contents (write, to update `gh-pages`),
actions (read), pull-requests (read), and issues (read).

## Local refresh

From this directory:

```bash
./refresh.sh
```

Writes `dashboard.html`, `summary.txt`, and `content_hash.txt`. Status is
`NOCHANGE` when the hash matches `last_hash.txt` (the hash ignores `as_of`).

## Actions

`.github/workflows/dashboard.yml` runs about every 3 hours, on
`workflow_dispatch`, and after a successful main Pages run. It pushes
`dashboard/` only when the content hash changes. A docs publish replaces the
site root and leaves `dashboard/` and `pr/` alone.
