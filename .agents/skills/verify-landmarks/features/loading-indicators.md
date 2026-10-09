# loading-indicators

Visible bootstrap and Inspect volume loading states (issue #90).

**Specs:** `frontend/e2e/landmarks/landmarks-loading.spec.ts` (map),
`frontend/e2e/landmarks/landmarks-volume.spec.ts` (cube panel, cross-section, volume error)

## Proof

- Map: `plot-bootstrap` shows `data-state="loading"` with delay hook, then unmounts when deck fits.
- Map error: `__landmarksPlotBootstrapHook.fail` leaves `data-state="error"` with a message.
- Cube: `cube-load-immersive` loading overlay until `data-refining="false"`, then clears; refine keeps the image (no overlay).
- Volume error: `__volumeCubeLoadHook.abortImage` shows error on immersive panel and inspect status chip.
- Cross-section: `inspect-cross-load` until cut ranges exist.
