---
name: verify-volume-cube
description: >-
  Verify VolumeCubeWidget behavior before merging using the Playwright e2e harness
  and a poteto-style feature map. Use when changing volume-cube chrome, Viv
  integration, OME-Zarr loading, window traitlets, or the Landmarks inspect-window
  contract — or when an agent needs to prove a VolumeCube change works end-to-end.
---

**Authoritative for VolumeCubeWidget verification** — overrides generic UI-motion skills when proving behavior or before merge.

# verify-volume-cube

Ground truth for VolumeCubeWidget verification is **existing Playwright e2e**, not
new product roadmap items. Each mapped feature in [`features/`](features/) ties a
user-visible capability to real selectors, harness helpers, traitlet keys, and
named screenshot anchors.

Domain vocabulary: [`CONTEXT.md`](../../CONTEXT.md) (Widget, Synced state, Traitlet).

## When to use

- Before merging changes to `frontend/src/widgets/volume-cube/`, `spatial_rx/volume_cube.py`,
  Viv/OME-Zarr wiring, or `window_*` traitlets consumed from Landmarks inspect mode.
- When an agent needs to **prove** a VolumeCube change works — run the relevant
  e2e spec(s) and compare against the feature map's proof criteria.
- When adding e2e coverage for a new volume-cube capability — add or extend a feature
  file under `features/` and link the spec path (do not invent UI that has no test).

## Harness launch

Playwright starts the Vite volume-cube harness via `webServer` in
`frontend/playwright.config.ts` when `E2E_HARNESS=volume-cube`:

```bash
cd frontend
npm install
npm run test:e2e:install          # once: Chromium for Playwright
npm run test:e2e:volume-cube      # all volume-cube tier specs
```

Run a single spec or test grep:

```bash
cd frontend
npx playwright test e2e/volume-cube/volume-cube.spec.ts -g "harness boots"
```

For the Landmarks Inspect → cube path (its own product surface now, not a
second linked widget), use `E2E_HARNESS=landmarks-volume` and
[verify-landmarks's `inspect-cube` feature](../verify-landmarks/features/inspect-cube.md):

```bash
cd frontend
E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts
```

CI path: `frontend/e2e/volume-cube/` (see [`frontend/e2e/README.md`](../../frontend/e2e/README.md)).

Manual harness (no Playwright):

```bash
cd frontend && npm run dev:volume-cube
# open http://127.0.0.1:5173 — toy OME-Zarr in frontend/dev/volume-cube/public/
```

## Doctor check (harness readiness)

Run this before driving features manually or when e2e fails mysteriously:

1. **Deps installed** — `cd frontend && npm install && npm run test:e2e:install`
2. **Harness boots** — `npm run test:e2e:volume-cube` starts `dev:volume-cube` on
   `http://127.0.0.1:5173` (Playwright `webServer` with `E2E_HARNESS=volume-cube`).
3. **Volume alive** — after `bootVolumeCubeHarness(page)`:
   - `.volume-cube` visible
   - `getByRole("button", { name: "Reset" })` visible
   - no `"Loading volume…"` text
   - at least one `canvas` inside `.volume-cube`
4. **Model hooks present** — `window.__volumeCubeModel.get("window_cx")` is finite.

Helpers live in [`frontend/e2e/helpers.ts`](../../frontend/e2e/helpers.ts):
`bootVolumeCubeHarness`, `waitForVolumeCube`, `getVolumeModel`, `setVolumeModel`,
`volumeCubeWidget`, `toyInspectBox`, `shot`, `stabilizeUi`, `screenshotsEnabled`.

## Driving via Playwright

Every spec uses `test.beforeEach(async ({ page }) => bootVolumeCubeHarness(page))`.

| Hook | Purpose |
| --- | --- |
| `window.__volumeCubeModel` | Read/write synced traitlets (`getVolumeModel` / `setVolumeModel`) |
| Toy inspect panel | Drag a 100 µm square on the harness-only tissue mock (sets `window_cx` / `window_cy`) |

Common traitlet keys: `image_url`, `labels_url`, `window_cx`, `window_cy`, `window_size_um`,
`slice_x_min`, `slice_x_max`, `slice_y_min`, `slice_y_max`, `slice_z_min`, `slice_z_max`.

Common selectors:

- Widget shell: `page.locator(".volume-cube").first()` or `volumeCubeWidget(page)`
- Reset: `getByRole("button", { name: "Reset" })`
- Labels overlay: `getByRole("switch", { name: "Labels" })`
- Window + slice readout: text matching `/window \\d+, \\d+ · 100 µm · X \\d+–\\d+ · Y \\d+–\\d+ · Z \\d+–\\d+/`
- Toy inspect drag target: `toyInspectBox(page)` (harness-only; not shipped in the widget)

## Landmarks inspect-window contract (cross-widget)

`LandmarksWidget(sdata)` renders its own floating Cube from `inspect_cx`,
`inspect_cy`, and `inspect_size_um` directly — no second widget, no glue
cell. That path is proved under verify-landmarks
([`inspect-cube`](../verify-landmarks/features/inspect-cube.md),
`E2E_HARNESS=landmarks-volume`), since it is Landmarks' own product surface
(see [ADR 0006](../../docs/adr/0006-landmarks-hosts-volume-cube.md)).

Manually copying `inspect_cx`/`inspect_cy` onto a separate standalone
`VolumeCubeWidget`'s `window_cx`/`window_cy` (as `demos/volume-cube.py` still
shows) remains possible but has no Playwright coverage — the notebook-link
harness and its spec are gone. The Playwright harness here simulates only the
standalone widget's own window placement with **Toy inspect** (drag a 100 µm
square) in `dev/volume-cube/`; prove that via
[`features/inspect-window-placement.md`](features/inspect-window-placement.md).

## Evidence

**Functional proof** — traitlet assertions, canvas count for labels on/off, window readout text.

**Visual proof** — named screenshots via `shot(page, name, widget)`; canonical anchors
in [`frontend/e2e/README.md`](../../frontend/e2e/README.md):

| Name | State |
| --- | --- |
| `rest` | Volume loaded at default window center |
| `window-on-sphere` | Toy inspect drag offset window traits |
| `labels-off` | Labels switch off (single canvas) |

Snapshots run on **Linux Chromium** (CI). macOS soft-skips unless `E2E_SCREENSHOTS=1`.
Disable with `E2E_SCREENSHOTS=0`.

## Feature map

Index: [`features/README.md`](features/README.md) — one markdown file per mapped
feature with Sub-features, user path, Playwright drive steps, and gotchas.

## Cleanup

- Leave the Playwright `webServer` running if you started tests locally (`reuseExistingServer`).
- Do not commit snapshot updates unless the visual change is intentional; use
  `npm run test:e2e:update:volume-cube` on Linux when updating baselines.
- Revert temporary `setVolumeModel` seeds or debug `page.evaluate` probes before committing product code.
