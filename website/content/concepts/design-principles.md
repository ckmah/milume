# Design principles

The choices behind milume ("visualize, don't compute"), so you know what to expect from the widget and what stays in your own code.

### Explore spatial biology in your notebook

milume puts a tissue map in a notebook cell so you can look, select and carry what you selected back into code. These principles explain how it does that and where it stops.

### Python owns analysis, the browser owns presentation

The widget computes only what it needs to draw and to select: raster bins, neighborhoods, probe scores and color scales. It doesn't normalize, cluster or test anything, and it never writes into your AnnData. Normalization, clustering and statistics stay in your code, with scanpy, squidpy or anything else. The measure helpers (`distances`, `composition`, `enrichment` and the others) run only when you call them and return DataFrames. They write an `obs` column only when you call `write_obs`.

### Results are plain data

Everything you take out of the widget is an ordinary object: `obs_names` for a selection, a GeoDataFrame for landmarks, and a DataFrame for a measurement. Nothing depends on milume being installed to read it later, and you can hand the same regions to another tool.

### Synced state stays small

Each widget declares its synced values as named, typed fields instead of one shared blob. A value is synced only when Python reads it, sets it or computes it. Camera, colors, layer toggles and cube settings stay in the widget. Each value has one owner, so a notebook slider and a widget control never fight over it. Controls redraw on every frame while you drag and update Python once when you let go, so dependent cells run once per gesture.

### Nothing to build

The widget's browser code is compiled ahead of time and shipped in the wheel. `pip install milume` is all a notebook user needs, with no Node or frontend toolchain. Runtime dependencies are kept small for the same reason.

### Alongside other viewers

milume is for forming intuition quickly. When you need to look at a dataset in depth, use a dedicated viewer and bring the same selections and landmarks with you.

## Related

- [Use selections downstream](../how-to/use-selections-downstream.md)
- [Draw and export landmarks](../how-to/draw-export-landmarks.md)
- [Measure](../reference/api/measure.md)
- [Synced traitlets](../reference/api/landmarks.md#synced-traitlets)
- [Install](../get-started/install.md)
