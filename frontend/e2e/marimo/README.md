# Marimo kernel e2e (volume comm)

Playwright drives a **real** `marimo run` kernel (not the Vite harness) so
`volume_get` binary payloads flow through marimo’s anywidget bridge (`DataView`
buffers on `msg:custom`).

- **Notebook:** `demos/landmarks.py` (Stellaromics `small/`; prefetch via
  `scripts/prefetch-marimo-e2e-data.py` in CI).
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

Specs: `landmarks-inspect.spec.ts` (volume comm), `landmarks-selection.spec.ts` (lasso + select click).
