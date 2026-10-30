# Widget UI dev — quick reference

Notebook-free harness for Landmarks chrome + canvas. UI changes are verified here (including the simulated-molab harness specs); UI PRs do not require marimo. marimo e2e (`frontend/e2e/marimo/`) is only for Python API and kernel interactions.

## Chrome iteration (no notebook)

```bash
cd frontend && npm run dev:landmarks
```

Open http://localhost:5173 — mock traitlet state from `frontend/dev/fixture.json`.

Edit under `frontend/src/widgets/landmarks/` (`chrome/`, `LandmarksView.tsx`, `landmarks.css`, …). Vite HMR reloads on save.

Refresh mock data after Python traitlet changes:

```bash
cd frontend && npm run dev:fixture
```

## Widget UI design loop (impeccable)

Authority: `frontend/PRODUCT.md`, `frontend/DESIGN.md`, and `frontend/.impeccable/surfaces/landmarks-chrome.md`.

```bash
cd frontend && npm run dev:landmarks
```

Edit under `frontend/src/widgets/landmarks/`. After each edit batch, the project hook runs `impeccable` on UI files (Cursor: `.cursor/hooks.json` on Write; Claude Code: `.claude/settings.json`). It warns only and never blocks. Config and scoped ignores live in `frontend/.impeccable/config.json`.

Box agents and one-off checks:

```bash
IMPECCABLE_NO_TELEMETRY=1 .cursor/skills/impeccable/scripts/impeccable detect --json frontend/src/widgets/landmarks
```

Rendered scan (same rules as CI, needs the dev server above on port 5173):

```bash
cd frontend && DESIGN_SCAN_PORT=5173 node scripts/design-scan.mjs --ci
```

Triage every finding: fix it, or `impeccable hooks ignore-value … --reason "Agent: …"` for a narrow false positive. Do not use `ignore-rule` / `ignore-file` without Clarence.

CI runs warn-only `impeccable detect --github` plus `design-scan --ci` in the `e2e-landmarks (default)` job. Primary findings are logged but do not fail the job. The step becomes strict on primary findings after about two quiet weeks.

## Notebook integration check

```bash
cd frontend && npm run watch:landmarks
ANYWIDGET_HMR=1 uv run --group demo marimo edit demos/landmarks.py
```

Uses real AnnData and kernel sync; not a substitute for the harness, but required before release.

## Ship bundles

```bash
cd frontend && npm run build
git add milume/static/bundled/
```

CI runs the same build; consumers never need Node.

## Cheat sheet

| Goal | Command |
| ---- | ------- |
| Fast UI edits | `npm run dev:landmarks` |
| Refresh mock state | `npm run dev:fixture` |
| Design detect (source) | `.cursor/skills/impeccable/scripts/impeccable detect --json src/widgets/landmarks` |
| Rendered design scan | dev server + `node scripts/design-scan.mjs --ci` |
| Real data / traitlets | `watch:landmarks` + marimo demo |
| Inspect cube, real xsmall | `dev:fixture:volume-xsmall-if-missing` then `dev:landmarks-volume-xsmall` |
| Inspect cube, Pyxa small | `dev:fixture:volume-small-if-missing` then `dev:landmarks-volume-small` |
| Warm HF demo trees only | `cd frontend && npm run dev:prefetch:hf-demo` |
| Typecheck | `npm run typecheck` |
| Publish bundles | `npm run build` |

## Harness layout

```
frontend/dev/
├── index.html          live inject target
├── main.tsx            mounts HarnessShell (theme toggle + marimo preview)
├── HarnessShell.tsx    notebook context wrapper
├── mock-model.ts       fake traitlets model
├── fixture.json        generated mock state
└── export-fixture.py   regenerate fixture.json
```

Design authority: `frontend/DESIGN.md`, `frontend/PRODUCT.md`.

## Authoring against a real notebook

Use anywidget file-watch HMR, not the Vite dev server:

```bash
cd frontend && npm run watch:landmarks
ANYWIDGET_HMR=1 uv run --group demo marimo edit demos/<demo>.py
```

Landmarks-with-a-cube harness (Playwright / manual, toy SpatialData with a 3D image):
`cd frontend && npm run dev:landmarks-volume`.

Real Pyxa tissue for inspect work (HF `Stellaromics/demo` `xsmall/`, not used in CI):

```bash
cd frontend && npm run dev:fixture:volume-xsmall   # once: HF download, Pyxa labels + mosaic, export zarr + JSON
cd frontend && npm run dev:landmarks-volume-xsmall
```

## Gotchas

| Situation | Do |
| --- | --- |
| Checking a real notebook | Rebuild bundles, then start your **own** `marimo run --headless --port <free>` (a running kernel keeps the old `_esm`). Never stop other marimo / napari processes. |
| Reading widget DOM | anywidgets render in shadow roots: query recursively through `shadowRoot`; e2e reads `data-*` state attributes (scope cube selectors to `.volume-cube__view`). |
| Timing renders in the browser pane | A hidden pane throttles `requestAnimationFrame` to ~1 Hz. Time `deck.redraw()` + `gl.readPixels`, not rAF. |
| Viv / luma shaders | All raycast samplers `sampler3D`; module name ≠ sampler name; 3D texture axes ≤ 2048; separate extension classes per mode (see `frontend/src/widgets/volume-cube/`). |
| marimo reactivity | A cell reading a UI element re-runs when it changes: define controls in the cell that displays them, or better, in the widget ([ADR 0005](adr/0005-widget-owns-rendering-controls.md)). |
| Screenshots | Linux CI only: run the `frontend-e2e` workflow with `update_snapshots=true` on the pushed branch, download the artifacts, commit them. |
| deck.gl / luma.gl versions | Pinned once in `frontend/package.json` (`overrides`) and aliased in `frontend/vite.config.ts`; each widget ships its own bundled `.mjs`. |
