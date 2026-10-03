# Inspect Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the immersive Inspect cube per the PR #58 review: drop the context region, let the user pan the live window in XY, draw labels as shells, swap the top toolbar for a dotted Inspect pill with a Refining→Ready status, reorganise the bottom controls (per-layer projection, Cross-section panel), and replace the history strip with selection info in the Selections panel.

**Architecture:** All work lands on branch `claude/inspect-mode-fullscreen-zoom-2442d5` (PR #58). `VolumeCube` goes back to window-only and gains a pan gesture (`onPan`). The Viv extension becomes one extension with `imageMip`/`cellMip` uniforms and shell-only cells. The top `Topbar` swaps with a new `InspectPill` via `cube-motion`'s `<Rise>`; the old actions row and history strip are deleted. The engine names new selections at creation (`<top category> · <count>`); a shadcn `hover-card` on selection rows shows the thumbnail and live composition.

**Tech Stack:** React 19, TypeScript, Viv 0.22 / deck.gl 9.2 / luma.gl 9.2 (GLSL injected through Viv extensions), `cube-motion/react`, shadcn/ui, Playwright e2e (no unit runner), vanilla engine `milume/static/landmarks.js`.

**Spec:** [`docs/superpowers/specs/2026-10-03-inspect-rework-design.md`](../specs/2026-10-03-inspect-rework-design.md)

## Global Constraints

- Widget UI uses shadcn/ui primitives from `frontend/src/components/ui/` (add missing ones with `cd frontend && npx shadcn@latest add <name>`) and the Soft Float chrome (`FLOAT_PANEL`, `TOOLBAR_CLASS`, `chromeHitClass`, `chromeHitTextClass`, `IconBtn`, `ToolbarDivider` from `chrome/primitives.tsx` / `chrome/sections.ts` / `chrome/selection-toolbar.tsx`). Do not hand-roll styled `button`/`div` where a primitive exists.
- **No new synced traits** (ADR 0005/0006). Pan writes the existing `inspect_cx` / `inspect_cy`; everything else is client-local (`CubeSettings`).
- The inspect window stays a fixed 300 µm (`INSPECT_WINDOW_UM`).
- Inspect selections keep `type: "inspect"`, `point_indices`, `window: { cx, cy, size_um, cut }`.
- `VolumeCube` stays backward compatible for the hover preview (`inspect-preview.tsx` passes `mode="mip"` today; it keeps drawing as before).
- One deck.gl/luma.gl root stack; no new runtime dependencies except what `shadcn add hover-card` pulls (it uses the already-installed `radix-ui`).
- `_esm` stays a `pathlib.Path`; bundles are git-ignored.
- Motion uses `cube-motion` (`<Rise>`, `<Morph>`), never ad-hoc keyframes for the pill swap; honour `prefers-reduced-motion` (cube-motion does this itself; CSS shimmer must also).
- Tests: Playwright only. Prefer `expect.poll` / web-first asserts; a fixed wait only for a negative check that must outlast a debounce, with a comment. Never delete an existing test without escalating; adapt it.
- Before any e2e run, `lsof -iTCP:5173 -sTCP:LISTEN` must be empty (Playwright reuses a stale server on that port). Stop any server you start.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push; do not touch the PR.
- Baseline before this plan (head `cb56c76`): `cd frontend && npm run test:e2e:landmarks` = 50 volume + 22 default pass; `npm run test:e2e:core` = 1 pass; typecheck clean.

## Behaviour changes to know before starting

1. The context region (PR #58 Tasks 5–7) is deleted, not hidden.
2. While the cube is open, **plain drag orbits, Shift+drag or the Move tool pans the live window**. The map is still covered; to place a window elsewhere without panning, Esc, then click.
3. The normal top pill is **replaced** in Inspect by the Inspect pill. Tests that switch tool while in Inspect must first click the pill's `Exit Inspect` button (or press Esc twice).
4. `CubeSettings.mode` is replaced by `imageMode` / `labelMode`; `data-render` on `.volume-cube__view` is replaced by `data-image-mode` / `data-label-mode`.
5. The cube's history strip, the Cube·µm/Save/Close actions row, and the toolbar's Additive/MIP and Palette controls move or disappear.

## File Structure

| File | Responsibility |
| --- | --- |
| `frontend/src/widgets/volume-cube/context-layer.ts` | **Deleted** (Task 1) |
| `frontend/src/widgets/volume-cube/pan.ts` (new) | Pure `dragToWindowDelta`: screen drag → µm window delta from the camera |
| `frontend/src/widgets/volume-cube/VolumeCube.tsx` | Window-only again; `imageMode`/`labelMode`; pan gesture (`panMode`, `onPan`, `onPanEnd`) |
| `frontend/src/widgets/volume-cube/cell-lut-extension.ts` | One extension; shell-only cells; `imageMip`/`cellMip`; context code removed |
| `frontend/src/widgets/volume-cube/palettes.ts` | `DEFAULT_RENDER.cellAlpha` retuned |
| `frontend/src/widgets/landmarks/use-cube-settings.ts` | `imageMode`, `labelMode`, `move`, `load` status; `mode` removed |
| `frontend/src/widgets/landmarks/use-inspect-cube.ts` | `panWindow`, `exitInspect`, Esc-twice, previous-mode memory |
| `frontend/src/widgets/landmarks/chrome/inspect-pill.tsx` (new) | Top Inspect pill: armed + cube-open states, status chip, Save, fullscreen |
| `frontend/src/widgets/landmarks/chrome/inspect-toolbar.tsx` | Bottom bar (camera, Move, Reset, Adjust, Cross-section) + two panels |
| `frontend/src/widgets/landmarks/chrome/cube-immersive.tsx` | Cube only; no actions row, no history strip; wires pan + load status |
| `frontend/src/widgets/landmarks/chrome/cube-snapshots.ts` | Snapshots feed the selection row/card (unchanged API) |
| `frontend/src/widgets/landmarks/chrome/layers-panel.tsx` | Selection rows with thumbnail + hover card |
| `frontend/src/widgets/landmarks/chrome/selection-card.tsx` (new) | Hover card content: counts, bounds/window, thumbnail, category bars |
| `frontend/src/components/ui/hover-card.tsx` (new, via shadcn) | Primitive |
| `frontend/src/widgets/landmarks/LandmarksView.tsx` | Swap Topbar ↔ InspectPill; render panels; pass snapshots to the Layers panel |
| `frontend/src/widgets/landmarks/landmarks.css` | Pill outline, shimmer, bar/panel layout; cube-actions/history CSS removed |
| `milume/static/landmarks.js` | `selectionName` at creation (all selection kinds) |
| `frontend/e2e/landmarks/landmarks-volume.spec.ts` | New and adapted tests |
| `.agents/skills/verify-landmarks/features/*.md`, `docs/adr/0006-…`, `frontend/DESIGN.md`, spec | Docs |

---

### Task 1: Remove the context region

**Files:**
- Delete: `frontend/src/widgets/volume-cube/context-layer.ts`
- Modify: `frontend/src/widgets/volume-cube/VolumeCube.tsx`, `frontend/src/widgets/volume-cube/frame-layers.ts`, `frontend/src/widgets/volume-cube/cell-lut-extension.ts`, `frontend/src/widgets/landmarks/chrome/cube-immersive.tsx`, `frontend/e2e/landmarks/landmarks-volume.spec.ts`, docs listed in Step 5

**Interfaces:**
- Produces: `VolumeCube` without `context`, `ContextProp`, `contextLayer`, `ctx*` uniforms, `data-context*`; `homeView` back to a fixed `minZoom: zoom - 2`. Later tasks assume none of these exist.

- [ ] **Step 1: Inventory what to delete**

```bash
cd frontend && grep -rn "ctx\|Context\|context-layer\|contextLayer\|CONTEXT_\|zoomOut\|data-context" src e2e | grep -v "^src/components" | cut -c1-140
```
Expected: hits in `VolumeCube.tsx` (the `context` prop, `ctxScale/ctxBudget/contextTarget/ctxLoaded/ctxShown/ctxImage/ctxLoader/onCtxViewportLoad/ctxMatrix/ctxZSlice/ctxRect`, the `contextLayer` entry inside `layerProps`, `zoomOut` in `homeView` and the `framing` ref, the `data-context*` attributes), `frame-layers.ts` (the `contextLayer` branch of `getLayers`), `cell-lut-extension.ts` (`ctxOn/ctxWin/ctxLook`, `ctxHidesRay`, `ctxGrade`, `CONTEXT_DIM`, `CONTEXT_DESATURATE`, the pre-loop `discard`, and the `ctxSkip`/`ctxGrade` uses in `_RENDER`/`_AFTER_RENDER`), `cube-immersive.tsx` (the `context=` prop on `<VolumeCube>`), the e2e spec (context tests), docs.

- [ ] **Step 2: Delete the code**

Delete `context-layer.ts`. In `VolumeCube.tsx` remove every item listed above, keeping the window path byte-for-byte as it was before PR #58's Task 5 (see `git show 7ba1ebd:frontend/src/widgets/volume-cube/VolumeCube.tsx` for the pre-context version; do **not** revert wholesale: Task 4's later fixes and the live thumbnail live elsewhere). `homeView` loses its `zoomOut` argument (floor `zoom - 2`); `framing` ref loses `zoomOut`. In `frame-layers.ts` `getLayers` returns to a single `CubeVolumeLayer` plus frame/overlays. In `cell-lut-extension.ts` remove the context uniforms from `uniformTypes`, `defaultUniforms`, `getUniforms`, the GLSL block, the helpers, the pre-loop discard and the grade calls; remove `ctxOn?`/`ctxWin?`/`ctxLook?` from `CubeUniforms`, `contextWindow` from `LayerLike["props"]`, and the `ctx*` fields in `draw()`.

- [ ] **Step 3: Delete the context e2e tests**

```bash
cd frontend && grep -n "context" e2e/landmarks/landmarks-volume.spec.ts | cut -c1-120
```
Delete exactly the tests whose subject is the context region (coarse context loads; context draws dimmed; zoom out stops past the context; the region-path test with `data-context-box`) and any helper only they used (`nextFrames` is also used by the MIP wait: keep it if still referenced). Do not touch other tests. Remove the `data-context` assertion from the preview test.

- [ ] **Step 4: Verify**

```bash
cd frontend && npm run typecheck && grep -rn "ctx\|context-layer\|contextLayer\|CONTEXT_\|data-context" src e2e | grep -v "^src/components" ; lsof -iTCP:5173 -sTCP:LISTEN; E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts 2>&1 | tail -8
```
Expected: typecheck clean; grep finds nothing; volume spec passes (46 tests = 50 minus the 4 deleted context tests; adjust if the count differs and say why).

- [ ] **Step 5: Docs pointers**

Add one line to each of `.agents/skills/verify-landmarks/features/inspect-cube.md` (remove the context sub-feature bullets), `docs/adr/0006-landmarks-hosts-volume-cube.md` (addendum: "context region removed 2026-10-03, see 2026-10-03-inspect-rework-design.md"), `frontend/DESIGN.md` (nothing if it never mentioned context), and the older spec `2026-10-02-inspect-immersive-cube-design.md` (a "Superseded in part" note at the top). Final grep for `context region` in docs.

- [ ] **Step 6: Commit**

```bash
git add -A frontend docs .agents && git commit -m "Remove the immersive cube's context region

It added no functional value; the window is panned instead (next changes).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Labels as shells

**Files:**
- Modify: `frontend/src/widgets/volume-cube/cell-lut-extension.ts` (`cellColor`, `buildCellLut`, `FILL_ALPHA`, `OUTLINE`)
- Modify: `frontend/src/widgets/volume-cube/palettes.ts` (`DEFAULT_RENDER.cellAlpha`)
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Produces: `HIGHLIGHT_ALPHA` (replaces `FILL_ALPHA`): the LUT alpha of a highlighted cell's shell. `cellColor` returns `vec4(0.0)` for interior voxels. Existing `OUTLINE` stays the non-highlighted orange shell.

- [ ] **Step 1: Write the failing test**

Add next to the existing test "with Labels on each toy cell renders in its category colour in the dock" (read it and its helper `newCategoryPixels` first; the toy cell centres are in the file header comment). The new test turns Labels on at the default highlight (nothing focused colours every cell by category), takes a screenshot of the cube view, and checks that category-coloured pixels form a ring, not a disc:

```ts
  test("labels draw as shells: a cell's rim is coloured, its core is not", async ({ page }) => {
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    await toggleShow(page, "Show labels");
    await expect(view).toHaveAttribute("data-labels", "on");
    const shot = await view.screenshot();
    // Pixels in a category hue (see CATEGORY_HUES) per cell neighbourhood:
    const { rim, core } = await ringVsCore(page, shot);
    expect(rim).toBeGreaterThan(0);
    expect(core).toBeLessThan(rim * 0.25);
  });
```
Implement `ringVsCore(page, png)` next to `newCategoryPixels`: decode the PNG as that helper does; classify category-hue pixels with the same `category()` rule; group them by connected component (or by nearest toy cell centroid, found as the centroid of each category's pixels from a **filled** reference you do not have, so use connected components); for each component of >= 30 pixels, compute its bounding box centre and radius R = half the larger side; `core` = category-hue pixels within 0.4R of the centre, `rim` = those between 0.7R and 1.15R. Sum over components. Tune the window and thresholds once against observed numbers (print them temporarily) but keep the assertion's meaning: a shell has a coloured rim and a hollow core.

- [ ] **Step 2: Run it; it fails**

```bash
cd frontend && lsof -iTCP:5173 -sTCP:LISTEN; E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "labels draw as shells"
```
Expected: FAIL on the `core` assertion (cells are filled today).

- [ ] **Step 3: Implement shells**

In `cell-lut-extension.ts`:

```ts
/** Per-sample alpha of a highlighted cell's shell. */
const HIGHLIGHT_ALPHA = 0.9;
```
(replace `FILL_ALPHA` and its doc), in `buildCellLut` write `Math.round(255 * HIGHLIGHT_ALPHA)` into a highlighted cell's texel alpha. In the GLSL `cellColor`:

```glsl
vec4 cellColor(ivec3 q) {
  ivec2 b = ivec2(texelFetch(labelVolume, q, 0).rg * 255.0 + 0.5);
  int idx = b.x + 256 * (b.y & 127);
  if (idx == 0) return vec4(0.0);
  // Cells are shells: interior voxels draw nothing.
  if (b.y < 128) return vec4(0.0);
  ivec2 size = textureSize(cellLut, 0).xy;
  vec4 own = vec4(0.0);
  if (idx < size.x * size.y) own = texelFetch(cellLut, ivec3(idx % size.x, idx / size.x, 0), 0);
  // A highlighted cell's shell in its own colour, otherwise the shared outline.
  vec4 c = own.a > 0.0 ? own : texelFetch(cellLut, ivec3(0), 0);
  return vec4(c.rgb, c.a * cubeRender.cellAlpha);
}
```
Update the module doc comment that describes fills.

- [ ] **Step 4: Calibrate defaults by eye**

Run the harness (`cd frontend && npm run dev:landmarks-volume`) and the colon A2 notebook (see Task 9 Step 5 for the command; read-only `marimo run`). With Labels on in dense tissue, tune `OUTLINE.alpha` (now 0.5), `OUTLINE.behindHighlight` (0.08) and `DEFAULT_RENDER.cellAlpha` so shells read without washing out the image: start `OUTLINE.alpha` 0.35 and adjust within 0.2–0.5; keep highlighted shells clearly stronger than the orange. Record the chosen values and why in the commit message; save before/after screenshots to the scratchpad and name the paths in your report. If you cannot view the colon notebook, say so.

- [ ] **Step 5: Run the test and the label tests**

```bash
cd frontend && npm run typecheck && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "labels|Labels|highlight"
```
Expected: PASS. The existing "with Labels on each toy cell renders in its category colour" and "highlight follows focus" tests may need their pixel thresholds re-measured (counts drop for shells): adapt thresholds, never remove the colour/hue assertions, and note each change in the report.

- [ ] **Step 6: Commit**

```bash
git add -A frontend && git commit -m "Draw cube labels as shells

Interior voxels draw nothing; highlighted cells keep a category-coloured shell.
Default shell alpha retuned.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Independent projection per layer

**Files:**
- Modify: `frontend/src/widgets/volume-cube/cell-lut-extension.ts` (templates, uniforms, one extension class, `CUBE_EXTENSIONS`)
- Modify: `frontend/src/widgets/volume-cube/VolumeCube.tsx` (`mode` → `imageMode` + `labelMode`; `data-render` → `data-image-mode`/`data-label-mode`)
- Modify: `frontend/src/widgets/landmarks/use-cube-settings.ts`, `chrome/cube-immersive.tsx`, `chrome/inspect-preview.tsx`, `chrome/inspect-toolbar.tsx` (temporary wiring), `landmarks/LandmarksView.tsx` if it reads `settings.mode`
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Produces: `VolumeCubeProps.imageMode?: "additive" | "mip"` and `labelMode?: "additive" | "mip"` (both default `"additive"`), replacing `mode`; `CubeSettings.imageMode` / `CubeSettings.labelMode` (default `"additive"`); `CUBE_EXTENSIONS: unknown[]` (a single array, no longer keyed by mode); DOM `data-image-mode` / `data-label-mode`.
- Consumes: `cellColor` shells (Task 2).

- [ ] **Step 1: Write the failing test**

Adapt the existing test "inspect toolbar: presets, MIP, palette, alpha/gamma, committed Z cut" later (Task 6 moves the controls); for now add a focused test that the old toolbar group sets both attributes:

```ts
  test("the projection toggle sets the image and label modes", async ({ page }) => {
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-image-mode", "additive");
    await expect(view).toHaveAttribute("data-label-mode", "additive");
    await page.getByRole("radio", { name: "Maximum intensity" }).click();
    await expect(view).toHaveAttribute("data-image-mode", "mip");
    await expect(view).toHaveAttribute("data-label-mode", "mip");
  });
```
(The `ToggleGroupItem` with `aria-label="Maximum intensity"` renders as a radio in a single-select group; if the role differs, use `getByLabel("Maximum intensity")`.)

- [ ] **Step 2: Run it; it fails** (no `data-image-mode`).

```bash
cd frontend && lsof -iTCP:5173 -sTCP:LISTEN; E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "projection toggle"
```

- [ ] **Step 3: Unify the shader templates**

In `cell-lut-extension.ts` replace the `ADDITIVE` / `MIP` templates, `CubeAdditiveExtension` / `CubeMipExtension` and the `CUBE_EXTENSIONS` record with one template and one class. Add uniforms `imageMip: "f32"` and `cellMip: "f32"` to `cubeRenderModule` (`uniformTypes`, `defaultUniforms: 0`, `getUniforms`: `render.imageMip ?? 0`, `render.cellMip ?? 0`, GLSL block, at the **end** of the block in the same order everywhere: `imageMip`, then `cellMip`; std140 floats pack 4 bytes each, so ordering consistency is the only requirement). Add `imageMode?: "additive" | "mip"; labelMode?: "additive" | "mip";` to `LayerLike["props"]` and set in `draw()`:

```ts
      imageMip: layer.props.imageMode === "mip" ? 1 : 0,
      cellMip: layer.props.labelMode === "mip" ? 1 : 0,
```
The unified template (labels composite over the image in every combination; the loop breaks early only when both layers are saturated):

```ts
const RENDERING = {
  _BEFORE_RENDER: `${CELL_SETUP}
  vec4 acc = vec4(0.0);
  float maxImage = -1.0;
  vec4 cells = vec4(0.0);
  float cellMax = 0.0;
  vec3 cellMaxRgb = vec3(0.0);`,
  _RENDER: `
    if (cubeRender.imageMip > 0.5) {
      maxImage = max(maxImage, intensityValue0);
    } else {
      vec4 im = imageSample(intensityValue0);
      acc.rgb += (1.0 - acc.a) * im.a * im.rgb;
      acc.a += (1.0 - acc.a) * im.a;
    }
    if (cellsOn) {
      ${CELL_SAMPLE}
      if (cubeRender.cellMip > 0.5) {
        if (cell.a > cellMax) {
          cellMax = cell.a;
          cellMaxRgb = cell.rgb;
        }
      } else if (cells.a < 0.95) {
        cells.rgb += (1.0 - cells.a) * cell.a * cell.rgb;
        cells.a += (1.0 - cells.a) * cell.a;
      }
    }
    bool imageDone = cubeRender.imageMip < 0.5 && acc.a >= 0.95;
    bool cellsDone = !cellsOn || (cubeRender.cellMip < 0.5 && cells.a >= 0.95);
    if (imageDone && cellsDone) {
      break;
    }`,
  _AFTER_RENDER: `
  // The image: opaque maximum projection, or the accumulated samples.
  vec4 imageOut = acc;
  if (cubeRender.imageMip > 0.5) {
    vec4 im = imageSample(maxImage);
    imageOut = vec4(im.rgb * cubeRender.imageAlpha * cubeRender.imageOn, cubeRender.imageOn);
  }
  // The labels: the strongest shell along the ray, or the accumulated shells.
  vec4 cellsOut = cubeRender.cellMip > 0.5 ? vec4(cellMaxRgb, cellMax) : cells;
  // Labels over the image.
  color = vec4(
    cellsOut.rgb + (1.0 - cellsOut.a) * imageOut.rgb,
    cellsOut.a + (1.0 - cellsOut.a) * imageOut.a
  );`,
};
```
`CELL_SAMPLE` and `CELL_SETUP` stay as they are (they reference `canShow`, `cellSize`, `cellsOn`). Keep `showImage` off semantics: `imageSample` already multiplies alpha by `imageOn` (additive path); the MIP path above multiplies by `imageOn` too.

One class replaces the two: `class CubeExtension extends ColorPalette3DExtensions.BaseExtension { static extensionName = "CubeExtension"; rendering = RENDERING; … }` (merge the abstract base and drop the per-mode subclasses; the "separate classes per mode" gotcha no longer applies because the mode is a uniform). Export `export const CUBE_EXTENSIONS: unknown[] = [new CubeExtension()];`.

- [ ] **Step 4: Props, settings, wiring**

`VolumeCube.tsx`: replace the `mode` prop with `imageMode` / `labelMode` (default `"additive"`); `extensions: CUBE_EXTENSIONS`; pass `imageMode`, `labelMode` as layer props (add them to the `layerProps` memo and its deps); root attributes `data-image-mode={imageMode}`, `data-label-mode={labelMode}`, remove `data-render`. `use-cube-settings.ts`: replace `mode` with `imageMode` and `labelMode` (type and default). `cube-immersive.tsx`: pass `imageMode={settings.imageMode} labelMode={settings.labelMode}`. `inspect-preview.tsx` line with `mode="mip"`: `imageMode="mip" labelMode="mip"`. `inspect-toolbar.tsx` (temporary until Task 6): the Projection `ToggleGroup` reads `settings.imageMode` and writes both: `patch({ imageMode: v, labelMode: v })`. Fix every other reader (`grep -rn "\.mode\b\|mode:" frontend/src/widgets/landmarks | grep -v "lm.mode"`) and every test reading `data-render` (replace by `data-image-mode`).

- [ ] **Step 5: Verify the four combinations visually**

Temporarily (do not commit) set both modes via React devtools-free means: edit the defaults in `use-cube-settings.ts` through the four combinations `{image, label} ∈ {additive, mip}²`, reload the dev harness with `npm run dev:landmarks-volume`, open the cube with Labels on, and screenshot each. Confirm: no shader compile error (console), image-only looks as before in both modes, labels additive shows a translucent stack and labels MIP a flat projection, labels composite over the image in all four, `showImage` off leaves labels. Save the four screenshots to the scratchpad; name paths in the report. Restore the defaults.

- [ ] **Step 6: Run tests**

```bash
cd frontend && npm run typecheck && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts 2>&1 | tail -10
```
Expected: all pass. Tests asserting `data-render` were adapted in Step 4 to `data-image-mode`.

- [ ] **Step 7: Commit**

```bash
git add -A frontend && git commit -m "Project the cube's image and labels independently

One extension with imageMip/cellMip uniforms; labels composite over the image.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pan the live window in XY

**Files:**
- Create: `frontend/src/widgets/volume-cube/pan.ts`
- Modify: `frontend/src/widgets/volume-cube/VolumeCube.tsx`, `frontend/src/widgets/landmarks/use-cube-settings.ts` (`move`), `frontend/src/widgets/landmarks/use-inspect-cube.ts` (`panWindow`), `frontend/src/widgets/landmarks/chrome/cube-immersive.tsx`, `frontend/src/widgets/landmarks/chrome/inspect-toolbar.tsx` (Move button, temporary position), `frontend/src/widgets/landmarks/LandmarksView.tsx` (wiring), `landmarks.css` (grab cursor)
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Produces `pan.ts`:

```ts
/**
 * How far the window centre moves (data µm, +x right on the map, +y down) for a
 * pointer drag of (dx, dy) screen px (+dy down), so the tissue follows the pointer.
 * `view` is the camera; `umPerWorldUnit` is the shown level's X voxel (µm).
 */
export function dragToWindowDelta(
  dx: number,
  dy: number,
  view: { zoom: number; rotationX: number; rotationOrbit: number },
  umPerWorldUnit: number,
): { x: number; y: number };
```
- `VolumeCubeProps`: `panMode?: boolean` (Move tool; default false), `onPan?: (dxUm: number, dyUm: number) => void` (incremental, per pointer move), `onPanEnd?: () => void`. When `onPan` is set, a left-button press with Shift held or `panMode` on pans and the orbit controller never sees it.
- `CubeSettings.move: boolean` (default false); `InspectCube.panWindow(dxUm: number, dyUm: number): void` and `InspectCube.panEnd(): void`.

- [ ] **Step 1: Write the failing tests**

Add (helper `dragCube(page, dx, dy, { shift })` presses at the cube view centre, moves in 4 steps and releases; hold Shift via `page.keyboard.down("Shift")` around the drag):

```ts
  test("shift-drag in the cube pans the live window; plain drag only orbits", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    const pitch0 = await view.getAttribute("data-pitch");
    // Plain drag: orbit, the window stays.
    await dragCube(page, view, 60, 0, {});
    expect(Number(await getModel(page, "inspect_cx"))).toBe(cx0);
    // Shift-drag right: the tissue follows the pointer, so the window centre moves left (top-down).
    await page.getByRole("radio", { name: "Top view" }).click();
    await dragCube(page, view, 80, 0, { shift: true });
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeLessThan(cx0);
    // The map's square follows.
    const placed = await page.evaluate(() => (window as any).__landmarksEngine.getInspectOverlay().placed);
    expect(placed[0]).toBeCloseTo(Number(await getModel(page, "inspect_cx")), 1);
    // The cube settles at the new window.
    await expect(view).toHaveAttribute("data-pan", "0,0");
    await expect(view).toHaveAttribute("data-refining", "false");
    expect(await view.getAttribute("data-pitch")).toBe("90");
    void pitch0;
  });

  test("the Move tool makes a plain drag pan; the distance scales with the drag", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await page.getByRole("radio", { name: "Top view" }).click();
    await page.getByRole("button", { name: "Move" }).click();
    await expect(page.getByRole("button", { name: "Move" })).toHaveAttribute("aria-pressed", "true");
    const cx0 = Number(await getModel(page, "inspect_cx"));
    await dragCube(page, view, 40, 0, {});
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeLessThan(cx0);
    const d1 = cx0 - Number(await getModel(page, "inspect_cx"));
    await dragCube(page, view, 80, 0, {});
    const d2 = cx0 - d1 - Number(await getModel(page, "inspect_cx"));
    expect(d2 / d1).toBeGreaterThan(1.7);
    expect(d2 / d1).toBeLessThan(2.3);
  });

  test("panning clamps the window centre to the volume", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await page.getByRole("radio", { name: "Top view" }).click();
    await page.getByRole("button", { name: "Move" }).click();
    for (let i = 0; i < 6; i++) await dragCube(page, view, 250, 0, {});
    // 256 µm toy volume starting at the origin: the centre never leaves it.
    const cx = Number(await getModel(page, "inspect_cx"));
    expect(cx).toBeGreaterThanOrEqual(0);
    expect(cx).toBeLessThanOrEqual(256);
  });
