# Inspect Immersive Cube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Inspect, releasing a click makes the cube fill the widget's plot area (instead of a floating window), with soft out-of-focus tissue around the fixed 300 µm window that the user can zoom out to see.

**Architecture:** `CubeWindow` (floating, draggable) becomes `CubeImmersive` (absolute `inset-0` over the plot area, glass chrome on top). The cube opens on mouse **release** (new engine `release` event), so drag-to-position still works with the hover preview. `VolumeCube` gains a `context` mode: a second, coarse, window-masked volume layer (loaded through a second `useShownWindow`) drawn under the unchanged fine window layer. Window, cut, highlight, Save and all synced traits keep their meaning.

**Tech Stack:** React 19, TypeScript, Viv 0.22 / deck.gl 9.2 / luma.gl 9.2 (GLSL ES 3.00 injected via Viv extensions), Playwright e2e (no unit runner in this repo), vanilla engine in `milume/static/landmarks.js`.

**Spec:** [`docs/specs/2026-10-02-inspect-immersive-cube-design.md`](../specs/2026-10-02-inspect-immersive-cube-design.md)

## Global Constraints

- Widget UI uses shadcn/ui primitives from `frontend/src/components/ui/` and Soft Float chrome (`FLOAT_PANEL`, `chromeHitClass`, `chromeHitTextClass` from `chrome/primitives.tsx` / `chrome/sections.ts`). No hand-rolled styled `button`/`div` where a primitive exists.
- No new synced traits (ADR 0005/0006). `volume`, `volume_label_ids`, `volume_cut`, `inspect_cx`, `inspect_cy`, `inspect_size_um`, `selections` keep their meaning. Rendering controls stay client-local.
- Window stays a fixed 300 µm (`INSPECT_WINDOW_UM`); panning/zooming the cube never moves `inspect_cx`/`inspect_cy`.
- Context region reuses `PREVIEW_REGION_SCALE` (3) and `PREVIEW_REGION_BUDGET` (8 M voxels) from `volume-cube/window-source.ts`. No second budget constant.
- `VolumeCube` stays backward compatible: the hover preview and any caller without `context` render exactly as before.
- `_esm` stays a `pathlib.Path` to the bundled `.mjs`; bundles are git-ignored; one deck.gl/luma.gl root stack (do not add dependencies).
- Tests: Playwright only (`npm run test:e2e:landmarks`). Prefer `expect.poll` / web-first asserts; a fixed wait only for a negative check that must outlast a debounce, with a comment.
- All work happens in this worktree (`.claude/worktrees/inspect-mode-fullscreen-zoom-2442d5`, branch `claude/inspect-mode-fullscreen-zoom-2442d5`). Run commands from the worktree root unless a step says `cd frontend`.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Behaviour changes to know before starting

1. **The map is blocked while the cube is open.** Today a press on the map moves the live window while the floating cube is open ("drag pans the cube live"). With the takeover that is impossible. Replacement: press+drag on the map still moves the window with the hover preview following; the cube opens on release. To move a window after opening, Esc/Close, then place again. Many existing e2e tests do exactly that (drag while open) and are adapted in Task 4.
2. **Coarse-context seam, not dim-only.** The spec's "tier 1" is implemented as a second coarse volume layer masked out over the window footprint, plus a dim/desaturate in the shader. Tier 2 (screen-space blur) is out of scope.
3. **No free pan.** The orbit camera target stays fixed on the window (existing `fixedTargetRef`); the user orbits and zooms out to see context.
4. **Compositing limit.** The context layer is drawn first, the window layer over it. Exact from the top-down home view; approximate when orbited (context in front of the window is not composited in front). Accept.

## File Structure

| File | Responsibility |
| --- | --- |
| `milume/static/landmarks.js` | Emit `release` inspect event when a press ends by mouse release |
| `frontend/src/widgets/landmarks/engine.d.ts` | `InspectEvent` gains `{ type: "release" }` |
| `frontend/src/widgets/landmarks/use-inspect-cube.ts` | Open on `release` (not `place`); remember last hover for the open animation |
| `frontend/src/widgets/landmarks/chrome/cube-immersive.tsx` (new) | The takeover: full-bleed `VolumeCube`, action pill, history strip, snapshots |
| `frontend/src/widgets/landmarks/chrome/cube-window.tsx` | Keep only exported snapshot helpers (`ChipSnapshot`, `windowKey`, `snapshotOf`) → moved; file deleted |
| `frontend/src/widgets/landmarks/chrome/cube-snapshots.ts` (new) | `ChipSnapshot`, `windowKey`, `snapshotOf`, `SNAPSHOT`, `SNAPSHOT_SETTLE_MS` (moved out of cube-window) |
| `frontend/src/widgets/landmarks/chrome/index.ts` | Export `CubeImmersive` instead of `CubeWindow` |
| `frontend/src/widgets/landmarks/LandmarksView.tsx` | Render `CubeImmersive`; hide the hover preview while the cube is open |
| `frontend/src/widgets/landmarks/landmarks.css` | `landmarks__cube-window*` → `landmarks__cube-immersive*`; open animation; drop resize/titlebar drag styles |
| `frontend/src/widgets/volume-cube/context-layer.ts` (new) | Pure helpers: context region target, context→window model matrix, window rect in the context volume's texture space |
| `frontend/src/widgets/volume-cube/VolumeCube.tsx` | `context` prop: second `useShownWindow`, second layer props, camera range, `data-context*` attrs |
| `frontend/src/widgets/volume-cube/frame-layers.ts` | `FramedVolumeView.getLayers` draws `props.contextLayer` first |
| `frontend/src/widgets/volume-cube/cell-lut-extension.ts` | Context uniforms (`ctxOn`/`ctxWin`/`ctxLook`): skip the window footprint, dim and desaturate the rest |
| `frontend/e2e/landmarks/landmarks-volume.spec.ts` | New immersive tests; adapt tests that drag the map while open |
| `.agents/skills/verify-landmarks/features/inspect-cube.md`, `inspect-history.md` | Feature map updated |
| `docs/adr/0006-landmarks-hosts-volume-cube.md`, `frontend/DESIGN.md` | Addendum / wording |

---

### Task 1: Baseline in the worktree

**Files:** none changed.

- [ ] **Step 1: Install and type-check**

```bash
cd frontend && npm ci && npm run typecheck
```
Expected: install succeeds; `tsc --noEmit` exits 0.

- [ ] **Step 2: Install the Playwright browser if missing**

```bash
cd frontend && npm run test:e2e:install
```

- [ ] **Step 3: Run the landmarks e2e baseline**

```bash
cd frontend && npm run test:e2e:landmarks 2>&1 | tail -40
```
Expected: record pass/fail counts. Any failure here is pre-existing: write the failing test titles into the PR description later, do not "fix" them in this plan. On macOS, screenshot comparisons soft-skip (see `frontend/e2e/README.md`).

- [ ] **Step 4: Note the dev harness**

`npm run dev:landmarks-volume` serves the harness used by `E2E_HARNESS=landmarks-volume`. Tasks 5–7 need it for visual checks.

(No commit.)

---

### Task 2: Open the cube on release, not on press

