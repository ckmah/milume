# milume

<div class="milume-docs-hero" data-milume-hero data-assets-base="assets/" markdown="0">
  <canvas class="milume-hero__canvas" width="1600" height="900"></canvas>
  <img class="milume-hero__poster" src="assets/hero-poster.png" alt="" width="1600" height="900" decoding="async" />
</div>

[LandmarksWidget](quickstart.md) draws selections and landmarks on tissue
coordinates in `AnnData` or `SpatialData`. Python owns analysis; the browser
owns presentation; geometry syncs through traitlets.

```python
import milume

w = milume.peek(adata, color="cell_type")
```

## Agents

- [llms.txt](https://ckmah.github.io/milume/llms.txt) — page index
- [llms-full.txt](https://ckmah.github.io/milume/llms-full.txt) — bundled markdown
- Markdown mirrors: append `.md` to doc paths (for example `install.md`)
