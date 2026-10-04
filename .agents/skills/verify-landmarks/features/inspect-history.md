# inspect-history

Hovering in Inspect shows a live coarse preview beside the window square,
sliding with the cursor and recentring only when it nears the loaded region's
edge. A click places the window and opens the immersive cube (on mouse
release); **Save window** on the Inspect pill keeps it as an inspect selection.
Saved windows are ordinary rows in the left dock's **Selections** list (there
is no history strip in the cube since 2026-10-03): each row shows a thumbnail
of the cube, a hover card describes it, and clicking the row restores its
window and cut and opens the cube. Every new selection is named by what it
holds, `<top category> · <count>`. The hover preview hides while the cube is
open.

**Spec:** `frontend/e2e/landmarks/landmarks-volume.spec.ts` — `"Landmarks inspect cube"` describe block
(`E2E_HARNESS=landmarks-volume`, run via `npm run test:e2e:landmarks`)

**Design:** [`docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md`](../../../docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md) · [`docs/superpowers/specs/2026-10-02-inspect-immersive-cube-design.md`](../../../docs/superpowers/specs/2026-10-02-inspect-immersive-cube-design.md) · [`docs/superpowers/specs/2026-10-03-inspect-rework-design.md`](../../../docs/superpowers/specs/2026-10-03-inspect-rework-design.md) · [ADR 0006](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)

## Sub-features

### Hover preview

