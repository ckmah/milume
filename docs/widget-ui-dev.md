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
