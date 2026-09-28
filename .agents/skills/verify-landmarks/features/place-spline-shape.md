# place-spline-shape

Spline and Shape authoring: click-to-add vertices, Enter commits; drag stroke does not commit.

**Spec:** `frontend/e2e/landmarks/landmarks.spec.ts` — `"spline and shape are click-to-add only (no drag stroke)"`

## Sub-features

- Spline: drag stroke ignored; two clicks + Enter → `type: "spline"`, 2 vertices
- Shape: drag stroke ignored; three clicks + Enter → `type: "shape"`, 3 vertices
- Escape clears in-progress authoring without committing

## How to get to it (user POV)

Select **Spline** or **Shape** mode. Click on the tissue to add vertices one at a time.
Press **Enter** to commit the Landmark. Dragging without clicking does not finish a
shape — only discrete clicks count.

## Driving it with Playwright

**Spline (negative drag, positive click path):**

```ts
await clickLandmarkTool(page, "Spline"); // landmark ▾ dropdown
const beforeSpline = ((await getModel(page, "landmarks")) as unknown[]).length;

// Drag must NOT commit:
await page.mouse.move(sx0, sy0);
await page.mouse.down();
await page.mouse.move(sx0 + 80, sy0 + 40, { steps: 10 });
await page.mouse.up();
// landmarks.length still beforeSpline

await page.keyboard.press("Escape");
await page.mouse.click(/* vertex 1 */);
await page.mouse.click(/* vertex 2 */);
await page.keyboard.press("Enter");
// landmarks.length === beforeSpline + 1, type "spline", 2 vertices
```

**Shape (same pattern, three clicks):**

```ts
await clickLandmarkTool(page, "Shape"); // landmark ▾ dropdown
// drag → no commit; Escape; three clicks; Enter
// type "shape", vertices.length === 3
```

Helpers: `bootLandmarksHarness`, `getModel`, `canvasBox`.

Selectors: `clickLandmarkTool(page, "Spline" \| "Shape")` (helpers.ts; the landmark tools live in the landmark ▾ dropdown).

Model keys: `landmarks`.

**Proof**

- After failed drag: `landmarks.length` unchanged.
- After Enter: length +1; last entry `type` is `"spline"` or `"shape"` with expected vertex count.

## Gotchas

- Always `Escape` after a rejected drag before starting click-to-add, or stale draft state may interfere.
- Enter commits; Escape alone cancels in-progress geometry without adding to `landmarks`.
- Coordinates in the spec use fractions of `canvasBox` — keep clicks inside the WebGL canvas bounds.
