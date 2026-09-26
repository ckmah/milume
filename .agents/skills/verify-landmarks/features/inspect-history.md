# inspect-history

Hovering in Inspect shows a live coarse preview beside the window square,
sliding with the cursor and recentring only when it nears the loaded region's
edge. Each click commits an inspect selection and adds a chip to the dock's
history strip; chips restore their window and cut, and deleting the last one
closes the dock.

**Spec:** `frontend/e2e/landmarks/landmarks-volume.spec.ts` — `"Landmarks inspect cube"` describe block
(`E2E_HARNESS=landmarks-volume`, run via `npm run test:e2e:landmarks`)

**Design:** [`docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md`](../../../docs/superpowers/specs/2026-09-26-inspect-preview-dock-design.md) · [ADR 0006](../../../docs/adr/0006-landmarks-hosts-volume-cube.md)

## Sub-features

- A borderless preview float (`data-testid="inspect-preview"`) follows the cursor at a fixed offset, rendering the coarse level for a region 3× the square's side; it pans (`data-pan`) without a new fetch while inside the loaded region, and hides when the pointer leaves the volume's extent or the canvas
- Moving past half the square's side from the region's edge recentres the preview at a new region led by the cursor's recent velocity; the old region keeps rendering, square clamped, until the new one swaps in
- A click commits an inspect selection (`type: "inspect"`) and adds a chip to the dock's **Inspect history** strip (`getByLabel("Inspect history")`), labelled "Inspect \<n\>" in commit order
- Each chip carries a 64 px snapshot of the dock, captured once the fine level renders; snapshots are client-only (keyed by selection id), never synced, and re-taken when the entry's window moves or its id is reused after a delete
- Clicking a chip, or focusing an inspect selection anywhere in the UI, restores its `window` (centre, size, cut) in the dock; membership (`point_indices`) never changes because of the cut
- Deleting an inspect selection removes its chip; deleting the last one closes the dock

## How to get to it (user POV)

Press **I** to arm Inspect and move the cursor over the tissue: a small
preview float shows a coarse view of what a click there would open. Click to
commit it — the dock opens (or updates) and a numbered chip appears along its
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
const strip = page.getByRole("dialog", { name: "Cube" }).getByLabel("Inspect history");
await expect(strip.getByRole("button", { name: "Inspect 1" })).toHaveAttribute("aria-pressed", "true");
```

Helpers: `bootLandmarksVolumeHarness`, `canvasBox`, `getModel`, `setModel`
(all in `frontend/e2e/helpers.ts`). Selectors: `getByTestId("inspect-preview")`,
`getByLabel("Inspect history")` inside `getByRole("dialog", { name: "Cube" })`.

Model keys: `selections` (`type: "inspect"` entries with `window`),
`selected_kind`, `selected_index`, `inspect_cx`, `inspect_cy`,
`inspect_size_um`, `volume_cut`.

**Proof**

- Functional: `"history chips restore each committed window and cut"` — a second click adds a second chip; clicking the first restores `inspect_cx` and `volume_cut` without changing that entry's `point_indices`.
- Functional: `"deleting an inspect selection removes its chip; the last one closes the dock"` — the dock closes once `selections` holds no inspect entries.
- Functional: `"a chip's snapshot follows its entry's window: moved, or a reused id"` — the chip's `img[src]` changes once a drag settles, and again after a delete + recommit reuses the id.
- Functional: `"hover shows a live coarse preview that slides without refetching"` — moving within the loaded region changes `data-pan` but fires no `/s\d+/c/` chunk requests, and the dock stays closed.
- Functional: `"moving far recentres the preview region; leaving the map hides it"` — crossing the region's edge changes `data-region`; moving off-canvas hides the float.

## Gotchas

- Small toy pyramids can make every level fit the default voxel budgets; override with `?budgets=<preview>,<dock>` (goto `/?budgets=20000,300000`) to force a level split — see `"the dock shows the coarse level first, then refines"` (inspect-cube.md) and the two preview tests above.
- The preview float has its own `.volume-cube__view` (`getByTestId("inspect-preview").locator(".volume-cube__view")`), separate from the dock's inside `getByRole("dialog", { name: "Cube" })` — scope selectors to the one under test, same rule as the dock vs. the standalone `VolumeCubeWidget` (see [verify-volume-cube features README](../../verify-volume-cube/features/README.md)).
