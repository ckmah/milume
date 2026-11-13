# PR 430 visual acceptance

Production-built landmarks-volume harness stills for issue 429. These shots are `vite build` plus `vite preview` of `frontend/dev/landmarks-volume`. They are not `vite` (the dev server) and not a marimo notebook.

`build-stamp.json` in the preview dist records `mode: production`, `command: vite build`, `serve: vite preview`, and the git SHA. `capture.mjs` refuses the page unless that stamp matches, `devicePixelRatio` is 2, and the document did not load `@vite/client` or a `/src/` module.

## Reproduce

From the repo root, with `frontend` dependencies installed:

```sh
CAPTURE_SHA=$(git rev-parse HEAD) \
CAPTURE_LABEL=pr-head \
CAPTURE_PORT=4173 \
node docs/visual-acceptance/pr-430/run.mjs
```

`run.mjs` builds with `docs/visual-acceptance/pr-430/harness.vite.config.mjs`, serves that dist with `vite preview`, then runs `capture.mjs`.

Historical stills use the same script against a worktree of that SHA. `CAPTURE_FRONTEND` points at that worktree's `frontend`. `CAPTURE_RESET=0 CAPTURE_CLIP=0` keeps the run to the category stills.

The volume harness shell is hardcoded dark. Light stills remove that shell class so `.landmarks--light` tokens apply, then check the computed `.landmarks__body` background (dark luminance under 80, light over 140). The cube viewport stays dark in both themes. The pointer sits on the Image toggle so the Top camera is not a hover cut.

## What the files show

Same toy Inspect window (`window=100`), Labels on, Top camera, DPR 2, SwiftShader.

| File | SHA | Chrome | What is on screen |
| --- | --- | --- | --- |
| `pre418-a8730ff-*-dpr2.png` | `a8730ff` (last green volume nightly) | light and dark | Textured category cells, one warm and one cool. Toolbar has Points. Downsampled orange count is 0. |
| `merge-base-510927f-*-dpr2.png` | `510927f` (PR base) | light and dark | Both cells are uncoloured white. Orange count 0. No Points control. `data-image-mode` is `mip`. |
| `pr-c67ef6b-*-dpr2.png` | `c67ef6b` | light and dark | Earlier head. Solid orange and blue meshes (993 and 621 samples in a 160×120 downsample). No Points. |
| `pr-e50eb9a-*-dpr2.png` | `e50eb9a` | light and dark | Textured cells. Cube viewport pixels match `a8730ff` (0 of 1,334,967 differ). No Points control. `data-image-mode` is `additive`. Orange count 0. |
| `pr-e50eb9a-reset-*-dpr2.png` | `e50eb9a` | light and dark | Image was set to MIP, then Reset. Additive is checked and `data-image-mode` is `additive`. Cells stay textured. Pointer is on Additive. |
| `inspect-reset-clip.mp4` | `e50eb9a` | dark | 10.8s. Pointer is visible. Textured cells, Iso switches the camera to oblique, Image is set to MIP, Reset returns Additive. |

Counts and stamp URLs are in `provenance-*.json`. The clip is a separate run of the same production preview path; its banner names `c67ef6b`.

`category-meshes-dark.png`, `category-meshes-light.png`, and `image-reset.png` are the earlier dev-server captures (DPR 1). They are not this evidence.
