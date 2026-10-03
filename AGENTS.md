# AGENTS.md

Guidance for agents working in **milume**. Rules that can be checked are enforced by
tooling, not listed here: run `cd frontend && npm run verify` before merging (it picks
the checks for your diff from [`.github/e2e-tiers.json`](.github/e2e-tiers.json)).

- Domain language: [`CONTEXT.md`](CONTEXT.md). Architecture decisions: [`docs/adr/`](docs/adr/). Roadmap: [`ROADMAP.md`](ROADMAP.md).
- Product and design authority: [`frontend/PRODUCT.md`](frontend/PRODUCT.md), [`frontend/DESIGN.md`](frontend/DESIGN.md).
- Widget UI dev loop and gotchas: [`docs/widget-ui-dev.md`](docs/widget-ui-dev.md). Packaging: [`docs/widget-packaging.md`](docs/widget-packaging.md). E2E tiers: [`frontend/e2e/README.md`](frontend/e2e/README.md).

## Skills

- Landmarks changes: [`.agents/skills/verify-landmarks/`](.agents/skills/verify-landmarks/); update its feature map when adding coverage.
- Widget chrome: [`shadcn-anywidget`](.agents/skills/shadcn-anywidget/SKILL.md), then [`shadcn`](.agents/skills/shadcn/SKILL.md). Motion: [`cube-motion`](.agents/skills/cube-motion/SKILL.md) only when editing `Rise` / `Morph` / `leave` / `reveal`.

## Merging your own PR

Needs a green `gate` check, a conflict-free non-draft PR, and, for user-visible chrome or canvas, visual evidence on the PR ([`post-playwright-visuals.sh`](.github/scripts/post-playwright-visuals.sh)). Squash, delete the branch, and note what you verified.

**Stop and escalate to Clarence instead of merging** on:

- Unresolved review threads that need a product/design call
- Scope creep outside product rules (Visium HD, speculative chrome, new panels without an issue/brief)
- ADR / SpatialData / landmarks persistence contract breaks without an explicit decision
- Verification failed, or passing would require inventing UI/tests with no real product surface
- A stacked PR whose ancestor is not yet merged and verified

## Product scope

Imaging and single-molecule resolved platforms; expand live landmarks chrome. Not Visium HD or spot-parity UX. Design from `DESIGN.md` plus the harness, not speculative overview mockups.