```
(`d2` is the second drag's displacement of 80 px vs the first's 40 px; both start from different centres, so the ratio compares like with like. If the toy volume origin/extent differ from 0..256, read them from `cube.bounds` via the harness comment at the top of the spec and adjust the clamp assertion.)

- [ ] **Step 2: Run them; they fail**

```bash
cd frontend && lsof -iTCP:5173 -sTCP:LISTEN; E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "shift-drag|Move tool|panning clamps"
```
Expected: FAIL (no Move button; shift-drag does not move the window).

- [ ] **Step 3: `pan.ts`**

`cameraDirection` in `axis-legend.tsx` already gives each data axis's camera-space direction (x right, y up the screen); data +x is world `[1,0,0]`, data +y is world `[0,0,1]`. Content displacement on screen per data displacement `(a, b)` world units is `right = s·(a·exx + b·eyx)`, `up = s·(a·exy + b·eyy)` with `s = 2**zoom` px per world unit at the target. Solve for the content to follow the pointer (`right = dx`, `up = -dy`) and move the window the **opposite** way:

```ts
import { cameraDirection } from "./axis-legend";

const MIN_DET = 0.1;

export function dragToWindowDelta(
  dx: number,
  dy: number,
  view: { zoom: number; rotationX: number; rotationOrbit: number },
  umPerWorldUnit: number,
): { x: number; y: number } {
  const s = 2 ** view.zoom;
  const [exx, exy] = cameraDirection([1, 0, 0], view.rotationX, view.rotationOrbit);
  const [eyx, eyy] = cameraDirection([0, 0, 1], view.rotationX, view.rotationOrbit);
  const right = dx;
  const up = -dy;
  const det = exx * eyy - eyx * exy;
  let a: number;
  let b: number;
  if (Math.abs(det) >= MIN_DET) {
    a = (right * eyy - up * eyx) / (s * det);
    b = (up * exx - right * exy) / (s * det);
  } else {
    // Edge-on (side view): data y points at the viewer; only x can follow the pointer.
    a = Math.abs(exx) > MIN_DET ? right / (s * exx) : 0;
    b = 0;
  }
  return { x: -a * umPerWorldUnit, y: -b * umPerWorldUnit };
}
```
Sanity (top-down, orbit 0): `ex = (1, 0)`, `ey = (0, -1)` → `det = -1`; a drag right by `dx` gives `a = dx / s`, so the window moves `-dx/s·um`. Dragging down (`dy > 0`, `up < 0`) gives `b = (up·1 - 0)/(s·-1) = -up/s = dy/s`, window `-dy/s·um`. Both match "tissue follows the pointer". If your first run shows the opposite sign anywhere, fix the sign here, not in callers.

- [ ] **Step 4: The gesture in `VolumeCube`**

Add the props. On the root host `div` add capture handlers. React 19 forwards `stopPropagation()` from a capture handler to the native event at the root's capture phase, before the canvas's own bubble listeners, which is what keeps deck's controller from seeing the press. Stop both the pointer and the mouse press events (deck/mjolnir may listen to either):

```tsx
  const panAbort = useRef<AbortController | null>(null);
  const viewRef = useLatest(viewState);
  const umRef = useLatest(levelVoxel ? levelVoxel[2] : 1);
  const onPanRef = useLatest(onPan);
  const onPanEndRef = useLatest(onPanEnd);
  const [panning, setPanning] = useState(false);

  const wantsPan = (e: { button: number; shiftKey: boolean }) =>
    Boolean(onPan) && e.button === 0 && (panMode || e.shiftKey);

  const onPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wantsPan(e)) return;
    e.stopPropagation();
    e.preventDefault();
    panAbort.current?.abort();
    const abort = new AbortController();
    panAbort.current = abort;
    let last = { x: e.clientX, y: e.clientY };
    setPanning(true);
    const end = () => {
      abort.abort();
      setPanning(false);
      onPanEndRef.current?.();
    };
    const opts = { signal: abort.signal };
    window.addEventListener(
      "pointermove",
      (m: PointerEvent) => {
        const view = viewRef.current;
        if (!view) return;
        const d = dragToWindowDelta(m.clientX - last.x, m.clientY - last.y, view, umRef.current);
        last = { x: m.clientX, y: m.clientY };
        onPanRef.current?.(d.x, d.y);
      },
      opts,
    );
    window.addEventListener("pointerup", end, opts);
    window.addEventListener("pointercancel", end, opts);
    window.addEventListener("blur", end, opts);
  };
  const onMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (wantsPan(e)) e.stopPropagation();
  };
