# obs-ramp-legend

Sequential ramp in Explore when `color_mode === "obs"` (numeric `w.color` on `adata.obs`).

**Spec:** `frontend/e2e/landmarks/landmarks-obs-ramp.spec.ts`

## Proof

- `data-testid="obs-ramp-legend"` shows `legend_title`, `obs-ramp-vmin`, `obs-ramp-vmax`
- Categorical `w.color` or gene pick hides the ramp (`genes-channel-legend` for genes)
- `color_vmin` / `color_vmax` trait updates re-render scale ends without remount
