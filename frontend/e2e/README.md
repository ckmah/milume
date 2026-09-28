# Frontend e2e (Playwright)

Four tiers, path-gated in CI (`.github/workflows/frontend-e2e.yml`):

| Tier | When it runs | Specs |
|------|----------------|-------|
| **core** | Shared chrome changes (`src/components`, `styles`, `lib`, `hooks`, `e2e/core`) | `e2e/core/` |
| **landmarks** | Landmarks widget / harness / `e2e/landmarks` changes | `e2e/landmarks/` |
| **volume-cube** | VolumeCube widget / harness / `e2e/volume-cube` / `spatial_rx/volume_cube.py` | `e2e/volume-cube/` |
| **gallery** | Gallery widget / `e2e/gallery` changes (skips until specs exist) | `e2e/gallery/` |

Infra changes (`e2e/helpers.ts`, `playwright.config.ts`, `package-lock.json`, …) run **all** tiers.
The workflow itself only triggers when `frontend/**` (or the workflow/script) changes.

## Screenshots

Keep **2–3 visual anchors per widget** for the biggest state changes. Everything else is functional asserts only.

### Landmarks (3)

| Name | State |
|------|--------|
| `rest` | Soft Float chrome at rest |
| `selection-neighborhood` | Selection focused + neighborhood |
| `after-place-point` | Landmark point authored |

### VolumeCube (3)

| Name | State |
|------|--------|
| `rest` | Toy OME-Zarr volume loaded at default window center |
| `window-on-sphere` | Toy inspect drag offset window traits |
| `labels-off` | Labels switch off (image canvas only) |

### Core (1)

| Name | State |
|------|--------|
| `shared-chrome-rest` | Shared toolbar / docks / shadcn controls |

Obsolete Soft Float assertions removed: Selection ModeToggle radio, Inspect pin chip, near-zero line click-click path.
VolumeCube `labels-on` and `highlight-on` captures were dropped: they are not anchors and never had baselines.

Prefer `expect.poll` / web-first `expect` over `waitForTimeout`. A fixed wait is only for a
negative check that must outlast a debounce (e.g. "nothing written back" past the cube's
settle commit) and should say so in a comment.

Canonical platform: **Linux Chromium** (GitHub Actions). macOS soft-skips screenshots unless `E2E_SCREENSHOTS=1`.

The Landmarks toolbar regroup (lasso/landmark dropdowns, cube icon), panel
peek tabs, and the shared `VolumeCube` component all changed chrome pixels:
regenerate the Landmarks `rest` snapshot, the core `shared-chrome-rest`
snapshot, and the VolumeCube snapshots (`rest`, `window-on-sphere`,
`labels-off`) on Linux/CI (`npm run test:e2e:update:landmarks` /
`test:e2e:update:core` / `test:e2e:update:volume-cube`) rather than trusting a
locally-generated baseline.

## Run locally

```bash
cd frontend
npm install
npx playwright install chromium
npm run test:e2e:core
npm run test:e2e:landmarks
npm run test:e2e:volume-cube
# or everything:
npm run test:e2e
```

Update snapshots (Linux / CI / Docker):

```bash
npm run test:e2e:update:landmarks
npm run test:e2e:update:volume-cube
# or workflow_dispatch with update_snapshots=true, then download the artifact
```

```bash
npm run test:e2e:mac          # functional; screenshots skipped by default
E2E_SCREENSHOTS=0 npm run test:e2e
```

Harness: Vite per tier via `playwright.config.ts` `webServer` (`dev:landmarks` default;
`E2E_HARNESS=volume-cube` for volume-cube tier; `E2E_HARNESS=landmarks-volume` for
`landmarks-volume.spec.ts`, a Landmarks harness with a toy SpatialData that
also has a 3D image, so its Inspect cube opens).

`npm run test:e2e:landmarks` already runs both: the `landmarks-volume` harness
against `landmarks-volume.spec.ts`, then the default `dev:landmarks` harness
against the rest of `e2e/landmarks/`.

Hooks:

- Landmarks: `window.__landmarksEngine` / `__landmarksModel`
- VolumeCube: `window.__volumeCubeModel` (harness exposes mock model)

## CI artifacts

Per-tier HTML report + test-results (failure screenshots / traces / videos).
Videos are `retain-on-failure` only.
