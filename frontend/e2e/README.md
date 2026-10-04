# Frontend e2e (Playwright)

Two tiers, path-gated in CI (`.github/workflows/frontend-e2e.yml`):

| Tier | When it runs | Specs |
|------|----------------|-------|
| **core** | Shared chrome changes (`src/components`, `styles`, `lib`, `hooks`, `e2e/core`) | `e2e/core/` |
| **landmarks** | Landmarks widget / harness / `e2e/landmarks` changes | `e2e/landmarks/` |

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

### Core (1)

| Name | State |
|------|--------|
| `shared-chrome-rest` | Shared toolbar / docks / shadcn controls |

Obsolete Soft Float assertions removed: Selection ModeToggle radio, Inspect pin chip, near-zero line click-click path.

Prefer `expect.poll` / web-first `expect` over `waitForTimeout`. A fixed wait is only for a
negative check that must outlast a debounce (e.g. "nothing written back" past the cube's
settle commit) and should say so in a comment.

Canonical platform: **Linux Chromium** (GitHub Actions). macOS soft-skips screenshots unless `E2E_SCREENSHOTS=1`.

The Landmarks toolbar regroup (lasso/landmark dropdowns, cube icon), panel
peek tabs all changed chrome pixels: regenerate the Landmarks `rest` snapshot and
the core `shared-chrome-rest` snapshot on Linux/CI (`npm run test:e2e:update:landmarks` /
`test:e2e:update:core`) rather than trusting a locally-generated baseline.

## Run locally

```bash
cd frontend
npm install
npx playwright install chromium
npm run test:e2e:core
npm run test:e2e:landmarks
# or everything:
npm run test:e2e
```

Update snapshots (Linux / CI / Docker):

```bash
npm run test:e2e:update:landmarks
# or workflow_dispatch with update_snapshots=true, then download the artifact
```

```bash
npm run test:e2e:mac          # functional; screenshots skipped by default
E2E_SCREENSHOTS=0 npm run test:e2e
```

Harness: Vite per tier via `playwright.config.ts` `webServer` (`dev:landmarks` default;
`E2E_HARNESS=landmarks-volume` for
`landmarks-volume.spec.ts`, a Landmarks harness with a toy SpatialData that
also has a 3D image, so its Inspect cube opens).

`npm run test:e2e:landmarks` already runs both: the `landmarks-volume` harness
against `landmarks-volume.spec.ts`, then the default `dev:landmarks` harness
against the rest of `e2e/landmarks/`.

Hooks:

- Landmarks: `window.__landmarksEngine` / `__landmarksModel`

### One page per worker

Specs import `test` from `e2e/fixtures.ts`, not from `@playwright/test`. Each
worker boots the harness once and keeps the page; later tests call the boot
helper, which remounts the widget in place through `window.__harnessReset`
(fresh model, fresh engine). Between tests the fixture releases the mouse and
modifier keys, drops routes and page listeners, restores the viewport and
reloads plain `/` if a test used `?window=` / `?budgets=`. The HTTP cache stays
disabled, so progressive loads still show their coarse level.

- 4 workers locally (2 on CI, `E2E_WORKERS` overrides). On macOS outside CI
  Chromium runs on the Metal GPU (`E2E_GPU=0` falls back to SwiftShader, which
  Linux CI always uses). Both Landmarks tiers take about 50–70 s locally.
- Tag a test `{ tag: "@isolated" }` when it needs a fresh page: anything using
  `page.addInitScript`, or state a remount cannot undo.
- No state may leak between tests: module-level state in the widget or the
  harness has to be reset in `__harnessReset` (`dev/HarnessShell.tsx`,
  `dev/landmarks-volume/main.tsx`), and a test must not rely on running first.

## CI artifacts

Per-tier HTML report + test-results (failure screenshots / traces / videos).
Videos are `retain-on-failure` only.
