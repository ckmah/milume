# Test data

## `xenium_ovary_subsample/` (committed)

Subset of 10x Genomics **Xenium_V1_Human_Ovary_tiny** (632 cells, 2D `morphology_focus`): only the outs files
`spatialdata_io.xenium()` needs for widget tests (no transcripts, no `morphology.ome.tif`, no aux/analysis HTML).
Regenerate from the public zip with `make_xenium_ovary_subsample.py`.

**License:** 10x Genomics public example data, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## `cosmx_synthetic_tiny/` (committed)

Synthetic CosMx SMI **flat-file** layout (2 FOVs, 6 cells): `*_exprMat_file.csv`, `*_metadata_file.csv`,
`*_fov_positions_file.csv`, `*_tx_file.csv`, `CellLabels/`, `CellComposite/`. Read with
`spatialdata_io.cosmx(..., dataset_id="milume_cosmx_tiny")`. Local `obsm["spatial"]` repeats per FOV;
use `spatial_key="global"` in milume.

Regenerate: `python tests/data/make_cosmx_synthetic_tiny.py`.

## `palettes_matplotlib.json`, `selection_hit_test_matplotlib.npz` (committed)

matplotlib reference outputs, so milume can drop the matplotlib dependency and still prove
parity: the tab10/tab20/tab20b/tab20c and default sequential hex palettes, and
`Path.contains_points` masks for the 170k-point lasso cases in `tests/selection_cases.py`
(packed bits). `tests/test_palettes.py` and `tests/test_selection_hit_test.py` also compare
against live matplotlib when it is installed. Regenerate with
`python tests/data/make_matplotlib_fixtures.py` in an env that has matplotlib.
