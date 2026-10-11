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

Molab layout stress on the **Vite harness** (scale, zero-height grow) lives in
`e2e/landmarks/landmarks-molab-viewport.spec.ts` and runs in the landmarks e2e tier.

## CI (`e2e-marimo-volume`)

Same as `main` (#151): two Playwright invocations only (no Pyxa / iframe specs).

1. `landmarks-selection.spec.ts` with `toy-landmarks.marimo.py`
2. `landmarks-inspect.spec.ts -g "non-localhost"` on `demos/landmarks.py`

```bash
cd frontend
npm run build
uv sync --extra demo   # repo root
uv run --extra demo python scripts/prefetch-marimo-e2e-data.py  # optional warm cache
npm run test:e2e:marimo-volume   # matches CI marimo config (molab marimo specs excluded)
```

## Local-only: Pyxa molab + iframe marimo specs

Not run in CI (too slow / flaky nested kernel). Use before claiming molab fixes
that depend on real Pyxa + marimo anywidget sync:

| Spec | Config | Command |
| ---- | ------ | ------- |
| `landmarks-selection-molab.spec.ts`, `landmarks-molab-pyxa-shell.spec.ts` | `playwright.marimo-pyxa.config.ts` | `npm run test:e2e:marimo-pyxa` |
| `landmarks-molab-iframe.spec.ts` | `playwright.marimo-pyxa-iframe.config.ts` | `npm run test:e2e:marimo-pyxa-iframe` |

### Iterate on one spec (reuse the kernel)

Playwright configs set `reuseExistingServer: !CI`. Keep `marimo run` up, then rerun only
the failing grep — no full suite loop.

```bash
# terminal 1 (repo root): Pyxa molab notebook
export E2E_MARIMO_NOTEBOOK=frontend/e2e/marimo/fixtures/pyxa-small-landmarks.marimo.py
export E2E_MARIMO_PORT=28793
node frontend/scripts/marimo-e2e-serve.mjs

# terminal 2
cd frontend
npx playwright test -c playwright.marimo-pyxa.config.ts -g "molab shell"
```

Toy / inspect smoke use `playwright.marimo.config.ts` (port from `marimo-e2e-host.mjs`).