```
Attach `onPointerDownCapture` and `onMouseDownCapture` to the root host `div`, and add `data-pan-mode={String(panMode)}` and `data-panning={String(panning)}` to it. Abort any live pan on unmount (`useEffect(() => () => panAbort.current?.abort(), [])`). Cursor CSS in `landmarks.css`: `.volume-cube__view[data-pan-mode="true"] { cursor: grab; }` and `.volume-cube__view[data-panning="true"] { cursor: grabbing; }`. Import `dragToWindowDelta` from `./pan`.

- [ ] **Step 5: Move the real window**

`use-cube-settings.ts`: add `move: boolean` (default `false`). The engine needs a move that does not save on every pointer move: in `milume/static/landmarks.js` next to `setInspectWindow` add

```js
    moveInspectWindow(x, y) {
      const size = volumeWindow?.size ?? inspectWindowUm;
      volumeWindow = { x, y, size };
      model.set("inspect_cx", x);
      model.set("inspect_cy", y);
      model.set("inspect_size_um", size);
      setDeckLayers();
    },
```
and declare `moveInspectWindow(x: number, y: number): void;` in `engine.d.ts` (doc: "Move the placed square and `inspect_cx/cy` without saving or emitting; the caller saves"). In `use-inspect-cube.ts` extend the `latest` ref with `volumeBounds: cube.bounds ? { volumeX: cube.bounds.volumeX, volumeY: cube.bounds.volumeY } : null` and add:

```ts
  const panSavedAt = useRef(0);
  const panWindow = useCallback(
    (dxUm: number, dyUm: number) => {
      if (!engine) return;
      const x0 = facade.get("inspect_cx") as number | null;
      const y0 = facade.get("inspect_cy") as number | null;
      if (x0 == null || y0 == null) return;
      const b = latest.current.volumeBounds;
      const clamp = (v: number, [lo, hi]: Range) => Math.max(lo, Math.min(hi, v));
      const nx = b ? clamp(x0 + dxUm, b.volumeX) : x0 + dxUm;
      const ny = b ? clamp(y0 + dyUm, b.volumeY) : y0 + dyUm;
      // A pan is a user placement: the settle commit then writes the cut once it stops.
      placedRef.current = { x: nx, y: ny };
      engine.moveInspectWindow(nx, ny);
      const now = performance.now();
      if (now - panSavedAt.current > 40) {
        panSavedAt.current = now;
        facade.save_changes();
      }
    },
    [engine, facade],
  );
  const panEnd = useCallback(() => {
    panSavedAt.current = performance.now();
    facade.save_changes();
  }, [facade]);
