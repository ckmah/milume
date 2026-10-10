# AGENTS.md

Guidance for agents working in **milume**. Rules that can be checked are enforced by
tooling, not listed here: run `cd frontend && npm run verify` before merging (it picks
the checks for your diff from [`.github/e2e-tiers.json`](.github/e2e-tiers.json)).

| Rule | Enforced by |
| ---- | ----------- |
| Landmarks UI issues have Outcome, Acceptance, and Visual acceptance | [`.github/ISSUE_TEMPLATE/landmarks-ui.yml`](.github/ISSUE_TEMPLATE/landmarks-ui.yml) (required fields); `npm run check:widget-issue`; linked issues when a UI PR says `Closes #N` ([`pr-policy.yml`](.github/workflows/pr-policy.yml)) |
| UI PRs link the issue they close (`Closes #N` / `Fixes #N` in the body, including drafts) | `npm run check:pr-policy` / [`pr-policy.yml`](.github/workflows/pr-policy.yml) |
| Ready UI PRs embed screenshots or video in the body (not only Actions artifacts) | `npm run check:pr-policy` / [`pr-policy.yml`](.github/workflows/pr-policy.yml) |
| Playwright runs on UI changes; artifact pointers posted on PRs | [`frontend-e2e.yml`](.github/workflows/frontend-e2e.yml) `post-ui-evidence-comment` |
| Widget chrome uses shadcn primitives, scoped CSS, cube-motion channels | `npm run check:chrome` |
| Right e2e tier for the diff | `npm run verify` + [`.github/e2e-tiers.json`](.github/e2e-tiers.json) |
| Merge only on green `gate`, non-draft, conflicts resolved | Branch protection + [`frontend-e2e.yml`](.github/workflows/frontend-e2e.yml) `gate` job |

- **Draft UI PRs:** keep PRs in draft while iterating. Draft runs the fast tier (`test`, `e2e-core`, landmarks default harness) without volume shards. Mark **ready for review** (or add the `ui-evidence` label / run the **UI evidence** workflow) to capture screenshots for the PR body before merge.

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
- A stacked PR whose ancestor is not yet merged and verified

## Product scope

Imaging and single-molecule resolved platforms; expand live landmarks chrome. Not Visium HD or spot-parity UX. Design from `DESIGN.md` plus the harness, not speculative overview mockups.
