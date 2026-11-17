# milume agent dashboard

Static HTML dashboard of open PRs, needs-clarence items, nightlies, and CI.
Rebuilt on a schedule by GitHub Actions with zero model tokens.

Live URL (after the workflow has published at least once):
<https://ckmah.github.io/milume/dashboard/>

Morning-triage summary: <https://ckmah.github.io/milume/dashboard/summary.txt>

The live docs site is the GitHub Actions Pages artifact. This workflow still
pushes `dashboard/` to the `gh-pages` branch and overlays it onto that artifact.
The overlay also copies `pr/` from `gh-pages` so a dashboard publish does not
drop open harness previews.

## Auth

`fetch_snapshot.py` talks to GitHub only through the `gh` CLI. In Actions that
is `GITHUB_TOKEN` (set as `GH_TOKEN`). Locally, `gh auth` is enough.

Permissions used by the workflow: contents (write, to update `gh-pages`),
actions (read), pull-requests (read), issues (read), pages (write), and
id-token (write) for `deploy-pages`.

## Local refresh

From this directory:

```bash
./refresh.sh
```

Writes `dashboard.html`, `summary.txt`, and `content_hash.txt`. Status is
`NOCHANGE` when the hash matches `last_hash.txt` (the hash ignores `as_of`).

## Actions

`.github/workflows/dashboard.yml` runs about every 3 hours, on
`workflow_dispatch`, and after a successful main Pages deploy (so a docs
publish does not wipe `/dashboard/`). It skips the `gh-pages` push when the
content hash is unchanged, and still restores `/dashboard/` after a Pages
deploy. That restore keeps `/pr/` from `gh-pages`.