```
Return `panWindow` and `panEnd` from the hook (add them to the `InspectCube` type with doc comments). `cube-immersive.tsx` takes `onPan` and `onPanEnd` props and passes `panMode={settings.move} onPan={onPan} onPanEnd={onPanEnd}` to `<VolumeCube>`; `LandmarksView.tsx` wires them to `inspectCube.panWindow` / `inspectCube.panEnd`. When the cube closes, turn Move off: in the existing effect on `cube.open` in `use-inspect-cube.ts` add `if (!cube.open) patchCube({ move: false, bounds: null })`.

- [ ] **Step 6: The Move button (temporary home)**

In `inspect-toolbar.tsx` add an `IconBtn` before the Adjust group using lucide `HandIcon`, `title="Move"`, `active={settings.move}`, `onClick={() => patch({ move: !settings.move })}`, and ensure it exposes `aria-pressed` (look at `IconBtn`'s props; if it lacks `aria-pressed`, add it there). Task 6 repositions it; do not redesign it here.

- [ ] **Step 7: Run tests**

```bash
cd frontend && npm run typecheck && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts 2>&1 | tail -10
```
Expected: all pass. If Shift-drag also orbits, the capture-phase stop did not reach deck: verify which events deck's canvas listens to (`mjolnir.js` in `node_modules/@deck.gl/core`) and stop those too; do not disable the controller via props mid-drag (it would rebuild the view). If the orbit direction is inverted in iso/side views, fix `dragToWindowDelta`'s signs using `data-axes`.

- [ ] **Step 8: Commit**

```bash
git add -A frontend milume && git commit -m "Pan the live inspect window from inside the cube

Shift+drag or the Move tool pans the window in XY (clamped to the volume);
plain drag still orbits. Adds engine.moveInspectWindow.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Inspect pill (top toolbar swap) and status chip

**Files:**
- Create: `frontend/src/widgets/landmarks/chrome/inspect-pill.tsx`
- Modify: `frontend/src/widgets/landmarks/LandmarksView.tsx` (swap), `frontend/src/widgets/landmarks/chrome/cube-immersive.tsx` (remove actions row, push load status), `frontend/src/widgets/landmarks/use-cube-settings.ts` (`load`), `frontend/src/widgets/landmarks/use-inspect-cube.ts` (`exitInspect`, Esc twice, previous-mode memory), `frontend/src/widgets/landmarks/landmarks.css`, `chrome/index.ts`
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Produces `InspectPill` (props below); `CubeSettings.load: "refining" | "ready" | "error"` and `CubeSettings.loadError: string`; `InspectCube.exitInspect(): void`.
- DOM: `data-testid="inspect-pill"` with `data-placement="top"`, `data-state="armed" | "open"`; status chip `data-testid="inspect-status"` with `data-state="refining" | "ready" | "error"`; buttons `aria-label="Exit Inspect"`, `"Save window"` (unchanged name), `"Zoom in"`/`"Zoom out"`/`"Reset view"`/`"Full screen"` (same names as the normal pill).

