# inspect-history

Hovering in Inspect shows a live coarse preview beside the window square,
sliding with the cursor and recentring only when it nears the loaded region's
edge. A click places the dock's window; the dock's **Save** keeps it as an
inspect selection and adds a chip to the dock's history strip; chips restore their window and cut, and
deleting the last one closes the dock.

**Spec:** `frontend/e2e/landmarks/landmarks-volume.spec.ts` — `"Landmarks inspect cube"` describe block
(`E2E_HARNESS=landmarks-volume`, run via `npm run test:e2e:landmarks`)

**Design:** [`docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md`](../../../docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md) · [ADR 0006](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)

## Sub-features

- A frameless preview float (`data-testid="inspect-preview"`: no panel background, border or shadow; the cube's view is transparent, `VolumeCube background={false}`, keeping its wireframe) follows the cursor beside the hover square (offset by half the square's `sizePx`, from the `hover` event, plus a gap; to the right, else to the left when that side has room; never over the square). When neither side has room (the product's 300 µm square is wider than the canvas at the fitted zoom) it pins inside the widget in the corner farthest from the cursor, clear of the top tools and peek tabs; if that corner still covers the cursor (a small widget) it takes the next corner that does not, inset and then flush with the widget's edges; always inside the widget. It renders the coarse level top-down (MIP) for a region 3× the square's side; it pans (`data-pan`) without a new fetch while inside the loaded region, and hides when the pointer leaves the volume's extent or the canvas
- The float stacks above the dock (same `z-index: 21`, later in the DOM) and under the top tools (22)
- Once created the float stays mounted (hidden) outside Inspect, so its cube and WebGL context are reused on the next hover; leaving Inspect still clears the preview's queued prefetches
- Moving past half the square's side from the region's edge recentres the preview at a new region led by the cursor's recent velocity; the old region keeps rendering, square clamped, until the new one swaps in
- Save creates an inspect selection (`type: "inspect"`) and adds a chip to the dock's **Inspect history** strip (`getByLabel("Inspect history")`), labelled "Inspect \<n\>" in save order; a click alone adds nothing
- Saved entries are fixed snapshots: presses move only the live window, and a committed cut is written into the focused entry only while its window is the live one
- Each chip carries a 64 px snapshot of the dock, captured once the fine level renders; snapshots are client-only (keyed by selection id), never synced, and re-taken when an id is reused after a delete
- Clicking a chip (also the focused one, after the live window moved), or focusing an inspect selection anywhere in the UI, restores its `window` (centre, size, cut) in the dock; membership (`point_indices`) never changes because of the cut
- Deleting an inspect selection removes its chip; deleting the last one closes the dock

## How to get to it (user POV)

Press **I** to arm Inspect and move the cursor over the tissue: a small
preview float shows a coarse view of what a click there would open. Click to
place it — the dock opens (or updates); Save adds a numbered chip along its
bottom edge. Click an earlier chip, or focus its Selection in the side panel,
to jump the dock back to that window and cut.

## Driving it with Playwright

```ts
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const box = await canvasBox(page);
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
const preview = page.getByTestId("inspect-preview");
await expect(preview).toBeVisible();
await expect(preview.locator(".volume-cube__view")).not.toHaveAttribute("data-level", "-1");

await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
const dock = page.getByRole("dialog", { name: "Cube" });
await dock.getByRole("button", { name: "Save window" }).click();
const strip = dock.getByLabel("Inspect history");
await expect(strip.getByRole("button", { name: "Inspect 1" })).toHaveAttribute("aria-pressed", "true");
```

Helpers: `bootLandmarksVolumeHarness`, `canvasBox`, `getModel`, `setModel`
(all in `frontend/e2e/helpers.ts`). Selectors: `getByTestId("inspect-preview")`,
`getByLabel("Inspect history")` inside `getByRole("dialog", { name: "Cube" })`.

Model keys: `selections` (`type: "inspect"` entries with `window`),
`selected_kind`, `selected_index`, `inspect_cx`, `inspect_cy`,
`inspect_size_um`, `volume_cut`.

**Proof**

- Functional: `"history chips restore each saved window and cut; a saved entry keeps its cut"` — two saves with different Z cuts give two chips; a cut changed after moving off the focused entry stays out of it; each chip restores `inspect_cx` and `volume_cut`; clicking the focused chip after a press moved the live window restores it again; both entries end unchanged.
- Functional: `"deleting an inspect selection removes its chip; the last one closes the dock"` — the dock closes once `selections` holds no inspect entries.
- Functional: `"a chip's snapshot follows its entry: a reused id re-snapshots"` (`?window=100`) — after a delete, a new save elsewhere reuses the id and the chip's `img[src]` changes.
- Functional: `"hover shows a live coarse preview that slides without refetching"` — moving within the loaded region changes `data-pan` but fires no `/s\d+/c/` chunk requests, and the dock stays closed.
- Functional: `"moving far recentres the preview region; leaving the map hides it"` — crossing the region's edge changes `data-region`; moving off-canvas hides the float.
- Functional: `"the preview float sits beside the hover square, inside the widget, above the dock"` — at mid-canvas and near the right edge (flipped) the float's box never intersects the `sizePx` square around the cursor and stays inside the widget; with the dock open the float stacks above the dock and below `.landmarks__chrome-tools`.
- Functional: `"at the product window the preview float stays inside the widget, clear of the cursor"` — at the default 300 µm window (no `?window=`), at the centre and near each corner the float is inside the widget and never under the cursor.
- Functional: `"in a small widget the pinned preview float still clears the cursor"` — at 560 px wide and the minimum 400 px height, where every inset corner covers the centre, the float stays inside the widget and off the cursor.
- Functional: `"the preview is frameless: no panel chrome, a transparent cube"` — the float has a transparent background, no shadow and no border; its `.volume-cube__view` background is transparent.
- Functional: `"leaving Inspect hides the preview but keeps its cube for the next hover"` — after Select and back to Inspect, the same `.volume-cube__view` element renders the next hover.

## Gotchas

- Small toy pyramids can make every level fit the default voxel budgets; override with `?budgets=<preview>,<dock>` (goto `/?budgets=20000,300000&window=100`) to force a level split; `window=100` keeps the square smaller than the 256 µm toy volume and the canvas — see `"the dock shows the coarse level first, then refines"` (inspect-cube.md) and the two preview tests above.
- The preview float has its own `.volume-cube__view` (`getByTestId("inspect-preview").locator(".volume-cube__view")`), separate from the dock's inside `getByRole("dialog", { name: "Cube" })` — scope selectors to the one under test, same rule as the dock vs. the standalone `VolumeCubeWidget` (see [verify-volume-cube features README](../../verify-volume-cube/features/README.md)).
