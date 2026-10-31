# Tutorial: explore cells in 2D

Walk through the [ileum molab notebook](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/ileum_2d.py) on Xu et al. 2026 ileum MERFISH ([#343](https://github.com/ckmah/milume/issues/343)). Each step below matches one section of the notebook and shows a visible result on the map or in a table.

## 1. Load the ileum slice

Download the slice with ``ml.datasets`` or the short alias ``ml.ds`` (pinned URL, user cache). The matrix ``X`` is already the authors' log-normalized values — do not call ``normalize_total`` or ``log1p``.

```python
import milume as ml

adata = ml.ds.ileum_merfish_xu2026()
```

**Result:** `adata` is 30,332 cells × 1,815 genes with `obsm["spatial"]` in micrometres. The notebook preloads a small curated gene list in `ml.peek(..., genes=...)` so the widget export stays within the static payload budget. See the [Datasets](../reference/datasets.md#2d) reference for fields and citation.

## 2. Open the map on cell types

```python
DEMO_GENES = [
    "Apob", "Slc5a1", "Nos2", "Cps1", "Mki67", "Lgr5", "Erbb3", "H2-Eb1",
    "Acta2", "Col1a1", "Phox2b", "Kit", "Pecam1", "Mzb1", "Cd3e", "Csf1r",
    "Cxcl13", "Cr2", "Ccr7",
]
w = ml.peek(adata, color="cell_type", genes=DEMO_GENES)
w
```

**Result:** The full ileum ring appears, coloured by `cell_type`.

<figure class="ml-hero ml-hero--still" markdown="0">
<img class="ml-only-dark" src="../assets/tutorials/explore-cells-2d/still-cell-types.dark.png" alt="The ileum section coloured by cell type in the Landmarks map." loading="lazy">
<img class="ml-only-light" src="../assets/tutorials/explore-cells-2d/still-cell-types.light.png" alt="The ileum section coloured by cell type in the Landmarks map." loading="lazy">
</figure>

## 3. Layer and villus–crypt genes

Recolour in place — no new figure objects:

```python
w.color = "anatomical_layer"  # mucosa, submucosa, muscle, GALT
w.color = "Apob"              # villus-tip enterocytes
w.color = "Cps1"              # crypt / lower villus
```

**Result:** You see the crypt–villus axis and the GALT patches in anatomical layers before you select them.

<figure class="ml-hero ml-hero--still" markdown="0">
<img class="ml-only-dark" src="../assets/tutorials/explore-cells-2d/still-anatomical-layer.dark.png" alt="The same section coloured by anatomical layer, with GALT patches visible." loading="lazy">
<img class="ml-only-light" src="../assets/tutorials/explore-cells-2d/still-anatomical-layer.light.png" alt="The same section coloured by anatomical layer, with GALT patches visible." loading="lazy">
</figure>

## 4. Lasso GALT cryptopatch aggregates

Use the Select tool and lasso each GALT cryptopatch on the map ([Select regions](../reference/ui/select-regions.md)). Xu et al. annotate these as small ILF-like aggregates (rich in cDC, ILC3, and FRC), not classical B/T follicles. Each edit updates `w.selections`.

The notebook seeds two tight polygons (`galt-aggregates-west` and `galt-aggregates-east`). Join them for downstream analysis:

```python
galt_hits = w.get_obs_names("galt-aggregates-west").union(
    w.get_obs_names("galt-aggregates-east")
)
```

**Result:** The seeded headless lassos select **294 cells** in total, **260** with `anatomical_layer` GALT (**88.4%** of the selection). That covers the annotated GALT cells in the two cryptopatch aggregates on this slice (western polygon **90.2%** GALT, 164 cells; eastern **86.2%** GALT, 130 cells). Your own lassos may differ.

<figure class="ml-hero ml-hero--still" markdown="0">
<img class="ml-only-dark" src="../assets/tutorials/explore-cells-2d/still-galt-selection.dark.png" alt="Two GALT cryptopatch lassos on the ileum map with cell-type counts for the selection." loading="lazy">
<img class="ml-only-light" src="../assets/tutorials/explore-cells-2d/still-galt-selection.light.png" alt="Two GALT cryptopatch lassos on the ileum map with cell-type counts for the selection." loading="lazy">
</figure>

## 5. Enrichment and violin plots

```python
enrich = ml.enrichment(adata, galt_hits, obs_key="cell_type")
enrich
```

**Result:** Stromal and innate immune types rank highest by `log2_enrichment` relative to the whole section (seeded union: FRC 6.12, cDC (Il22ra2+) 5.99, ILC3 5.58, FDC 5.27, B (follicular) 4.44).

Flag the selection and plot immune markers:

```python
adata.obs["galt_vs_rest"] = "rest"
adata.obs.loc[galt_hits, "galt_vs_rest"] = "GALT selection"
sc.pl.violin(adata, ["Mzb1", "Cd3e"], groupby="galt_vs_rest")
```

**Result:** `Mzb1` and `Cd3e` are higher in the GALT selection than in the rest of the section.

## Next

- [Use selections downstream](../how-to/use-selections-downstream.md)
- [Datasets](../reference/datasets.md)
- [LandmarksWidget API](../reference/api/landmarks.md)
