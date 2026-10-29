# Recipes

Each recipe is one [marimo](https://marimo.io) notebook under `demos/recipes/`. The docs site serves a **prepared** studio export (fixed widget state). Draw new selections or re-run analysis in **molab**.

Needs the same optional packages as the demos (`squidpy`, `scanpy`, `leidenalg` where noted). The Squidpy niche recipe uses `demos/data/ileum.h5ad`.

## Squidpy niche colour

Colour Landmarks from Squidpy neighborhood niches on a masked selection, then assign `w.color` to the niche column Squidpy writes to `adata.obs`.

| | Link |
| --- | --- |
| Docs (prepared studio view) | [Squidpy niche colour](squidpy_color/) |
| molab (live kernel) | [squidpy_color.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/squidpy_color.py) |
