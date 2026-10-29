# Ileum demo data (`ileum.h5ad`)

`ileum.h5ad` contains one complete mouse ileum cross-section, imaged with MERFISH. It replaces the old
square crop of `20211215_WT_ile1_slice_4`, which was cut off on one side.

| | |
|---|---|
| Slice | `20211215_WT_ile1_slice_2` (SPF, specific-pathogen-free ileum; dataset `20211215_WT_ile1`, slice 2) |
| Cells | 30,332 (the whole section, uncropped): 19,978 epithelial, 4,247 smooth muscle, 2,894 immune, 1,944 fibroblast, 896 endothelial, 201 interstitial, 172 ENS |
| Genes | 1,815 QC-pass genes (source order); 1,813 detected in this slice |
| File | 5,014,135 B, gzip level 9, md5 `b4ff9ecdc57f382d4e4ba26a54cd5e56` |
| Layout | `X` float32 CSR, the authors' log-normalized values (source `raw.X` is identical, so it is not duplicated); `layers['raw_counts']` int32 CSR (source stored int64, max 282); `obs` has `cell_type`, `cell_class`, `anatomical_layer` (categoricals) and `mucosal_pseudospace` (float64); `obsm['spatial']` is float64 x/y centroids in µm; `uns['cell_type_colors']`. |
| Sparsity | nnz 920,437; median 26 genes per cell and 48 raw counts per cell over these 1,815 genes |

The source `obs['n_counts']` has median **54** transcripts per cell for the full 1,922-gene panel; that column was **not** computed from these 1,815 genes alone (median **48** counts/cell in `layers['raw_counts']` here).

Checks against the earlier 16-gene commit: `obs`, `obs_names`, `obsm['spatial']`, and `uns['cell_type_colors']` are equal, and the 16 demo genes' `X` values are bit-identical.

## Source and credit

- **Paper:** Xu RJ, Zhang H, Cadinu P, Nicol PB, Herrmann US, Lee T, Geistlinger L, Irizarry RA,
  Moffitt JR. *Cell Host & Microbe* 34(3):509–525.e13 (2026).
  doi:[10.1016/j.chom.2026.01.018](https://doi.org/10.1016/j.chom.2026.01.018)
- **Data:** Moffitt J, Xu R. MERFISH measurements of the mouse gastrointestinal tract in the
  presence and absence of the microbiome. Dryad (2025), version 5,
  doi:[10.5061/dryad.p5hqbzm0z](https://doi.org/10.5061/dryad.p5hqbzm0z). License: **CC0-1.0**.
  File: `data_upload.zip` (26,407,604,947 B, sha256
  `541e4f6992214ccc3634a656352ccf0ac3e06c2b01006e7e6fe804a7387f15ee`), member
  `data_upload/cell_by_gene/cell_by_gene_with_metadata.h5ad`.

The values in `X`, the cell labels (`cell_type`, `cell_class`), `anatomical_layer` and
`mucosal_pseudospace` all come from the authors. Nothing was renormalized or reclustered.

## How the slice was chosen

The dataset has 28 ileum sections: 12 SPF and 16 germ-free (GF). Rankings are in
`ileum_slice_ranking.md` and `.csv` (metrics and completeness rules in the markdown header).

1. **Complete cross-section.** The submucosa and muscularis wall must close around the lumen with a gap of 100 µm
   or less, and no more than 20 mucosa cells may sit on a scan edge. Seven of the 12 SPF sections pass. The old slice fails: its wall is
   open on one side. `20211220_WT_ile2_slice_4` has the most cells, but it also fails, because the scan boundary clips
   about 700 µm of its right-hand wall.
2. **Lymphoid tissue.** Among the seven complete SPF sections, `20211215_WT_ile1_slice_2` has the most
   gut-associated lymphoid tissue (GALT): 375 cells forming visible lymphoid follicles. The next is `20211027_WT_ile_slice_4`
   with 190, and the other five have 4–51.
   That keeps the immune compartment that the old crop showed (411 GALT cells) and gives demos a second tissue
   architecture besides the villus-crypt axis.
3. **Density.** It is the third-ranked complete SPF section on density, with 30,332 cells, a median of 54 transcripts per cell in the source
   (`obs['n_counts']`, full panel), 0.91 M transcripts per mm² and 12,531 cells/mm². The densest section, `20211220_WT_ile2_slice_4`
   (34,606 cells, median 61 transcripts per cell), has almost no GALT (20 cells), so it was passed over.
   Tissue area is the occupied area on a 25 µm grid, which leaves out the lumen. It is not a convex hull.
4. **SPF over GF.** GF sections have more transcripts per cell (median 56–82, against 41–66 for SPF). However, the GF sections were all
   imaged in separate 2022 runs, and few of them are complete. The best complete GF section, `20220627_GF_ile_slice_2`, has fragmented
   villi and only 26.3 k cells. SPF tissue, with its microbiome present, is also more representative.

Caveat: this comes from the same imaging run (`20211215_WT_ile1`) as the old crop, but it is a different, complete section.
To use the densest section instead, set `SLICE = "20211220_WT_ile2_slice_4"` in the script.

## Demo gene colouring

The file ships **all** measured genes. Interactive demos pass a short `genes=` list to `milume.peek` (original 16-gene tutorial panel plus GALT markers such as `Cxcl13`, `Cr2`, `Ccr7`) so marimo exports stay within the static payload budget; other genes still colour on demand.

The earlier 16-gene panel (Apob, Slc5a1, Nos2, Cps1, Mki67, Lgr5, Erbb3, H2-Eb1, Acta2, Col1a1, Phox2b, Kit, Pecam1, Mzb1, Cd3e, Csf1r) was chosen for layer and cell-type specificity on a dense candidate slice; see git history before the 1,815-gene export for detection rates on that panel.

## Regenerate

The pooled h5ad member is 62.9 GB inflated. The first real member of `data_upload.zip` is only **990,689,244 B** compressed (local header at byte 161, data at 299), so a partial download of the zip's first ~1 GB is enough for one slice.

**Option A — zip + random access (rapidgzip):**

```bash
uv run --script export_from_raw.py --zip /path/to/data_upload.zip --out ../ileum.h5ad
# optional: --index /tmp/h5ad.rgzidx caches the ~390 MB seek index for faster re-runs
```

**Option B — stream member, then export:**

`inflate_member.py` streams the deflate stream once, verifies CRC32 `0xe899a898` against the zip data descriptor, and writes a sparse 62.9 GB file holding only the byte ranges needed for this slice. Then:

```bash
python inflate_member.py member_sparse.h5 0:67108864 947225604:1167435924 ...
uv run --script export_from_raw.py --member member_sparse.h5 --out ../ileum.h5ad
```

`export_from_raw.py` reads only the obs columns and the slice row block; it never extracts the full zip to disk. Output is reproducible byte for byte (md5 above, gzip level 9).
