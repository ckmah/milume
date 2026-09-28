# Inspect preview, docked cube and inspect history: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Inspect, hovering shows a live coarse preview cube, and a click commits
an inspect selection. The committed selection opens in the docked cube, which
refines from coarse to fine, and the dock lists every inspect selection in a
history strip.

**Architecture:**

- **Chunk cache.** A per-widget decoded-chunk cache patches each zarrita array's
  `getChunk`, so every `VolumeCube` instance on the same store shares chunks.
- **Prefetch-then-swap.** `VolumeCube` hands Viv only sources whose blocks have
  already arrived. That one mechanism gives:
  - the dock its coarse-then-fine step;
  - the preview seamless region recentres.
- **Loaded region.** The preview is a second `VolumeCube` whose loaded region is
  3× the square. The square slides over that region through the existing pan
  offset.
- **Engine.** The engine owns:
  - the zoom-scaled square;
  - hover events;
  - inspect-selection commits.
- **React.** React owns:
  - restoring a focused entry's view;
  - the history strip.

**Tech Stack:** TypeScript/React 19, deck.gl 9.2 + Viv 0.22, zarrita 0.5.4,
Playwright, Python 3.12, spatialdata, pytest.

**Spec:** [`docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md`](../specs/2026-09-26-inspect-preview-dock-design.md)

## Global Constraints

- **Traits.** No new synced traits. Inspect selections are entries in `selections`:
  - `type: "inspect"`;
  - `point_indices`;
  - `window: {cx, cy, size_um, cut}`.
- **Main view.** No image layer in the Landmarks main view.
- **Membership.** Membership is the points inside the axis-aligned square, at every
  depth. The cut never changes membership.
- **Square.** The square is `INSPECT_SQUARE_PX = 160` screen px:
  - its µm size is `160 / 2 ** zoom`;
  - the browser writes `inspect_size_um` at commit;
  - Python only reads it.
- **Budgets:**
  - the preview region is `PREVIEW_REGION_SCALE = 3` × the square, with
    `PREVIEW_REGION_BUDGET = 8 * 1024 * 1024` voxels;
  - the dock uses `WINDOW_VOXEL_BUDGET` (64M);
  - both respect `MAX_TEXTURE_AXIS` (2048).
- **Chunk cache:** decoded bytes, least recently used first out, capped at
  `CHUNK_CACHE_BYTES = 256 * 1024 * 1024`, scoped per widget. Prefetch runs at most
  `PREFETCH_CONCURRENCY = 2` requests at a time.
- **Preview float:** about `PREVIEW_PX = 240` px, max-intensity projection only,
  fixed camera, `data-testid="inspect-preview"`. It follows the Labels toggle.
- **WebGL contexts:** at most two per Landmarks widget, the preview and the dock.
- **Dock level:** the dock shows `data-level` on its `.volume-cube__view`. It shows
  the coarse level first and swaps only when the dock level's image and labels
  have both arrived.
- **Legend:** the hosted cube shows no category legend. The standalone
  `VolumeCubeWidget` keeps its legend.
- **Height:** the default Landmarks height is 720 px (was 550).
- **Tests:** keep only feature and regression tests. e2e scopes the dock's view as
  `page.getByRole("dialog", { name: "Cube" }).locator(".volume-cube__view")` and
  the preview's as `page.getByTestId("inspect-preview").locator(".volume-cube__view")`.
- **UI primitives:** use shadcn/ui primitives from `@/components/ui/*` and the Soft
  Float chrome classes already in `landmarks.css` (`FLOAT_PANEL`,
  `chromeHitClass`).
- **Windows builds:**
  - `export npm_config_script_shell="C:/Program Files/Git/bin/bash.exe"` before any
    npm script;
  - build one widget with `SPATIAL_RX_BUILD_WIDGET=<name> npx vite build`, landmarks
    last;
  - bundles are git-ignored.
- **Processes:** never stop other people's marimo or napari processes. Test
  notebooks on your own `marimo run --headless --port <free>`.

## File map

| File | Responsibility |
| --- | --- |
| `frontend/src/widgets/volume-cube/chunk-cache.ts` (new) | `ChunkCache`: decoded-chunk LRU, `attach`, prefetch queue with pause/resume |
| `frontend/src/widgets/volume-cube/window-source.ts` | `pickLevel(..., budget)`, `regionBox`, `levelBox`, `chunkRing` |
| `frontend/src/widgets/volume-cube/VolumeCube.tsx` | prefetch-then-swap, `budget` / `region` / `coarse` / `interactive` / `showLegend` / `chunkCache` / `onRendered` props, `data-level`, `data-refining` |
| `spatial_rx/static/landmarks.js` | zoom-scaled square, hover events, inspect-selection commit and move, `setInspectWindow` |
| `frontend/src/widgets/landmarks/engine.d.ts` (or wherever `EngineHandle` is typed) | types for the new engine events and methods |
| `frontend/src/widgets/landmarks/use-inspect-cube.ts` | restore a focused entry, write the cut into the focused entry, close the dock when no entries are left |
| `frontend/src/widgets/landmarks/chrome/cube-window.tsx` | pinned dock, history strip, chip snapshots, no legend, coarse options |
| `frontend/src/widgets/landmarks/chrome/inspect-preview.tsx` (new) | preview float: hover subscription, region recentre, velocity lead, prefetch ring |
| `frontend/src/widgets/landmarks/LandmarksView.tsx` | 720 px default, one `ChunkCache` per widget, `cubeBudgets` prop, mounting the preview |
| `frontend/dev/landmarks-volume/main.tsx` | `?budgets=preview,dock` harness override |
| `tests/helpers.py`, `frontend/dev/export-landmarks-volume-fixture.py` | 3-level toy pyramid, regenerated fixture |
| Docs | README Inspect paragraph, ADR 0006 addendum, `inspect-cube.md`, new `inspect-history.md`, `landmarks.py` docstring |

## Shared names (every task uses these exact identifiers)

