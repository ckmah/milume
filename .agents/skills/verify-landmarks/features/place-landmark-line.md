# place-landmark-line

Line authoring mode: press-drag on canvas commits a two-vertex Landmark.

**Spec:** `frontend/e2e/landmarks/landmarks.spec.ts` — `"line drag places a two-vertex landmark"`

## Sub-features

- Switch to Line authoring radio
- Mouse down → move → up draws a segment
- Synced `landmarks` gains one `type: "line"` with two vertices

## How to get to it (user POV)

Choose **Line** in the landmark authoring controls, press on the tissue, drag to a
second location, and release. A line Landmark with two vertices is created.

## Driving it with Playwright

```ts
await bootLandmarksHarness(page);
const before = ((await getModel(page, "landmarks")) as unknown[]).length;

await clickLandmarkTool(page, "Line"); // landmark ▾ dropdown
await page.waitForTimeout(150);

const box = await canvasBox(page);
const x0 = box.x + box.width * 0.35;
const y0 = box.y + box.height * 0.4;
const x1 = box.x + box.width * 0.65;
const y1 = box.y + box.height * 0.55;

await page.mouse.move(x0, y0);
await page.mouse.down();
await page.mouse.move(x1, y1, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(200);

const landmarks = (await getModel(page, "landmarks")) as any[];
// landmarks.length === before + 1
// landmarks[landmarks.length - 1].type === "line"
// landmarks[landmarks.length - 1].vertices?.length === 2
```

Helpers: `bootLandmarksHarness`, `getModel`, `canvasBox`.

Selectors: `clickLandmarkTool(page, "Line")` (helpers.ts; the landmark tools live in the landmark ▾ dropdown).

Model keys: `landmarks`.

**Proof**

- `landmarks` array length increases by 1.
- New Landmark: `type === "line"`, `vertices.length === 2`.

## Gotchas

- Line mode commits on drag stroke — unlike Spline/Shape, a drag **does** create a landmark.
- Use `{ steps: 8 }` on `mouse.move` so the engine registers the drag reliably.
- No named screenshot for this path; functional asserts only per e2e README tier budget.
