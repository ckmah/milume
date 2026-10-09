# Test data

## `cosmx_lung5_tiny/` (committed, ~4.4 MB)

Cut of NanoString CosMx SMI **NSCLC Lung5_Rep2** flat files
(`https://nanostring-public-share.s3.us-west-2.amazonaws.com/SMI-Compressed/Lung5_Rep2/Lung5_Rep2+SMI+Flat+data.tar.gz`,
the dataset used by the spatialdata docs). FOVs 1–2, the top-left 1000×1000 px of each FOV image,
218 cells, 980 genes, ~63k cell-assigned transcripts. Same flat-file layout as the original
(`*_exprMat_file.csv`, `*_metadata_file.csv`, `*_fov_positions_file.csv`, `*_tx_file.csv`,
`CellLabels/`, `CellComposite/`), dataset id `Lung5_Rep2_tiny`, so
`spatialdata_io.cosmx("tests/data/cosmx_lung5_tiny")` reads it unchanged.
Regenerate with `make_cosmx_lung5_tiny.py` (docstring has the download command).

Provenance/license: NanoString (now Bruker Spatial Biology) public "CosMx SMI FFPE NSCLC" dataset,
released for public use; see NanoString's dataset page for terms. Redistributed here as a small
derived subset for testing only, with attribution.

## Xenium (downloaded at test time, not committed)

10x Genomics **Xenium_V1_Human_Ovary_tiny** (28 MB zip, 632 cells, 2D `morphology_focus`),
the same file spatialdata-io's own CI uses. `tests/platform_fixtures.py` downloads it once,
checks its sha256 and caches it in `$MILUME_TEST_DATA` (default `~/.cache/milume-test-data`);
`MILUME_OFFLINE=1` skips instead. License: 10x Genomics public datasets, CC BY 4.0.