```ts
export function InspectPill(props: {
  /** The cube is open (else armed: placing a window). */
  open: boolean;
  sizeUm: number;
  /** The live window centre (µm), or null before one is placed. */
  centre: { x: number; y: number } | null;
  status: "refining" | "ready" | "error";
  statusError: string;
  saved: boolean;
  canSave: boolean;
  fullscreen: boolean;
  onExit: () => void;
  onSave: () => void;
  onToggleFullscreen: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```ts
  test("entering Inspect swaps the top pill for the dotted Inspect pill; Exit restores it", async ({ page }) => {
    const tools = page.getByRole("toolbar", { name: "Drawing tools" });
    await expect(tools).toBeVisible();
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const pill = page.getByTestId("inspect-pill");
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("data-state", "armed");
    await expect(tools).toHaveCount(0);
    await expect(pill.getByText("Click to place a 300 µm window")).toBeVisible();
    expect(await pill.evaluate((el) => getComputedStyle(el).borderStyle)).toContain("dashed");
    await pill.getByRole("button", { name: "Exit Inspect" }).click();
    await expect(pill).toHaveCount(0);
    await expect(tools).toBeVisible();
    expect(await getModel(page, "mode")).not.toBe("inspect");
  });

  test("the Inspect pill shows Refining then Ready, with Save and Exit", async ({ page }) => {
    await openCubeAtCentre(page);
    const pill = page.getByTestId("inspect-pill");
    await expect(pill).toHaveAttribute("data-state", "open");
    await expect(pill.getByText(/Inspect/)).toBeVisible();
    await expect(page.getByTestId("inspect-status")).toHaveAttribute("data-state", "ready");
    await expect(pill.getByRole("button", { name: "Save window" })).toBeEnabled();
    await pill.getByRole("button", { name: "Exit Inspect" }).click();
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
  });

  test("Esc closes the cube, a second Esc exits Inspect", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
    await expect(page.getByTestId("inspect-pill")).toHaveAttribute("data-state", "armed");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("inspect-pill")).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Drawing tools" })).toBeVisible();
  });

  test("the status chip reads Refining while a level loads", async ({ page }) => {
    // Force a coarse-then-fine load with the harness budgets so the chip is observable.
    await reloadWith(page, "budgets=2000,20000");
    await openCubeAtCentre(page);
    const chip = page.getByTestId("inspect-status");
    await expect(chip).toHaveAttribute("data-state", /refining|ready/);
    await expect(chip).toHaveAttribute("data-state", "ready");
  });
```
(The last test pins that the chip exists and resolves; an unconditional `refining` observation would race, so it only requires it to end `ready`. Keep it.)

- [ ] **Step 2: Run them; they fail**

```bash
cd frontend && lsof -iTCP:5173 -sTCP:LISTEN; E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "dotted Inspect pill|Refining then Ready|second Esc|status chip"
```

- [ ] **Step 3: Status in settings; remove the actions row**

`use-cube-settings.ts`: add `load: "refining" | "ready" | "error"` (default `"refining"`) and `loadError: string` (default `""`). In `cube-immersive.tsx`, `onLoadState` already receives `refining` / `refineError` / `imageError`: replace its local `useState`s with `patch({ load: s.imageError || s.refineError ? "error" : s.refining ? "refining" : "ready", loadError: s.imageError || s.refineError || "" })`. Delete the `<header className="… landmarks__cube-actions">` block and the history strip is **left for Task 8** (do not touch it here). Remove the now-unused `cube-actions` CSS later in this task's Step 6. `Save` handling moves to the pill: `CubeImmersive` keeps accepting `onSave` for now only if still used by the history strip; otherwise delete the prop and its wiring.

- [ ] **Step 4: `InspectPill`**

Create `chrome/inspect-pill.tsx` with `TOOLBAR_CLASS`, `ChromeTooltip`, `ToolbarDivider`, `chromeHitClass`, `chromeHitTextClass`, lucide `XIcon`, `BoxIcon`, `PlusIcon`, `MinusIcon`, `Maximize2Icon`, `MaximizeIcon`, `MinimizeIcon`, `BookmarkPlusIcon`, `BookmarkCheckIcon`, and `Morph` from `cube-motion/react` for the status. Structure (armed vs open from `props.open`):

```tsx
export function InspectPill(p: InspectPillProps) {
  const fullscreenLabel = p.fullscreen ? "Exit full screen" : "Full screen";
  return (
    <TooltipProvider delayDuration={80} skipDelayDuration={0}>
      <div
        className={cn(TOOLBAR_CLASS, "landmarks__inspect-pill")}
        role="toolbar"
        aria-label="Inspect"
        data-testid="inspect-pill"
        data-placement="top"
        data-state={p.open ? "open" : "armed"}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <ChromeTooltip label="Exit Inspect" shortcut="Esc">
          <Button type="button" variant="ghost" size="icon-sm" className={chromeHitClass} aria-label="Exit Inspect" onClick={p.onExit}>
            <XIcon className="size-4" />
          </Button>
        </ChromeTooltip>
        <span className="landmarks__inspect-title">
          <BoxIcon aria-hidden className="size-3.5" />
          <span className="font-medium">Inspect</span>
          {p.open ? <span className="landmarks-meta">{Math.round(p.sizeUm)} µm</span> : null}
        </span>
        {p.open ? (
          <>
            {p.centre ? (
              <span className="landmarks-meta tabular-nums" data-testid="inspect-centre">
                {Math.round(p.centre.x)}, {Math.round(p.centre.y)} µm
              </span>
            ) : null}
            <StatusChip status={p.status} error={p.statusError} />
            <ToolbarDivider />
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label="Save window"
              data-saved={String(p.saved)}
              disabled={p.saved || !p.canSave}
              title={p.saved ? "This window is saved" : "Save this window as an inspect selection"}
              className={cn(chromeHitTextClass, "gap-1 px-2")}
              onClick={p.onSave}
            >
              {p.saved ? <BookmarkCheckIcon aria-hidden /> : <BookmarkPlusIcon aria-hidden />}
              {p.saved ? "Saved" : "Save"}
            </Button>
          </>
        ) : (
          <>
            <span className="landmarks-meta">Click to place a 300 µm window</span>
            <ToolbarDivider />
            <ZoomControls onZoomIn={p.onZoomIn} onZoomOut={p.onZoomOut} onReset={p.onResetZoom} />
          </>
        )}
        <ToolbarDivider />
        <FullscreenButton fullscreen={p.fullscreen} onToggle={p.onToggleFullscreen} />
      </div>
    </TooltipProvider>
  );
}
```
Do not copy the zoom and fullscreen buttons: extract them from `chrome/topbar.tsx` into two exported components in the same file, `ZoomControls({ onZoomIn, onZoomOut, onReset })` (the `Zoom in`, `Zoom out`, `Reset view` buttons with their `ChromeTooltip`s) and `FullscreenButton({ fullscreen, onToggle })`, use them inside `Topbar` (output identical), and use them in `InspectPill` where the comments say so (zoom/reset in the armed state; fullscreen in both). `StatusChip`:

```tsx
function StatusChip({ status, error }: { status: "refining" | "ready" | "error"; error: string }) {
  return (
    <span
      data-testid="inspect-status"
      data-state={status}
      role="status"
      className="landmarks__inspect-status"
      title={status === "error" ? error : undefined}
    >
      {status === "error" ? (
        <span className="text-destructive">{error || "Could not load"}</span>
      ) : (
        <Morph active={status === "ready"} off="Refining" on="Ready" />
      )}
    </span>
  );
}
```
`Morph` crossfades the two faces (a letter-level morph for text); the shimmer is CSS on the `off` face.

- [ ] **Step 5: Swap in `LandmarksView` and exit logic**

In the `landmarks__chrome-tools` block replace the single `<Topbar …/>` with two `<Rise>` children (import `Rise` from `cube-motion/react`, as `selection-toolbar.tsx` does):

```tsx
          <Rise show={!inspecting}>
            <Topbar … />
          </Rise>
          <Rise show={inspecting}>
            <InspectPill
              open={cubeOpen}
              sizeUm={lm.inspect_size_um || INSPECT_WINDOW_UM}
              centre={lm.inspect_cx != null && lm.inspect_cy != null ? { x: lm.inspect_cx, y: lm.inspect_cy } : null}
              status={cube.load}
              statusError={cube.loadError}
              saved={…same expression the old actions row used…}
              canSave={lm.inspect_cx != null && lm.inspect_cy != null}
              fullscreen={isFullscreen}
              onExit={inspectCube.exitInspect}
              onSave={inspectCube.save}
              onToggleFullscreen={() => { toggle(); }}
              onZoomIn={() => engineRef.current?.zoomBy(1)}
              onZoomOut={() => engineRef.current?.zoomBy(-1)}
              onResetZoom={() => engineRef.current?.resetZoom()}
            />
          </Rise>
```
`<Rise show>` keeps the leaving pill mounted for its 320 ms exit: both pills overlap at the same spot briefly. Place both in a `display: grid` wrapper with `grid-area: 1 / 1` children so they stack and centre (CSS in Step 6). The `saved` expression is the `history.some(...)` check that lived in the old actions row; export a small `isWindowSaved(lm)` helper from `use-inspect-cube.ts` (using `inspectWindowOf`) and use it here.

`use-inspect-cube.ts`: remember the last non-Inspect mode and add exit:

```ts
  const prevModeRef = useRef("select");
  useEffect(() => {
    if (lm.mode !== "inspect") prevModeRef.current = lm.mode;
  }, [lm.mode]);
  const exitInspect = useCallback(() => {
    patchCube({ open: false });
    lm.setMode(prevModeRef.current === "inspect" ? "select" : prevModeRef.current);
  }, [lm, patchCube]);
```
and in `onKeyDown`: if the key is Escape, `mode === "inspect"`, and the cube is **not** open (and the target is not in a menu/Adjust panel, same exclusions as today), call `exitInspect()` instead of returning. The engine's own Escape handler still runs first for the first Esc (it emits `close`); a second Esc reaches `onKeyDown` with `open === false`. Guard against the same keystroke closing and then exiting: use the `open` value captured when the handler runs (React state is the pre-close value for that event), which is what the existing code already relies on.

- [ ] **Step 6: CSS**

In `landmarks.css`: delete `.landmarks__cube-actions` (and its `--rulers`/narrow variants and the second-row offset logic from Task 8 of PR #58 that existed only to clear it; keep the `--lm-chrome-band` override that lowers docks so they do not cover the bottom bar/pill if still needed: re-verify at wide/narrow/fullscreen). Add:

```css
/* The Inspect pill replaces the tool pill in the same slot; both stack while one leaves. */
.landmarks__chrome-tools {
  display: grid;
  place-items: start center;
}
.landmarks__chrome-tools > * {
  grid-area: 1 / 1;
}