```ts
// window-source.ts
export const PREVIEW_REGION_SCALE = 3;
export const PREVIEW_REGION_BUDGET = 8 * 1024 * 1024;
export function pickLevel(levels: Level[], frame: Frame, sizeUm: number, budget?: number): Level; // budget defaults to WINDOW_VOXEL_BUDGET
export function levelBox(level: Level): Box;                 // the whole level
export function regionBox(level: Level, frame: Frame, cx: number, cy: number, sizeUm: number): Box; // = windowBox
export function chunkRing(source: ZarrSource, box: Box): number[][]; // chunk coords (in source.labels order) one chunk outside box in y/x

// chunk-cache.ts
export const CHUNK_CACHE_BYTES = 256 * 1024 * 1024;
export const PREFETCH_CONCURRENCY = 2;
export class ChunkCache {
  constructor(maxBytes?: number, concurrency?: number);
  attach(arr: zarr.Array<zarr.DataType, zarr.Readable>, key: string): void;
  prefetch(arr: zarr.Array<zarr.DataType, zarr.Readable>, coords: number[][]): void;
  pause(): void;
  resume(): void;
  clearQueue(): void;
  readonly bytes: number;   // decoded bytes held
  readonly hits: number;    // getChunk calls answered from cache (for e2e)
  readonly misses: number;
}

// VolumeCube.tsx props (new)
budget?: number;                                  // default WINDOW_VOXEL_BUDGET
region?: { scale: number; budget: number; cx: number; cy: number } | null; // preview: loaded region centre + size
coarse?: { scale: number; budget: number } | null; // dock: coarse first step picks the level pickLevel(levels, frame, size*scale, budget)
interactive?: boolean;                            // default true; false = no camera controller
showLegend?: boolean;                             // default true
chunkCache?: ChunkCache | null;
onRendered?: (canvas: HTMLCanvasElement) => void; // after each deck render
// CubeLoadState gains: refining: boolean

// engine events (subscribeInspect)
type InspectEvent =
  | { type: "place"; x: number; y: number }
  | { type: "hover"; x: number; y: number; sizeUm: number; px: number; py: number }
  | { type: "hover-end" }
  | { type: "commit"; index: number }    // selection index created or moved
  | { type: "close" };
// engine handle methods (new)
setInspectWindow(x: number, y: number, sizeUm: number): void; // move the placed square without events
getInspectOverlay(): { hover: [number, number] | null; placed: [number, number] | null; sizeUm: number; placedSizeUm: number | null };

// LandmarksView prop (new, harness only)
cubeBudgets?: { preview: number; dock: number };
```

---

### Task 1: Three-level toy pyramid and regenerated harness fixture

**Files:**
- Modify: `tests/helpers.py` (`toy_spatialdata`)
- Modify: `frontend/dev/export-landmarks-volume-fixture.py` only if the element paths change (they should not)
- Regenerate: `frontend/dev/landmarks-volume/public/toy.sdata.zarr/**`, `frontend/dev/landmarks-volume-fixture.json`
- Test: `tests/test_volume_source.py`

**Interfaces:**
- Produces: toy store with `images/mosaic/s0..s2` and `labels/cells/s0..s2`, on
  matching grids: (64, 256, 256), (32, 128, 128), (16, 64, 64).

- [ ] **Step 1: Write the failing test** (append to `tests/test_volume_source.py`; the file already has a `toy` fixture built from `toy_spatialdata(tmp_path / "toy.zarr")`, so reuse it)

```python
def test_toy_pyramid_levels_share_grids(toy):
    import zarr

    root = zarr.open_group(str(toy.path), mode="r")
    image = [root[f"images/mosaic/s{i}"].shape[-3:] for i in range(3)]
    labels = [root[f"labels/cells/s{i}"].shape for i in range(3)]
    assert image == [(64, 256, 256), (32, 128, 128), (16, 64, 64)]
    assert labels == image
```

- [ ] **Step 2: Run it and check it fails**

Run: `uv run pytest tests/test_volume_source.py::test_toy_pyramid_levels_share_grids -v`
Expected: FAIL (`KeyError`/missing `s1`).

- [ ] **Step 3: Implement.** In `toy_spatialdata`, pass `scale_factors=[2, 2]` to both
  `Image3DModel.parse(...)` and `Labels3DModel.parse(...)`. If spatialdata keeps Z
  whole for 3D scale factors, pass dict factors so Z halves too:
  `scale_factors=[{"z": 2, "y": 2, "x": 2}, {"z": 2, "y": 2, "x": 2}]`. Check which
  form this spatialdata version accepts with `help(Image3DModel.parse)`.

- [ ] **Step 4: Run the volume tests**

Run: `uv run pytest tests/test_volume_source.py tests/test_landmarks_volume.py -v`
Expected: all PASS. Inference still picks `mosaic`, `cells` and the frame from s0.

- [ ] **Step 5: Regenerate the harness fixture**

Run: `uv run python frontend/dev/export-landmarks-volume-fixture.py`
Expected: `toy.sdata.zarr` now has `s1` and `s2` under both elements, and
`landmarks-volume-fixture.json` is rewritten. Then run the existing e2e to confirm
nothing regressed:
`cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts`
Expected: PASS (the dock still picks s0, well inside 64M).

- [ ] **Step 6: Commit**

```bash
git add tests/helpers.py tests/test_volume_source.py frontend/dev/landmarks-volume frontend/dev/landmarks-volume-fixture.json
git commit -m "test: three-level toy image and labels pyramid"
```

---

### Task 2: Chunk cache and level helpers

**Files:**
- Create: `frontend/src/widgets/volume-cube/chunk-cache.ts`
- Modify: `frontend/src/widgets/volume-cube/window-source.ts`
- Test: typecheck plus the e2e in Task 3 (the frontend has no unit runner; do not add one)

**Interfaces:**
- Produces: `ChunkCache`, `PREVIEW_REGION_SCALE`, `PREVIEW_REGION_BUDGET`,
  `pickLevel(..., budget)`, `levelBox`, `regionBox`, `chunkRing` (signatures in
  Shared names).

- [ ] **Step 1: Confirm the zarrita hook.** `node_modules/zarrita/dist/src/indexing/get.js`
  calls `arr.getChunk(chunk_coords, opts.opts)`. Patching the instance's `getChunk`
  therefore caches every chunk that `zarr.get` reads. `arr.chunks` gives the chunk
  shape in the array's axis order.

- [ ] **Step 2: Write `chunk-cache.ts`**

