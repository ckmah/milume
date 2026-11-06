# Writing a recipe

Contributor doc (not in the public docs nav). One marimo notebook under `demos/recipes/` becomes a static Zensical page with a frozen Landmarks widget, plus an **Open in molab** link for a live kernel.

Stack: marimo-studio **zero-python** export, `website/scripts/export-recipes.sh`, `prepare_recipe_studio.py`, Zensical template `recipe_studio.html`, and `recipe-studio.js` for light/dark sync with the site palette.

## What you ship

| Artifact | Role |
| --- | --- |
| `demos/recipes/<slug>.py` | Source notebook (script header + cells) |
| `website/content/recipes/<slug>/index.md` | Zensical page stub (`template: recipe_studio.html`) |
| `website/scripts/export-recipes.sh` | `RECIPES=(…)` list drives export + copy into `site/` |
| `website/scripts/check_recipe_payload.py` | `RECIPES` tuple must include your slug for CI payload gate |
| Generated under `website/overrides/partials/` | `recipe-studio-<slug>-head.html` and `-body.html` from `prepare_recipe_studio.py` (commit after export) |
| `website/content/assets/recipe-widgets/` | Shared, content-addressed Landmarks ESM hoisted from prepared views (commit after export) |
| Optional `website/zensical.toml` nav | Add under **How-to guides** when the recipe is user-facing |

