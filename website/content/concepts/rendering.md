# How rendering works

How the 2D map and the Inspect cube draw large data in a notebook: points vs raster, lazy genes, and windowed multiscale image loading under a voxel budget.

### The 2D map: one canvas

The map is a single deck.gl canvas in flat, orthographic coordinates. Cells, selections, landmarks, drafts and neighborhood overlays all draw on it, so they can't drift apart when you pan or zoom. Marker size comes from the median distance between neighboring cells. Neighborhood expansion (k-NN or radius) runs in the browser from the coordinates. It needs no neighbor graph from Python.

The 2D map doesn't draw the tissue image or cell outlines yet. Those appear in the Inspect cube.

### Points and raster

In points mode, each cell is one marker. In raster mode, the browser sorts cells into square bins and gives each bin the mean, or the category mix, of the cells within a window around its centre. In micrometre data, the defaults are 8 µm bins and a 24 µm window. Raster suits dense sections, where points overlap and hide each other. Probe compares bins by similarity. Bins and scores live only in the browser.

<figure class="ml-hero" markdown="0">
<video class="ml-loop" autoplay muted loop playsinline preload="none" data-src="../assets/tools/color-layers/loop-raster" data-theme="dark" poster="../../assets/tools/color-layers/loop-raster.dark.poster.webp" aria-label="The map flips from individual points to square raster bins and back." width="960" height="600"><source src="../assets/tools/color-layers/loop-raster.dark.webm" type="video/webm"><source src="../assets/tools/color-layers/loop-raster.dark.mp4" type="video/mp4"></video>
<img class="ml-loop-poster" src="../assets/tools/color-layers/loop-raster.dark.poster.webp" alt="The map flips from individual points to square raster bins and back." width="960" height="600" loading="lazy">
</figure>

### Genes load when you color by them

At startup only gene names reach the browser. A gene's column is fetched from the kernel the first time you color by it, then kept in a size-limited browser cache that never drops a gene on screen. So a whole-transcriptome panel opens as fast as a small one. `genes=[...]` preloads a short list instead, up to 64 MiB. For color, each gene is scaled from its minimum to its 99th percentile. That scaling is for display only and doesn't change `X`.

### The Inspect cube reads one window

Inspect places a 300 µm square on the map and opens a cube of that window through the full depth of the image. The browser reads only that box from one level of the image pyramid over the widget's own connection, and never reads tables or expression that way. Cells in the window are built into meshes in a Web Worker and colored from the category panel. The cube's Points layer (cell centres) is off by default.

<figure class="ml-hero ml-hero--still" markdown="0">
<img class="ml-only-dark" src="../assets/tools/inspect-3d/still-pill.dark.png" alt="The Inspect cube open: the top pill shows Exit, Inspect with the window size in µm, Save window, and full screen; the bottom toolbar has camera presets and layer toggles." loading="lazy">
<img class="ml-only-light" src="../assets/tools/inspect-3d/still-pill.light.png" alt="The Inspect cube open: the top pill shows Exit, Inspect with the window size in µm, Save window, and full screen; the bottom toolbar has camera presets and layer toggles." loading="lazy">
</figure>

### Choosing an image level: the voxel budget

The hover preview uses a coarse level. The open cube picks the sharpest level whose window fits 64 Mi voxels (about 64 MB of 8-bit texture) and at most 2,048 voxels per axis. Nothing is hard-coded per dataset. On the 3D demo tier, a full-resolution window is over the budget, so the cube loads the next level.

### Which data sizes this covers

Demo data runs from tiny test fixtures to a 2D section, a 3D tier and a full colon run. Tier paths, on-disk sizes, and citations are on [Datasets](../reference/datasets.md).

## Related

- [Color & layers](../reference/ui/color-layers.md)
- [Probe](../reference/ui/probe.md)
- [Inspect in 3D](../reference/ui/inspect-3d.md)
- [Datasets](../reference/datasets.md)
- [Methods](../reference/api/landmarks.md#methods) (`set_render_mode`, `set_raster_basis`)
