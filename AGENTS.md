# AGENTS.md

Guidance for agents working in **milume**. Rules that can be checked are enforced by
tooling, not listed here: run `cd frontend && npm run verify` before merging (it picks
the checks for your diff from [`.github/e2e-tiers.json`](.github/e2e-tiers.json)).

| Rule | Enforced by |
| ---- | ----------- |
| Landmarks UI issues have Outcome, Acceptance, and Visual acceptance | [`.github/ISSUE_TEMPLATE/landmarks-ui.yml`](.github/ISSUE_TEMPLATE/landmarks-ui.yml) (required fields); `npm run check:widget-issue`; linked issues when a UI PR says `Closes #N` ([`pr-policy.yml`](.github/workflows/pr-policy.yml)) |
| UI PRs into main link the issue they close (`Closes #N` / `Fixes #N` in the body, including drafts); PRs into a `feat/*` base say `Part of #N` | `npm run check:pr-policy` / [`pr-policy.yml`](.github/workflows/pr-policy.yml) |
| Ready UI PRs (UI paths or the `ui-evidence` label) have a `## Visual acceptance` section: one entry per linked-issue item, in order, each with an image/video or `N/A: <reason>`; one agent pass on ready-for-review checks the shots | `npm run check:pr-policy` / [`pr-policy.yml`](.github/workflows/pr-policy.yml) `ui-pr-policy`; [`verify-visual-acceptance`](.agents/skills/verify-visual-acceptance/SKILL.md) |
| Playwright runs on UI changes; artifact pointers posted on PRs | [`frontend-e2e.yml`](.github/workflows/frontend-e2e.yml) `post-ui-evidence-comment` |
| Widget chrome uses shadcn primitives, scoped CSS, cube-motion channels | `npm run check:chrome` |
| Simulated-molab specs always run in `e2e-landmarks (default)` for gesture/DOM paths; marimo e2e has no UI gestures | `npm run check:e2e-scope` + [`frontend/e2e/e2e-scope.json`](frontend/e2e/e2e-scope.json) / [`pr-policy.yml`](.github/workflows/pr-policy.yml) `e2e-scope` |
| Public API changes (`milume.__all__`, `_PUBLIC_TRAITS`, their signatures) update `.github/public-api.json`, add a CHANGELOG line under unreleased, and stop for Clarence | `npm run check:public-api` / [`pr-policy.yml`](.github/workflows/pr-policy.yml) `public-api` (labels `public-api` + `needs-clarence`) |
| Ready PRs are unstacked (base `main` or `feat/*`, no commits from another open PR) and not duplicates (another open PR closes the same issue and touches the same files); a shared file or `Part of #N` alone gets a warning comment | `npm run check:pr-stack` / `npm run check:pr-overlap -- --branch <name>` ([`pr-policy.yml`](.github/workflows/pr-policy.yml) `pr-hygiene`) |
| Right e2e tier for the diff: CI and `npm run verify` read one path → tier → leg → job map; wheel builds ship the widget bundle | `npm run check:ci-legs` ([`pr-policy.yml`](.github/workflows/pr-policy.yml) `ci-legs`) + [`.github/e2e-tiers.json`](.github/e2e-tiers.json); [`scripts/check-wheel-bundle.sh`](scripts/check-wheel-bundle.sh) in [`ci.yml`](.github/workflows/ci.yml) |
| Landing montage shots are rows in [`docs/montage/shot-spec.md`](docs/montage/shot-spec.md) (dataset, setup, duration, caption, capture, status, owner); handoffs name shot ids; tagline captions match the landing `<h1>`; new or re-shot rows name a capture script (or `N/A: <reason>`) | `npm run check:shot-spec` ([`pr-policy.yml`](.github/workflows/pr-policy.yml) `agent-policy-tests`); [Montage issue template](.github/ISSUE_TEMPLATE/montage.yml) |
| Bots wait on CI in bounded sessions, then hand off with the snapshot (head SHA, conflicts, failing tier): `gh-ci-watch.mjs` gives 3 sessions of at most 20 min per head SHA; `npm run verify` stops at 15 min naming the step that hung; ready bot-branch PRs with red or pending CI and no push for 6 h get a `stalled` comment | [`gh-ci-watch.mjs`](frontend/scripts/gh-ci-watch.mjs) (refuses the 4th session); [`verify.mjs`](frontend/scripts/verify.mjs) (`MILUME_VERIFY_TIMEOUT_MIN`); [`stale-prs.yml`](.github/workflows/stale-prs.yml) (hourly) |
| Merge only on green `gate`, non-draft, conflicts resolved | Branch protection + [`frontend-e2e.yml`](.github/workflows/frontend-e2e.yml) `gate` job |

