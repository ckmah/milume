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
