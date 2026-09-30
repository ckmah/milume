# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, treated equally:

- **Computational biologists** exploring their own spatial omics tissue datasets in notebooks — selecting regions, placing landmarks, and linking visual choices back to AnnData-backed analysis.
- **Bioinformatics engineers** building reusable analysis notebooks for a lab or platform — embedding widgets that stay in sync with Python without requiring a frontend toolchain.

Both work in Python notebook environments (marimo primary, Jupyter secondary) with AnnData as the analysis object.

## Product Purpose

Milume provides interactive notebook widgets for spatial omics exploration. Python owns analysis logic; the browser owns presentation. Named, typed traitlets keep widget state in sync with the notebook kernel so users can explore tissue coordinates, selections, and landmarks without re-running cells.

Success means a notebook user can install the package, embed a widget, and get faithful, responsive spatial interaction tied to their AnnData object — with no build step on the consumer side.

## Positioning

Notebook-native toolkit: best-in-class marimo/Jupyter widgets for spatial omics, as opposed to standalone spatial visualization apps. The product wins by being the right control surface inside the analysis notebook — AnnData-native, sync-first, and composable with the rest of a Python workflow.

## Operating Context

- **Environment:** marimo (primary) and Jupyter notebooks; widgets render in the browser within notebook cells.
- **Data model:** AnnData with coordinates in `obsm["spatial"]`, labels in `obs`, expression in `X`. Neighborhood expand runs client-side from coordinates (no required `obsp` graphs). Gene expression packs eagerly for view-only coloring. Interaction sync is landmarks/selections; other chrome state is client-local.
- **Widget types:** React/shadcn widgets (bundled ahead of time) and vanilla JavaScript widgets (shipped as source). Canvas drawing for landmarks uses deck.gl orthographic layers via `mountEngine`.
- **Development:** Widget authors work in `frontend/` and rebuild bundles; widget consumers install the published package only.
- **Demos:** `demos/landmarks.py` with a molab badge for remote execution; `demos/volume-cube.py`.

## Capabilities and Constraints

**Shipped widgets**

- `LandmarksWidget` — draw selections and landmarks on tissue coordinates (lasso, rectangle, ellipse; point, line, spline, shape); gene/color controls; selection hits via `get_obs_names` / `assign_obs_mask`; landmarks are durable SpatialData annotations per `docs/landmarks-spatialdata-contract.md` (M1).
- `VolumeCubeWidget` — OME-Zarr detail cube (Viv); Landmarks inspect drives `window_cx` / `window_cy`; Marimo XYZ slice traits (`slice_x`, `slice_y`, `slice_z`).

**Technical constraints**

- Widget consumers must never need a frontend build toolchain; React bundles ship inside the installed package (`milume/static/`).
- k-NN / radius neighborhood expand is client-side; no precomputed `obsp` graphs required.
- Selections persist as `obs_names`, not positional indices.
- Chrome follows notebook cell width; marker radius derives from median nearest-neighbor distance.

**Terminology**

Use domain language from `CONTEXT.md` (widget, synced state, traitlet, widget consumer, widget author, landmark, selection). Avoid synonyms listed there as _Avoid_ entries.

**Undecided**

- Additional widgets beyond Landmarks and VolumeCube (README notes more may land over time).
- Jupyter parity details relative to marimo-first development.

## Brand Commitments

- **Name:** Milume (`milume`; formerly spatial-rx)
- **License:** MIT open source
- **Author:** ckmah
- **Repository:** https://github.com/ckmah/milume
- **Voice:** Technical, precise, notebook-native; domain terms from `CONTEXT.md` are binding.

## Evidence on Hand

| Asset | Path |
| ----- | ---- |
| Landmarks demo | `demos/landmarks.py` |
| Volume cube demo | `demos/volume-cube.py` |
| Landmarks screenshot | `assets/landmarks_widget_{light,dark}.png` |
| Demo data | [Stellaromics/demo](https://huggingface.co/datasets/Stellaromics/demo) `xsmall/` (Landmarks demo) |
| Domain vocabulary | `CONTEXT.md` |
| Widget architecture docs | `docs/widget-packaging.md`, `docs/shadcn-frontend.md` |

Do not fabricate testimonials, case studies, benchmarks, or customer logos. Screenshots and demos are the primary visual proof.

## Product Principles

1. **Notebook-native first** — design for marimo/Jupyter cells, not standalone apps; the notebook kernel remains the source of truth.
2. **Analysis fidelity** — widgets reflect AnnData state accurately; UI never hides or replaces Python-side logic.
3. **Zero consumer toolchain** — published bundles must work out of the box for `pip install milume` users.
4. **Sync over re-run** — state crosses the Python/browser boundary through named traitlets, not opaque payloads or cell re-execution.
5. **Accessible chrome** — widget UI targets WCAG 2.1 AA for controls, labels, and keyboard paths.

## Accessibility & Inclusion

Widget chrome (React/shadcn controls, labels, sliders, accordions) must meet WCAG 2.1 AA. Canvas-based spatial drawing (deck.gl landmarks layer) follows platform expectations for pointer interaction; document keyboard gaps where canvas semantics cannot fully map.
