# Ileum slice ranking (Xu et al. 2026, Dryad doi:10.5061/dryad.p5hqbzm0z)

Ranked within each microbiome group: complete sections first, then by the mean of their ranks on cells, median transcripts/cell, cells/mm² and transcripts/mm².

- **Transcripts per cell**: `obs['n_counts']` from the Dryad h5ad (the authors' per-cell transcript count after Baysor segmentation).
- **Tissue area**: occupancy area, not a convex hull. Cell centroids are binned on a 25 µm grid, a 1-pixel binary closing is applied, and the occupied pixels are summed. This excludes the empty lumen, which a convex hull would count. Convex-hull area is in the CSV for reference.
- **Wall-ring gap**: the smallest gap that has to be bridged before the Submucosa + Muscularis Propria + Myenteric Plexus cells enclose the lumen (enclosed hole > 0.3 mm²). 'open' means the gap is over 800 µm, so the wall does not close.
- **Mucosa cells on scan edge**: the most Mucosa cells within 30 µm of any side of the section's bounding box. A high count means the scan boundary cut through the tissue.
- **Complete** = wall-ring gap ≤ 100 µm and ≤ 20 mucosa cells on a scan edge. Checked by eye against `survey/*.png`.

## SPF
| Rank | Slice | Microbiome | Complete | Cells | Median tx/cell | Cells/mm² | Tx/mm² | Tissue area mm² | Wall-ring gap µm | Mucosa cells on scan edge | GALT cells | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `20211220_WT_ile2_slice_4` | SPF | yes | 34,606 | 61 | 12,415 | 1.08 M | 2.79 | ≤50 | 1 | 20 | densest complete SPF section (most cells and transcripts/mm²); few stray cells outside the wall (lower right); almost no GALT (20 cells) |
| 2 | `20211215_WT_ile1_slice_3` | SPF | yes | 30,223 | 60 | 12,537 | 1.06 M | 2.41 | ≤50 | 0 | 13 | runner-up: roundest, cleanest ring; almost no GALT (13 cells) |
| 3 | `20211215_WT_ile1_slice_2` | SPF | yes | 30,332 | 54 | 12,531 | 0.91 M | 2.42 | ≤50 | 6 | 375 | PICK: most GALT of complete SPF sections (375 cells, lymphoid follicles); lower tx/cell than rank 1 |
| 4 | `20211027_WT_ile_slice_2` | SPF | yes | 30,307 | 51 | 12,370 | 0.87 M | 2.45 | ≤50 | 0 | 32 |  |
| 5 | `20211215_WT_ile1_slice_1` | SPF | yes | 27,795 | 46 | 12,846 | 0.80 M | 2.16 | ≤50 | 0 | 4 |  |
| 6 | `20211027_WT_ile_slice_4` | SPF | yes | 25,212 | 49 | 12,056 | 0.82 M | 2.09 | ≤100 | 1 | 190 |  |
| 7 | `20211220_WT_ile2_slice_1` | SPF | yes | 26,689 | 43 | 10,287 | 0.60 M | 2.59 | ≤50 | 15 | 51 |  |
| 8 | `20211215_WT_ile1_slice_4` | SPF | **no** | 23,879 | 66 | 14,678 | 1.35 M | 1.63 | open | 336 | 433 | OLD SET: open U, cut off on one side |
| 9 | `20211220_WT_ile2_slice_3` | SPF | **no** | 39,902 | 64 | 13,155 | 1.20 M | 3.03 | ≤100 | 82 | 4 | right wall clipped by scan edge at x≈3254 µm (~700 µm of muscularis missing) |
| 10 | `20211027_WT_ile_slice_3` | SPF | **no** | 28,039 | 52 | 12,099 | 0.87 M | 2.32 | ≤100 | 36 | 284 |  |
| 11 | `20211220_WT_ile2_slice_2` | SPF | **no** | 23,068 | 52 | 11,242 | 0.81 M | 2.05 | open | 278 | 23 | cut off at bottom and right |
| 12 | `20211027_WT_ile_slice_1` | SPF | **no** | 19,118 | 41 | 9,508 | 0.54 M | 2.01 | ≤350 | 0 | 46 |  |

## Germ-free
| Rank | Slice | Microbiome | Complete | Cells | Median tx/cell | Cells/mm² | Tx/mm² | Tissue area mm² | Wall-ring gap µm | Mucosa cells on scan edge | GALT cells | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `20220627_GF_ile_slice_2` | GF | yes | 26,300 | 79 | 15,077 | 1.66 M | 1.74 | ≤50 | 18 | 101 | best GF: highest molecule density of complete sections, but villi fragmented |
| 2 | `20220627_GF_ile_slice_1` | GF | yes | 24,982 | 71 | 14,909 | 1.47 M | 1.68 | ≤50 | 0 | 259 |  |
| 3 | `20220613_GF_ile2_slice_5` | GF | yes | 28,280 | 65 | 12,319 | 1.20 M | 2.30 | ≤50 | 0 | 20 |  |
| 4 | `20220608_GF_ile1_slice_3` | GF | yes | 11,871 | 74 | 10,992 | 1.21 M | 1.08 | ≤100 | 7 | 26 |  |
| 5 | `20220627_GF_ile_slice_4` | GF | **no** | 27,516 | 82 | 16,056 | 1.88 M | 1.71 | ≤150 | 3 | 13 |  |
| 6 | `20220627_GF_ile_slice_3` | GF | **no** | 27,781 | 73 | 15,718 | 1.60 M | 1.77 | ≤750 | 137 | 170 |  |
| 7 | `20220608_GF_ile1_slice_4` | GF | **no** | 21,512 | 79 | 12,795 | 1.45 M | 1.68 | ≤150 | 131 | 56 |  |
| 8 | `20220608_GF_ile1_slice_5` | GF | **no** | 12,692 | 76 | 12,910 | 1.49 M | 0.98 | open | 122 | 95 |  |
| 9 | `20220608_GF_ile1_slice_2` | GF | **no** | 17,712 | 71 | 12,952 | 1.36 M | 1.37 | open | 141 | 11 |  |
| 10 | `20220627_GF_ile_slice_5` | GF | **no** | 6,673 | 72 | 13,515 | 1.39 M | 0.49 | open | 145 | 0 |  |
| 11 | `20220613_GF_ile2_slice_3` | GF | **no** | 18,518 | 73 | 11,674 | 1.25 M | 1.59 | ≤350 | 4 | 22 |  |
| 12 | `20220613_GF_ile2_slice_2` | GF | **no** | 24,917 | 69 | 11,450 | 1.19 M | 2.18 | ≤200 | 48 | 10 |  |
| 13 | `20220627_GF_ile_slice_6` | GF | **no** | 13,259 | 67 | 13,384 | 1.29 M | 0.99 | open | 35 | 11 |  |
| 14 | `20220608_GF_ile1_slice_1` | GF | **no** | 13,149 | 68 | 11,873 | 1.16 M | 1.11 | open | 71 | 6 |  |
| 15 | `20220613_GF_ile2_slice_1` | GF | **no** | 17,160 | 56 | 11,031 | 0.92 M | 1.56 | open | 140 | 0 |  |
| 16 | `20220608_GF_ile1_slice_6` | GF | **no** | 10,110 | 68 | 10,727 | 1.05 M | 0.94 | open | 128 | 16 |  |
