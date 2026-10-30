# Demo data (ileum AnnData)

2D demos and recipes load the SPF ileum section via ``milume.datasets.ileum_merfish_xu2026()`` (or ``demos/loaders/demo_tiers.load_2d_ileum_adata()`` in checkout scripts) from `demos/data/ileum.h5ad` in this
repository (Xu et al. 2026, Dryad [10.5061/dryad.p5hqbzm0z](https://doi.org/10.5061/dryad.p5hqbzm0z),
CC0-1.0).

## Layout

```
ileum.h5ad                      # SPF ileum cross-section AnnData (~5 MB)
                                # X, layers['raw_counts'], obs, obsm['spatial']
export_from_raw.py              # regenerate ileum.h5ad from Dryad zip or inflated member
xu2026/                         # slice ranking, inflate_member.py, regen notes
  README.md
  export_from_raw.py            # same script as ../export_from_raw.py
  inflate_member.py
  ileum_slice_ranking.{csv,md}
```

## Panel

| | |
|---|---|
| Slice | `20211215_WT_ile1_slice_2` (complete SPF cross-section) |
| Cells | 30,332 |
| Genes | 1,815 (all QC-pass genes for this slice, source order); 1,813 detected here |
| Matrix | `X` float32 CSR, authors' log-normalized values; `layers['raw_counts']` int32 CSR (median 48 counts/cell over these genes; nnz 920,437) |
| File | 5,014,135 B, gzip level 9 |

Molab notebooks preload a small curated gene list in `milume.peek(..., genes=[...])` so the widget stays under the static page payload budget; the committed file keeps every measured gene.

Full provenance, slice-selection rationale, and regeneration instructions are in
[`xu2026/README.md`](xu2026/README.md).

## Regenerate

From a local copy of the Dryad `data_upload.zip`, or from a sparse member file built with
`xu2026/inflate_member.py`:

```bash
uv run --script demos/data/export_from_raw.py \
  --zip /path/to/data_upload.zip \
  --out demos/data/ileum.h5ad
# or: --member /path/to/member_sparse.h5
```

The committed file should match md5 `b4ff9ecdc57f382d4e4ba26a54cd5e56`.

## Citation

If you use `ileum.h5ad`, cite the original study and dataset:

- Xu RJ, Zhang H, Cadinu P, Nicol PB, Herrmann US, Lee T, Geistlinger L, Irizarry RA, Moffitt JR.
  An image-based transcriptomics atlas reveals the regional and microbiota-dependent molecular,
  cellular, and spatial structure of the murine gut. *Cell Host & Microbe* 34(3):509–525.e13 (2026).
  doi:[10.1016/j.chom.2026.01.018](https://doi.org/10.1016/j.chom.2026.01.018)
- Moffitt J, Xu R. MERFISH measurements of the mouse gastrointestinal tract in the presence and
  absence of the microbiome. Dryad (2025), version 5.
  doi:[10.5061/dryad.p5hqbzm0z](https://doi.org/10.5061/dryad.p5hqbzm0z). License: CC0-1.0.

`ileum.h5ad` is one section (`20211215_WT_ile1_slice_2`) with all 1,815 QC genes for that slice, extracted by
`export_from_raw.py`. Values and labels are the authors'.

## Other assets

- **Volume cube demo** (`demos/volume-cube.py`) uses a separate 3D source; it is not stored here.
