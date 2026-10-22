# Marimo kernel e2e (Python API and kernel comm only)

These specs drive a **real** `marimo run` kernel. They cover Python-side behaviour only:
kernel load, volume comm (`DataView` buffers), traitlet round-trips, `w.color` /
`w.selections` set from Python, `get_obs_names`, and reactive cell re-runs.

**No UI gestures here.** Lasso, clicks, Inspect interaction and molab embed layout are
verified in the Vite harness (`e2e/landmarks/`, including the simulated-molab
`landmarks-molab-shadow` and `landmarks-molab-viewport` specs). UI PRs do not need marimo.
`npm run check:e2e-scope` fails on gesture APIs here; the allowlist is `marimo_api.allow` in
[`../e2e-scope.json`](../e2e-scope.json).

| Spec | Notebook | Covers |
|---|---|---|
| `api.spec.ts` | `fixtures/toy-api.marimo.py` | color/selections from Python, `get_obs_names`, cell re-run |
| `landmarks-inspect.spec.ts` | `demos/landmarks.py` | kernel load + comm image store on a non-localhost origin, DataView decode |

CI job `e2e-marimo-api` runs only on Python / comm / marimo-spec changes (tier `marimo_api`).