Shared Landmarks widget ESM ([#355](https://github.com/ckmah/milume/issues/355), on `main` via #358): `prepare_recipe_studio.py` calls `recipe_widget_esm.py` to pull embedded anywidget JavaScript out of each prepared `.cell.json` and write it under `website/content/assets/recipe-widgets/` as `landmarks-<sha256>.mjs`. The same bytes reuse one file across recipes. Head partials gain `<link data-milume-recipe-widget rel="modulepreload" href="../../assets/recipe-widgets/…">`. `export-recipes.sh` copies that tree into the Pages artifact at `site/docs/assets/recipe-widgets/`.

The zero-python marimo runtime must match **`marimo-studio==0.4.1`**. `patch_zero_python_runtime` applies pinned edits so the export loader accepts those shared URLs; if studio changes and an anchor is missing or duplicated, prepare **errors** instead of shipping a broken page.

Payload budgets are unchanged: `check_recipe_payload.py` plus `frontend/scripts/measure-recipe-payload.mjs`. Hoisted `.mjs` requests count as **widget JS**; prepared cell state and non-JS payloads count as **data**. Both still enforce **data** ≤ 10 MiB and **total** ≤ 16 MiB on the assembled site.

## Notebook layout

### Script header

Use an inline PEP 723 header (same pattern as `demos/recipes/squidpy_color.py`). List only what the notebook imports. Do **not** use `milume[demo]`; pin `milume` and optional analysis deps explicitly.

Include marimo-studio config:

```toml
[tool.marimo-studio]
default = "docs"
runtimes = ["server", "zero-python"]
```

Optional `[tool.marimo-studio.cells]` entries pin which notebook cells map to the **docs** view. Run `marimo-studio view create docs --target demos/recipes/<slug>.py` once after the notebook exists; it writes `demos/recipes/studio/<slug>/` and updates the header cell refs. Commit the studio tree. Edit `demos/recipes/studio/<slug>/docs/index.html` so each visible notebook cell has a matching `<marimo-cell name="…">` host (`landmark_map` for the widget). `squidpy_color` shows the pattern.

### Cell 1 (page intro)

First `@app.cell(hide_code=True)` with `def _(mo):` and `mo.md(...)`. This becomes the top prose block on the docs page. Put the title, one-line goal, dataset identity, and the molab link:

```markdown
**Open in molab:**
[<slug>.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/<slug>.py)
```

Always point at `main` on GitHub, even while your recipe lands on a feature branch.

Explain that the docs page replays **prepared** export state and that molab is where readers change selections or re-run analysis.

### Molab Preview tip (standalone markdown cell)

Add a **second** `@app.cell(hide_code=True)` / `def _(mo):` / `mo.md(...)` whose body is only the shared molab tip (same text as `demos/landmarks.py` and `tests/test_demo_molab_header.py`):

```markdown
> **molab:** Switch from **Preview** to **Run on Server** so this notebook runs properly. The widget needs a live kernel to download data and render; Preview alone will not run this notebook. After the server connects, click **Run all** (the ▶ button at the bottom right) to run the notebook.
```

Keep this in its own cell, not folded into cell 1. molab does not auto-run cells when the kernel connects; users must click **Run all** once after **Run on Server**.

### Imports and analysis cells

Follow `squidpy_color.py`: a plain `@app.cell` for imports, then data load, then setup, then a **`landmark_map`** cell that ends with `w` as the last expression so the widget renders in the wide studio column (`prepare_recipe_studio.py` wraps `name="landmark_map"` in `.milume-recipe-studio-wide`).

Suppress noisy stdout/stderr in the export path when you call scanpy/squidpy (see `landmark_map` in `squidpy_color.py`).

### How cells map to the page

`prepare_recipe_studio.py` extracts each `<marimo-cell>` from the studio export into `.milume-recipe-studio-prose` sections, except **`landmark_map`**, which is full width. Reordering notebook cells changes section order on the docs page.

## Data rules

| Geometry | Dataset | Path |
| --- | --- | --- |
| 2D recipes | Xu 2026 ileum slice | `demos/data/ileum.h5ad` |
| 3D recipes | Trimmed mouse-brain **`small`** volume | HF `Stellaromics/demo` `small` (same identity as landmarks demo; do not attach colon IDs) |

Shared helpers live in `tests/squidpy_color_recipes.py` and tier loaders in `demos/loaders/demo_tiers.py` (`load_2d_ileum_adata`, `load_3d_small_pyxa`, …). Recipes may import them; they are not part of the public API.

**Never call `sc.pp.normalize_total`.** It inflates prepared state and breaks comparability with CI fixtures.

Keep prepared payload within CI budgets (measured on the assembled Pages site):

| Budget | Limit | What counts |
| --- | --- | --- |
| **Data** | ≤ 10 MiB | Widget state plus non-JS file payloads in prepared `.cell.json` |
| **Total transfer** | ≤ 16 MiB | Everything the browser loads for the recipe page, including marimo runtime and Landmarks widget JS |

Enforced by `website/scripts/check_recipe_payload.py` using `frontend/scripts/measure-recipe-payload.mjs`. Marimo runtime and hoisted widget ESM under `docs/assets/recipe-widgets/` count toward **total** only, not **data**. Embedded widget ESM left in `.cell.json` after prepare should not happen; `recipe_widget_esm.assert_no_embedded_widget_esm` guards exports in tests.

## Media rules (stills and capture loops)

When you capture screenshots or video for a recipe page or a PR:

- **Inspect** must not show point clouds; use mesh/label rendering per [Inspect in 3D](../website/content/tools/inspect-3d.md).
- Show the **cursor** whenever the capture simulates pointer use (same bar as montage rows in `docs/montage/shot-spec.md`).
- Ship **light and dark** stills; recipe pages follow Zensical palette toggles, and `website/content/javascripts/recipe-studio.js` mirrors `data-md-color-scheme` onto `.milume-recipe-studio-host` so the Landmarks canvas tracks slate/default.

For automated light/dark checks on an assembled page, use `frontend/scripts/capture-recipe-zensical.mjs` against `http://127.0.0.1:8765/docs/recipes/<slug>/index.html`.

## Register a new slug

Replace `toy_peek` below with your slug (lowercase, underscores).

1. Add `demos/recipes/toy_peek.py` (notebook).
2. Create the studio **docs** view (once):

```bash
uv run marimo-studio view create docs --target demos/recipes/toy_peek.py
```

Commit `demos/recipes/studio/toy_peek/`. Adjust `docs/index.html` if you add or rename displayed cells.

3. Append `toy_peek` to the `RECIPES` bash array in `website/scripts/export-recipes.sh`.
4. Append `"toy_peek"` to the `RECIPES` tuple in `website/scripts/check_recipe_payload.py`.
5. Create `website/content/recipes/toy_peek/index.md`:

```yaml
---
template: recipe_studio.html
recipe_studio: toy_peek
title: Toy peek (guide smoke test)
description: Minimal ileum peek recipe for verifying the export pipeline.
---
```

6. When the recipe is ready for readers, add a nav line under **How-to guides** in `website/zensical.toml` (see `Squidpy niche colour`).

7. **Generate Zensical partials before the first full assemble.** `assemble-pages.sh` runs pytest (including a Zensical build) *before* it exports recipes. A new `recipe_studio.html` page needs the generated overrides:

```bash
cd frontend && npm ci && npm run build && cd ..
uv run bash website/scripts/export-recipes.sh prepare-for-zensical
```

Commit `website/overrides/partials/recipe-studio-<slug>-head.html` and `recipe-studio-<slug>-body.html`, and any new files under `website/content/assets/recipe-widgets/` from the hoister. View state under `website/content/recipes/<slug>/_marimo-studio/` is gitignored and rebuilt in CI.

8. If the notebook is heavy enough to need export CI coverage, extend `.github/workflows/recipe-studio-export.yml` (`RECIPE_NB` / cache `hashFiles`) like `squidpy_color.py`.

## Toy recipe (copy-paste smoke test)

Use this verbatim to verify the guide. Do not merge the toy slug unless you intend to ship it.

Create `demos/recipes/toy_peek.py`:

```python
# /// script
# requires-python = ">=3.11,<3.15"
# dependencies = [
#     "marimo>=0.25.1",
#     "marimo-studio==0.4.1",
#     "milume",
#     "scanpy>=1.10",
# ]
# [tool.marimo-studio]
# default = "docs"
# runtimes = ["server", "zero-python"]
# ///
"""Minimal ileum peek recipe (docs pipeline smoke test)."""

import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    mo.md(
        r"""
        # Toy peek

        Landmarks on the Xu 2026 ileum slice (`demos/data/ileum.h5ad`).

        **Open in molab:**
        [toy_peek.py](https://molab.marimo.io/github/ckmah/milume/blob/main/demos/recipes/toy_peek.py)

        > **Static docs view:** prepared export state. Use **Open in molab** to explore interactively.
        """
    )
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(
        r"""
        > **molab:** Switch from **Preview** to **Run on Server** so this notebook runs properly. The widget needs a live kernel to download data and render; Preview alone will not run this notebook. After the server connects, click **Run all** (the ▶ button at the bottom right) to run the notebook.
        """
    )
    return


@app.cell(hide_code=True)
def load_adata(ml):
    adata = ml.ds.ileum_merfish_xu2026(path=Path("demos/data/ileum.h5ad"))
    return (adata,)


@app.cell
def landmark_map(adata, milume):
    w = milume.peek(adata, color="cell_type")
    w
    return (w,)


if __name__ == "__main__":
    app.run()
```

Complete registration steps in the previous section for slug `toy_peek`, including the one-time `prepare-for-zensical` run so partials exist before `assemble-pages.sh`.

## Build and verify locally

From the repo root, with Node 22+, `uv sync --group dev`, and Playwright browsers installed (`cd frontend && npx playwright install chromium`):

```bash
cd frontend && npm ci && npm run build && cd ..
uv run bash website/scripts/assemble-pages.sh
```

`assemble-pages.sh` runs, in order: website hero build, recipe export (`export-recipes.sh prepare-for-zensical`), Zensical build, headless network recording to prune unused marimo chunks, second Zensical build, copy into `site/`, **`check_recipe_payload.py`**, redirect and agent-md checks.

Preview the integrated recipe:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory site
```

Open `http://127.0.0.1:8765/docs/recipes/toy_peek/index.html` (or your slug). Toggle light/dark in the header; the map canvas should follow (see `recipe-studio.js` and `frontend/src/hooks/notebook-theme.ts`).

Payload-only rerun (site already built):

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory site &
uv run python website/scripts/check_recipe_payload.py
```

## CI

| Workflow | When it runs | What it checks |
| --- | --- | --- |
| `pages.yml` | `main` and PRs touching recipes, website scripts, frontend, … | Full `assemble-pages.sh` including payload budgets |
| `recipe-studio-export.yml` | PRs touching `demos/recipes/**`, … | Cold marimo-studio preflight and warm export for `RECIPE_NB` (today `squidpy_color.py`) |

Required PR policy checks on `main` are listed in [AGENTS.md](../AGENTS.md).

## Theme sync (Zensical ↔ Landmarks)

Zensical sets `data-md-color-scheme` on `body` / `html` (`default` = light, `slate` = dark). `recipe-studio.js` copies that onto `.milume-recipe-studio-host`. Inside the anywidget shadow root, Landmarks reads the same attribute via `resolveNotebookDark` so `landmarks--dark` and deck clearColor track the docs toggle without reload.