**Files:**
- Modify: `milume/static/landmarks.js:3478-3490` (`endInspectPress`, `handleInspectRelease`)
- Modify: `frontend/src/widgets/landmarks/engine.d.ts:10-15`
- Modify: `frontend/src/widgets/landmarks/use-inspect-cube.ts:84-98`
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts` (new test after the `"hover shows the window square…"` test, line ~179)

**Interfaces:**
- Produces: `InspectEvent` variant `{ type: "release" }`, emitted once when an Inspect press ends by mouse release. Not emitted on Esc, blur, or a lost release. Consumed by Task 3's wiring (via `useInspectCube`) and Task 4's tests.

- [ ] **Step 1: Write the failing test**

Add inside `test.describe("Landmarks inspect cube", …)`:

```ts
  test("a drag moves the window with the cube closed; the cube opens on release", async ({ page }) => {
    await page.getByRole("radio", { name: "Inspect", exact: true }).click();
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 });
    // Mid-drag: the window has moved, the cube has not opened.
    await expect.poll(async () => Number(await getModel(page, "inspect_cx"))).toBeGreaterThan(0);
    await expect(cubeWindow(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(cubeWindow(page)).toBeVisible();
  });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "opens on release"
```
Expected: FAIL at `toHaveCount(0)` (cube opens on press today). If it cannot find the test, the `-g` string must match the title: use `-g "cube opens on release"`.

- [ ] **Step 3: Emit `release` from the engine**

In `milume/static/landmarks.js`, replace `handleInspectRelease`:

```js
  function handleInspectRelease(event) {
    if (event.button !== 0) return;
    endInspectPress();
    // A release (not Esc, blur or a lost release) is what opens the cube.
    emitInspect({ type: "release" });
  }
```

In `frontend/src/widgets/landmarks/engine.d.ts`, extend the union:

```ts
export type InspectEvent =
  | { type: "place"; x: number; y: number }
  | { type: "release" }
  | { type: "hover"; x: number; y: number; sizeUm: number; sizePx: number; px: number; py: number }
  | { type: "hover-end" }
  | { type: "commit"; index: number }
  | { type: "close" };
```

- [ ] **Step 4: Open on `release` in `useInspectCube`**

In `use-inspect-cube.ts`, replace the `subscribeInspect` handler body (inside the first `useEffect`):

```ts
    return engine.subscribeInspect((e) => {
      // Placements remember where the user put the window (for the settle commit);
      // the release (end of the click or drag) and saves open the cube, Esc closes it.
      if (e.type === "place") {
        placedRef.current = { x: e.x, y: e.y };
      } else if (e.type === "release" || e.type === "commit") {
        patchCube({ open: true });
      } else if (e.type === "close") {
        patchCube({ open: false });
      }
    });
```
Update the comment above it accordingly (it says "Placements and saves open the cube").

- [ ] **Step 5: Rebuild the bundle and run the test**

```bash
cd frontend && npm run build && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "cube opens on release"
```
Expected: PASS. (The harness serves source through Vite; `npm run build` is only needed for notebook checks, but is cheap and catches type errors.)

- [ ] **Step 6: Run the whole inspect describe block; note failures**

```bash
cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts 2>&1 | tail -40
```
Tests that `mouse.down()` without `mouse.up()` and expect the cube open will now fail ("a release over the dock…" and similar). Do not fix them here; Task 4 handles every such test together. Record the failing titles.

- [ ] **Step 7: Commit**

```bash
git add milume/static/landmarks.js frontend/src/widgets/landmarks/engine.d.ts frontend/src/widgets/landmarks/use-inspect-cube.ts frontend/e2e/landmarks/landmarks-volume.spec.ts
git commit -m "Open the inspect cube on release, not press

A drag now positions the window with the hover preview; the cube opens when
the press ends. Adds an engine 'release' inspect event.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `CubeImmersive` replaces the floating `CubeWindow`

**Files:**
- Create: `frontend/src/widgets/landmarks/chrome/cube-snapshots.ts`
- Create: `frontend/src/widgets/landmarks/chrome/cube-immersive.tsx`
- Delete: `frontend/src/widgets/landmarks/chrome/cube-window.tsx`
- Modify: `frontend/src/widgets/landmarks/chrome/index.ts:12`
- Modify: `frontend/src/widgets/landmarks/LandmarksView.tsx` (imports ~line 21-28; `<CubeWindow>` ~line 366; `<InspectPreview active>` ~line 381)
- Modify: `frontend/src/widgets/landmarks/chrome/inspect-preview.tsx:26` (comment mentioning cube-window.tsx)
- Modify: `frontend/src/widgets/landmarks/landmarks.css:1221-1290`
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Consumes: `InspectCube` from `use-inspect-cube.ts` (`cut`, `focusEntry`, `save`), `CubeSettings` / `CubeSettingsPatch`, `ChunkCache`, `HighlightGroup`, `CubeOverlay`, `CubeCut`, `CubeLoadState`.
- Produces: `CubeImmersive` with the same props as the old `CubeWindow` (`lm, settings, patch, cut, dark, groups, cache, budgets, snapshots, overlays, onFocusEntry, onSave`). Keeps `role="dialog"` + `aria-label="Cube"` so existing locators (`page.getByRole("dialog", { name: "Cube" })`) keep working. Keeps `Save window` / `Close cube` button names and the `Inspect history` group. `cube-snapshots.ts` exports `ChipSnapshot`, `windowKey`, `snapshotOf`, `SNAPSHOT`, `SNAPSHOT_SETTLE_MS`.

- [ ] **Step 1: Write the failing test**

Add after the Task 2 test:

```ts
  test("the cube fills the plot area and Esc returns to the map", async ({ page }) => {
    await openCubeAtCentre(page);
    const body = page.locator(".landmarks__body").first();
    const [cube, plot] = await Promise.all([cubeWindow(page).boundingBox(), body.boundingBox()]);
    expect(cube!.width).toBeGreaterThanOrEqual(plot!.width - 2);
    expect(cube!.height).toBeGreaterThanOrEqual(plot!.height - 2);
    await expect(cubeWindow(page).locator(".volume-cube__view")).toBeVisible();
    // The hover preview does not float over the immersive cube.
    await expect(preview(page)).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
  });
```

`.landmarks__body` is inside the widget root; `page.locator` finds it in the shadow DOM too (Playwright pierces open shadow roots).

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "fills the plot area"
```
Expected: FAIL on `cube.width` (the window is 440 px wide).

- [ ] **Step 3: Move the snapshot helpers**

Create `chrome/cube-snapshots.ts` with the helpers currently at the top of `cube-window.tsx` (lines 31–66, unchanged code):

```ts
export const SNAPSHOT = { width: 64, height: 40 };
/**
 * After an entry's first snapshot, later settled renders replace it for this
 * long: the first settled frame can still carry the previous textures while
 * Viv uploads the new ones.
 */
export const SNAPSHOT_SETTLE_MS = 1000;

/** A history chip snapshot: the window it shows (`windowKey`), its data URL, and when it was first taken. */
export type ChipSnapshot = { key: string; url: string; at: number };

/** The window a snapshot shows. A snapshot under another key (moved entry, reused id) is stale. */
export function windowKey(w: { cx: number; cy: number; size_um: number }): string {
  return `${w.cx},${w.cy},${w.size_um}`;
}

/** Draw `canvas` into a 64×40 WebP, cropped to cover. */
export function snapshotOf(canvas: HTMLCanvasElement): string | null {
  const { width: sw, height: sh } = canvas;
  if (!sw || !sh) return null;
  const out = document.createElement("canvas");
  out.width = SNAPSHOT.width;
  out.height = SNAPSHOT.height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  const aspect = SNAPSHOT.width / SNAPSHOT.height;
  const w = Math.min(sw, sh * aspect);
  const h = w / aspect;
  ctx.drawImage(canvas, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, SNAPSHOT.width, SNAPSHOT.height);
  return out.toDataURL("image/webp", 0.7);
}
```

- [ ] **Step 4: Write `cube-immersive.tsx`**

Create `frontend/src/widgets/landmarks/chrome/cube-immersive.tsx`. It is `CubeWindow` minus the drag/resize/`clampRect`/`Rect` code (old lines 68–73 `Rect`, 75–83 `clampRect`, 130–175 container/rect/pointer handlers, the resize `<button>`). Full file:

```tsx
import { Suspense, lazy, useCallback, useReducer, useRef, useState } from "react";
import { BookmarkCheckIcon, BookmarkPlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HighlightGroup } from "@/widgets/volume-cube/cell-lut-extension";
import type { ChunkCache } from "@/widgets/volume-cube/chunk-cache";
import type { CubeOverlay } from "@/widgets/volume-cube/overlay-layers";
import type { CubeCut, CubeLoadState } from "@/widgets/volume-cube/VolumeCube";
import { PREVIEW_REGION_BUDGET, PREVIEW_REGION_SCALE } from "@/widgets/volume-cube/window-source";

