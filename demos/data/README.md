# Demo data (ileum AnnData)

2D demos and recipes load the SPF ileum panel via ``demos/loaders/demo_tiers.py`` (``load_2d_ileum_adata()``)
from `demos/data/ileum.h5ad` in this
repository (Xu et al. 2026, Dryad [10.5061/dryad.p5hqbzm0z](https://doi.org/10.5061/dryad.p5hqbzm0z),
CC0-1.0).

## Layout

```
ileum.h5ad                      # SPF ileum cross-section AnnData (<10 MB)
                                # X, obs, obsm['spatial'], cell_type colors
export_from_raw.py              # regenerate ileum.h5ad from Dryad data_upload.zip
xu2026/                         # slice ranking tables and regen notes
  README.md
  ileum_slice_ranking.{csv,md}
```

## Panel

| | |
|---|---|
| Slice | `20211215_WT_ile1_slice_2` (complete SPF cross-section) |
| Cells | 30,332 |
| Genes | 16: Apob, Slc5a1, Nos2, Cps1, Mki67, Lgr5, Erbb3, H2-Eb1, Acta2, Col1a1, Phox2b, Kit, Pecam1, Mzb1, Cd3e, Csf1r |

Full provenance, slice-selection rationale, and regeneration instructions are in
[`xu2026/README.md`](xu2026/README.md).

## Regenerate

From a local copy of the Dryad `data_upload.zip`:

```bash
uv run --script demos/data/export_from_raw.py \
  --zip /path/to/data_upload.zip \
  --out demos/data/ileum.h5ad
```

The committed file should match md5 `dbb646e8304a7a9b69603992ed8974fe` (anndata 0.13.4, h5py 3.16.0).

## Citation

If you use `ileum.h5ad`, cite the original study and dataset:

- Xu RJ, Zhang H, Cadinu P, Nicol PB, Herrmann US, Lee T, Geistlinger L, Irizarry RA, Moffitt JR.
  An image-based transcriptomics atlas reveals the regional and microbiota-dependent molecular,
  cellular, and spatial structure of the murine gut. *Cell Host & Microbe* 34(3):509–525.e13 (2026).
  doi:[10.1016/j.chom.2026.01.018](https://doi.org/10.1016/j.chom.2026.01.018)
- Moffitt J, Xu R. MERFISH measurements of the mouse gastrointestinal tract in the presence and
  absence of the microbiome. Dryad (2025), version 5.
  doi:[10.5061/dryad.p5hqbzm0z](https://doi.org/10.5061/dryad.p5hqbzm0z). License: CC0-1.0.

`ileum.h5ad` is one section (`20211215_WT_ile1_slice_2`) with 16 of the 1,922 genes, extracted by
`export_from_raw.py`. Values and labels are the authors'.

## Other assets

- **Volume cube demo** (`demos/volume-cube.py`) uses a separate 3D source; it is not stored here.
