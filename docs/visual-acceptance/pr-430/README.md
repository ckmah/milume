# PR 430 visual acceptance

Toy Inspect cube stills for issue 429. `capture.mjs` drives the landmarks-volume harness.

1. From `frontend`, run `npm run build`.
2. Start a new Vite server: `npx cross-env DEV_WIDGET=landmarks-volume npx vite --host 127.0.0.1 --port 5173 --strictPort`.
3. Run `node ../docs/visual-acceptance/pr-430/capture.mjs`.

The script writes `category-meshes-dark.png`, `category-meshes-light.png`, and `image-reset.png` in this directory. GitHub renders them from `raw.githubusercontent.com` when the PR body pins the commit that contains the files.

The pointer overlay is on whenever the script moves the mouse. The toolbar has Image and Labels and no Points control.