import { INSPECT_WINDOW_UM } from "../engine";
import { SELECTION_COLORS } from "../helpers";
import type { CubeSettings, CubeSettingsPatch } from "../use-cube-settings";
import { inspectWindowOf } from "../use-inspect-cube";
import type { LandmarksModel } from "../use-landmarks-model";
import { type ChipSnapshot, SNAPSHOT, SNAPSHOT_SETTLE_MS, snapshotOf, windowKey } from "./cube-snapshots";
import { chromeHitClass, chromeHitTextClass } from "./primitives";
import { FLOAT_PANEL } from "./sections";

// Lazy only in the dev harness: the widget build inlines dynamic imports
// (`inlineDynamicImports`, vite.config.ts), so landmarks.mjs always carries Viv.
const VolumeCube = lazy(() =>
  import("@/widgets/volume-cube/VolumeCube").then((m) => ({ default: m.VolumeCube })),
);

const ORIGIN_ZYX: [number, number, number] = [0, 0, 0];
const VOXEL_ZYX: [number, number, number] = [1, 1, 1];

/**
 * The Inspect cube taking over the widget's plot area: full-bleed, with Soft
 * Float chrome over it (title, Save, Close top right; the inspect history
 * bottom). Esc in Inspect or the Close button returns to the map.
 */