/* Temporary mode: a dotted outline. */
.landmarks__inspect-pill {
  border: 1px dashed color-mix(in oklab, var(--lm-text-muted) 70%, transparent);
}
.landmarks__inspect-title {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding-inline: 0.25rem;
  font-size: 0.75rem;
}

/* Refining: a gradient sweeps across the text. */
.landmarks__inspect-status {
  font-size: 0.6875rem;
  min-width: 3.5rem;
  color: var(--lm-text-muted);
}
.landmarks__inspect-status[data-state="refining"] {
  background: linear-gradient(
      90deg,
      var(--lm-text-muted) 0%,
      var(--lm-text-muted) 35%,
      var(--foreground) 50%,
      var(--lm-text-muted) 65%,
      var(--lm-text-muted) 100%
    )
    0 0 / 250% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: landmarks-shimmer 1.4s linear infinite;
}
@keyframes landmarks-shimmer {
  to {
    background-position: -150% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .landmarks__inspect-status[data-state="refining"] {
    animation: none;
    color: var(--lm-text-muted);
    background: none;
  }
}
```
(`Morph`'s `off` face is the "Refining" text inside the span, so the gradient clip applies to it via inheritance when `data-state="refining"`; verify visually that the gradient shows on the text and that `Ready` renders in the muted colour after the morph. If `Morph`'s inactive/active faces break the clipped text, apply the shimmer class to the `off` face via a wrapper `<span className="landmarks__shimmer">Refining</span>` instead.)

- [ ] **Step 7: Adapt existing tests**

Every test that clicked the old actions-row `Save window` through `cubeWindow(page).getByRole("button", { name: "Save window" })` now uses `page.getByTestId("inspect-pill").getByRole("button", { name: "Save window" })` (update the `saveButton` helper at the top of the spec). Every test that clicked `Close cube` to return to the map (and stay in Inspect) now presses Esc (and awaits `cubeWindow` count 0); tests whose point is leaving Inspect click `Exit Inspect`. Tests that click another tool while in Inspect ("the cube closes when leaving Inspect…", the tool-switch tests) first click `Exit Inspect` then the tool, or press Esc twice. The preview-over-tools z-order test: the tools pill is now the Inspect pill in Inspect, keep the same intent (preview float under the top pill). The `landmarks.spec.ts` (non-volume harness) Inspect-without-volume test must still pass: the pill's armed state shows with no volume, and `InspectNoVolumePill` (bottom) is unchanged.

- [ ] **Step 8: Run tests**

```bash
cd frontend && npm run typecheck && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts 2>&1 | tail -10 && npx playwright test e2e/landmarks 2>&1 | tail -5
```
Expected: all pass. Take screenshots of the armed pill, the open pill (Refining and Ready), at wide, 640 px and fullscreen; confirm no overlap with the peek tabs/docks and that the dotted outline reads in light and dark themes. Name the paths in your report.

- [ ] **Step 9: Commit**

```bash
git add -A frontend && git commit -m "Swap the top toolbar for a dotted Inspect pill

Armed and open states, Refining/Ready status chip, Exit, Save and fullscreen;
the old cube actions row is removed. Esc closes the cube, a second Esc exits.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bottom bar and panels (per-layer projection, Cross-section)

**Files:**
- Modify: `frontend/src/widgets/landmarks/chrome/inspect-toolbar.tsx`, `frontend/src/widgets/landmarks/landmarks.css` (panel max-height and layout), `frontend/src/widgets/landmarks/LandmarksView.tsx` (props), `frontend/src/widgets/landmarks/use-inspect-cube.ts` (Reset sections: add `"cross"`; keep `"cuts"` name internally if simpler)
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- DOM: bar `data-testid="context-inspect-toolbar"` (unchanged id); camera `ToggleGroup` `aria-label="Camera"` (unchanged); `button "Move"` (`aria-pressed`); `button "Reset view"`; `button "Adjust"` (`aria-expanded`, `aria-haspopup="dialog"`) opening `data-testid="context-cube-adjust"` (`role="region"`, `aria-label="Adjust"`) with two columns `data-testid="adjust-image"` and `data-testid="adjust-labels"`; `button "Cross-section"` (`aria-expanded`, `aria-haspopup="dialog"`) opening `data-testid="context-cube-cross"` (`role="region"`, `aria-label="Cross-section"`) with the existing `data-testid="context-cube-cuts"` group inside it.
- Each Adjust column has `aria-label`ed projection toggle groups: `"Image projection"` and `"Labels projection"` with items `Additive` / `MIP`; the Palette dropdown (`aria-label="Palette"`) lives in the Image column. Show switches keep their names (`Show image`, `Show labels`).

- [ ] **Step 1: Write the failing tests**

```ts
  test("the bottom bar holds the view options; Adjust and Cross-section are separate panels", async ({ page }) => {
    await openCubeAtCentre(page);
    const bar = page.getByTestId("context-inspect-toolbar");
    await expect(bar.getByRole("button", { name: "Move" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Reset view" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Adjust" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Cross-section" })).toBeVisible();
    // The projection and palette moved into Adjust.
    await expect(bar.getByLabel("Projection")).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Palette" })).toHaveCount(0);
    await bar.getByRole("button", { name: "Cross-section" }).click();
    await expect(page.getByTestId("context-cube-cross").getByTestId("context-cube-cuts")).toBeVisible();
    await expect(page.getByTestId("context-cube-adjust")).toHaveCount(0); // one panel at a time
  });

  test("Adjust has an Image and a Labels column with independent projections", async ({ page }) => {
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await openAdjust(page);
    const panel = page.getByTestId("context-cube-adjust");
    await panel.getByTestId("adjust-image").getByRole("radio", { name: "MIP" }).click();
    await expect(view).toHaveAttribute("data-image-mode", "mip");
    await expect(view).toHaveAttribute("data-label-mode", "additive");
    await panel.getByTestId("adjust-labels").getByRole("radio", { name: "MIP" }).click();
    await expect(view).toHaveAttribute("data-label-mode", "mip");
    await panel.getByTestId("adjust-image").getByRole("radio", { name: "Additive" }).click();
    await expect(view).toHaveAttribute("data-image-mode", "additive");
    await expect(view).toHaveAttribute("data-label-mode", "mip");
    await expect(panel.getByTestId("adjust-image").getByRole("button", { name: "Palette" })).toBeVisible();
  });

  test("panels stay short enough not to cover the cube", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 520 });
    await openCubeAtCentre(page);
    const widget = (await page.locator(".landmarks__body").first().boundingBox())!;
    await openAdjust(page);
    const adjust = (await page.getByTestId("context-cube-adjust").boundingBox())!;
    expect(adjust.height).toBeLessThanOrEqual(widget.height * 0.5);
    await page.keyboard.press("Escape");
    await page.getByTestId("context-inspect-toolbar").getByRole("button", { name: "Cross-section" }).click();
    const cross = (await page.getByTestId("context-cube-cross").boundingBox())!;
    expect(cross.height).toBeLessThanOrEqual(widget.height * 0.5);
  });
```
(`openAdjust` is the existing helper; it clicks the `Adjust` button inside the toolbar.)

- [ ] **Step 2: Run them; they fail**

```bash
cd frontend && lsof -iTCP:5173 -sTCP:LISTEN; E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "bottom bar holds|independent projections|short enough"
```

- [ ] **Step 3: Restructure `InspectToolbar`**

Bar (`TOOLBAR_CLASS`, `data-testid="context-toolbar-l1"` kept): `Top|Iso|Side` `ToggleGroup` (unchanged) · `ToolbarDivider` · `Move` button (moved here from Task 4's temporary spot; keep `aria-pressed`) · `Reset view` · `ToolbarDivider` · `Adjust` `IconBtn`/`ToolStack` · `Cross-section` `IconBtn`/`ToolStack` (icon: lucide `SquareSplitVerticalIcon` or `ScissorsIcon`; whichever exists in the installed lucide, label `Cross-section`). Remove the Projection group and the Palette dropdown from the bar. One panel open at a time: state `panel: "adjust" | "cross" | null`; clicking the other button switches; Esc closes the open panel only (keep the `data-testid="context-cube-adjust-group"` wrapper's Esc logic for Adjust and add the same for Cross-section; the engine/`onKeyDown` exclusion selector must list both groups: update the selector string in `use-inspect-cube.ts` `onKeyDown` and in the engine's Escape handler (`milume/static/landmarks.js`, the `adjustTrigger` lookup) to a generic `[data-inspect-panel-group] [aria-haspopup="dialog"][aria-expanded="true"]`, and put `data-inspect-panel-group` on both wrapper spans, keeping the existing `data-testid="context-cube-adjust-group"` on the Adjust one).

Adjust panel: two columns in `landmarks-adjust__cols`. Image column (`data-testid="adjust-image"`): the existing `AdjustSection title="Image"` (show switch, reset) now also contains a projection `ToggleGroup type="single" aria-label="Image projection"` bound to `settings.imageMode` / `patch({ imageMode })` and the Palette dropdown (moved from the bar, same `DropdownMenu` code with `container={menuContainer}`), then Contrast, Alpha, Gamma. Labels column (`data-testid="adjust-labels"`): the existing Labels section with `aria-label="Labels projection"` toggles bound to `labelMode`, then Alpha. Foot: `Reset all`. Reset for a section also resets its projection to `"additive"` (extend `resetAdjust` in `use-inspect-cube.ts`: `image` → `patchCube({ imageMode: "additive", … })`, `labels` → `labelMode: "additive"`).

Cross-section panel (`data-testid="context-cube-cross"`, `role="region"`, `aria-label="Cross-section"`): a single `AdjustSection title="Cross-section" testId="context-cube-cuts"` with the X/Y/Z `cutRow`s (labels "X cut", "Y cut", "Z cut" unchanged so existing locators keep working) and its Reset (`onReset("cuts")`). Rename the visible title from "Cuts" to "Cross-section".

Remove the temporary projection wiring from Task 3 (`patch({ imageMode: v, labelMode: v })`).

- [ ] **Step 4: Panel height**

In `landmarks.css`, for `.landmarks-adjust` and the new cross panel class (add `landmarks-cross` to the panel element) set:

```css
.landmarks-adjust,
.landmarks-cross {
  max-height: min(45%, 22rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}
```
`45%` resolves against the panel's containing block: check that the `ToolStack` panel's offset parent is the widget (`.landmarks__chrome`), else compute from `100cqh`/a CSS variable. Verify in the browser at 520 px height that the panel is at most half the widget; the test in Step 1 pins it. On `.landmarks--narrow`, `.landmarks-adjust__cols` stacks (`grid-template-columns: 1fr`).

- [ ] **Step 5: Adapt the existing tests**

Update (never delete) these tests: "inspect toolbar: presets, MIP, palette, alpha/gamma, committed Z cut" (Projection group → the Adjust Image/Labels toggles via `data-image-mode`/`data-label-mode`; Palette → inside Adjust; the Z cut → open Cross-section), "one Adjust panel: Image, Labels and Cuts sections, each with a Reset…" (Cuts moves to Cross-section; resets of Image/Labels also reset projection; `Reset all`), "Adjust trigger a11y; Esc closes only the Adjust panel, not the cube" (add Cross-section's trigger and Esc), "partial X and Y cuts…", "a Z-only cut…", "Python's inspect and volume_cut writes…" (open the Cross-section panel instead of Adjust where they read `context-cube-cuts`), "a palette change before placing reaches the hover preview, then the dock" (the Palette control is in Adjust now; open the cube first or, if the point is "before placing", keep a way to change the palette before the cube opens: if the bar is absent before the cube opens, change the test to set the palette in Adjust once open and assert the preview picks it up at the next hover), the "Show image off…" test, and `toggleShow` (opens Adjust: fine). Keep every assertion's meaning.

- [ ] **Step 6: Verify the four projection combinations**

In the dev harness, open Adjust and toggle through all four combinations with Labels on; confirm each looks as in Task 3 Step 5. Screenshot the bar and both panels at wide, 640 px and 900×520; confirm panels never exceed half the widget. Name the paths in your report.

- [ ] **Step 7: Run tests and commit**

```bash
cd frontend && npm run typecheck && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts 2>&1 | tail -10
git add -A frontend milume && git commit -m "Reorganise the cube controls: view bar, Adjust, Cross-section

Projection is per layer and lives in Adjust with the palette; Cuts becomes the
Cross-section panel; both panels are height-capped.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Concise selection names at creation

**Files:**
- Modify: `milume/static/landmarks.js` (`nextNumberedId` neighbourhood, the five creation sites)
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts` and `frontend/e2e/landmarks/landmarks-tools.spec.ts` (selection-creation tests that assert ids)

**Interfaces:**
- Produces in the engine: `selectionName(indices, prefix, items)`: returns `"<top category> · <count>"` when an active categorical and category codes exist and at least one member has a valid code, else `nextNumberedId(prefix, items)`; duplicates get a numeric suffix (`"Epithelial · 214 2"`). Used by every site that does `id: nextSelectionId(selections)` and by `item.id = nextSelectionId(selections)` where a fresh selection is created. Prefixes: inspect → `"inspect"` (so `inspect 1`), others → `"selection"` (unchanged default).

- [ ] **Step 1: Write the failing test**

Harness toy table is typed `type1`/`type0`/`type1` for three cells (see the spec header comment) and the active category is the type column. After Save at the default window (all three cells in the 300 µm square):

```ts
  test("a saved inspect window is named by its top category and cell count", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.getByTestId("inspect-pill").getByRole("button", { name: "Save window" }).click();
    await expect.poll(async () => (await selectionsOf(page)).length).toBe(1);
    // Two of the three toy cells are type1.
    expect((await selectionsOf(page))[0].id).toBe("type1 · 3");
  });
```
Adjust the expected string to the harness's real active category labels (read `category_columns`/`active_category` with `getModel`); the count is the number of `point_indices`, and "top category" is the label with the most members (the toy has type1 ×2 of 3, so `type1 · 3`: the count is the selection's total members, not the top category's).

- [ ] **Step 2: Run it; it fails** (`selection 1`).

- [ ] **Step 3: Implement `selectionName`**

Next to `nextNumberedId`:

```js
  /** A selection's default name: its top category and size, e.g. "Epithelial · 214"; else "<prefix> <n>". */
  function selectionName(indices, prefix, items) {
    const cols = model.get("category_columns") || [];
    const active = model.get("active_category");
    const colIdx = cols.findIndex((c) => c.name === active);
    const labels = colIdx >= 0 ? cols[colIdx].labels || [] : [];
    const n = getPointsData().length;
    if (categoryCodes && labels.length && n && indices && indices.length) {
      const counts = new Map();
      for (const i of indices) {
        const c = categoryCodes[colIdx * n + i];
        if (c >= 0 && c < labels.length) counts.set(c, (counts.get(c) || 0) + 1);
      }
      let best = -1;
      let bestN = 0;
      for (const [c, k] of counts) {
        if (k > bestN) {
          best = c;
          bestN = k;
        }
      }
      if (best >= 0) {
        const base = `${labels[best]} · ${indices.length}`;
        const used = new Set((items || []).map((x) => String(x.id)));
        if (!used.has(base)) return base;
        for (let i = 2; ; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`;
      }
    }
    return nextNumberedId(prefix, items);
  }
