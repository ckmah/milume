# Match plot colors (squidpy)

Colour the Landmarks map from Squidpy niche labels and reuse the same hex colours in Matplotlib or Scanpy plots.

## Goal

Run Squidpy neighborhood niches on a selection, assign `w.color` to the niche column Squidpy writes, and read colours back with `w.category_colors`.

## Steps

1. Install optional analysis packages:

```bash
pip install scanpy squidpy leidenalg
```

2. Open the ileum slice and draw a region to analyze (or use the whole tissue):

```python
import milume
import milume.datasets as mds
import squidpy as sq

adata = mds.ileum_merfish_xu2026()
w = milume.peek(adata, color="cell_type")
w  # draw a selection in the browser, then continue
```

3. Build a boolean mask aligned to `adata.obs_names` for the selection you want:

```python
region = w.selections[-1]["id"]
mask = adata.obs_names.isin(w.get_obs_names(region))
```

4. Run Squidpy niches on that mask (neighbors + spatial graph first):

```python
sc.pp.neighbors(adata)
sq.gr.spatial_neighbors_knn(adata, n_neighs=6)
sq.gr.calculate_niche(
    adata,
    flavor="neighborhood",
    groups="cell_type",
    n_neighbors=6,
    resolutions=0.5,
    mask=mask,
)
niche_col = "nhood_niche_res=0.5"
```

5. Colour the map from the new column:

```python
w.color = niche_col
```

6. Reuse the map palette elsewhere:

```python
palette = w.category_colors(niche_col)  # {label: "#rrggbb"}
```

## Result

Landmarks points and downstream plots share the same label-to-colour mapping as the map.

For a prepared studio walkthrough (fixed selection and export state), use the [Squidpy niche colour recipe](recipes/squidpy_color/) or the live [molab notebook](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_color.py). The recipe export pipeline is unchanged; this page is the task-only steps.

Squidpy and Scanpy parameters stay in their own docs; milume traitlets are in the [LandmarksWidget API](../reference/api/landmarks.md).