- A frameless preview float (`data-testid="inspect-preview"`: no panel background, border or shadow; the cube's view is transparent, `VolumeCube background={false}`, keeping its wireframe) follows the cursor beside the hover square (offset by half the square's `sizePx`, from the `hover` event, plus a gap; to the right, else to the left when that side has room; never over the square). When neither side has room (the product's 300 µm square is wider than the canvas at the fitted zoom) it pins inside the widget in the corner farthest from the cursor, clear of the top pill and peek tabs; if that corner still covers the cursor (a small widget) it takes the next corner that does not, inset and then flush with the widget's edges; always inside the widget. It renders the coarse level top-down (`imageMode="mip"`, `labelMode="additive"`, as before the per-layer projection) for a region 3× the square's side; it pans (`data-pan`) without a new fetch while inside the loaded region, and hides when the pointer leaves the volume's extent or the canvas
- The float is hidden while the immersive cube is open; it sits under the top pill (22) and appears again on the next hover once the cube is closed
- Once created the float stays mounted (hidden) outside Inspect, so its cube and WebGL context are reused on the next hover; leaving Inspect still clears the preview's queued prefetches
- Moving past half the square's side from the region's edge recentres the preview at a new region led by the cursor's recent velocity; the old region keeps rendering, square clamped, until the new one swaps in

### Saved windows as Selections rows

- Save creates an inspect selection (`type: "inspect"`) and focuses it: its Selections row (`data-testid="selection-row"`) is `aria-current="true"`. A click alone adds nothing. Inspect collapses the docks; the left one comes back from its peek tab (`Show left panel`) and floats over the cube
- Names are generated in the engine at creation (`selectionName` in `milume/static/landmarks.js`) for every new selection (inspect saves, lasso/shape selections, neighbourhood and buffer promotes, pastes): `<top category> · <count>`, the most frequent label of the active Color-by categorical among the members and `point_indices.length`, e.g. `type1 · 3`. A taken name gets ` (2)`, ` (3)`, …. With no active categorical (or no valid codes) it falls back to `inspect <n>` / `selection <n>`. The name is a plain `id`: rename still works, and it does not follow later edits
- An inspect row shows the entry's cube thumbnail (`data-testid="selection-thumb"`, a 64×40 snapshot, `chrome/cube-snapshots.ts`) in place of the colour swatch, edged in the selection colour. Snapshots are client-only, held in a widget-local `Map` keyed by selection id and checked against the entry's window (`windowKey`), never synced: a row with no snapshot (from Python, a reloaded session, or after a rename, which changes the id) shows the swatch. The cube takes one once the fine level renders settled (no pan) and replaces it during the next ~1 s (`SNAPSHOT_SETTLE_MS`); a snapshot of the settled live window is also held, so a Save that lands after the cube has settled (no new frame) still gets a thumbnail. Reusing an id after a delete re-snapshots
- Every selection row has a hover card (shadcn `HoverCard`, `data-testid="selection-card"`, `chrome/selection-card.tsx`, Soft Float glass, opening to the right after ~350 ms; it steps aside while the row's menu or rename is open). It shows the thumbnail (inspect entries), the name, `N cells`, where it is, and the top three categories of the live Color-by as bars (`data-testid="selection-card-bar"`, width relative to the selection's count, with %). Where: an inspect entry reads `300 µm window at cx, cy µm`, plus `Depth z0–z1 µm` when its Z cut is narrower than the stack; other selections read `x a–b · y c–d µm`, their members' extent. It mounts only while open, so nothing is computed per row
- Clicking an inspect row (also the focused one, after the live window moved), or focusing an inspect selection anywhere in the UI, restores its `window` (centre, size, cut) and opens the cube; membership (`point_indices`) never changes because of the cut. Other rows only select
- Saved entries are fixed snapshots: presses and pans move only the live window, and a committed cut is written into the focused entry only while its window is the live one
- Deleting an inspect selection removes its row; deleting the last one closes the cube

## How to get to it (user POV)

Press **I** to arm Inspect and move the cursor over the tissue: a small
preview float shows a coarse view of what a click there would open. Click to
place it (or press, drag and release) — the cube opens over the map. **Save
window** on the top pill keeps it: open the left panel from its peek tab and
the window is a Selections row named after its main cell type and size, with a
thumbnail. Hover the row for its cell count, window and category mix; click it
to jump the cube back to that window and cut.

## Driving it with Playwright

```ts
await page.getByRole("radio", { name: "Inspect", exact: true }).click();
const box = await canvasBox(page);
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
const preview = page.getByTestId("inspect-preview");
await expect(preview).toBeVisible();
await expect(preview.locator(".volume-cube__view")).not.toHaveAttribute("data-level", "-1");

await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5); // opens on release
await page.getByTestId("inspect-pill").getByRole("button", { name: "Save window" }).click();
await expect.poll(async () => ((await getModel(page, "selections")) as any[]).length).toBe(1);

await page.getByRole("button", { name: "Show left panel" }).click();
const row = page.getByTestId("selection-row").first();
await expect(row.getByTestId("selection-thumb")).toBeVisible();
await row.hover();
await expect(page.getByTestId("selection-card")).toContainText("cells");
await row.click(); // restores the window and cut, opens the cube
```

Helpers: `bootLandmarksVolumeHarness`, `canvasBox`, `getModel`, `setModel`
(all in `frontend/e2e/helpers.ts`); the spec's `openSelectionsDock`,
`selectionRow`, `save`. Selectors: `getByTestId("inspect-preview")`,
`getByTestId("selection-row" | "selection-thumb" | "selection-card" | "selection-card-bar")`.

Model keys: `selections` (`type: "inspect"` entries with `window`),
`selected_kind`, `selected_index`, `active_category`, `inspect_cx`,
`inspect_cy`, `inspect_size_um`, `volume_cut`.

**Proof**

- Functional: `"there is no history strip; the saved window is a Selections row with a thumbnail"` — no `getByLabel("Inspect history")` in the cube; the row is visible with a `selection-thumb`.
- Functional: `"a saved inspect window is named by its top category and cell count"` — the toy window's entry is `type1 · 3`, and equals `<majority label of point_indices> · <point_indices.length>` computed from `category_codes`.
- Functional: `"a name already taken gets a numeric suffix"` — with `type1 · 3` taken, Save names the entry `type1 · 3 (2)`.
- Functional: `"hovering a selection row shows its count, window and category bars"` — "3 cells", a µm window line, at least one bar; no Depth line for a whole-stack cut; a Z cut of 10–40 shows `Depth 10–40 µm`.
- Functional: `"a lasso row's hover card gives its cells' extent in µm"` — a `points` selection's card shows `x a–b · y c–d µm` within 1 µm of its members' extent.
- Functional: `"clicking an inspect row restores its window and opens the cube"` (`?window=100`) — after moving away and closing the cube, the row click opens it at the saved `inspect_cx`.
- Functional: `"Selections rows restore each saved window and cut; a saved entry keeps its cut"` — two saves with different Z cuts give two rows; a cut changed after moving off the focused entry stays out of it; each row restores `inspect_cx` and `volume_cut`; clicking the focused row after a press moved the live window restores it again; both entries end unchanged.
- Functional: `"deleting an inspect selection removes its row; the last one closes the dock"` — the row has a thumbnail once refined; with `selections` emptied the row and the cube are gone.
- Functional: `"a row gets its thumbnail when Save lands after the cube has settled"` — the cube settles (fine level, no pan, 1.5 s idle), Save adds a row with a thumbnail from the live-window snapshot.
- Functional: `"a row's snapshot follows its entry: a reused id re-snapshots"` (`?window=100`, `active_category` cleared so the entry is `inspect 1`) — after a delete, a new save elsewhere reuses the id and the thumbnail's `src` changes.
- Functional (default harness, `landmarks-tools.spec.ts`): `"point buffer promotes contained points to a selection"` — the promoted selection's id ends in ` · <point_indices.length>`.
- Functional: `"hover shows a live coarse preview that slides without refetching"` — moving within the loaded region changes `data-pan` but fires no `/s\d+/c/` chunk requests, and the cube stays closed.
- Functional: `"moving far recentres the preview region; leaving the map hides it"` — crossing the region's edge changes `data-region`; moving off-canvas hides the float.
- Functional: `"the preview float sits beside the hover square, inside the widget, under the tools"` — at mid-canvas and near the right edge (flipped) the float's box never intersects the `sizePx` square around the cursor and stays inside the widget; its stacking is below `.landmarks__chrome-tools`; opening the cube hides the float.
- Functional: `"at the product window the preview float stays inside the widget, clear of the cursor"` — at the default 300 µm window, at the centre and near each corner the float is inside the widget and never under the cursor.
- Functional: `"in a small widget the pinned preview float still clears the cursor"` — at 560 px wide and the minimum 400 px height the float stays inside the widget and off the cursor.
- Functional: `"the preview is frameless: no panel chrome, a transparent cube"` — transparent background, no shadow or border; its `.volume-cube__view` background is transparent.
- Functional: `"leaving Inspect hides the preview but keeps its cube for the next hover"` — after leaving and re-entering Inspect, the same `.volume-cube__view` element renders the next hover.

## Gotchas

- Small toy pyramids can make every level fit the default voxel budgets; override with `?budgets=<preview>,<dock>` (goto `/?budgets=20000,300000&window=100`) to force a level split; `window=100` keeps the square smaller than the 256 µm toy volume and the canvas — see `"the dock shows the coarse level first, then refines"` (inspect-cube.md) and the two preview tests above.
- The preview float has its own `.volume-cube__view` (`getByTestId("inspect-preview").locator(".volume-cube__view")`), separate from the cube's inside `getByRole("dialog", { name: "Cube" })` — scope selectors to the one under test.
- Rows stay in the DOM while Inspect collapses the dock (it is `inert`, so not hoverable or clickable): reading a thumbnail's `src` works, hovering or clicking needs `openSelectionsDock` first.
- Names depend on `active_category` at creation: a test that needs a predictable `inspect <n>` clears it (`setModel(page, { active_category: "" })`). Two saves of different windows rarely share a categorical name, so id-reuse tests need the fallback.
- The hover card is portalled to the widget root, not inside the row: locate it with `page.getByTestId("selection-card")`.