export function CubeImmersive({
  lm,
  settings,
  patch,
  cut,
  dark,
  groups,
  cache,
  budgets,
  snapshots,
  overlays,
  onFocusEntry,
  onSave,
}: {
  lm: LandmarksModel;
  settings: CubeSettings;
  patch: (p: CubeSettingsPatch) => void;
  /** The cut inside the current window (absolute µm). */
  cut: CubeCut;
  dark: boolean;
  groups: HighlightGroup[];
  /** The widget's decoded-chunk cache, shared with the preview. */
  cache: ChunkCache;
  /** Voxel budgets: `preview` sizes the coarse first step, `dock` the fine level. */
  budgets: { preview: number; dock: number };
  /** History chip snapshots by selection id; kept across opens, never synced. */
  snapshots: Map<string, ChipSnapshot>;
  /** The user's landmarks (µm), drawn on the cube's top face. */
  overlays: CubeOverlay[] | null;
  /** A history chip: focus its entry and restore its window and cut. */
  onFocusEntry: (index: number) => void;
  /** Save the live window as an inspect Selection. */
  onSave: () => void;
}) {
  const [refineError, setRefineError] = useState("");
  const [refining, setRefining] = useState(false);
  const loadRef = useRef<CubeLoadState | null>(null);
  const onLoadState = useCallback((s: CubeLoadState) => {
    loadRef.current = s;
    setRefineError(s.refineError ?? "");
    setRefining(s.refining);
  }, []);

  // History: the inspect Selections, in `selections` order.
  const history = lm.selections.flatMap((sel, index) => {
    const win = inspectWindowOf(sel);
    return win ? [{ id: String(sel.id), index, win }] : [];
  });
  const focusedIndex = lm.selected_kind === "selection" ? lm.selected_index : -1;
  const focused = history.find((h) => h.index === focusedIndex) ?? null;

  // Snapshot the focused entry once its window is shown settled (fine level,
  // no pan) at the entry's own window.
  const [, bumpSnapshots] = useReducer((n: number) => n + 1, 0);
  const latest = useRef({ focused, cx: lm.inspect_cx, cy: lm.inspect_cy });
  latest.current = { focused, cx: lm.inspect_cx, cy: lm.inspect_cy };
  const onRendered = useCallback(
    (canvas: HTMLCanvasElement) => {
      const s = loadRef.current;
      const { focused: f, cx, cy } = latest.current;
      if (!s || s.refining || s.pan[0] !== 0 || s.pan[1] !== 0 || !f) return;
      if (f.win.cx !== cx || f.win.cy !== cy) return;
      const key = windowKey(f.win);
      const prev = snapshots.get(f.id);
      const current = prev?.key === key ? prev : null;
      const now = performance.now();
      if (current && now - current.at > SNAPSHOT_SETTLE_MS) return;
      const url = snapshotOf(canvas);
      if (!url) return;
      snapshots.set(f.id, { key, url, at: current?.at ?? now });
      bumpSnapshots();
    },
    [snapshots],
  );

  const volume = lm.volume ?? {};
  const size = lm.inspect_size_um || INSPECT_WINDOW_UM;
  // The live window is already a saved entry: nothing new to save.
  const placed = lm.inspect_cx != null && lm.inspect_cy != null;
  const saved = history.some(
    (h) => h.win.cx === lm.inspect_cx && h.win.cy === lm.inspect_cy && h.win.size_um === lm.inspect_size_um,
  );
  const swatch = (index: number) => SELECTION_COLORS[index % SELECTION_COLORS.length];

  return (
    <section
      role="dialog"
      aria-label="Cube"
      // Focusable, so Esc pressed after clicking the cube reaches the widget.
      tabIndex={-1}
      className="landmarks__cube-immersive pointer-events-auto absolute inset-0 outline-none"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading cube…</p>}>
        <VolumeCube
          imageUrl={volume.image_url ?? ""}
          labelsUrl={volume.labels_url ?? ""}
          voxelSizeUm={volume.voxel_size_um ?? VOXEL_ZYX}
          originUm={volume.origin_um ?? ORIGIN_ZYX}
          windowCx={lm.inspect_cx ?? 0}
          windowCy={lm.inspect_cy ?? 0}
          windowSizeUm={size}
          cut={cut}
          contrast={settings.contrast}
          mode={settings.mode}
          preset={settings.preset}
          home="top"
          reframeOnPreset
          resetTick={settings.resetTick}
          showImage={settings.showImage}
          showLabels={settings.showLabels}
          groups={groups}
          render={settings.render}
          dark={dark}
          height="100%"
          showLegend={false}
          overlays={overlays}
          coarse={{ scale: PREVIEW_REGION_SCALE, budget: budgets.preview }}
          budget={budgets.dock}
          chunkCache={cache}
          pausesPrefetch
          onLoadState={onLoadState}
          onRendered={onRendered}
          onBounds={(bounds) => patch({ bounds })}
          onPreset={(preset) => patch({ preset })}
        />
      </Suspense>
      <header
        className={cn(FLOAT_PANEL, "landmarks__cube-actions")}
        data-testid="cube-actions"
      >
        <span className="min-w-0 truncate px-2 text-xs font-medium text-foreground">Cube · {Math.round(size)} µm</span>
        {refineError ? (
          <span className="min-w-0 truncate text-xs text-destructive" role="status">
            {refineError}
          </span>
        ) : refining ? (
          <span className="shrink-0 text-xs text-muted-foreground">refining</span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label="Save window"
          title={saved ? "This window is saved" : "Save this window as an inspect selection"}
          data-saved={String(saved)}
          disabled={saved || !placed}
          className={cn(chromeHitTextClass, "gap-1 px-2")}
          onClick={onSave}
        >
          {saved ? <BookmarkCheckIcon aria-hidden /> : <BookmarkPlusIcon aria-hidden />}
          {saved ? "Saved" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close cube"
          title="Close cube"
          className={chromeHitClass}
          onClick={() => patch({ open: false })}
        >
          <XIcon className="size-4" />
        </Button>
      </header>
      {history.length ? (
        <div
          role="group"
          aria-label="Inspect history"
          className={cn(FLOAT_PANEL, "landmarks__cube-history")}
        >
          {history.map((h, n) => {
            const snap = snapshots.get(h.id);
            const src = snap?.key === windowKey(h.win) ? snap.url : null;
            return (
              <Button
                key={`${h.id}-${h.index}`}
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Inspect ${n + 1}`}
                aria-pressed={h.index === focusedIndex}
                title={`Inspect ${n + 1}`}
                className={cn(chromeHitClass, "landmarks__inspect-chip")}
                onClick={() => onFocusEntry(h.index)}
              >
                {src ? (
                  <img src={src} alt="" width={SNAPSHOT.width} height={SNAPSHOT.height} className="rounded-sm" />
                ) : (
                  <span
                    className="block rounded-sm"
                    style={{ width: SNAPSHOT.width, height: SNAPSHOT.height, background: swatch(h.index) }}
                  />
                )}
                <span className="pointer-events-none absolute bottom-1 left-1.5 text-[10px] leading-none font-medium text-white [text-shadow:0_0_2px_rgb(0_0_0/0.9)]">
                  {n + 1}
                </span>
              </Button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
```


- [ ] **Step 5: CSS**

In `landmarks.css`, replace the block at lines 1221–1260 (`.landmarks__cube-window`, `.landmarks__cube-resize`, `::after`, `:hover::after`) and the `.landmarks__cube-titlebar` block (1281–1290) with:

```css
/* Inspect cube taking over the plot area: under the top tools (22), over the docks (16-17). */
.landmarks__cube-immersive {
  z-index: 21;
  border-radius: inherit;
  overflow: hidden;
  animation: landmarks-cube-open var(--duration-quick, 180ms) var(--ease-out, ease-out);
}

@keyframes landmarks-cube-open {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}

@media (prefers-reduced-motion: reduce) {
  .landmarks__cube-immersive {
    animation: none;
  }
}

/* Title, Save, Close: top right, clear of the right peek tab and the tool pill. */
.landmarks__cube-actions {
  position: absolute;
  top: var(--lm-chrome-inset);
  right: 3rem;
  display: flex;
  align-items: center;
  gap: var(--lm-toolbar-gap);
  min-height: var(--lm-toolbar-h);
  padding: var(--lm-toolbar-pad);
  padding-inline-start: 0.75rem;
  box-sizing: border-box;
  max-width: calc(100% - 6rem);
}

/* Inspect history: bottom left, scrolls sideways. */
.landmarks__cube-history {
  position: absolute;
  bottom: var(--lm-chrome-inset);
  left: var(--lm-chrome-inset);
  right: 3rem;
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  width: fit-content;
  max-width: calc(100% - 4rem);
  overflow-x: auto;
}
```

Keep `.landmarks__inspect-chip` (line 1264) unchanged. Check that `--lm-chrome-inset` and `--duration-quick`/`--ease-out` exist (`grep -n "lm-chrome-inset\|--duration-quick" frontend/src/widgets/landmarks/landmarks.css`); the fallbacks above cover the last two.

- [ ] **Step 6: Wire it into `LandmarksView.tsx`**

Imports (around line 21-28): replace `CubeWindow` with `CubeImmersive` in the `./chrome` import list and change `import type { ChipSnapshot } from "./chrome/cube-window";` to `import type { ChipSnapshot } from "./chrome/cube-snapshots";`.

Replace the `<CubeWindow …/>` block (~line 366) with the same props on `<CubeImmersive …/>` (names are identical).

On `<InspectPreview active={inspecting} …>` (~line 381) change to:

```tsx
            active={inspecting && !cube.open}
```

In `chrome/index.ts` line 12 replace `export { CubeWindow } from "./cube-window";` with `export { CubeImmersive } from "./cube-immersive";`. In `chrome/inspect-preview.tsx:26` change the comment `(see cube-window.tsx)` to `(see cube-immersive.tsx)`. Delete `chrome/cube-window.tsx`.

- [ ] **Step 7: Type-check, run the new tests**

```bash
cd frontend && npm run typecheck && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "fills the plot area|cube opens on release"
```
Expected: both PASS. If `preview(page)` is not hidden, `InspectPreview` `active` may not hide its float when a cube is open: check how `active` is used inside `inspect-preview.tsx` (it hides the float when inactive; if it also tears down the WebGL cube, that is the "kept mounted" behaviour already handled by `active`).

- [ ] **Step 8: Visual check in the harness**

```bash
cd frontend && npm run dev:landmarks-volume
```
Open the printed URL, choose Inspect, click the canvas. Confirm: cube fills the widget; Inspect toolbar and tool pill remain on top and clickable; Save/Close top right; opens with a short fade. Resize the browser to ~640 px wide and to a short height (~360 px): chrome must not overlap itself.

- [ ] **Step 9: Commit**

```bash
git add -A frontend/src frontend/e2e
git commit -m "Replace the floating cube window with an immersive cube

The cube fills the plot area with glass chrome over it; the hover preview
steps aside while it is open. Drag/resize code is removed.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Adapt the e2e suite to a blocked map

**Files:**
- Modify: `frontend/e2e/landmarks/landmarks-volume.spec.ts`
- Modify: `frontend/e2e/landmarks/landmarks.spec.ts:239` (check only)

**Why:** with the cube open the map cannot be pressed. Tests that press/drag the map while the cube is open now hit the cube. Tests that expect a dock beside the map or a movable window fail for the same reason.

**Interfaces:**
- Produces: helper `moveWindow(page, box, from, to)` used by every adapted test.

- [ ] **Step 1: Add the helper next to `dragOnMap`**

```ts
/**
 * Move the live window while the immersive cube is open: close it (the map is
 * covered while it is open), then press-drag on the map; the cube opens again
 * on release.
 */
async function moveWindow(page: Page, box: Box, from: [number, number], to: [number, number]) {
  if (await cubeWindow(page).count()) {
    await page.keyboard.press("Escape");
    await expect(cubeWindow(page)).toHaveCount(0);
  }
  await dragOnMap(page, box, from, to);
  await expect(cubeWindow(page)).toBeVisible();
}
```

- [ ] **Step 2: Run the suite; list every failure**

```bash
cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts 2>&1 | grep -E "✘|failed|passed" | head -40
```

- [ ] **Step 3: Fix each failing test by category**

Known tests that move or press the map while the cube is open (fix by calling `moveWindow`, or by driving `__landmarksEngine.setInspectWindow` when the test is about the cube's reaction, not the gesture):

| Test (title starts with) | Fix |
| --- | --- |
| `presses move the live window, never a saved entry` | Replace the two map interactions after `save(page)` with `moveWindow` (drag) and `Escape` + `page.mouse.click` (second press); the assertion stays: the saved entry is unchanged. |
| `a release over the dock ends the press; Esc, a lost release or blur end it too` | Rename to `a release over the chrome ends the press…`. The press now starts with the cube closed (`page.keyboard.press("Escape")` after `openCubeAtCentre`); "over the dock" becomes over `getByTestId("cube-actions")` (it only exists after release, so use `getByRole("radio", { name: "Inspect" })`'s bounding box, which is always on screen). The Esc/lost-release/blur parts are unchanged. |
| `drag pans the cube; Esc closes it` | The live-pan-while-open behaviour is gone (Behaviour change 1). Rewrite as `a drag on the map slides the window; the cube reopens on release at the new window`: start closed, drag, assert `inspect_cx` increased, cube visible, `data-pan` returns to `0,0`. Drop the `__pans` MutationObserver. Keep the Esc assertion. |
| `a quick drag saves the final window position on release` | Use `dragOnMap` on the closed map instead of dragging under an open cube. |
| `partial X and Y cuts keep their place in a moved window…` | Use `moveWindow` for the window move. |
| `Python's inspect and volume_cut writes are followed…` | Unchanged if it drives `setModel`; otherwise `moveWindow`. |
| `a Z-only cut leaves X and Y whole for any window…` | `moveWindow`. |
| `the cube stays open after switching tool; Esc from its chrome closes it…` | Check: tool pill is above the cube (z 22 > 21), so clicking a different tool works. Esc from the cube chrome must still close. |
| `Inspect hides both side panels; leaving restores them as they were` | The peek tabs sit under the cube while it is open; click them with the cube closed (Esc first). |
| `hover shows a live coarse preview…`, `moving far recentres…`, `the preview float sits beside the hover square…`, `at the product window…`, `in a small widget…`, `the preview is frameless…`, `leaving Inspect hides the preview but keeps its cube…` | Preview tests hover with the cube closed; they should pass. If one opens the cube first, close it first. "above the dock" wording in the title → "above the map". |

For each fix: run only that test (`-g "<title fragment>"`), confirm PASS, move on.

- [ ] **Step 4: Fix the second spec's dialog check**

`e2e/landmarks/landmarks.spec.ts:239` asserts `getByRole("dialog", { name: "Cube" })` has count 0 in the non-volume harness. It must still pass unchanged; run it:

```bash
cd frontend && npx playwright test e2e/landmarks/landmarks.spec.ts -g "Cube"
```

- [ ] **Step 5: Full gate**

```bash
cd frontend && npm run test:e2e:landmarks 2>&1 | tail -15
```
Expected: same pass/fail set as the Task 1 baseline plus the new tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e
git commit -m "Adapt inspect e2e to the immersive cube

Moving the window now closes the cube first; the map is covered while open.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Context volume layer (data + placement, no styling yet)

**Files:**
- Create: `frontend/src/widgets/volume-cube/context-layer.ts`
- Modify: `frontend/src/widgets/volume-cube/VolumeCube.tsx` (props ~line 104-108; target memo ~line 409-422; `layerProps` ~line 770; data attrs ~line 836; imports)
- Modify: `frontend/src/widgets/volume-cube/frame-layers.ts:148-165`
- Modify: `frontend/src/widgets/landmarks/chrome/cube-immersive.tsx` (pass `context`)
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Produces in `context-layer.ts`:

```ts
/** The context region loaded around the window (cube views only). */
export type ContextProp = { scale: number; budget: number };

/** Where the context volume sits in the window layer's world (window-level X-voxel units). */
export function contextMatrix(args: {
  base: Matrix4; // Z_UP
  ctx: { level: Level; box: Box };
  win: { level: Level; box: Box };
  ry: number; // window level's y/x voxel ratio
}): Matrix4;

/** The window's footprint in the context volume's 0-1 texture coordinates: [x0, x1, y0, y1]. */
export function windowRectInContext(args: {
  ctx: { level: Level; box: Box };
  win: { level: Level; box: Box };
}): [number, number, number, number];
```
- `VolumeCube` prop `context?: ContextProp | null` (default `null`).
- `VolumeCube` data attributes: `data-context="on|off"`, `data-context-level` (index, `-1` before load), `data-context-refining="true|false"`.
- `FramedVolumeView.getLayers` reads `props.contextLayer: Record<string, unknown> | null` (props of one more `CubeVolumeLayer`).

Geometry (derive carefully, write once, here): the window layer's world unit is the **window level's X voxel**. A level has per-axis `factor` `[fz, fy, fx]` relative to level 0, so for boxes in different levels convert through level-0 voxels:

- `scale s = ctx.level.factor[2] / win.level.factor[2]` (uniform; the layer's own anisotropy is handled inside Viv).
- `dx = ctx.box.x0 * ctx.level.factor[2] / win.level.factor[2] - win.box.x0`
- `dyRows = win.box.y1 - ctx.box.y1 * ctx.level.factor[1] / win.level.factor[1]` (texture rows run reversed: world y = 0 is the **bottom** edge, the box's `y1`, exactly as the existing `panY = liveBox.y1 - shownBox.y1`).
- matrix = `base.clone().translate([dx, dyRows * ry, 0]).scale(s)`.

Window rect in context texture coordinates (`p ∈ [0,1]`, y reversed): with `a = win.box.x0 * win.level.factor[2] / ctx.level.factor[2] - ctx.box.x0` (window left edge in context voxels, relative to the context box) and `w = (win.box.x1 - win.box.x0) * win.level.factor[2] / ctx.level.factor[2]`:
`x0 = a / cw`, `x1 = (a + w) / cw` where `cw = ctx.box.x1 - ctx.box.x0`. For y: window top row (data row `win.box.y0`) in context rows `b = win.box.y0 * win.level.factor[1] / ctx.level.factor[1] - ctx.box.y0`, height `h = (win.box.y1 - win.box.y0) * win.level.factor[1] / ctx.level.factor[1]`, `ch = ctx.box.y1 - ctx.box.y0`. Texture y = (ch − row)/ch, so `y0 = (ch - (b + h)) / ch`, `y1 = (ch - b) / ch`.

- [ ] **Step 1: Write the failing test**

```ts
  test("the immersive cube loads a coarse context region around the window", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-context", "on");
    await expect.poll(async () => Number(await view.getAttribute("data-context-level"))).toBeGreaterThanOrEqual(0);
    await expect(view).toHaveAttribute("data-context-refining", "false");
    // The hover preview (no context) is unchanged.
    await page.keyboard.press("Escape");
    const box = await canvasBox(page);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(preview(page).locator(".volume-cube__view")).toHaveAttribute("data-context", "off");
  });
```
- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "coarse context region"
```
Expected: FAIL: attribute `data-context` missing.

- [ ] **Step 3: Write `context-layer.ts`**

```ts
import type { Matrix4 } from "@math.gl/core";

import type { Box, Level } from "./window-source";

/** The context region loaded around the window (cube views only): its side as `scale` × the window, within `budget` voxels. */
export type ContextProp = { scale: number; budget: number };

type Placed = { level: Level; box: Box };

/** Where the context volume sits in the window layer's world (window-level X-voxel units). */
export function contextMatrix({
  base,
  ctx,
  win,
  ry,
}: {
  base: Matrix4;
  ctx: Placed;
  win: Placed;
  ry: number;
}): Matrix4 {
  const [, cfy, cfx] = ctx.level.factor;
  const [, wfy, wfx] = win.level.factor;
  const s = cfx / wfx;
  const dx = (ctx.box.x0 * cfx) / wfx - win.box.x0;
  const dyRows = win.box.y1 - (ctx.box.y1 * cfy) / wfy;
  return base.clone().translate([dx, dyRows * ry, 0]).scale(s);
}

/** The window's footprint in the context volume's 0-1 texture coordinates: [x0, x1, y0, y1] (y runs reversed, as the texture's rows do). */
export function windowRectInContext({ ctx, win }: { ctx: Placed; win: Placed }): [number, number, number, number] {
  const [, cfy, cfx] = ctx.level.factor;
  const [, wfy, wfx] = win.level.factor;
  const cw = ctx.box.x1 - ctx.box.x0;
  const ch = ctx.box.y1 - ctx.box.y0;
  const a = (win.box.x0 * wfx) / cfx - ctx.box.x0;
  const w = ((win.box.x1 - win.box.x0) * wfx) / cfx;
  const b = (win.box.y0 * wfy) / cfy - ctx.box.y0;
  const h = ((win.box.y1 - win.box.y0) * wfy) / cfy;
  return [a / cw, (a + w) / cw, (ch - (b + h)) / ch, (ch - b) / ch];
}
```

- [ ] **Step 4: Second shown window in `VolumeCube`**

Add the prop (type + default) next to `region`/`coarse`:

```ts
  /** Cube views: also load a coarse region around the window, drawn out of focus around it. Default none. */
  context?: ContextProp | null;
```
and `context = null,` in the destructuring. Import `ContextProp, contextMatrix, windowRectInContext` from `./context-layer`.

After the existing `useShownWindow` call (~line 434-441) add:

```ts
  // Context: a coarse region around the window, loaded and swapped like the window (no labels).
  const ctxScale = context?.scale ?? 0;
  const ctxBudget = context?.budget ?? 0;
  const contextTarget: WindowTarget | null = useMemo(() => {
    if (!levels || !ctxScale) return null;
    const size = window_size_um * ctxScale;
    const lvl = pickLevel(levels, frame, size, ctxBudget);
    const box = fitsBudget(levelBox(lvl), ctxBudget) ? levelBox(lvl) : regionBox(lvl, frame, cx, cy, size);
    return { level: lvl, box, cells: null };
  }, [levels, frame, cx, cy, window_size_um, ctxScale, ctxBudget]);
  const { shown: ctxShown } = useShownWindow({
    levels,
    frame,
    fine: contextTarget,
    coarse: null,
    chunkCache,
    pausesPrefetch: false,
  });
```

After `loader`/`onViewportLoad` are defined (~line 465-476) add the context loader:

```ts
  const ctxImage = ctxShown?.image ?? null;
  const ctxLoader = useMemo(() => (ctxImage ? [ctxImage] : null), [ctxImage]);
  const onCtxViewportLoad = useMemo(
    () =>
      ctxImage
        ? (volumes: { data: unknown }[]) => {
            markVivVolume(volumes[0]?.data, ctxImage);
            ctxImage.release();
          }
        : undefined,
    [ctxImage],
  );
```

After `volumeMatrix` (~line 535) add:

```ts
  const ctxMatrix = useMemo(
    () =>
      ctxShown && shown && level
        ? contextMatrix({ base: Z_UP, ctx: ctxShown, win: shown, ry })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctxShown, shown, ry],
  );
```
Note `contextMatrix` positions relative to the **shown** window box; the live window moves under it exactly as the window layer's `panX/panY` does. To keep the context aligned with the *requested* window frame (the frame and camera follow `liveBox`), use `liveBox` for `win.box` when it exists: `win: { level: shown.level, box: liveBox ?? shown.box }` and recompute: add `liveBox` to the memo deps. Write it that way.

Then, inside `layerProps` (the `useMemo` that returns the array), add a second entry key `contextLayer` on the same props object:

```ts
              contextLayer: ctxLoader && ctxMatrix
                ? {
                    loader: ctxLoader,
                    onViewportLoad: onCtxViewportLoad,
                    contrastLimits,
                    colors: IMAGE_COLORS,
                    channelsVisible: ONE_CHANNEL_VISIBLE,
                    selections: ONE_CHANNEL,
                    xSlice: [0, ctxShown!.image.width],
                    ySlice: [0, ctxShown!.image.height],
                    zSlice,        // placeholder: replaced in Step 5 by a ctx-level Z range
                    resolution: 0,
                    extensions: CUBE_EXTENSIONS[mode],
                    cellVolume: null,
                    cellGroups: null,
                    imagePalette,
                    render,
                    showImage,
                    modelMatrix: ctxMatrix,
                    clippingPlanes: [],
                  }
                : null,
```
`zSlice` is in the window level's z voxels; the context level may have a different z factor. Compute a context `ctxZSlice` in the same way as `zSlice` using `ctxShown.level` (`const scale = ctxShown.level.factor[0] * szUm; clampRange((zShown[0]-ozUm)/scale, (zShown[1]-ozUm)/scale, 0, axisSize(ctxShown.level.source, "z"))`) and use it. Add `ctxLoader, onCtxViewportLoad, ctxMatrix, ctxZSlice` to the `layerProps` deps list.

Data attributes on the root `div`:

```tsx
      data-context={ctxScale ? "on" : "off"}
      data-context-level={ctxShown?.level.index ?? -1}
      data-context-refining={String(Boolean(ctxScale) && contextTarget != null && ctxShown?.level.index !== contextTarget.level.index)}
```

- [ ] **Step 5: Draw the layer first in `FramedVolumeView`**

In `frame-layers.ts` `getLayers`, replace the first two statements:

```ts
    const loader = props.loader as { type?: string };
    const context = props.contextLayer as Record<string, unknown> | null | undefined;
    // The out-of-focus context first, so the window layer draws over it.
    const layers = context
      ? [new CubeVolumeLayer(context, { id: `context-${loader.type}${vivTag(id)}` })]
      : [];
    layers.push(new CubeVolumeLayer(props, { id: `${loader.type}${vivTag(id)}` }));
```
Type: `const layers: CubeVolumeLayer[]`. The context props need `loader.type`-style `id` uniqueness only; if `vivTag` is not a function of `id` alone, check its definition above `FramedVolumeView` and keep ids distinct.

- [ ] **Step 6: Turn it on for the immersive cube**

In `cube-immersive.tsx`, add to `<VolumeCube …>`:

```tsx
          context={{ scale: PREVIEW_REGION_SCALE, budget: PREVIEW_REGION_BUDGET }}
```
(both are already imported in Step 4 of Task 3).

- [ ] **Step 7: Run the test; then verify placement visually**

```bash
cd frontend && npm run typecheck && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "coarse context region"
```
Expected: PASS.

Placement check (cannot be asserted by data attributes; do it by eye, once, in the dev harness `npm run dev:landmarks-volume` with `?window=100`): place the window off-centre so the toy cells (≈(70,80), (160,150), (100,190) µm) fall both inside and outside it, open the cube, zoom out with the wheel. At this step the context layer is **unmasked**, so cells inside the window show doubled (fine + coarse) and context cells outside must line up with where they sit relative to the window frame (the orange frame lines). A cell straddling the window edge must be continuous across the frame. If context is offset or mis-scaled, fix `contextMatrix` (dx/dy/scale) before moving on. Save a screenshot for the PR.

- [ ] **Step 8: Commit**

```bash
git add frontend/src frontend/e2e
git commit -m "Load a coarse context region under the immersive cube window

A second shown window and volume layer, placed in the window's world; masked
and dimmed in the next change.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Out-of-focus context shader (mask the window, dim, desaturate)

**Files:**
- Modify: `frontend/src/widgets/volume-cube/cell-lut-extension.ts`
- Modify: `frontend/src/widgets/volume-cube/VolumeCube.tsx` (context layer props)
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

**Interfaces:**
- Consumes: `windowRectInContext` (Task 5).
- Produces: layer prop `contextWindow: [x0, x1, y0, y1]` (context texture coordinates; absent on the window layer, which stays bit-identical). Exported constants `CONTEXT_DIM = 0.55`, `CONTEXT_DESATURATE = 0.5`. The context layer shares `CUBE_EXTENSIONS[mode]`; no new extension class.

**Design:** one more uniform group on `cubeRenderModule`: `ctxWin` (vec4: x0,x1,y0,y1) and `ctxOn` (f32, 0 for the window layer), `ctxLook` (vec2: dim, desaturate). Inside the raycast loop `p` is the volume's 0–1 texture position. A context sample is skipped when `p.xy` is inside the window rect, otherwise its colour is mixed toward grey by `ctxLook.y` and scaled by `ctxLook.x`. The window layer keeps `ctxOn = 0` and is bit-identical to today. Note `_RENDER` runs inside the loop and the loop advances `p` after it, so **never `continue`/`break` there except the existing opacity `break`**: guard with `if`.

- [ ] **Step 1: Write the failing test**

Context must draw outside the window and nothing doubled inside it. Use pixel counts on screenshots of the cube view, zoomed out so the context is on screen:

```ts
  test("context draws dimmed around the window, never over it", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-refining", "false");
    await expect(view).toHaveAttribute("data-context-refining", "false");
    // Zoom out so the region around the 100 µm window is on screen.
    const b = (await view.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
    await expect.poll(async () => Number(await view.getAttribute("data-zoom"))).toBeLessThan(0);
    const clip = (fx: number, fy: number, fw: number, fh: number) => ({
      x: b.x + b.width * fx,
      y: b.y + b.height * fy,
      width: b.width * fw,
      height: b.height * fh,
    });
    // Top and bottom strips lie outside the window's footprint: only context can light them.
    const outside =
      (await brightPixels(page, await page.screenshot({ clip: clip(0, 0, 1, 0.15) }), 20)) +
      (await brightPixels(page, await page.screenshot({ clip: clip(0, 0.85, 1, 0.15) }), 20));
    expect(outside).toBeGreaterThan(0);
    // The context is dimmed: nothing outside the window reaches the stain's full brightness.
    const outsideBright =
      (await brightPixels(page, await page.screenshot({ clip: clip(0, 0, 1, 0.15) }), 200)) +
      (await brightPixels(page, await page.screenshot({ clip: clip(0, 0.85, 1, 0.15) }), 200));
    expect(outsideBright).toBe(0);
  });
```

The thresholds (20 = any context light, 200 = the window's full-bright stain; `CONTEXT_DIM` 0.55 keeps context below it) come from `brightPixels`'s max-channel rule; Step 6 re-checks them against what the harness renders.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "context draws dimmed"
```
Expected: FAIL on `outsideBright` toBe(0) (the Task 5 layer is not dimmed yet). The `outside > 0` assertion already passes.

- [ ] **Step 3: Extend the module and add context extensions**

In `cell-lut-extension.ts`:

Uniform types/defaults/getters (add to `cubeRenderModule`):

```ts
    ctxOn: "f32",
    ctxWin: "vec4<f32>",
    ctxLook: "vec2<f32>",
  // defaultUniforms:
  ctxOn: 0, ctxWin: [0, 0, 0, 0], ctxLook: [1, 0],
```
Extend `CubeUniforms`:

```ts
type CubeUniforms = Partial<RenderSettings> & {
  cellsOn?: number;
  imageOn?: number;
  imageScale?: number;
  ctxOn?: number;
  ctxWin?: [number, number, number, number];
  ctxLook?: [number, number];
};
```
and in `getUniforms`:

```ts
    ctxOn: render.ctxOn ?? 0,
    ctxWin: render.ctxWin ?? [0, 0, 0, 0],
    ctxLook: render.ctxLook ?? [1, 0],
```
In the module's GLSL `uniform cubeRenderUniforms { … }` block append (after `float imageScale;`):

```glsl
  float ctxOn;
  vec4 ctxWin;
  vec2 ctxLook;
```
(order matters: keep identical to the `uniformTypes` order — add the three keys at the end of `uniformTypes` in this same order: `ctxOn`, `ctxWin`, `ctxLook`.) Add two GLSL helpers to the module `fs` string after `imageSample`:

```glsl
// Context layers skip the window's footprint (texture x0, x1, y0, y1) and grade the rest.
bool ctxSkip(vec3 p) {
  return cubeRender.ctxOn > 0.5
    && p.x >= cubeRender.ctxWin.x && p.x <= cubeRender.ctxWin.y
    && p.y >= cubeRender.ctxWin.z && p.y <= cubeRender.ctxWin.w;
}
vec3 ctxGrade(vec3 c) {
  if (cubeRender.ctxOn < 0.5) return c;
  float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, vec3(g), cubeRender.ctxLook.y) * cubeRender.ctxLook.x;
}
```
In `ADDITIVE._RENDER`, wrap the image composite and use the helpers (cells never draw in context: `cellsOn` is 0 for the context layer, since its `cellVolume` is null):

```ts
  _RENDER: `
    if (cellsOn) {
      ${CELL_SAMPLE}
      color.rgb += (1.0 - color.a) * cell.a * cell.rgb;
      color.a += (1.0 - color.a) * cell.a;
    }
    if (!ctxSkip(p)) {
      vec4 im = imageSample(intensityValue0);
      im.rgb = ctxGrade(im.rgb);
      color.rgb += (1.0 - color.a) * im.a * im.rgb;
      color.a += (1.0 - color.a) * im.a;
    }
    if (color.a >= 0.95) {
      break;
    }`,
```
In `MIP._RENDER`, gate the max: `if (!ctxSkip(p)) maxImage = max(maxImage, intensityValue0);` and in `_AFTER_RENDER` grade: `vec4 im = imageSample(maxImage); im.rgb = ctxGrade(im.rgb);`.

Plumb the uniforms in `draw()`:

```ts
    const uniforms: CubeUniforms = {
      ...(layer.props.render ?? DEFAULT_RENDER),
      cellsOn,
      imageOn,
      imageScale: image?.scale ?? 1,
      ctxOn: layer.props.contextWindow ? 1 : 0,
      ctxWin: layer.props.contextWindow ?? [0, 0, 0, 0],
      ctxLook: [CONTEXT_DIM, CONTEXT_DESATURATE],
    };
```
Add `contextWindow?: [number, number, number, number] | null;` to `LayerLike["props"]` and export:

```ts
/** The out-of-focus look: brightness kept, and how far colour moves toward grey. */
export const CONTEXT_DIM = 0.55;
export const CONTEXT_DESATURATE = 0.5;
```
No new extension class is needed: the window layer's `contextWindow` is undefined, so `ctxOn = 0` and the shader behaves as today for it. Both layers share `CUBE_EXTENSIONS[mode]` (one compiled program; the uniform differs per layer).

- [ ] **Step 4: Pass the window rect from `VolumeCube`**

In the `contextLayer` props (Task 5, Step 4) add:

```ts
                    contextWindow: ctxRect,
```
with, next to `ctxMatrix`:

```ts
  const ctxRect = useMemo(
    () =>
      ctxShown && shown && liveBox
        ? windowRectInContext({ ctx: ctxShown, win: { level: shown.level, box: liveBox } })
        : null,
    [ctxShown, shown, liveBox],
  );
```
and require `ctxRect` in the `contextLayer` condition (`ctxLoader && ctxMatrix && ctxRect`). Add `ctxRect` to the `layerProps` deps.

- [ ] **Step 5: Rebuild and look**

```bash
cd frontend && npm run typecheck && npm run dev:landmarks-volume
```
In the harness (`?window=100`): the window shows sharp and undimmed; around it the coarse context is visibly dimmer and greyer; no double-bright inside the window; no visible seam gap at the frame. Check Additive and MIP (toolbar). If the context layer paints over the window (draw order), swap the layer order in `FramedVolumeView.getLayers` or enable `depthTest: false`/`parameters: { blend: true }` on the context layer props; record what was needed in the commit message.

If, after a reasonable attempt, two layers cannot be made to composite correctly, **stop and use the spec's fallback**: remove the `context` prop from `CubeImmersive` (outline only, as the frame already draws it), keep the code behind the prop for later, and tell the user.

- [ ] **Step 6: Run the test; re-check the thresholds**

```bash
cd frontend && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "context draws dimmed"
```
Expected: PASS. If `outsideBright` is non-zero because the toy stain's context reaches 200 even dimmed, lower `CONTEXT_DIM` rather than raising the threshold: the test states the product rule (context is visibly dimmer than the window). If `outside` is 0, the strips miss the context at this zoom: zoom out further in the test, not the threshold.

- [ ] **Step 7: Run the whole landmarks suite**

```bash
cd frontend && npm run test:e2e:landmarks 2>&1 | tail -15
```
The preview tests must be unaffected (`data-context="off"`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src frontend/e2e
git commit -m "Draw the cube's context out of focus around the window

Masks the window footprint in the context layer and dims/desaturates the rest.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Zoom range that reveals the context, no further

**Files:**
- Modify: `frontend/src/widgets/volume-cube/VolumeCube.tsx` (`homeView`, `onViewStateChange`)
- Test: `frontend/e2e/landmarks/landmarks-volume.spec.ts`

`homeView` sets `minZoom: zoom - 2`, `maxZoom: zoom + 5`. The region is 3× the window wide: `log2(3) ≈ 1.58`, so the existing −2 reaches the region edge with 0.42 of empty margin around the context. In context mode lower the floor to the region edge plus a small margin.

- [ ] **Step 1: Write the failing test**

```ts
  test("zoom out stops just past the context region", async ({ page }) => {
    await reloadWith(page, "window=100");
    await openCubeAtCentre(page);
    const view = cubeWindow(page).locator(".volume-cube__view");
    await expect(view).toHaveAttribute("data-context-refining", "false");
    const home = Number(await view.getAttribute("data-zoom"));
    const b = (await view.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 400);
    await expect.poll(async () => Number(await view.getAttribute("data-zoom"))).toBeLessThan(home - 1);
    const min = Number(await view.getAttribute("data-zoom"));
    expect(home - min).toBeLessThan(1.58 + 0.5); // log2(3) region width, plus a margin
    expect(home - min).toBeGreaterThan(1.2);
  });
```

- [ ] **Step 2: Run it; it fails** (today's floor is −2, so `home − min` ≈ 2).

- [ ] **Step 3: Implement**

Give `homeView` an optional `zoomOut` argument (default 2) and pass `Math.log2(context.scale) + 0.25` when `context` is set; thread it through the three `homeView(...)` call sites in `VolumeCube` (first view, `resetTick`, `preset`) via the `framing` ref (add `zoomOut` to the object stored by `useLatest`). Also add the same delta in the level-swap effect (it already shifts `minZoom`/`maxZoom` by `dz`).

```ts
function homeView(preset: ViewPreset, fits: Record<ViewPreset, Fit[]>, view: { width: number; height: number }, zoomOut = 2): ViewState {
  const zoom = fitZoom(fits[preset], view) - HOME_ZOOM_BACKOFF[preset];
  return { id: "3d", target: [0, 0, 0], zoom, ...PRESETS[preset], minZoom: zoom - zoomOut, maxZoom: zoom + 5, minRotationX: MIN_PITCH, maxRotationX: MAX_PITCH };
}
```
with `const zoomOut = context ? Math.log2(context.scale) + 0.25 : 2;` computed in the component.

- [ ] **Step 4: Run test and the suite**

```bash
cd frontend && npm run typecheck && E2E_HARNESS=landmarks-volume npx playwright test e2e/landmarks/landmarks-volume.spec.ts -g "zoom out stops|camera|preset"
```
Expected: PASS, including the existing camera/preset tests (`the camera dips 45°…`, `a camera preset chosen…`) which read `data-zoom` and `data-pitch`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src frontend/e2e
git commit -m "Bound the immersive cube's zoom-out to its context region

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, feature map, evidence, gate

**Files:**
- Modify: `.agents/skills/verify-landmarks/features/inspect-cube.md`, `inspect-history.md`
- Modify: `docs/adr/0006-landmarks-hosts-volume-cube.md` (append addendum)
- Modify: `frontend/DESIGN.md` (cube wording)
- Modify: `docs/specs/2026-10-02-inspect-immersive-cube-design.md` (record deviations)
- Modify: `CONTEXT.md` only if the word "dock" for the cube appears (`grep -n "dock" CONTEXT.md`)

- [ ] **Step 1: Feature map `inspect-cube.md`**

Edit the intro and sub-features: the cube is an **immersive cube** filling the plot area (a `role="dialog"` named "Cube", full-bleed, `Save window`/`Close cube`, `data-testid="cube-actions"`); it opens on mouse **release** (a press+drag positions the window with the preview following); the map is covered while open (Esc/Close, then place again to move); coarse out-of-focus context around the window (`data-context="on"`, `data-context-level`, `data-context-refining`; the hover preview reports `data-context="off"`); zoom-out floor ≈ context region; remove "Drag pans it live", "the dock's Save", and the "released over the dock" bullet text (reword to "over the chrome"). Add the new test titles from Tasks 2, 3, 5, 6, 7 under Sub-features. Fix the Playwright snippet to `await expect(cubeWindow).toBeVisible()` after click (unchanged) and note release timing.

- [ ] **Step 2: `inspect-history.md`**

Replace "dock" with "immersive cube" where it names the cube window; history strip is the bottom-left `getByLabel("Inspect history")` group inside the dialog.

- [ ] **Step 3: ADR 0006 addendum**

Append a dated section (2026-10-02): immersive takeover replaces the floating window; open on release; second coarse context layer (spec link); no new traits; cube blocks the map while open.

- [ ] **Step 4: `frontend/DESIGN.md`**

`grep -n -i "cube\|floating window" frontend/DESIGN.md`; adjust the one sentence that treats the cube as a floating window; note the immersive cube's chrome (actions top right, history bottom).

- [ ] **Step 5: Spec deviations**

Append a "Deviations during implementation" list to the spec: opens on release; two-layer context (window layer untouched, context masked); no pan; open animation is a fade/scale from the viewport centre (not from the hover preview's rect); compositing limit when orbited.

- [ ] **Step 6: Full verification (verification-before-completion)**

```bash
cd frontend && npm run typecheck && npm run build && npm run test:e2e:landmarks 2>&1 | tail -20
```
Expected: typecheck clean, build succeeds, e2e matches the Task 1 baseline plus the new tests, no new failures. Also run `npm run test:e2e:core` (shared chrome untouched; expected unchanged).

- [ ] **Step 7: Real notebook check**

Per AGENTS.md: rebuild bundles (`npm run build`), start **your own** `uv run --extra demo marimo run --headless --port <free> demos/<demo>.py` (never stop other marimo/napari processes), open the demo with a SpatialData, Inspect → hover → click: immersive opens, zoom out shows context, Esc closes. If no demo with a 3D image exists, state that the notebook check was not done.

- [ ] **Step 8: Visual evidence**

Capture harness screenshots (hover preview, immersive open, zoomed-out context) and post with `.github/scripts/post-playwright-visuals.sh` on the PR.

- [ ] **Step 9: Commit and hand off**

```bash
git add -A
git commit -m "Document the immersive inspect cube

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Merge policy (AGENTS.md): this touches `frontend/src/widgets/volume-cube/` and landmarks: CI green, conflicts resolved, `npm run test:e2e:landmarks` passing, visual evidence on the PR, brief PR note naming the verify-landmarks feature-map files updated. Escalate to Clarence before merging if any Task 4 test had to be deleted rather than adapted.
