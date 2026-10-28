# Issue #242 spike: marimo-studio for Squidpy color recipe

Prototype notebook: `squidpy_color_niche.py`  
Studio view: `studio/squidpy_color_niche/docs/`  
Build: `bash website/recipes/scripts/build-studio-export.sh`

## Measured export times (Linux CI-like VM, 2026-10-28)

| Step | Condition | Seconds |
| ---- | --------- | ------- |
| `marimo-studio view preflight` | Cold (`__marimo__` removed); **failed** on first attempt | 42.58 (error) |
| `marimo-studio view export` | Cold (empty marimo + export cache) | 22.90 |
| `marimo-studio view export` | Warm (`Prepared reused`, marimo cell cache present) | 10.08–10.11 |
| `marimo-studio view preflight` | Warm | 9.37 |
| `marimo export html` (comparison) | Same notebook | 15.81 |

Export breakdown (cold): HTML build ~0.08s; state prepare ~5.3s (5 cell cache misses); bundle ~2.7s; marimo cache 3 hits / 5 misses.

## Persistent cache

| Layer | Location | CI restore |
| ----- | -------- | ---------- |
| marimo cell cache | `website/recipes/__marimo__/cache/` | `actions/cache` on `website/recipes/__marimo__/` keyed by notebook hash + lockfile |
| marimo-export publication store | `MARIMO_EXPORT_REPOSITORY` (default under user cache); this spike used `/tmp/marimo-export-repo-cold` (~9.9 MiB after cold export) | Cache directory keyed by notebook document SHA256 |
| Studio build artifacts | `website/recipes/__marimo__/studio/` (gitignored) | Regenerated; cheap (~0.06s) when view HTML unchanged |

Warm export logs `Prepared reused (1/1)` and skips re-running notebook cells when notebook SHA unchanged.

## Widget on static site (zero-python)

Headless Chromium against `python -m http.server` serving the export:

- `marimo-anywidget` host present; **2** canvases; WebGL context attaches.
- Screenshot: `spike-artifacts/studio-squidpy-zero-python.png` (niche-colored points, selection list shows `patch`, category donut).

No live Python kernel at read time; widget model and outputs come from prepared export state (`marimo-export` / `_marimo-studio/views/.../zero-python/`).

**Interaction:** zero-python serves fixed prepared control values. New lasso selections or re-running Squidpy on changed selections need **server** runtime or **molab**. WASM export was attempted; Pyodide failed installing `milume @ file:///workspace` (micropip invalid wheel) before any widget render — not viable for this recipe without a published milume wheel and Pyodide-compatible scanpy/squidpy stack.

## Zensical / Pages

- Serve export under a separate static route, e.g. `site/docs/recipes/squidpy-niche/` (copy export output after `assemble-pages.sh` docs build or extend that script).
- Zensical can link from `integrations/squidpy-color.md` or embed via `<iframe>`; no Zensical plugin required.
- `check_molab_links.py` on a tree containing the export HTML still passes; recipe molab URLs in notebook markdown are not scanned unless added to tracked `website/content/*.md` (today would fail policy unless checker is extended).

## Open in molab

Notebook header links to  
`https://molab.marimo.io/github/ckmah/milume/blob/main/website/recipes/squidpy_color_niche.py`
