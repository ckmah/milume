---
name: verify-landmarks
description: >-
  Verify LandmarksWidget behavior before merging using the Playwright e2e harness
  and a poteto-style feature map. Use when changing landmarks chrome, engine
  (landmarks.js), synced traitlets, selection/neighborhood UX, or landmark authoring
  modes — or when an agent needs to prove a LandmarksWidget change works end-to-end.
---

**Authoritative for LandmarksWidget verification** — overrides generic UI-motion skills when proving behavior or before merge.

# verify-landmarks

Ground truth for LandmarksWidget verification is **existing Playwright e2e**, not
new product roadmap items. Each mapped feature in [`features/`](features/) ties a
user-visible capability to real selectors, harness helpers, traitlet keys, and
named screenshot anchors.

Domain vocabulary: [`CONTEXT.md`](../../CONTEXT.md) (Landmark, Selection, Widget,
Synced state, Traitlet).

## When to use

- Before merging changes to `frontend/src/widgets/landmarks/`, `spatial_rx/static/landmarks.js`,
  landmark traitlets, or selection/neighborhood behavior.
- When an agent needs to **prove** a LandmarksWidget change works — run the relevant
  e2e spec(s) and compare against the feature map's proof criteria.
- When adding e2e coverage for a new landmark capability — add or extend a feature
  file under `features/` and link the spec path (do not invent UI that has no test).

## Harness launch

Playwright starts the Vite landmarks harness via `webServer` in
`frontend/playwright.config.ts`:

```bash
cd frontend
npm install
npm run test:e2e:install          # once: Chromium for Playwright
npm run test:e2e:landmarks        # all landmarks tier specs
```

Run a single spec or test grep:

```bash
cd frontend
npx playwright test e2e/landmarks/landmarks.spec.ts -g "zoom in/out"
npx playwright test e2e/landmarks/landmarks-tools.spec.ts -g "node mode"
```

CI path: `frontend/e2e/landmarks/` (see [`frontend/e2e/README.md`](../../frontend/e2e/README.md)).

## Doctor check (harness readiness)

Run this before driving features manually or when e2e fails mysteriously:

1. **Deps installed** — `cd frontend && npm install && npm run test:e2e:install`
2. **Harness boots** — `npm run test:e2e:landmarks` starts `dev:landmarks` on
   `http://127.0.0.1:5173` (Playwright `webServer`).
3. **Engine alive** — after `bootLandmarksHarness(page)`:
   - `.landmarks` and `canvas.landmarks__webgl` visible
   - `window.__landmarksEngine.getViewState().zoom` is finite
4. **Model hooks present** — `window.__landmarksModel.get("landmarks")` returns an array.

Helpers live in [`frontend/e2e/helpers.ts`](../../frontend/e2e/helpers.ts):
`bootLandmarksHarness`, `waitForEngine`, `getModel`, `setModel`, `getZoom`,
`canvasBox`, `shot`, `stabilizeUi`, `screenshotsEnabled`.

## Driving via Playwright

Every spec uses `test.beforeEach(async ({ page }) => bootLandmarksHarness(page))`.

| Hook | Purpose |
| --- | --- |
| `window.__landmarksModel` | Read/write synced traitlets (`getModel` / `setModel`) |
| `window.__landmarksEngine` | Viewport, overlays, inspect pin, engine-only edits |

Common traitlet keys: `landmarks`, `selections`, `mode`, `selected_kind`,
`selected_index`, `promote_tick`, `promote_buffer_tick`, `x_bounds`, `y_bounds`.

Common selectors:

- Widget shell: `page.locator(".landmarks").first()`
- Canvas: `page.locator("canvas.landmarks__webgl").first()`
- Zoom: `getByRole("button", { name: "Zoom in" \| "Zoom out" \| "Reset view" })`
- Authoring tools: `clickLandmarkTool(page, "Point" \| "Line" \| "Spline" \| "Shape")` (landmark ▾ dropdown)
- Interaction modes: `getByRole("radio", { name: "Select" \| "Node" \| "Move" \| "Probe", exact: true })`
- Selection tool: `getByRole("button", { name: /Lasso/i })` (geometry is a menu, not a ModeToggle radio)

Canvas clicks use `canvasBox(page)` for screen coordinates relative to the WebGL canvas.

## Evidence

**Functional proof** — traitlet assertions and engine overlay probes (see each feature file).

**Visual proof** — named screenshots via `shot(page, name, widget)`; canonical anchors
in [`frontend/e2e/README.md`](../../frontend/e2e/README.md):

| Name | State |
| --- | --- |
| `rest` | Soft Float chrome at rest |
| `selection-neighborhood` | Selection focused + neighborhood |
| `after-place-point` | Landmark point authored |

Snapshots run on **Linux Chromium** (CI). macOS soft-skips unless `E2E_SCREENSHOTS=1`.
Disable with `E2E_SCREENSHOTS=0`.

## Feature map

Index: [`features/README.md`](features/README.md) — one markdown file per mapped
feature with Sub-features, user path, Playwright drive steps, and gotchas.

## Cleanup

- Leave the Playwright `webServer` running if you started tests locally (`reuseExistingServer`).
- Do not commit snapshot updates unless the visual change is intentional; use
  `npm run test:e2e:update:landmarks` on Linux when updating baselines.
- Revert temporary `setModel` seeds or debug `page.evaluate` probes before committing product code.
