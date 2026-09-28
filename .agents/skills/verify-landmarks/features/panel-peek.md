# panel-peek

The left (layers) and right (info/explore) docks each collapse to a slim edge
tab and back, by their header button or by the **[** / **]** keyboard
shortcuts.

**Spec:** `frontend/e2e/landmarks/landmarks.spec.ts` —
`"side panels collapse to a peek tab and come back"`

## Sub-features

- `PanelCollapseButton` (`chrome/panel-peek.tsx`) sits beside each dock, outside its inner edge (never on top of the panel); clicking it sets `data-collapsed="true"` on the dock (`.landmarks__chrome-dock--left` / `--right`) and slides it off its edge
- `PanelPeekTab` replaces a collapsed dock with an edge tab (full height of the old header); clicking it expands the dock again (`data-collapsed="false"`)
- **[** collapses/expands the left dock, **]** the right dock, once the widget has focus (e.g. a click on the canvas)
- A collapsed dock is `inert`: its controls leave the tab order and the accessibility tree until it expands
- Collapse state is client-local (not a traitlet); the narrow/stacked layout collapses as one
- The peek tab sits above the minimap slot so the left tab never covers it
- Entering Inspect collapses both docks and leaving restores them (see [inspect-cube](inspect-cube.md); spec `landmarks-volume.spec.ts` → `"Inspect hides both side panels; leaving restores them as they were"`)

## How to get to it (user POV)

Click the collapse chevron in a side panel's header to hide it; a thin tab
with the same icon (now pointing the other way) appears at that edge — click
it to bring the panel back. With the widget focused (click the canvas first),
**[** toggles the left panel and **]** toggles the right panel without
reaching for the mouse.

## Driving it with Playwright

```ts
const left = page.locator(".landmarks__chrome-dock--left");
await page.getByRole("button", { name: "Collapse left panel" }).click();
await expect(left).toHaveAttribute("data-collapsed", "true");
await page.getByRole("button", { name: "Show left panel" }).click();
await expect(left).toHaveAttribute("data-collapsed", "false");

const box = await canvasBox(page);
await page.mouse.click(box.x + 5, box.y + box.height - 5); // focus the widget
await page.keyboard.press("]");
await expect(page.locator(".landmarks__chrome-dock--right")).toHaveAttribute("data-collapsed", "true");
await page.keyboard.press("]");
await expect(page.locator(".landmarks__chrome-dock--right")).toHaveAttribute("data-collapsed", "false");
```

Helpers: `bootLandmarksHarness`, `canvasBox` (`frontend/e2e/helpers.ts`).
Selectors: `getByRole("button", { name: "Collapse left panel" | "Collapse right panel" | "Show left panel" | "Show right panel" })`,
`.landmarks__chrome-dock--left` / `--right` (`data-collapsed` attribute).

**Proof**

- Functional: `data-collapsed` toggles true/false via the header button, and via `[`/`]` after the widget has focus; a button inside the collapsed dock cannot take focus, and can again once expanded.
- Visual: no dedicated named anchor; the collapsed/expanded states are covered functionally rather than by screenshot.

## Gotchas

- `[`/`]` only act once the widget (not the page/body) has keyboard focus — click the canvas or another widget element first, as the spec does, or the key press is a no-op.
- Collapse state is not a traitlet — do not look for it on the model; assert the dock's `data-collapsed` attribute instead.
- The peek tab's accessible name flips with side (`"Show left panel"` vs `"Show right panel"`) — match the side you actually collapsed.
