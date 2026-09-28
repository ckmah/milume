# place-landmark-point

Point authoring mode: single canvas click commits a one-vertex Landmark.

**Spec:** `frontend/e2e/landmarks/landmarks.spec.ts` — `"landmark point authoring happy path"`

## Sub-features

- Switch to Point authoring radio
- Click on tissue canvas places a point Landmark
- Synced `landmarks` traitlet grows by one entry

## How to get to it (user POV)

In the LandmarksWidget toolbar, choose **Point** mode, then click once on the tissue
scatter. A point Landmark appears at the click location and syncs to Python via the
`landmarks` traitlet.

## Driving it with Playwright

```ts
await bootLandmarksHarness(page);
const widget = page.locator(".landmarks").first();
const before = ((await getModel(page, "landmarks")) as unknown[]).length;

await clickLandmarkTool(page, "Point"); // landmark ▾ dropdown
await page.waitForTimeout(150);

const box = await canvasBox(page);
await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
await page.waitForTimeout(250);

const after = (await getModel(page, "landmarks")) as any[];
// after.length === before + 1
// after[after.length - 1].type === "point"
// after[after.length - 1].vertices?.length === 1

await shot(page, "after-place-point", widget);
```

Helpers: `bootLandmarksHarness`, `getModel`, `canvasBox`, `shot`.

Selectors: `clickLandmarkTool(page, "Point")` (helpers.ts; the landmark tools live in the landmark ▾ dropdown).

Model keys: `landmarks` (array of Landmark objects with `type`, `vertices`).

**Proof**

- Functional: `landmarks` length increments; last entry `type === "point"`, one vertex.
- Visual: `shot(page, "after-place-point", widget)` → snapshot `after-place-point.png`.

## Gotchas

- Use `canvasBox(page)` (`canvas.landmarks__webgl`) — not the outer `.landmarks` box — for click coordinates.
- `exact: true` on the Point radio avoids matching partial labels.
- Point mode commits on click; no Enter key required (unlike Spline/Shape).
