# selection-neighborhood

Focused Selection neighborhood: Shift+wheel adjusts radius; radius mode shows gradient overlay, k-NN shows edges.

**Spec:** `frontend/e2e/landmarks/landmarks.spec.ts` —
`"selection neighborhood: highlight, Shift+wheel radius, radius gradient vs knn edges"`

## Sub-features

- Focus a Selection via synced `selected_kind` / `selected_index`
- Active selection highlights points without a persisted outline stroke; focusing a landmark leaves every selection unhighlighted
- Shift + vertical or horizontal wheel changes `selections[i].neighborhood_radius`
- Radius neighborhood: gradient bitmap overlay covering the radius, no k-NN edges ([ADR 0004](../../../docs/adr/0004-neighborhood-visuals.md))
- k-NN neighborhood: `edgeCount > 0`, no radius gradient

## How to get to it (user POV)

Create or focus a **Selection** on the widget (lasso/polygon region). With the
selection focused, hold **Shift** and scroll the mouse wheel over the canvas to grow
or shrink the neighborhood radius. Switch neighborhood mode between radius and k-NN
(in chrome or via model) to change how neighbors are visualized.

## Driving it with Playwright

**Focus selection + highlight overlay:**

```ts
await setModel(page, { selected_kind: "selection", selected_index: 0 });
const overlay = () => page.evaluate(() => (window as any).__landmarksEngine.getSelectionOverlay());
await expect.poll(async () => (await overlay()).find((r: any) => r.index === 0)?.selected).toBe(true);
// active row: selected === true, pointCount > 0, lineWidth === 0, lineAlpha === 0
await shot(page, "selection-neighborhood", widget);
```

**Shift+wheel:**

```ts
const radius = async () =>
  Number(((await getModel(page, "selections")) as any[])[0].neighborhood_radius);
const box = await canvasBox(page);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.keyboard.down("Shift");
const start = await radius();
await page.mouse.wheel(0, -120); // grows; (-120, 0) horizontal works too
await expect.poll(radius).toBeGreaterThan(start);
await page.keyboard.up("Shift");
```

**Neighborhood overlay:**

```ts
let hood = await page.evaluate(() =>
  (window as any).__landmarksEngine.getNeighborhoodOverlay(),
);
// radius mode: hood.mode === "radius", hood.radiusGradient === true, hood.gradientKind === "bitmap",
//   hood.radiusDiskCount === 0, hood.edgeCount === 0, hood.gradientBakeRadius >= hood.radius

await setModel(page, {
  selections: [{ ...sels[0], neighborhood: "knn", neighborhood_k: 8 }],
  selected_kind: "selection",
  selected_index: 0,
});
// knn: hood.mode === "knn", hood.edgeCount > 0, hood.radiusGradient === false
```

Helpers: `bootLandmarksHarness`, `setModel`, `getModel`, `canvasBox`, `shot`.

Model keys: `selections`, `selected_kind`, `selected_index`; per-selection
`neighborhood`, `neighborhood_k`, `neighborhood_radius`.

**Proof**

- Traitlet: `neighborhood_radius` monotonic with wheel direction under Shift.
- Engine: `getSelectionOverlay()` highlight without outline; `getNeighborhoodOverlay()` mode/gradient/edge counts per the snippets above.
- Visual: `shot(page, "selection-neighborhood", widget)`.

## Gotchas

- Neighborhood expand runs in the browser (k-NN / radius from coordinates) — no `obsp` graph required.
- Seed data in the harness must include at least one selection at index 0 for these tests.
- Shift must be held during wheel events; release with `keyboard.up("Shift")` when done.
