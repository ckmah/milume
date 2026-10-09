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

## Local preview

```bash
uv sync --group dev
uv run bash website/scripts/assemble-pages.sh
python -m http.server 8080 --directory site
```

Open `http://127.0.0.1:8080/` (landing) and `http://127.0.0.1:8080/docs/` (docs).

Docs-only live reload:

```bash
cd website && uv run zensical serve
```

(Note: `zensical serve` serves docs at `/`, not under `/docs/`.)

## Deploy

`.github/workflows/pages.yml` assembles on `main` and deploys via GitHub Actions Pages.
Target: `https://ckmah.github.io/milume/`