```ts
import type * as zarr from "zarrita";

type AnyArray = zarr.Array<zarr.DataType, zarr.Readable>;
type Chunk = zarr.Chunk<zarr.DataType>;

/** Decoded bytes the cache may hold (per widget). */
export const CHUNK_CACHE_BYTES = 256 * 1024 * 1024;
/** Background prefetch requests in flight at once. */
export const PREFETCH_CONCURRENCY = 2;

const ATTACHED = Symbol("chunkCache");

/**
 * Decoded Zarr chunks shared by every cube of one widget. `attach` patches an
 * array's `getChunk`, which `zarr.get` calls per chunk, so windows and regions
 * that overlap earlier ones only copy memory. Keys are `<key>/<coords>`, so two
 * array objects opened on the same level (preview and dock) share entries.
 */
export class ChunkCache {
  private readonly entries = new Map<string, { chunk: Promise<Chunk>; bytes: number }>();
  private readonly queue: { arr: AnyArray; coords: number[] }[] = [];
  private running = 0;
  private paused = false;
  bytes = 0;
  hits = 0;
  misses = 0;

  constructor(
    private readonly maxBytes = CHUNK_CACHE_BYTES,
    private readonly concurrency = PREFETCH_CONCURRENCY,
  ) {}

  attach(arr: AnyArray, key: string): void {
    const tagged = arr as AnyArray & { [ATTACHED]?: ChunkCache };
    if (tagged[ATTACHED] === this) return;
    const original = arr.getChunk.bind(arr);
    arr.getChunk = ((coords: number[], opts?: unknown) =>
      this.load(`${key}/${coords.join(".")}`, () => original(coords, opts as never))) as AnyArray["getChunk"];
    tagged[ATTACHED] = this;
  }

  private load(id: string, fetch: () => Promise<Chunk>): Promise<Chunk> {
    const hit = this.entries.get(id);
    if (hit) {
      this.hits++;
      // Re-insert: Map order is the LRU order.
      this.entries.delete(id);
      this.entries.set(id, hit);
      return hit.chunk;
    }
    this.misses++;
    const entry = { chunk: fetch(), bytes: 0 };
    this.entries.set(id, entry);
    entry.chunk.then(
      (chunk) => {
        entry.bytes = (chunk.data as { byteLength?: number }).byteLength ?? 0;
        this.bytes += entry.bytes;
        this.evict();
      },
      () => {
        // A failed read must not poison retries.
        if (this.entries.get(id) === entry) this.entries.delete(id);
      },
    );
    return entry.chunk;
  }

  private evict(): void {
    for (const [id, entry] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      if (!entry.bytes) continue; // still in flight
      this.entries.delete(id);
      this.bytes -= entry.bytes;
    }
  }

  /** Queue background reads (through the patched `getChunk`, so they land here). */
  prefetch(arr: AnyArray, coords: number[][]): void {
    for (const c of coords) this.queue.push({ arr, coords: c });
    this.pump();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.pump();
  }

  clearQueue(): void {
    this.queue.length = 0;
  }

  private pump(): void {
    while (!this.paused && this.running < this.concurrency && this.queue.length) {
      const { arr, coords } = this.queue.shift()!;
      this.running++;
      arr
        .getChunk(coords)
        .catch(() => undefined)
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
}
```

- [ ] **Step 3: Extend `window-source.ts`.** Change `pickLevel` to take
  `budget = WINDOW_VOXEL_BUDGET` and use it in place of the constant. Then add:

```ts
/** Loaded preview region: this many times the square's side. */
export const PREVIEW_REGION_SCALE = 3;
/** Voxels one preview region may load. */
export const PREVIEW_REGION_BUDGET = 8 * 1024 * 1024;

/** The whole level as one box. */
export function levelBox(level: Level): Box {
  return {
    z0: 0,
    z1: axisSize(level.source, "z"),
    y0: 0,
    y1: axisSize(level.source, "y"),
    x0: 0,
    x1: axisSize(level.source, "x"),
  };
}

/** A square region of `sizeUm` around (cx, cy): the same box rule as a window. */
export function regionBox(level: Level, frame: Frame, cx: number, cy: number, sizeUm: number): Box {
  return windowBox(level, frame, cx, cy, sizeUm);
}

/** Chunk coordinates one chunk outside `box` in Y and X (full Z), in `source.labels` order. */
export function chunkRing(source: ZarrSource, box: Box): number[][] {
  const chunks = source._data.chunks;
  const at = (axis: string) => source.labels.indexOf(axis);
  const [iz, iy, ix] = [at("z"), at("y"), at("x")];
  const span = (lo: number, hi: number, i: number) => [Math.floor(lo / chunks[i]!), Math.ceil(hi / chunks[i]!) - 1];
  const [zy0, zy1] = span(box.z0, box.z1, iz);
  const [cy0, cy1] = span(box.y0, box.y1, iy);
  const [cx0, cx1] = span(box.x0, box.x1, ix);
  const maxY = Math.ceil(axisSize(source, "y") / chunks[iy]!) - 1;
  const maxX = Math.ceil(axisSize(source, "x") / chunks[ix]!) - 1;
  const out: number[][] = [];
  for (let y = Math.max(0, cy0 - 1); y <= Math.min(maxY, cy1 + 1); y++) {
    for (let x = Math.max(0, cx0 - 1); x <= Math.min(maxX, cx1 + 1); x++) {
      if (y >= cy0 && y <= cy1 && x >= cx0 && x <= cx1) continue;
      for (let z = zy0; z <= zy1; z++) {
        out.push(source.labels.map((l, i) => (i === iz ? z : i === iy ? y : i === ix ? x : 0)));
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/widgets/volume-cube/chunk-cache.ts frontend/src/widgets/volume-cube/window-source.ts
git commit -m "feat(volume-cube): shared decoded-chunk cache and level/region helpers"
```

---

### Task 3: VolumeCube prefetch-then-swap, coarse-then-fine and new props

**Files:**
- Modify: `frontend/src/widgets/volume-cube/VolumeCube.tsx`
- Modify: `frontend/src/widgets/landmarks/chrome/cube-window.tsx` (pass `showLegend={false}`, `coarse`, `chunkCache`)
- Modify: `frontend/src/widgets/landmarks/LandmarksView.tsx`:
  - one `ChunkCache` per widget (`useMemo(() => new ChunkCache(), [])`);
  - a `cubeBudgets` prop;
  - `SHELL_HEIGHT = 720`.