```
At each creation site replace `id: nextSelectionId(selections)` with `id: selectionName(<the point_indices being stored>, "selection", selections)`; for `saveInspect` pass `"inspect"` and `inspectMemberIndices(cx, cy, size)` (compute once into a local). The 5th site (`item.id = nextSelectionId(selections)` near line 5377) is a promote/rename of an existing item: read it first; if it creates a selection from a neighbourhood with `point_indices`, use the same call, otherwise leave it. `nextSelectionId` stays for any remaining caller.

- [ ] **Step 4: Adapt tests that assert default ids**

```bash
cd frontend && grep -rn "selection 1\|selection 2\|\"selection \|Selection 1\|inspect 1" e2e | cut -c1-120
```
Update each to the new names (with or without an active categorical in that harness; the default `landmarks` harness has categories too: use `getModel(page, "selections")` to derive expectations rather than hard-coding where several are created).

- [ ] **Step 5: Run tests and commit**

```bash
cd frontend && npm run typecheck && npm run test:e2e:landmarks 2>&1 | tail -10
git add -A frontend milume && git commit -m "Name new selections by their top category and size

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Selection rows with thumbnail and hover card; remove the history strip

**Files:**
- Create: `frontend/src/components/ui/hover-card.tsx` (via shadcn), `frontend/src/widgets/landmarks/chrome/selection-card.tsx`
- Modify: `frontend/src/widgets/landmarks/chrome/layers-panel.tsx`, `chrome/primitives.tsx` (`LayerRow` gets an optional `thumbnail` slot and a `hoverContent` slot), `chrome/cube-immersive.tsx` (delete the history strip and chip code), `LandmarksView.tsx` (pass `snapshots` and category data down), `landmarks.css` (remove `landmarks__cube-history`/`landmarks__inspect-chip`, add card styles)
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Produces `SelectionCard({ lm, index, snapshot })`: `snapshot: ChipSnapshot | null`; renders cell count, bounds in µm (non-inspect) or window centre/size/cut (inspect), the thumbnail when present, and up to 3 category bars from the live Color-by using `resolvePointMask` + `compositionSlices` from `chrome/info-stats.ts` (`selectedKind: "selection"`, `selectedIndex: index`). Computed only when the card is open (render lazily inside the `HoverCardContent`).
- DOM: row `data-testid="selection-row"` per selection; thumbnail `<img data-testid="selection-thumb">` (inspect entries with a snapshot); hover content `data-testid="selection-card"`; category bars `data-testid="selection-card-bar"`.

- [ ] **Step 1: Add the primitive**

```bash
cd frontend && npx shadcn@latest add hover-card
```
Confirm `src/components/ui/hover-card.tsx` exists and imports from `radix-ui` (already a dependency). If the CLI wants to overwrite or restyle other files, stop and report. Run `npm run test:e2e:core` later: shared `components/` changed.

- [ ] **Step 2: Write the failing tests**

```ts
  test("there is no history strip; the saved window is a Selections row with a thumbnail", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.getByTestId("inspect-pill").getByRole("button", { name: "Save window" }).click();
    await expect.poll(async () => (await selectionsOf(page)).length).toBe(1);
    await expect(cubeWindow(page).getByLabel("Inspect history")).toHaveCount(0);
    const row = page.getByTestId("selection-row").first();
    await expect(row).toBeVisible();
    await expect(row.getByTestId("selection-thumb")).toBeVisible();
  });

  test("hovering a selection row shows its count, window and category bars", async ({ page }) => {
    await openCubeAtCentre(page);
    await page.getByTestId("inspect-pill").getByRole("button", { name: "Save window" }).click();
    await expect.poll(async () => (await selectionsOf(page)).length).toBe(1);
    await page.getByTestId("selection-row").first().hover();
    const card = page.getByTestId("selection-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("3 cells");
    await expect(card).toContainText("µm");
    await expect(card.getByTestId("selection-card-bar").first()).toBeVisible();
  });

  test("clicking an inspect row restores its window and opens the cube", async ({ page }) => {
    await reloadWith(page, "window=100");
    const box = await openCubeAtCentre(page);
    await page.getByTestId("inspect-pill").getByRole("button", { name: "Save window" }).click();
    await expect.poll(async () => (await selectionsOf(page)).length).toBe(1);
    const saved = (await selectionsOf(page))[0].window;
    await page.keyboard.press("Escape");
    await dragOnMap(page, box, [0.3, 0.3], [0.35, 0.3]);
    await expect(cubeWindow(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("selection-row").first().click();
    await expect(cubeWindow(page)).toBeVisible();
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBe(saved.cx);
  });
```
(The docks are collapsed on entering Inspect and the Selections panel is in the left dock: open it first with the left peek tab, as the earlier peek-tab test does; add that step in each test via a small helper `openSelectionsDock(page)` that clicks the left peek tab if `data-collapsed="true"`.)