- **Branch names:** agent branches use the `agent/` prefix (e.g. `agent/montage-capture-script`). In PR mentions, the short name is the part after the prefix (`montage-capture-script`).
- **Draft UI PRs:** keep PRs in draft while iterating. Draft runs the fast tier (`test`, `e2e-core`, landmarks default harness) without volume shards.

## Agent run budgets

Wall-clock on cloud agents is often idle time waiting for the next follow-up, not tool work. When you have pushed and CI is running:

- Before the first push on a UI change, run `cd frontend && npm run verify` locally (about 4 min for landmarks on GPU-less Linux, where it runs the cube smoke spec; about 8 min with `--full-volume`). Use CI for integration gaps, not as a retry loop for the same failing spec (cap local reruns of one grep to **3** attempts, then fix root cause).
- Pin scope up front: read the linked issue **Outcome / Acceptance** and any PM comment before coding. Confirm dataset identity (colon vs Pyxa `small`/`xsmall` are mouse brain — never join colon IDs onto them; see issue #97).

## Demo data (agents)

- **Do not** build full `colon_a2.sdata.zarr` on cloud VMs (~30 GB RAM; OOM in multiple runs). Use `npm run dev:fixture:colon` subsamples, or HF `Stellaromics/demo` `xsmall` / `small` via `npm run dev:fixture:volume-xsmall-if-missing` / `volume-small-if-missing` (download + export only when missing).
- Never poll for an hour on local export logs; prefetch once, then `--if-present` export.

- Domain language: [`CONTEXT.md`](CONTEXT.md). Architecture decisions: [`docs/adr/`](docs/adr/). Roadmap: [`ROADMAP.md`](ROADMAP.md).
- Product and design authority: [`frontend/PRODUCT.md`](frontend/PRODUCT.md), [`frontend/DESIGN.md`](frontend/DESIGN.md).
- Widget UI dev loop and gotchas: [`docs/widget-ui-dev.md`](docs/widget-ui-dev.md). Packaging: [`docs/widget-packaging.md`](docs/widget-packaging.md). E2E tiers: [`frontend/e2e/README.md`](frontend/e2e/README.md).

## Skills

- Landmarks changes: [`.agents/skills/verify-landmarks/`](.agents/skills/verify-landmarks/); update its feature map when adding coverage.
- Widget chrome: [`shadcn-anywidget`](.agents/skills/shadcn-anywidget/SKILL.md), then [`shadcn`](.agents/skills/shadcn/SKILL.md). Motion: [`cube-motion`](.agents/skills/cube-motion/SKILL.md) only when editing `Rise` / `Morph` / `leave` / `reveal`.

## Merging your own PR

Needs a green `gate` check and a conflict-free non-draft PR. Squash, delete the branch, and note what you verified. Visual changes show up as snapshot diffs in the PR; regenerate baselines on Linux CI.

**Stop and escalate to Clarence instead of merging** on:

- Unresolved review threads that need a product/design call
- Scope creep outside product rules (Visium HD, speculative chrome, new panels without an issue/brief)
- ADR / SpatialData / landmarks persistence contract breaks without an explicit decision
- Verification failed, or passing would require inventing UI/tests with no real product surface

## Releases

Follow [`docs/publishing.md`](docs/publishing.md). Before asking Clarence to test a release branch, run `scripts/release-demo-check.sh` on it (fresh venv, release build, demo notebook headless) and report its `PASS` output. Never tag or publish without Clarence's own confirmation that he tested locally.

## Product scope

Imaging and single-molecule resolved platforms; expand live landmarks chrome. Not Visium HD or spot-parity UX. Design from `DESIGN.md` plus the harness, not speculative overview mockups.