- Modify: `frontend/dev/landmarks-volume/main.tsx` (read `?budgets=<preview>,<dock>` and pass `cubeBudgets`)
- Modify: `spatial_rx/landmarks.py` (docstring: "height starts at 720px")
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Consumes: Task 2 names.
- Produces:
  - the VolumeCube props in Shared names;
  - `data-level` (displayed level index) and `data-refining` (`"true"` / `"false"`)
    on `.volume-cube__view`;
  - `CubeLoadState.refining`.

**Design (implement exactly this):**

1. Split *target* from *shown*.
   - The target is computed from props, as today:
     - level from `pickLevel(levels, frame, sizeForLevel, budget)`, where
       `sizeForLevel` is `region ? size * region.scale : size`;
     - box from `region ? regionBox(level, frame, region.cx, region.cy, size * region.scale) : windowBox(...)`,
       or `levelBox(level)` when the whole level is within `region.budget`.
   - The shown state is
     `{ level: Level; box: Box; image: WindowPixelSource; cells: WindowPixelSource | null }`,
     kept in `useState`.
2. When the target key changes (`level.index` + box values + whether labels are
   wanted), build the target's `WindowPixelSource`s.
   - Call `fetchBlock({})` on each: image, plus cells when labels are loaded and
     matched.
   - When all resolve and the target is still the latest, `setShown(target)`.
   - Viv's loader is built only from `shown.image` / `shown.cells`, so Viv never
     waits on a network fetch and never blanks.
3. All geometry comes from `shown.level`:
   - `levelVoxel`, `ry`, `rz`, `levelDepth`, `fit`, `aimTarget`;
   - the slices, `cubeFrame`;
   - the live frame box `liveBox = windowBox(shown.level, frame, window_cx, window_cy, window_size_um)`;
   - pan = `shown.box` against `liveBox`, the same formulas as today (`panX = shownBox.x0 - liveBox.x0`, `panY = liveBox.y1 - shownBox.y1`).
   - A region larger than the window is already clipped to the window by the X/Y
     slices, because `xShown` and `yShown` clamp to `winX` / `winY`. Keep that.
4. Remove the `loaded` / `onViewportLoad` state: `shown` replaces it.
5. **Coarse first step.** When `coarse` is set, and either `shown` is null or the
   new target box does not overlap `shown.box` (at the same level, or after
   converting through the level factors), first load an intermediate target:
   - level: `pickLevel(levels, frame, size * coarse.scale, coarse.budget)`;
   - box: `windowBox` at that level.
   - Show it, then continue to the fine target.
   - While `shown.level.index !== target.level.index`, report `refining: true`.
6. While the dock's fine target is loading, call `chunkCache.pause()`, and
   `chunkCache.resume()` when it is shown. Pass a prop `pausesPrefetch?: boolean`
   (default false); the dock sets it true.
7. Attach the cache: after `loadOmeZarr`, run
   `chunkCache?.attach(level._data, \`${imageUrl}#${i}\`)` for each level. Do the
   same for labels, keyed on `labelsUrl`.
8. `interactive === false` passes `controller: false` in the view:
   `new FramedVolumeView({ ..., controller: false })`. If `FramedVolumeView`
   ignores it, pass `onViewStateChange={() => null}` and drop the view state
   updates instead.
9. `showLegend === false` hides the Badge legend but keeps `data-highlight`
   computed from `groups`.
10. `onRendered`: pass
    `deckProps={{ onAfterRender: ({ gl }) => onRenderedRef.current?.(gl.canvas as HTMLCanvasElement) }}`
    to `VivViewer`. `VivViewer` spreads `deckProps` into `DeckGL`; see
    `node_modules/@vivjs/viewers/dist/*.mjs` line ~215.
11. Add `data-level={shown?.level.index ?? -1}` and
    `data-refining={String(refining)}` to the root. Keep every existing `data-*`.
12. `status` is unchanged, except that an image fetch error at a fine target with a
    coarse view already shown keeps the coarse view. It then sets the status to
    `Could not refine: <message>`, shown in the title bar by `CubeWindow` through
    `onLoadState`, not over the canvas.

- [ ] **Step 1: Write the failing e2e tests** (add to the `Landmarks inspect cube` describe)

```ts
test("the dock shows the coarse level first, then refines", async ({ page }) => {
  // Small budgets make the toy pyramid pick different levels (see main.tsx ?budgets).
  await page.goto("/?budgets=20000,300000", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).__landmarksEngine));
  await openCubeAtCentre(page);
  const view = cubeWindow(page).locator(".volume-cube__view");
  const levels: string[] = [];
  await view.evaluate((el) => {
    const seen: string[] = [];
    (window as any).__levels = seen;
    new MutationObserver(() => seen.push(el.getAttribute("data-level") ?? "")).observe(el, {
      attributes: true,
      attributeFilter: ["data-level"],
    });
  });
  await expect(view).toHaveAttribute("data-refining", "false");
  levels.push(...(await page.evaluate(() => (window as any).__levels as string[])));
  const shown = levels.filter((l) => l !== "-1").map(Number);
  expect(shown.length).toBeGreaterThanOrEqual(2);
  expect(shown[0]).toBeGreaterThan(shown[shown.length - 1]!);
});

test("the hosted cube has no category legend", async ({ page }) => {
  await openCubeAtCentre(page);
  await page.getByTestId("context-inspect-toolbar").getByRole("switch", { name: "Labels" }).click();
  const view = cubeWindow(page).locator(".volume-cube__view");
  await expect(view).toHaveAttribute("data-labels", "on");
  await expect(view).not.toHaveAttribute("data-highlight", "0");
  await expect(cubeWindow(page).getByLabel("Highlighted cells")).toHaveCount(0);
});

test("reopening the same window reads every chunk from the cache", async ({ page }) => {
  const box = await openCubeAtCentre(page);
  const view = cubeWindow(page).locator(".volume-cube__view");
  await expect(view).toHaveAttribute("data-refining", "false");
  await cubeWindow(page).getByRole("button", { name: "Close cube" }).click();
  const chunkRequests: string[] = [];
  page.on("request", (r) => {
    if (/\/s\d+\/c\//.test(r.url())) chunkRequests.push(r.url());
  });
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(view).toHaveAttribute("data-refining", "false");
  expect(chunkRequests).toEqual([]);
});
```

In the existing highlight test, replace the two
`getByLabel("Highlighted cells")` assertions with `data-highlight` checks only.
This behaviour changes: there is no legend in the dock.

