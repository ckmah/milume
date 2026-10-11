# Marimo kernel e2e (volume comm)

Playwright drives a **real** `marimo run` kernel (not the Vite harness) so
`volume_get` binary payloads flow through marimo’s anywidget bridge (`DataView`
buffers on `msg:custom`).

- **Notebook:** CI uses `fixtures/toy-landmarks.marimo.py` (fast). Locally you can
  run `demos/landmarks.py` (Stellaromics `small/`; prefetch via
  `scripts/prefetch-marimo-e2e-data.py`).
- **Origin:** non-loopback host from `scripts/marimo-e2e-host.mjs` (molab-style).
- **CI tier:** `marimo_volume` in `.github/e2e-tiers.json` (volume-cube /
  `volume_comm.py` changes only).

```bash
cd frontend
npm run build
uv sync --extra demo   # repo root
uv run --extra demo python scripts/prefetch-marimo-e2e-data.py  # optional warm cache
npm run test:e2e:marimo-volume
```

Fast local loop (toy SpatialData, not the Pyxa demo):

```bash
E2E_MARIMO_NOTEBOOK=frontend/e2e/marimo/fixtures/toy-landmarks.marimo.py npm run test:e2e:marimo-volume
```

**CI job** (`e2e-marimo-volume` in `frontend-e2e.yml`): toy `landmarks-selection.spec.ts`, then
`landmarks-inspect.spec.ts -g "non-localhost"` on `demos/landmarks.py`, then Pyxa molab
`landmarks-selection-molab.spec.ts` + `landmarks-molab-pyxa-shell.spec.ts` (`playwright.marimo-pyxa.config.ts`).
Iframe shell (`landmarks-molab-iframe.spec.ts`) is **local-only** (skipped when `CI=true`).
CI runs the same molab assertions on the marimo page via `landmarks-molab-pyxa-shell.spec.ts`
(zero-height grow + CSS scale). Local iframe: `npm run test:e2e:marimo-pyxa-iframe`.

### Iterate on one spec (reuse the kernel)

Playwright configs set `reuseExistingServer: !CI`. Keep `marimo run` up, then rerun only
the failing grep — no full `test:e2e:marimo-volume` loop.

```bash
# terminal 1 (repo root): Pyxa molab notebook
export E2E_MARIMO_NOTEBOOK=frontend/e2e/marimo/fixtures/pyxa-small-landmarks.marimo.py
export E2E_MARIMO_PORT=28793
node frontend/scripts/marimo-e2e-serve.mjs

# terminal 2
cd frontend
npx playwright test -c playwright.marimo-pyxa.config.ts -g "molab shell"
# or: -g "molab-scale selection"  /  landmarks-molab-pyxa-shell.spec.ts
```

Toy / inspect smoke use `playwright.marimo.config.ts` and port `28765` (see `marimo-e2e-host.mjs`).
