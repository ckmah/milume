# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: plain static HTML/CSS/JS for the Persuade landing under `website/landing/`; Zensical for Read docs under `website/content/`; GitHub Actions assembles both into the Pages artifact (`site/`). Chosen because Option A (split assemble) was approved and keeps engineering `docs/` untouched.

## Users

Spatial-omics notebook users — researchers and analysts who already work in Python notebooks (marimo, Jupyter) with AnnData. They arrive wanting to install quickly, try `LandmarksWidget` on tissue coordinates, and understand how synced state reaches Python. They distrust marketing fluff and judge tools by whether the docs match real API behavior.

## Product Purpose

milume ships interactive notebook widgets for spatial omics: Python owns analysis; the browser owns presentation; state syncs through typed traitlets. The public site exists to (1) make the offer intelligible in one viewport and (2) get visitors into install + LandmarksWidget docs without colliding with contributor engineering notes.

## Positioning

Widgets that stay in sync with the caller’s AnnData — landmarks and selections drawn on tissue coordinates, hits persisted as `obs_names` — without requiring a frontend toolchain. Neighbor expand and gene coloring run in the widget; notebooks keep analysis ownership.

## Operating Context

Visitors land on GitHub Pages at `https://ckmah.github.io/milume/`. Landing CTAs point to `/docs/install/`, the GitHub repo, and molab demos. Docs are Zensical Read-mode pages. Widget UI in notebooks (shadcn/React) is a separate Operate surface and is not the public-site design system.

## Capabilities and Constraints

- Public install path: `pip install milume` (PyPI). Source install via `uv` is documented for contributors.
- Hero widget: `LandmarksWidget(adata, color=..., genes=...)` with `obsm["spatial"]`.
- Do not invent customer counts, benchmarks, or unshipped widgets.
- Do not point Zensical `docs_dir` at repo engineering `docs/`.
- Do not block site shipping on a pending PyPI 1.0.1 approval.

## Brand Commitments

Voice: concrete, notebook-native, same register as `CONTEXT.md` / README (widget, synced state, landmark, selection). Three-word personality: **precise, instrumented, calm**.

Anti-claims / anti-looks for Persuade surfaces:

- No SaaS hero-metric strips, icon-card feature grids, floating badges on hero media, or eyebrow kickers.
- Avoid AI-default aesthetics: purple/indigo glow, cream+terracotta Fraunces template, broadsheet hairline columns.
- Prefer real product imagery (`assets/landmarks_widget_*.png`) over abstract gradients.

Landing (Persuade) and docs (Read) share only a thin brand bridge: product name, one accent hue, favicon/wordmark. Full Persuade expression must not be forced onto docs chrome.

## Evidence on Hand

- README table of widgets + molab demo badges.
- In-repo screenshots: `assets/landmarks_widget_{light,dark}.png`.
- Domain language in `CONTEXT.md`; Landmarks ↔ GeoDataFrame contract in engineering `docs/landmarks-spatialdata-contract.md` (promote excerpts only when useful).
- Constructor and notebook API documented on `LandmarksWidget` in package source.

## Product Principles

1. **Show the widget.** Hero proof is a real LandmarksWidget capture, not an illustration of “AI spatial biology.”
2. **One clear action.** Install / open docs / try demo — not a taxonomy of features.
3. **Truth over pitch.** Copy stays in the product’s own vocabulary; no unverifiable superlatives.
4. **Related-but-separate.** Persuade landing and Read docs share product truth and a thin bridge, not one visual system.
5. **Respect engineering docs.** Contributor `docs/` stays out of the public tree unless deliberately promoted.

## Accessibility & Inclusion

WCAG 2.2 AA for body and controls on the landing. Docs inherit Zensical defaults. Honor `prefers-reduced-motion`. Color is never the sole meaning carrier. Semantic HTML first.
