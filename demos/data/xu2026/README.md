# Ileum demo data (`ileum.h5ad`)

`ileum.h5ad` contains one complete mouse ileum cross-section, imaged with MERFISH. It replaces the old
square crop of `20211215_WT_ile1_slice_4`, which was cut off on one side.

| | |
|---|---|
| Slice | `20211215_WT_ile1_slice_2` (SPF, specific-pathogen-free ileum; dataset `20211215_WT_ile1`, slice 2) |
| Cells | 30,332 (the whole section, uncropped): 19,978 epithelial, 4,247 smooth muscle, 2,894 immune, 1,944 fibroblast, 896 endothelial, 201 interstitial, 172 ENS |
| Genes | 16, listed below |
| File | 1,777,425 B, gzip |
| Layout | Same as the old file: `X` float32, the authors' log-normalized values; `obs` has `cell_type`, `cell_class`, `anatomical_layer` (categoricals) and `mucosal_pseudospace` (float64); `obsm['spatial']` is the float64 x/y cell centroid in µm; `uns['cell_type_colors']`. |

## Source and credit

- **Paper:** Xu RJ, ..., Moffitt JR. *Cell Host & Microbe* 34(3):509–525.e13 (2026).
  doi:[10.1016/j.chom.2026.01.018](https://doi.org/10.1016/j.chom.2026.01.018)
- **Data:** Xu RJ, Moffitt JR. *MERFISH measurements of the mouse gastrointestinal tract in the
  presence and absence of the microbiome.* Dryad,
  doi:[10.5061/dryad.p5hqbzm0z](https://doi.org/10.5061/dryad.p5hqbzm0z). License: **CC0-1.0**.
  File: `data_upload.zip` (26,407,604,947 B, sha256
  `541e4f6992214ccc3634a656352ccf0ac3e06c2b01006e7e6fe804a7387f15ee`), member
  `data_upload/cell_by_gene/cell_by_gene_with_metadata.h5ad`.

The values in `X`, the cell labels (`cell_type`, `cell_class`), `anatomical_layer` and
`mucosal_pseudospace` all come from the authors. Nothing was renormalized or reclustered.

## How the slice was chosen

The dataset has 28 ileum sections: 12 SPF and 16 germ-free (GF). The survey is in
`ileum_slice_ranking.md` and `.csv`, with an overview still of every section in `survey/`.

1. **Complete cross-section.** The submucosa and muscularis wall must close around the lumen with a gap of 100 µm
   or less, and no more than 20 mucosa cells may sit on a scan edge. Seven of the 12 SPF sections pass. The old slice fails: its wall is
   open on one side. `20211220_WT_ile2_slice_3` has the most cells, but it also fails, because the scan boundary clips
   about 700 µm of its right-hand wall.
2. **Lymphoid tissue.** Among the seven complete SPF sections, `20211215_WT_ile1_slice_2` has the most
   gut-associated lymphoid tissue (GALT): 375 cells forming visible lymphoid follicles. The next is `20211027_WT_ile_slice_4`
   with 190, and the other five have 4–51.
   That keeps the immune compartment that the old crop showed (411 GALT cells) and gives demos a second tissue
   architecture besides the villus-crypt axis.
3. **Density.** It is the third-ranked complete SPF section on density, with 30,332 cells, a median of 54 transcripts per cell
   (`obs['n_counts']`), 0.91 M transcripts per mm² and 12,531 cells/mm². The densest section, `20211220_WT_ile2_slice_4`
   (34,606 cells, median 61 transcripts per cell), has almost no GALT (20 cells), so it was passed over.
   Tissue area is the occupied area on a 25 µm grid, which leaves out the lumen. It is not a convex hull.
4. **SPF over GF.** GF sections have more transcripts per cell (median 56–82, against 41–66 for SPF). However, the GF sections were all
   imaged in separate 2022 runs, and few of them are complete. The best complete GF section, `20220627_GF_ile_slice_2`, has fragmented
   villi and only 26.3 k cells. SPF tissue, with its microbiome present, is also more representative.

Caveat: this comes from the same imaging run (`20211215_WT_ile1`) as the old crop, but it is a different, complete section.
To use the densest section instead, set `SLICE = "20211220_WT_ile2_slice_4"` in the script.

## Genes (16)

The old 14 genes were mostly very sparse in these sections: Scnn1g, Ccl22, Ccl20, Chat, Nos1 and Mrc1 are each
detected in under 1% of cells. The new panel was picked (on `20211220_WT_ile2_slice_4`, the first candidate) for layer and cell-type
specificity and for correlation with `mucosal_pseudospace`. Muc2 is not among the 1,815 genes
that passed QC.

| Gene | Marks | Detected in |
|---|---|---|
| Apob | villus-tip enterocytes (ρ = +0.59 with pseudospace) | 28% |
| Slc5a1 | villus enterocytes, SGLT1 (ρ = +0.55) | 37% |
| Nos2 | villus epithelium (ρ = +0.50) | 40% |
| Cps1 | crypt / lower-villus enterocytes (ρ = −0.59) | 34% |
| Mki67 | proliferating transit-amplifying crypt cells (ρ = −0.45) | 15% |
| Lgr5 | crypt-base stem cells; sparse, kept because the docs use it | 2% |
| Erbb3 | pan-epithelial (81% of epithelial cells vs 3% of other cells) | 55% |
| H2-Eb1 | MHC-II on epithelium and antigen-presenting cells (kept from the old panel) | 60% |
| Acta2 | smooth muscle, Muscularis Propria (97% of SMC) | 19% |
| Col1a1 | fibroblasts, Submucosa (86% of fibroblasts) | 16% |
| Phox2b | enteric neurons, Myenteric Plexus (56% of ENS, 0% elsewhere) | 0.5% |
| Kit | interstitial cells of Cajal (60%) | 5% |
| Pecam1 | endothelium (62%) | 3% |
| Mzb1 | plasma cells (44% of immune) | 4.5% |
| Cd3e | T cells (25% of immune) | 3% |
| Csf1r | macrophages (28% of immune) | 3% |

## Size

The file is 1.78 MB, well under the 10 MiB data budget for static pages, but above the ~1 MB target. Most of
the size comes from the cell count, not the genes: `obsm['spatial']` float64, `mucosal_pseudospace` and the
HDF5 string index scale with the number of cells, and the 16 genes add only a few hundred KB. Getting to about 1 MB would mean
cropping, which defeats the point of a complete section, or changing the layout, for example rounding
coordinates to 0.01 µm. Neither was done.

## Regenerate

```bash
uv run --script ../export_from_raw.py --zip /path/to/data_upload.zip --out ../ileum.h5ad
# optional: --index /tmp/h5ad.rgzidx caches the ~390 MB seek index for faster re-runs
```

The 62.9 GB h5ad member is never extracted. The script reads the deflate stream with random access
(rapidgzip) and uses h5py to read only the obs columns and the slice's row block. It takes about 40 s
on 8 cores the first time and 3 s with a cached index. The output is byte-identical between runs: md5 `dbb646e8304a7a9b69603992ed8974fe`
with anndata 0.13.4 and h5py 3.16.0.