- [ ] **Step 2: Run and check the new tests fail**

Run:
```bash
export npm_config_script_shell="C:/Program Files/Git/bin/bash.exe"
cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "coarse level|no category legend|from the cache"
```
Expected: FAIL (no `data-level` / `data-refining`, legend present, chunks refetched).

- [ ] **Step 3: Implement** Design items 1–12 in `VolumeCube.tsx`, then wire the new
  props:
  - **`CubeWindow`:**
    - `showLegend={false}`;
    - `coarse={{ scale: PREVIEW_REGION_SCALE, budget: budgets.preview }}`;
    - `budget={budgets.dock}`;
    - `chunkCache={cache}`;
    - `pausesPrefetch`;
    - add `cache` and `budgets` props on `CubeWindow`.
  - **`LandmarksView`:**
    - creates the cache;
    - `budgets = cubeBudgets ?? { preview: PREVIEW_REGION_BUDGET, dock: WINDOW_VOXEL_BUDGET }`;
    - passes both down.
  - **`main.tsx`:** parses
    `new URLSearchParams(location.search).get("budgets")` into
    `{ preview, dock }` when present.
  - **Height:** set `SHELL_HEIGHT = 720` and update the `landmarks.py` docstring
    (`height starts at 720px`).

- [ ] **Step 4: Run the whole landmarks-volume spec and the volume-cube tier**

