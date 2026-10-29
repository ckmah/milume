# Datasets

Demo and test datasets by size tier ([#343](https://github.com/ckmah/milume/issues/343)). Constructor and loader options live on the [LandmarksWidget API](api/landmarks.md#constructor-parameters); streaming colon is tracked in [#134](https://github.com/ckmah/milume/issues/134).

| Tier | Dataset | Size | Cells × genes | Modality | Used by | Source / license |
| --- | --- | --- | --- | --- | --- | --- |
| tiny | `tests/data` fixtures + HF [`Stellaromics/demo`](https://huggingface.co/datasets/Stellaromics/demo) `xsmall/` | Xenium ovary subsample 1,487,071 B; CosMx synthetic 6,311 B; `xsmall/` 8,277,419 B | 187 × 241 (Pyxa cube) | 2D Xenium outs; synthetic CosMx flat files; 100 µm Pyxa crop | CI, unit/e2e, docs tool stills | 10x example [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); synthetic (repo); Pyxa demo [BSD-3-Clause](https://huggingface.co/datasets/Stellaromics/demo) |
| 2D | `demos/data/ileum.h5ad` | 1,777,425 B | 30,332 × 16 | 2D MERFISH mouse ileum (one SPF section) | 2D tutorials, recipes, how-to examples | Xu et al. 2026 / Dryad [CC0-1.0](https://doi.org/10.5061/dryad.p5hqbzm0z); in git |
| 3D | HF `Stellaromics/demo` `small/` | 246,930,525 B (no transcript CSV) | 4,372 × 241 | 3D DAPI mosaic + per-z cell outlines (~1310 × 443 × 130 µm) | [Landmarks molab demo](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/landmarks.py), 3D tutorial, Inspect docs | Stellaromics Pyxa demo [BSD-3-Clause](https://huggingface.co/datasets/Stellaromics/demo); left untrimmed on purpose |
| full | HF `Stellaromics/demo` `colon/` | ~30.2 GB | 492,155 × 1,020 | Human colon region + 3D mosaic | Showcase, perf, streaming work | Glasgow colon run + Stellaromics; [BSD-3-Clause](https://huggingface.co/datasets/Stellaromics/demo); see HF README [Colon attribution](https://huggingface.co/datasets/Stellaromics/demo#colon-attribution) |

## tiny

**Fields:** Sub-megabyte committed fixtures under `tests/data/` (`xenium_ovary_subsample/`, `cosmx_synthetic_tiny/`) plus the Hugging Face `xsmall/` tree (100 µm cube cropped from `small/`; 187 cells kept whole with segmentation and counts).

**Load:** Test helpers and frontend harness scripts read the committed paths or `snapshot_download(..., allow_patterns="xsmall/*")` then `spatialdata_io.experimental.pyxa`. Coordinates are in micrometres (Pyxa metadata; Xenium as read by `spatialdata_io`).

**Citation:** Xenium ovary tiny — 10x Genomics public example data, CC BY 4.0. Pyxa `xsmall/` — Stellaromics demo dataset, BSD-3-Clause (see HF README).

## 2D

**Fields:** AnnData with authors' log-normalized `X`, `obsm["spatial"]` (µm), `obs` columns `cell_type`, `cell_class`, `anatomical_layer`, `mucosal_pseudospace`, and `uns["cell_type_colors"]`. Sixteen genes from the Dryad 1,922-gene panel.

**Load:** `sc.read_h5ad("demos/data/ileum.h5ad")` from a checkout, or fetch the raw file on `main` (molab tutorials use the GitHub raw URL until the tier loader lands). Then `milume.peek(adata, color="cell_type")`. Do not re-normalize: `X` is already log-normalized.

**Citation:**

- Xu RJ, Zhang H, Cadinu P, Nicol PB, Herrmann US, Lee T, Geistlinger L, Irizarry RA, Moffitt JR. *Cell Host & Microbe* 34(3):509–525.e13 (2026). [doi:10.1016/j.chom.2026.01.018](https://doi.org/10.1016/j.chom.2026.01.018)
- Moffitt J, Xu R. Dryad (2025), version 5. [doi:10.5061/dryad.p5hqbzm0z](https://doi.org/10.5061/dryad.p5hqbzm0z). CC0-1.0.

Provenance and regen: [`demos/data/README.md`](https://github.com/ckmah/milume/blob/main/demos/data/README.md), [`demos/data/xu2026/`](https://github.com/ckmah/milume/blob/main/demos/data/xu2026/README.md).

## 3D

**Fields:** Pyxa folder layout: `cell_by_gene_v1.csv`, `cell_metadata_v1.csv`, `segmentation_geometries_v1.parquet`, zipped `mosaic_3d.ome.zarr.zip` (optional transcript CSV). Table coordinates in µm; Inspect uses the mosaic and per-z cell outline meshes.

**Load:** `snapshot_download("Stellaromics/demo", allow_patterns="small/*", ignore_patterns="*cell_assigned_gene*")` then `pyxa(local_dir / "small", cell_assigned_gene=False)` as in [`demos/landmarks.py`](https://github.com/ckmah/milume/blob/main/demos/landmarks.py). Write a SpatialData Zarr store if you need a stable path for Inspect. Clustering in the demo uses `sc.pp.log1p` on counts only for a colour column — not `normalize_total`.

**Citation:** Stellaromics Pyxa demo dataset, BSD-3-Clause. Colon attribution on the HF README applies to `colon/`, not `small/`.

## full

**Fields:** Full human colon Pyxa export (`colon/` on HF): ~5180 × 4230 × 128 µm, 492,155 cells, 1,020 genes, ~30 GB on disk when materialized.

**Load:** Stream or selectively `snapshot_download` columns/files you need ([#134](https://github.com/ckmah/milume/issues/134)). Not bundled in git.

**Citation:** Stellaromics Pyxa demo dataset, BSD-3-Clause; [Colon attribution](https://huggingface.co/datasets/Stellaromics/demo#colon-attribution) on the HF README.
