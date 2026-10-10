# website/

Public GitHub Pages sources for **milume** (landing + Zensical docs).

| Path | Role |
| --- | --- |
| `landing/` | Impeccable Persuade static landing → site `/` |
| `content/` | Zensical Read docs → site `/docs/` |
| `zensical.toml` | Docs config (`docs_dir = content`, `site_dir = dist`) |
| `PRODUCT.md` / `DESIGN.landing.md` | Impeccable product + landing design contracts |
| `scripts/assemble-pages.sh` | Merge landing + Zensical into repo-root `site/` |

Engineering notes stay in the repo’s top-level `docs/` and are **not** the Zensical tree.

## Hero WebGL loop

The landing hero and docs home mount `landing/assets/hero-renderer.js` (built from
`landing/hero/`). Point data lives in `landing/assets/hero-points.bin`. Posters:
`hero-poster.png` (fallback / reduced motion) and `hero-poster-800.png` for README
embeds.

```bash
cd website && npm ci && npm run build:hero
```

## Local preview

```bash
uv sync --group dev
uv run bash website/scripts/assemble-pages.sh
python -m http.server 8080 --directory site
```

Open `http://127.0.0.1:8080/` (landing) and `http://127.0.0.1:8080/docs/` (docs).

Docs-only live reload (sync API snippets first):

```bash
uv run python website/scripts/sync-api-docs.py
cd website && uv run zensical serve
```

(Note: `zensical serve` serves docs at `/`, not under `/docs/`.)

## Deploy

`.github/workflows/pages.yml` assembles on `main` and deploys via GitHub Actions Pages.
Target: `https://ckmah.github.io/milume/`
