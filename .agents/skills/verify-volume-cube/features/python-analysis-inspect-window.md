# python-analysis-inspect-window

Notebook Python reacts to Landmarks inspect and VolumeCube slice state — not
only visual sync. ``demos/volume-cube.py`` counts synthetic cells inside the
inspect window via ``cells_in_inspect_window``.

**Spec:** `tests/test_volume_cube.py` — `test_coord_contract_landmarks_cube_xy`  
**Demo:** `demos/volume-cube.py` — analysis cell after the link cell

## Sub-features

- ``if landmarks.inspect_cx is not None`` gates analysis (same pattern as window sync)
- Cell count uses ``cells_in_inspect_window(adata.obsm["spatial"], ...)``
- Readout includes cube Z slab from ``slice_z_min`` / ``slice_z_max``

## How to get to it (user POV)

Open ``demos/volume-cube.py``. After clicking **Inspect** on tissue, the
analysis markdown cell updates with the cell count and current Z slab.

## Driving it with Playwright

Not fully automated in headless marimo today. Offline proof is pytest for
``cells_in_inspect_window``; the manual two-widget notebook link this demo
cell depends on (`inspect_cx` copied onto a separate `VolumeCubeWidget`) has
no Playwright coverage since the notebook-link harness and spec were removed
— Landmarks' own inline cube ([`inspect-cube`](../../verify-landmarks/features/inspect-cube.md))
is the Playwright-proved path today.

**Proof**

- Functional: pytest mask geometry; manual marimo for live count readout.
- Visual: no dedicated anchor.

## Gotchas

- Analysis cell is marimo-only; CI uses pytest only for this contract (no e2e harness left for the two-widget link).
- Z slab default (64 planes) is set by ``VolumeCubeWidget.from_url`` for GPU safety.
