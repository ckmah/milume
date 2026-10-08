# Widget UI dev — quick reference

Notebook-free harness for Landmarks chrome + canvas. Marimo remains the integration check before ship.

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

## Impeccable live (visual variants)

Requires the dev server above.

```bash
# terminal 1
cd frontend && npm run dev:landmarks

# terminal 2 — repo root
node .agents/skills/impeccable/scripts/live.mjs --target frontend/dev/index.html

# terminal 3 — repo root (poll loop; or ask the agent for $impeccable live)
node .agents/skills/impeccable/scripts/live-poll.mjs
```

Select elements in the browser, generate variants, accept to write source. Live config: `frontend/.impeccable/live/config.json`.

## Notebook integration check

```bash
cd frontend && npm run watch:landmarks
ANYWIDGET_HMR=1 uv run --extra demo marimo edit demos/landmarks.py
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
| Live variant mode | dev server + `live.mjs` + `live-poll.mjs` |
| Real data / traitlets | `watch:landmarks` + marimo demo |
| Inspect cube, real xsmall | `dev:fixture:volume-xsmall` then `dev:landmarks-volume-xsmall` |
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
ANYWIDGET_HMR=1 uv run --extra demo marimo edit demos/<demo>.py
```

Landmarks-with-a-cube harness (Playwright / manual, toy SpatialData with a 3D image):
`cd frontend && npm run dev:landmarks-volume`.

Real Pyxa tissue for inspect work (HF `Stellaromics/demo` `xsmall/`, not used in CI):

```bash
cd frontend && npm run dev:fixture:volume-xsmall   # once: download + export zarr + JSON
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