Run:
```bash
cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts
cd frontend && npm run test:e2e:volume-cube
```
Expected: PASS for both. The standalone cube keeps its legend and existing behaviour.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/widgets/volume-cube/VolumeCube.tsx frontend/src/widgets/landmarks frontend/dev/landmarks-volume/main.tsx frontend/e2e/landmarks/landmarks-volume.spec.ts spatial_rx/landmarks.py
git commit -m "feat(volume-cube): prefetch-then-swap, coarse-then-fine dock, shared chunk cache; 720px Landmarks"
```

---

### Task 4: Engine: zoom-scaled square, hover events, inspect selections

**Files:**
- Modify: `spatial_rx/static/landmarks.js`
- Modify: the `EngineHandle` type file under `frontend/src/widgets/landmarks/`; find
  it with `grep -rn "subscribeInspect" frontend/src/widgets/landmarks/*.ts`
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `InspectEvent` (`hover` / `hover-end` / `commit`),
  `setInspectWindow(x, y, sizeUm)`, the extended `getInspectOverlay()`, and
  inspect selections in `selections`.

**Behaviour (implement exactly this):**

- `const INSPECT_SQUARE_PX = 160;`
- `function liveSquareUm() { return INSPECT_SQUARE_PX / Math.pow(2, currentViewState.zoom ?? 0); }`.
  If `currentViewState.zoom` is an array (orthographic `[zx, zy]`), use its first
  element.
- **Square sizes.** `volumeWindow` becomes `{ x, y, size }`, drawn from
  `volumeWindow.size`. `volumeHover` is drawn from `liveSquareUm()`. `windowRing`
  takes `(x, y, size)`.
- **Hover.** On hover moves (`buttons === 0` in inspect), emit
  `{ type: "hover", x, y, sizeUm: liveSquareUm(), px, py }`, using `px, py` from
  `eventPoint`.
  - On zoom, when `volumeHover` is set, re-emit `hover` with the new size: hook
    where the view state updates, e.g. `onViewStateChange`.
  - Emit `hover-end` where `volumeHover` is cleared: mouse leave (~line 5223), Esc
    (~line 5469) and mode change.
- **Press in inspect (button 0).**
  - Find the focused inspect selection: `selected_kind === "selection"`, the entry
    at `selected_index` has `type === "inspect"`, and the press point is inside its
    square.
  - If so, set `inspectGesture = { kind: "move", index, size: entry.window.size_um }`.
  - Otherwise set `inspectGesture = { kind: "new", size: liveSquareUm() }`.
  - Then call `setVolumeWindow(pt.x, pt.y, gesture.size, true)`, which also writes
    `inspect_size_um`, and emit `place`, as today.
  - For a `move`, keep the press offset from the entry centre, so the square does
    not jump under the cursor.
- **Drag (buttons 1).** `setVolumeWindow(x, y, gesture.size, false)` plus a `place`
  event, as today.
- **Release (button 0) with an `inspectGesture`.** Flush as today, then:
  - For `new`: push
    `withHood({ id: nextSelectionId(selections), type: "inspect", point_indices, window: { cx, cy, size_um, cut } })`.
    - `point_indices` = points with `|p.x - cx| <= size/2 && |p.y - cy| <= size/2`,
      using `getPointsData()`.
    - `cut` = `model.get("volume_cut")` when it has 6 numbers, else `[]`.
    - Set `selected_kind = "selection"` and `selected_index` = the new index.
    - Save, then emit `{ type: "commit", index }`.
    - The selection commits even with zero members.
  - For `move`: replace that entry's `window.cx/cy` and `point_indices`, keeping its
    `id`, `size_um` and `cut`. Save, then emit `commit`.
  - Do **not** call `resetToSelectMode()`; Inspect stays active.
- **`setInspectWindow(x, y, sizeUm)`** (handle method): sets `volumeWindow` and
  `inspect_cx` / `inspect_cy` / `inspect_size_um`, saves, redraws, and emits no
  events.
- **`getInspectOverlay()`** returns
  `{ hover, placed, sizeUm: liveSquareUm(), placedSizeUm: volumeWindow?.size ?? null }`.

- [ ] **Step 1: Write the failing e2e tests**

```ts
test("the square's µm size follows zoom", async ({ page }) => {
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  const overlay = () => page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay());
  const size0 = (await overlay()).sizeUm as number;
  await page.evaluate(() => (window as any).__landmarksEngine.zoomBy(-1, { animate: false }));
  await expect.poll(async () => (await overlay()).sizeUm as number).toBeCloseTo(size0 * 2, 3);
});

test("a click commits an inspect selection of the points in the square", async ({ page }) => {
  await openCubeAtCentre(page);
  const selections = (await getModel(page, "selections")) as any[];
  expect(selections).toHaveLength(1);
  const sel = selections[0];
  expect(sel.type).toBe("inspect");
  const size = Number(await getModel(page, "inspect_size_um"));
  expect(sel.window.size_um).toBeCloseTo(size, 6);
  const inside = await page.evaluate((w) => {
    const pts = (window as any).__landmarksEngine.getPoints?.() as [number, number][] | undefined;
    if (!pts) return null;
    return pts.flatMap((p, i) =>
      Math.abs(p[0] - w.cx) <= w.size_um / 2 && Math.abs(p[1] - w.cy) <= w.size_um / 2 ? [i] : [],
    );
  }, sel.window);
  if (inside) expect([...sel.point_indices].sort()).toEqual(inside.sort());
  expect(await getModel(page, "selected_kind")).toBe("selection");
  expect(await getModel(page, "selected_index")).toBe(0);
});

test("dragging the focused square moves its entry; a press elsewhere adds one", async ({ page }) => {
  const box = await openCubeAtCentre(page);
  const first = ((await getModel(page, "selections")) as any[])[0];
  await dragOnMap(page, box, [0.5, 0.5], [0.53, 0.5]);
  await expect.poll(async () => ((await getModel(page, "selections")) as any[])[0].window.cx).toBeGreaterThan(first.window.cx);
  expect(((await getModel(page, "selections")) as any[])).toHaveLength(1);
  await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.2);
  await expect.poll(async () => ((await getModel(page, "selections")) as any[]).length).toBe(2);
  expect(await getModel(page, "selected_index")).toBe(1);
});
```

If the engine handle has no `getPoints`, add
`getPoints: () => { const pts = getPointsData(); return Array.from({ length: pts.length }, (_, i) => [pts[i][0], pts[i][1]]); }`
to the handle. Adapt it to the real shape `getPointsData()` returns: read its
return statement first. The e2e test above then always runs its membership check,
so remove the `if (inside)` guard once `getPoints` exists.

- [ ] **Step 2: Update the existing tests that assume a fixed 100 µm square.**
  - Read the committed size with `Number(await getModel(page, "inspect_size_um"))`
    and derive every offset from it:
    - `cx0 + 40` becomes `cx0 + size / 2 - 10`;
    - `cx1 - 50` becomes `cx1 - size / 2`.
  - Replace the `"Cube · 100 µm"` text checks with a regex `/Cube · [\d.]+ µm/`.
  - In the highlight test, a click now focuses the new inspect selection, so the
    "nothing focused" step must first `setModel(page, { selected_kind: "", selected_index: -1 })`.
  - The "Python's inspect … writes are followed" test stays as is.

- [ ] **Step 3: Run the tests and check the new ones fail.**
  Command as in Task 3 Step 2, with `-g "follows zoom|commits an inspect|moves its entry"`.
  Expected: FAIL.

- [ ] **Step 4: Implement** the behaviour above in `landmarks.js` and the handle
  types.

- [ ] **Step 5: Run the whole landmarks e2e tier**

Run: `cd frontend && npm run test:e2e:landmarks`
Expected: PASS. Other landmark specs use Select, Lasso and so on, which are
unaffected.

- [ ] **Step 6: Commit**

```bash
git add spatial_rx/static/landmarks.js frontend/src/widgets/landmarks frontend/e2e/landmarks/landmarks-volume.spec.ts
git commit -m "feat(landmarks): zoom-scaled Inspect square; clicks commit inspect selections"
```

---

### Task 5: Dock history: restore on focus, cut into the entry, chips with snapshots

**Files:**
- Modify: `frontend/src/widgets/landmarks/use-inspect-cube.ts`
- Modify: `frontend/src/widgets/landmarks/chrome/cube-window.tsx`
- Modify: `frontend/src/widgets/landmarks/landmarks.css` (strip styles only if Tailwind classes cannot express them)
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`, `tests/test_landmarks_volume.py`

**Interfaces:**
- Consumes:
  - Task 4 `commit` events and `setInspectWindow`;
  - inspect selections;
  - `onRendered` and `CubeLoadState.refining` from Task 3.
- Produces:
  - a history strip with `aria-label="Inspect history"`;
  - one chip per inspect selection: a `Button` with
    `aria-label="Inspect <n>"` and `aria-pressed` = focused.

**Behaviour:**

- **Focus restore** (in `useInspectCube`): when the focused selection is an inspect
  entry whose `window` differs from `(inspect_cx, inspect_cy, inspect_size_um)`:
  - call `engine.setInspectWindow(w.cx, w.cy, w.size_um)`;
  - then, if `w.cut.length === 6`, set `volume_cut` to it and save it. The existing
    `pendingRef` path adopts it as a Python-set cut;
  - then `patchCube({ open: true })`.
  - Focusing an inspect selection anywhere therefore opens and restores the dock.
- **Cut into the entry:** every time `write(next)` commits `volume_cut`, also patch
  the focused inspect entry's `window.cut = next`, in the same `facade.set("selections", …)`
  and `save_changes()`. Only that entry's `window` changes; `point_indices` never do.
- **Closing:** when the last inspect selection is gone, `patchCube({ open: false })`.
- **`engine.subscribeInspect`:** `commit` opens the cube (`patchCube({ open: true })`).
  `place` keeps its current meaning.
- **Strip** (`CubeWindow`, below the view, above the resize handle):
  - a horizontal `ScrollArea` or overflow-x flex of chips in `selections` order,
    inspect entries only;
  - each chip is `Button variant="ghost" size="sm"` with `chromeHitClass`;
  - the chip shows a 64×40 snapshot `<img>` when there is one, otherwise a
    swatch in the selection colour (use the same colour source the selections
    panel uses; `grep -rn "selectionColor\|selection.*color" frontend/src/widgets/landmarks/chrome/*.tsx`);
  - its number `n` = 1-based position among inspect entries;
  - clicking sets `selected_kind = "selection"` and `selected_index` = its index,
    then saves.
- **Snapshots:** keep `useRef(new Map<string, string>())` keyed by selection id.
  - In `onRendered(canvas)`, when `refining` is false (from `onLoadState`) and the
    focused inspect entry has no snapshot, draw `canvas` into a 64×40 offscreen 2D
    canvas and store `toDataURL("image/webp", 0.7)`.
  - Then bump a state counter so the chip re-renders.
  - Snapshots are never synced.
- **Title bar:** `Cube · <size_um rounded to 0 decimals> µm`, plus a muted
  "refining" suffix while `refining` is true, or a refine error, if any.

- [ ] **Step 1: Write the failing tests**

```ts
test("history chips restore each committed window and cut", async ({ page }) => {
  const box = await openCubeAtCentre(page);
  await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cuts" }).click();
  const zHi = page.getByRole("slider", { name: "Z cut" }).nth(1);
  await zHi.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => ((await getModel(page, "selections")) as any[])[0].window.cut[5]).toBe(54);
  const first = ((await getModel(page, "selections")) as any[])[0];

  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.25);
  const strip = cubeWindow(page).getByLabel("Inspect history");
  await expect(strip.getByRole("button")).toHaveCount(2);
  await expect(strip.getByRole("button", { name: "Inspect 2" })).toHaveAttribute("aria-pressed", "true");

  await strip.getByRole("button", { name: "Inspect 1" }).click();
  await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeCloseTo(first.window.cx, 3);
  await expect.poll(async () => ((await getModel(page, "volume_cut")) as number[])[5]).toBe(54);
  // The cut never changed membership.
  expect(((await getModel(page, "selections")) as any[])[0].point_indices).toEqual(first.point_indices);
});

test("deleting an inspect selection removes its chip; the last one closes the dock", async ({ page }) => {
  await openCubeAtCentre(page);
  const strip = cubeWindow(page).getByLabel("Inspect history");
  await expect(strip.getByRole("button")).toHaveCount(1);
  await setModel(page, { selections: [], selected_kind: "", selected_index: -1 });
  await expect(cubeWindow(page)).toHaveCount(0);
});
```

```python
# tests/test_landmarks_volume.py
def test_inspect_selection_round_trips_through_get_obs_names(toy):
    from spatial_rx import LandmarksWidget

    w = LandmarksWidget(toy, color="cell_type")
    w.selections = [
        {"id": "inspect-1", "type": "inspect", "point_indices": [0, 2],
         "window": {"cx": 100.0, "cy": 120.0, "size_um": 80.0, "cut": []}},
    ]
    names = list(w.get_obs_names("inspect-1"))
    assert names == [str(w._obs_names[0]), str(w._obs_names[2])]
```

(Use the file's existing `toy` fixture name. If `get_obs_names` takes different
arguments, read its signature at `spatial_rx/landmarks.py:959` and adapt the call,
not the assertion.)

- [ ] **Step 2: Run the tests and check the new ones fail.** Expected: the e2e
  tests FAIL (no strip). The pytest test may already pass, because membership
  reads `point_indices`; keep it as the regression guard for the data model.

- [ ] **Step 3: Implement** the behaviour above.

- [ ] **Step 4: Run the landmarks tier and pytest**

Run: `cd frontend && npm run test:e2e:landmarks` and `uv run pytest -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/widgets/landmarks frontend/e2e/landmarks/landmarks-volume.spec.ts tests/test_landmarks_volume.py
git commit -m "feat(landmarks): Inspect history strip; focusing an inspect selection restores its cube"
```

---

### Task 6: Live preview float with region recentre and prefetch

**Files:**
- Create: `frontend/src/widgets/landmarks/chrome/inspect-preview.tsx`
- Modify: `frontend/src/widgets/landmarks/chrome/index.ts` (export), `LandmarksView.tsx` (mount it when `hasVolume && lm.mode === "inspect"`)
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Consumes:
  - engine `hover` / `hover-end` events;
  - `VolumeCube` with `region`, `interactive={false}`, `mode="mip"` and
    `chunkCache`;
  - `ChunkCache.prefetch`, `chunkRing`, `pickLevel`, `levelBox`,
    `PREVIEW_REGION_SCALE`, and `budgets.preview`.
- Produces: a `<div data-testid="inspect-preview" data-region="<cx>,<cy>">` float.

**Behaviour:**

- **State.** `hover: { x, y, sizeUm, px, py } | null` comes from events.
  `hover-end` sets it to null.
- **Visibility and mounting.**
  - The float renders only while `hover` is set and the pointer is inside the
    volume's XY extent (`volume.origin_um` plus shape × voxel size; take the extent
    from `onBounds`).
  - Once mounted, the float stays mounted after `hover-end` and is hidden with
    `hidden` / `display:none`, so the WebGL context is reused.
- **Placement.** `left = px + 24`, `top = py - PREVIEW_PX / 2`.
  - Flip to `px - 24 - PREVIEW_PX` when it would overflow the widget's right edge.
  - Clamp `top` to the widget.
  - Positioned `absolute` inside the chrome root, with `pointer-events-none`.
- **Region centre.** `region = { cx, cy }` is set on first hover.
  - Recentre when the square's edge comes within `sizeUm / 2` of the region's edge.
    The region's half side is `sizeUm * PREVIEW_REGION_SCALE / 2`. Recentre when
    `|x - cx| > regionHalf - sizeUm` or the same holds for y.
  - On a recentre, the new centre = cursor + velocity × 150 ms. The velocity is in
    µm/ms, taken from hover samples in the last 100 ms. The centre is clamped to
    the volume extent.
  - When the whole preview level fits `budgets.preview` (compute
    `pickLevel(levels, frame, sizeUm * 3, budgets.preview)`, then check
    `levelBox` voxels ≤ budget), the region is fixed at the level centre and never
    recentres. VolumeCube already picks `levelBox` for it.
  - A zoom that changes `sizeUm` enough to change the preview level also recentres.
- **Render.** `<VolumeCube>` with:
  - `windowCx/Cy = hover.x/y`, `windowSizeUm = hover.sizeUm`;
  - `region = { scale: PREVIEW_REGION_SCALE, budget: budgets.preview, cx, cy }`;
  - `mode="mip"`, `interactive={false}`, `showLegend={false}`;
  - `showLabels` / `groups` / `render` / `contrast` / `dark` from the dock settings;
  - `cut` = open;
  - `height={PREVIEW_PX}`, and the same `imageUrl` / `labelsUrl` / frame;
  - `chunkCache`.
  - Keep the preset fixed at `iso` (`preset="iso"`), with a constant `resetTick`.
- **Prefetch.** After each region is shown (`onLoadState` reports the level and the
  region key changed):
  - call `chunkCache.prefetch(levelSource._data, chunkRing(levelSource, shownBox))`,
    sorted by `dot(chunkCentre - regionCentre, velocity)` descending;
  - if the level's decoded size (voxels × bytes per voxel for image plus labels)
    is at most `CHUNK_CACHE_BYTES / 2`, prefetch every chunk of that level instead.
  - To reach level sources, add an `onLevels?: (image: ZarrSource[], labels: ZarrSource[] | null) => void`
    prop to `VolumeCube`, called when each pyramid loads, and an `onShown?: (level: number, box: Box) => void`
    prop called when `shown` changes.
- **Errors.** When the preview's `onLoadState` / status reports an image error,
  hide the float until the next recentre.

- [ ] **Step 1: Write the failing tests**

```ts
const preview = (page: Page) => page.getByTestId("inspect-preview");

test("hover shows a live coarse preview that slides without refetching", async ({ page }) => {
  await page.goto("/?budgets=20000,300000", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).__landmarksEngine));
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  const view = preview(page).locator(".volume-cube__view");
  await expect(preview(page)).toBeVisible();
  await expect(view).not.toHaveAttribute("data-level", "-1");
  const region = await preview(page).getAttribute("data-region");

  const chunkRequests: string[] = [];
  page.on("request", (r) => {
    if (/\/s\d+\/c\//.test(r.url())) chunkRequests.push(r.url());
  });
  await page.mouse.move(box.x + box.width * 0.51, box.y + box.height * 0.5, { steps: 4 });
  await expect(view).not.toHaveAttribute("data-pan", "0,0");
  expect(await preview(page).getAttribute("data-region")).toBe(region);
  expect(chunkRequests).toEqual([]);
  await expect(page.getByRole("dialog", { name: "Cube" })).toHaveCount(0);
});

test("moving far recentres the preview region; leaving the map hides it", async ({ page }) => {
  await page.goto("/?budgets=20000,300000", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).__landmarksEngine));
  await page.getByRole("radio", { name: "Inspect", exact: true }).click();
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await expect(preview(page)).toBeVisible();
  const region = await preview(page).getAttribute("data-region");
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5, { steps: 8 });
  await expect.poll(() => preview(page).getAttribute("data-region")).not.toBe(region);
  await page.mouse.move(box.x - 20, box.y - 20);
  await expect(preview(page)).toBeHidden();
});
```

- [ ] **Step 2: Run and check the new tests fail.** Expected: FAIL (no
  `inspect-preview`).

- [ ] **Step 3: Implement** the behaviour above.

- [ ] **Step 4: Run the landmarks tier and the volume-cube tier.**

Run: `cd frontend && npm run test:e2e:landmarks && npm run test:e2e:volume-cube`
Expected: PASS.

- [ ] **Step 5: Manual check on the A2 notebook** (skip only if `D:\clarence\pyxa_scverse_demo\data\colon_a2.sdata.zarr` is missing):
  1. Rebuild the bundles: set the Windows shell, then
     `SPATIAL_RX_BUILD_WIDGET=volume-cube npx vite build`, then
     `SPATIAL_RX_BUILD_WIDGET=landmarks npx vite build`.
  2. Start your own `uv run marimo run --headless --port 2799 colon_a2.py` from the
     demo repo.
  3. In the browser pane, press **I** and hover the tissue.
  4. Confirm:
     - the preview follows the cursor smoothly;
     - it recentres without blanking;
     - a click docks the cube and it refines.
  5. Stop only your own marimo.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/widgets/landmarks frontend/src/widgets/volume-cube frontend/e2e/landmarks/landmarks-volume.spec.ts
git commit -m "feat(landmarks): live Inspect preview over a loaded region with chunk prefetch"
```

---

### Task 7: Docs, demo and feature maps

**Files:**
- Modify: `README.md` (Inspect paragraph)
- Modify: `docs/adr/0006-landmarks-hosts-volume-cube.md` (short "Addendum 2026-09-26" section)
- Modify: `.agents/skills/verify-landmarks/features/inspect-cube.md`
- Create: `.agents/skills/verify-landmarks/features/inspect-history.md`
- Modify: `.agents/skills/verify-landmarks/features/README.md` (index row)
- Modify: `CONTEXT.md` (define **Inspect selection** in one line)
- Modify: `D:\clarence\pyxa_scverse_demo\colon_a2.py` (separate repo, branch `colon-a2-demo`)

- [ ] **Step 1: README.** Replace the Inspect paragraph with 3–4 sentences:
  - hover previews;
  - a click docks the cube and adds an inspect selection;
  - zoom sets the square's size;
  - read results with `get_obs_names("<inspect id>")` or `widget.selections`.

- [ ] **Step 2: ADR addendum** (≤ 10 lines):
  - preview plus dock;
  - prefetch-then-swap;
  - per-widget chunk cache;
  - inspect selections instead of new traits;
  - `inspect_size_um` is written only by the browser.

- [ ] **Step 3: Feature maps.**
  - **`inspect-cube.md`:** update the proofs to the new spec titles (coarse
    level, legend, cache, zoom size, commit, drag).
  - **`inspect-history.md`:**
    - capability;
    - proof spec titles (history chips, delete closes dock, preview slides,
      recentre);
    - gotchas: budgets override via `?budgets=`, and the preview's own
      `.volume-cube__view`.
  - Match the format of the existing feature files; read one first.

- [ ] **Step 4: CONTEXT.md.** Add under Selection: **Inspect selection**: a
  Selection committed from Inspect (`type: "inspect"`), with the points in the
  square and the cube window that restores its view.

- [ ] **Step 5: Demo.** In `colon_a2.py`:
  - delete `widget.inspect_size_um = 500`;
  - change "500 µm" in the notebook text to "the square (its size follows zoom)";
  - keep the cut-box table that reads `landmarks.inspect_size_um`;
  - run `uvx marimo check colon_a2.py`.
  - Commit there with
    `git -C D:/clarence/pyxa_scverse_demo commit -am "Inspect square follows zoom; drop the 500 µm override"`
    and the Co-authored-by trailer.

- [ ] **Step 6: Commit (spatial-rx)**

```bash
git add README.md docs/adr/0006-landmarks-hosts-volume-cube.md .agents/skills/verify-landmarks CONTEXT.md
git commit -m "docs: Inspect preview, dock refine and inspect history"
```

---

## Out of scope / follow-ups

- Web Worker decode (only if profiling shows recentre stutter).
- Z slider for browsing cells in the main view.
- Linux snapshot regeneration requires pushing the branch and running the
  `frontend-e2e` workflow with `update_snapshots=true`. Ask before pushing.
