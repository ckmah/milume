# Recipes

Each recipe is one [marimo](https://marimo.io) notebook under `demos/recipes/`. The docs site serves a **prepared** studio export (fixed widget state). Draw new selections or re-run analysis in **molab**.

Needs the same optional packages as the demos (`squidpy`, `scanpy`, `leidenalg` where noted). 2D recipes use the **ileum** tier via ``milume.datasets.ileum_merfish_xu2026()`` ([#380](https://github.com/ckmah/milume/issues/380)).

## Squidpy niche colour

Colour Landmarks from Squidpy neighborhood niches on a masked selection, then assign `w.color` to the niche column Squidpy writes to `adata.obs`.

| | Link |
| --- | --- |
| Docs (prepared studio view) | [Squidpy niche colour](squidpy_color/) |
| molab (live kernel) | [squidpy_color.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_color.py) |

## Squidpy Moran's I (ileum)

Compare all-cell Moran's I with Moran's I within enterocytes on the ileum slice, then pick a gene in the widget.

| | Link |
| --- | --- |
| Docs (prepared studio view) | [Squidpy Moran's I](squidpy_moran/) |
| molab (live kernel) | [squidpy_moran.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_moran.py) |
