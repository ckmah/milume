# AGENTS.md

Guidance for agents working in **spatial-rx**.

Domain language: [`CONTEXT.md`](CONTEXT.md).

Before merging LandmarksWidget changes, verify behavior via Playwright e2e and the feature map in [`.agents/skills/verify-landmarks/`](.agents/skills/verify-landmarks/). Before merging VolumeCubeWidget changes, use [`.agents/skills/verify-volume-cube/`](.agents/skills/verify-volume-cube/). Full gate: [Merge policy](#merge-policy). Active roadmap: [`ROADMAP.md`](ROADMAP.md).

## Skills precedence

When multiple skills could apply, follow this order:

1. **Behavioral proof / before merge widget changes**
   - Landmarks: [`.agents/skills/verify-landmarks/`](.agents/skills/verify-landmarks/)
   - VolumeCube: [`.agents/skills/verify-volume-cube/`](.agents/skills/verify-volume-cube/)
2. **Widget chrome composition** — [`.agents/skills/shadcn-anywidget/SKILL.md`](.agents/skills/shadcn-anywidget/SKILL.md), then [`.agents/skills/shadcn/SKILL.md`](.agents/skills/shadcn/SKILL.md)
3. **Motion primitives already in use** — [`.agents/skills/cube-motion/SKILL.md`](.agents/skills/cube-motion/SKILL.md) only when editing `Rise` / `Morph` / `leave` / `reveal` usage

Soft Float chrome plus Playwright proofs are the standard for widget work on user-visible surfaces.

## Merge policy

Less-supervision gate for agents merging their own PRs. CI green alone is not a verdict.

**Agents may merge their own PR only when all applicable gates pass:**

1. CI green on the head commit.
2. Merge conflicts resolved; PR not left as draft when intending to land.
3. Verification PASS by change class:
   - **LandmarksWidget / landmarks surface** (`frontend/src/widgets/landmarks/`, `spatial_rx/static/landmarks.js`, landmark traitlets, selection/neighborhood UX): run relevant Playwright + match [verify-landmarks feature map](.agents/skills/verify-landmarks/) proof criteria for touched mapped capabilities; update the map when adding coverage.
   - **VolumeCubeWidget / volume-cube surface** (`frontend/src/widgets/volume-cube/`, `spatial_rx/volume_cube.py`, Viv/OME-Zarr wiring, `window_*` traitlets): run `npm run test:e2e:volume-cube` + match [verify-volume-cube feature map](.agents/skills/verify-volume-cube/) proof criteria for touched capabilities; update the map when adding coverage.
   - **Other UI with a Playwright tier**: run the path-gated e2e that covers the change ([`frontend/e2e/README.md`](frontend/e2e/README.md), [`.github/workflows/frontend-e2e.yml`](.github/workflows/frontend-e2e.yml)).
   - **Docs / AGENTS / skills / non-runtime only**: feature-map not required; CI + conflict-free is enough unless the PR also touches runtime UI.
4. Visual evidence on the PR when the change is user-visible chrome or canvas ([`.github/scripts/post-playwright-visuals.sh`](.github/scripts/post-playwright-visuals.sh) or equivalent proof on the PR). Docs-only skips this.

**Do not merge — stop and escalate to the human (Clarence):**

- Unresolved review threads that need a product/design call
- Scope creep outside product rules (Visium HD, speculative chrome, new panels without an issue/brief)
- ADR / SpatialData / landmarks persistence contract breaks without an explicit decision
- Verification failed, or the only way to pass would be inventing UI/tests that have no real product surface
- Dependent/stacked PR whose ancestor is not yet merged and verified

**How to merge:** prefer squash + delete branch. Leave a brief PR note of what was verified (spec names / feature map files).

## Patterns and anti-patterns

Durable do/don't rules for agents. Prefer short tables over prose; vocabulary matches [`CONTEXT.md`](CONTEXT.md).

### Data and Python

| Prefer | Avoid |
| --- | --- |
| Hold a **reference** to the caller's AnnData; pack genes at construct as designed ([`CONTEXT.md`](CONTEXT.md)) | `obs.copy()`, densifying full `X`, inventing a second CRS for landmarks ([`docs/landmarks-spatialdata-contract.md`](docs/landmarks-spatialdata-contract.md)) |
| Landmark persistence via `landmarks_to_geodataframe` / `geodataframe_to_landmarks` | Treating selections as SpatialData geometry export (M1 contract) |
| Selection hits via `obs_names` / `get_obs_names` / `assign_obs_mask` | Positional indices for selection membership |
| Neighborhood expand in the browser from coordinates | Required or synced `obsp` neighbor graphs |
| `LandmarksWidget(sdata)` infers table / labels / 3D image / frame (`volume_source.py`); test with `tests.helpers.toy_spatialdata` | Asking callers for paths or keys the SpatialData metadata already holds |
| New synced traits only for values Python reads or sets; one compact trait per concern (base64 arrays, one config dict) | A trait per rendering control, or re-sending per-cell data on interaction |
| Loopback serving scoped to the element dirs the browser needs (`serve_directory(..., allow_prefixes=)`) | Serving a whole store (tables, expression) to any local page |

### Chrome and packaging

| Prefer | Avoid |
| --- | --- |
| shadcn/ReUI primitives for chrome; Soft Float patterns already in landmarks ([`frontend/DESIGN.md`](frontend/DESIGN.md), [Widgets](#widgets)) | Hand-rolled buttons/panels when a UI primitive exists; painting host `:root` (scope tokens under widget / Soft Float) |
| `_esm` as `pathlib.Path` to bundled `.mjs`; anywidget HMR watch flow ([Widget UI development](#widget-ui-development), [`docs/widget-packaging.md`](docs/widget-packaging.md)) | `.read_text()` on bundle; pointing `_esm` at Vite `localhost:5173` |

### Verification and PRs

| Prefer | Avoid |
| --- | --- |
| Follow [Merge policy](#merge-policy) verification by change class; update verify-landmarks / verify-volume-cube feature maps when adding coverage | Merging on CI green alone — see [Merge policy](#merge-policy) |
| Path-gated e2e tiers ([`frontend/e2e/README.md`](frontend/e2e/README.md), [`.github/workflows/frontend-e2e.yml`](.github/workflows/frontend-e2e.yml)) | Inventing UI in e2e/feature map that has no real product surface |
| PR visual comments via [`.github/scripts/post-playwright-visuals.sh`](.github/scripts/post-playwright-visuals.sh) | — |
| Resolve merge conflicts before marking a PR ready for review | — |

### Product scope

| Prefer | Avoid |
| --- | --- |
| Imaging / single-molecule resolved platforms; expand live landmarks chrome ([`frontend/PRODUCT.md`](frontend/PRODUCT.md)) | Visium HD / spot-parity UX; speculative overview mockups as the design process (use [`frontend/DESIGN.md`](frontend/DESIGN.md) + harness; see [`docs/widget-ui-dev.md`](docs/widget-ui-dev.md)) |

### Architecture (ADRs)

| Prefer | Avoid |
| --- | --- |
| Prebuilt bundles in the wheel; consumers never need Node ([ADR 0001](docs/adr/0001-prebuilt-bundles-node-free-install.md)) | Node at `pip install`, CDN runtime bundles, or EsmWidget CDN imports without a build step |
| Named traitlets as the widget contract ([ADR 0002](docs/adr/0002-named-traitlets-as-widget-contract.md)) | Single generic `data` JSON blob for library widgets |
| One deck.gl orthographic `Deck` for all geometry ([ADR 0003](docs/adr/0003-deckgl-landmarks-renderer.md)) | A second 2D canvas camera that drifts from the deck.gl viewport |
| Client-side neighborhood overlay from coordinates ([ADR 0004](docs/adr/0004-neighborhood-visuals.md)) | Syncing or requiring `obsp` CSR graphs for expand visuals |
| Rendering controls in widget chrome; sync a trait only when Python reads/sets it; commit on release ([ADR 0005](docs/adr/0005-widget-owns-rendering-controls.md)) | Notebook sliders as a widget's control panel; two owners for one trait |
| `LandmarksWidget(sdata)` infers and renders its own volume cube, sharing `VolumeCube` with the standalone widget ([ADR 0006](docs/adr/0006-landmarks-hosts-volume-cube.md)) | A notebook glue cell linking two widgets' traits for one gesture |

## Widgets

React/shadcn widgets live in `frontend/src/widgets/`. Canvas drawing for landmarks
stays in `spatial_rx/static/landmarks.js` (`mountEngine`) and is bundled with the
React chrome.

**Widget UI must use shadcn/ui primitives** from `frontend/src/components/ui/`.
Compose with `@/components/ui/*` (Button, Card, Slider, Field, Accordion, etc.).
Add missing components via `npx shadcn@latest add` from `frontend/`; the **ReUI**
registry (`@reui/*`, free `c-*` components) is configured in `frontend/components.json`.
Do not hand-roll styled `div`/`button`/`input` markup when a shadcn or ReUI component exists. See
[`.agents/skills/shadcn-anywidget/SKILL.md`](.agents/skills/shadcn-anywidget/SKILL.md)
and [`.agents/skills/shadcn/SKILL.md`](.agents/skills/shadcn/SKILL.md).

When adding or changing a React/shadcn widget: read
[`.agents/skills/shadcn-anywidget/SKILL.md`](.agents/skills/shadcn-anywidget/SKILL.md).
Architecture: [`docs/widget-packaging.md`](docs/widget-packaging.md),
[`docs/widget-scaffold.md`](docs/widget-scaffold.md).

## Widget UI development

Use anywidget file-watch HMR (not the Vite dev server):

```bash
cd frontend && npm run watch:landmarks
ANYWIDGET_HMR=1 uv run --extra demo marimo edit demos/<demo>.py
```

VolumeCube harness (Playwright / manual):

```bash
cd frontend && npm run dev:volume-cube
```

Landmarks-with-a-cube harness (Playwright / manual, toy SpatialData with a 3D image):

```bash
cd frontend && npm run dev:landmarks-volume
```

### Working efficiently here (lessons from past sessions)

| Situation | Do |
| --- | --- |
| Windows shell | npm scripts use `VAR=x`: `export npm_config_script_shell="C:/Program Files/Git/bin/bash.exe"` first; build one widget with `SPATIAL_RX_BUILD_WIDGET=<name> npx vite build`, **landmarks last** (it rewrites the shared `widgets.css`). Bundles are git-ignored. |
| Checking a real notebook | Rebuild bundles, then start your **own** `marimo run --headless --port <free>` (a running kernel keeps the old `_esm`). Never stop other marimo / napari processes. |
| Reading widget DOM | anywidgets render in shadow roots: query recursively through `shadowRoot`; e2e reads `data-*` state attributes (scope cube selectors to `.volume-cube__view`). |
| Timing renders in the browser pane | A hidden pane throttles `requestAnimationFrame` to ~1 Hz. Time `deck.redraw()` + `gl.readPixels`, not rAF. |
| Viv / luma shaders | All raycast samplers `sampler3D`; module name ≠ sampler name; 3D texture axes ≤ 2048; separate extension classes per mode ([`verify-volume-cube/features/labels-toggle.md`](.agents/skills/verify-volume-cube/features/labels-toggle.md) Gotchas). |
| marimo reactivity | A cell reading a UI element re-runs when it changes: define controls in the cell that displays them, or better, in the widget (ADR 0005). |
| Screenshots | Linux CI only: run the `frontend-e2e` workflow with `update_snapshots=true` on the pushed branch, download the artifacts, commit them. |
| Tests | Keep tests that pin a feature, API contract or fixed regression; skip tests of private constants or internal call shapes. |

## deck.gl / luma.gl (frontend)

Landmarks and VolumeCube (Viv) share one **root** stack in `frontend/package.json`:

- `@deck.gl/*@9.2.11`, `@luma.gl/*@9.2.6`, `@loaders.gl/core@4.3.4`
- `overrides` dedupe Viv's nested peers to those versions

Each widget still ships as its **own** bundled `.mjs`; notebook cells do not share a
runtime Deck instance. Path `_esm` is loaded via blob URL — no sibling chunk imports.
Vite aliases all `@deck.gl/*` and `@luma.gl/*` imports to the root copies during every
widget build (`frontend/vite.config.ts`).

Viv dev harnesses (`dev:volume-cube`, `dev:landmarks-volume`) use default Vite
`optimizeDeps`; the plain landmarks harness (`dev:landmarks`, no 3D image) excludes
`@hms-dbmi/viv` from pre-bundling, since it never opens a cube.

`_esm` must remain a `pathlib.Path` to the bundled `.mjs` — see
[Chrome and packaging](#chrome-and-packaging) and [`docs/widget-packaging.md`](docs/widget-packaging.md).