- [ ] **Step 3: Run them; they fail**

```bash
cd frontend && lsof -iTCP:5173 -sTCP:LISTEN; E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "no history strip|hovering a selection row|clicking an inspect row"
```

- [ ] **Step 4: Remove the strip; surface snapshots**

Delete the history `div` and chip rendering from `cube-immersive.tsx` and the CSS blocks `.landmarks__cube-history`, `.landmarks-hit.landmarks__inspect-chip`. Keep the snapshot **capture** (`onRendered`, the live slot, `bumpSnapshots`) in `CubeImmersive`: it still feeds the `snapshots` Map owned by `LandmarksView`. Pass `snapshots` (and a `snapshotVersion` that `CubeImmersive` bumps through an `onSnapshot` callback so the Layers panel re-renders when a thumbnail arrives; the Map is mutable, so use a simple counter state in `LandmarksView` incremented by that callback) to `LayersPanel`. The history-only constants/helpers that nothing uses now (`SELECTION_COLORS` stays, used by rows) must be removed if dead.

- [ ] **Step 5: Rows and card**

`LayerRow` (in `primitives.tsx`): add optional props `thumbnail?: string | null` (rendered as `<img data-testid="selection-thumb" … className="size-7 rounded-sm object-cover">` in place of the colour swatch when present) and `hoverContent?: ReactNode` (wrap the row in `HoverCard`/`HoverCardTrigger asChild` with `HoverCardContent side="right" data-testid="selection-card"` and a short `openDelay`; render the content lazily so the composition is only computed on open). Add `data-testid="selection-row"` to the row root. In `layers-panel.tsx`, for each selection compute `thumbnail = snapshots.get(String(sel.id))` when its `key` equals `windowKey(window)` for inspect entries (reuse `inspectWindowOf` and `windowKey`), and pass `hoverContent={<SelectionCard lm={lm} index={i} snapshot={...} />}`.

`selection-card.tsx`:

```tsx
export function SelectionCard({ lm, index, snapshot }: { lm: LandmarksModel; index: number; snapshot: ChipSnapshot | null }) {
  const sel = lm.selections[index];
  const win = inspectWindowOf(sel);
  const n = lm.n_points; // see below
  const mask = resolvePointMask({
    n,
    selectedKind: "selection",
    selectedIndex: index,
    selections: lm.selections,
    pointsDataB64: lm.points_data,
    categoryCodesB64: lm.category_codes,
    categoryColumns: lm.category_columns,
    activeCategory: lm.active_category,
  });
  const count = mask.reduce((a, v) => a + v, 0);
  const slices = compositionSlices({
    n,
    mask,
    categoryCodesB64: lm.category_codes,
    categoryColumns: lm.category_columns,
    activeCategory: lm.active_category,
  })
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  return (
    <div className="landmarks__selection-card">
      {snapshot ? <img src={snapshot.url} alt="" className="w-full rounded-md" /> : null}
      <p className="m-0 text-xs font-medium">{count} cells</p>
      {win ? (
        <p className="landmarks-meta m-0">
          {Math.round(win.size_um)} µm window at {Math.round(win.cx)}, {Math.round(win.cy)} µm
          {win.cut.length === 6 ? " · cross-section" : ""}
        </p>
      ) : (
        <p className="landmarks-meta m-0">{boundsText(lm, mask)}</p>
      )}
      {slices.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5 text-[11px]">
          <span className="w-16 truncate">{s.label}</span>
          <span
            data-testid="selection-card-bar"
            className="h-1.5 rounded-full"
            style={{ width: `${(s.value / Math.max(count, 1)) * 100}%`, background: s.fill }}
          />
          <span className="tabular-nums">{Math.round((s.value / Math.max(count, 1)) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
```
`lm.n_points` / `lm.points_data` / `lm.category_codes` names: read `info-panel.tsx` to see exactly how it obtains `n` and passes `pointsDataB64`/`categoryCodesB64` to `resolvePointMask`, and copy that (the type of `lm` exposes `points_data` and `category_codes`; `n` is `decodeF32Base64(points_data).length / 4`: compute once with `useMemo` keyed on `points_data`, or reuse whatever helper `info-panel.tsx` uses). `boundsText` computes min/max x,y of the masked points from `decodeF32Base64(points_data)` (stride 4) and returns e.g. `x 120–260 · y 80–190 µm`. Add `selection-card` CSS (padding, width 14rem) with Soft Float glass (`FLOAT_PANEL`-based) in `landmarks.css`.

- [ ] **Step 6: Adapt existing tests**

The history tests (`history chips restore each saved window and cut; a saved entry keeps its cut`, `deleting an inspect selection removes its chip; the last one closes the dock`, `a chip's snapshot follows its entry: a reused id re-snapshots`, the live-snapshot test, `Save re-enables…`) are about the same behaviors, now in the Selections panel: adapt them to click `selection-row`s and assert `selection-thumb` instead of chips (the snapshot logic is unchanged). The "cube stays open" tests that referenced `Inspect history` drop that locator.

- [ ] **Step 7: Run tests, including core (shared components changed)**

```bash
cd frontend && npm run typecheck && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts 2>&1 | tail -10 && npm run test:e2e:core 2>&1 | tail -4
```
Expected: all pass. If the core shared-chrome screenshot differs only because of the new component being unused there, it should not change; if it changes, investigate before updating any snapshot.

- [ ] **Step 8: Commit**

```bash
git add -A frontend && git commit -m "Describe inspect windows in the Selections panel

Rows get a thumbnail and a hover card (count, window, category bars); the cube's
history strip is removed.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs, feature maps, colon check, full gate

**Files:**
- Modify: `.agents/skills/verify-landmarks/features/inspect-cube.md`, `inspect-history.md`, `toolbar-layout.md`, `zoom-controls.md`, `pointer-or-select-modes.md` (as touched), `docs/adr/0006-landmarks-hosts-volume-cube.md` (addendum), `frontend/DESIGN.md`, `README.md`/`milume/landmarks.py` wording if it names the history strip or Cuts, the spec `2026-10-03-inspect-rework-design.md` (a "Deviations during implementation" list)

- [ ] **Step 1: Docs against what was built**

Read the actual code and tests before writing. Feature maps: the Inspect pill (armed/open states, dotted outline, `Exit Inspect`, status chip states, Esc then Esc), pan (Shift+drag, Move, clamp, `inspect_cx/cy` written), shells, per-layer projection and the new panel names/testids, no history strip (rows + hover card + thumbnails + concise names). Use real test titles (`grep -n '  test(' frontend/e2e/landmarks/landmarks-volume.spec.ts`). Remove statements about the old actions row, history chips, `data-render`, Additive/MIP in the bar, "Cuts". ADR addendum dated 2026-10-03. `frontend/DESIGN.md`: Inspect chrome paragraph and the glass/pill tokens (dotted outline).

- [ ] **Step 2: Deviations**

Append any deviation from this plan (Task reports) to the spec's "Deviations during implementation" list.

- [ ] **Step 3: Stale wording sweep**

```bash
grep -rn "history strip\|Inspect history\|cube-actions\|Close cube\|\"Cuts\"\|data-render\|Additive.*bar\|context region" README.md milume docs/adr frontend/DESIGN.md .agents frontend/dev frontend/src | cut -c1-140
```
Fix every live hit (historical plan/spec files may keep old wording).

- [ ] **Step 4: Full verification**

```bash
cd frontend && lsof -iTCP:5173 -sTCP:LISTEN; npm run typecheck && npm run build && npm run test:e2e:landmarks 2>&1 | tail -6 && npm run test:e2e:core 2>&1 | tail -4
```
Expected: all green; report exact totals (the volume spec count changes from the baseline: say how).

- [ ] **Step 5: Colon A2 check**

The colon A2 SpatialData is at `/Users/clarence/scverse_conference_2026/pyxa_scverse_demo/data/colon_a2.sdata.zarr` (notebook `colon_a2.py` there). From that directory, with a **free** port and without touching its `pyproject.toml`/`uv.lock`:

```bash
uv run --frozen --with-editable /Users/clarence/scverse_conference_2026/milume/.claude/worktrees/inspect-mode-fullscreen-zoom-2442d5 marimo run --headless --no-token --port <free> colon_a2.py
```
(rebuild the bundle first: `cd frontend && npm run build`). Drive it with headless Playwright (`page.goto`, wait for the widget, press `I`, hover, click) or by hand: the pill swaps, the cube opens, shift-drag pans across several windows without stalls, labels read as shells at the tuned defaults, Adjust/Cross-section panels fit, Save creates a row named `<category> · <n>` with a thumbnail and hover card. Do not stop other marimo/napari processes (the user may have one on port 65151). Stop only the one you start. If you cannot run it, say so.

- [ ] **Step 6: Visual evidence**

Capture screenshots into the scratchpad dir: armed pill, open pill (Refining, Ready), cube with shells, Adjust and Cross-section panels, a selection hover card, a pan mid-drag. Name the paths in the report. Do **not** push or post to the PR.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Document the reworked Inspect

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
