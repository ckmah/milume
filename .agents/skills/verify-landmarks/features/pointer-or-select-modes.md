# pointer-or-select-modes

Interaction modes (Select, Node, Move, Probe) and lasso selection entry update the synced `mode` traitlet.

**Spec:** `frontend/e2e/landmarks/landmarks.spec.ts` — `"Select / Node / Move / Probe and lasso geometry control"`

## Sub-features

- Select, Node, Move, Probe mode radios visible
- Lasso button starts selection geometry (not a "Selection" ModeToggle radio)
- Each mode switch writes expected `mode` value
- Lasso click sets `mode === "lasso"`
- Hold **Space** to pan in any tool (deck.gl drag-pan while held); the synced
  `mode` does not change and a lasso drag with Space held draws nothing
  (`landmarks.spec.ts` — `"hold Space to pan in any tool without changing the mode"`)

## How to get to it (user POV)

Use the interaction mode toggles (**Select**, **Node**, **Move**, **Probe**) to change
how pointer input behaves on the canvas. To draw a selection region, click the **Lasso**
button (geometry variants may live in a right-click menu on that button — there is no
separate "Selection" radio in ModeToggle).

## Driving it with Playwright

```ts
await expect(page.getByRole("radio", { name: "Select", exact: true })).toBeVisible();
await expect(page.getByRole("radio", { name: "Node", exact: true })).toBeVisible();
await expect(page.getByRole("radio", { name: "Move", exact: true })).toBeVisible();
await expect(page.getByRole("radio", { name: "Probe", exact: true })).toBeVisible();

// No Selection ModeToggle radio:
await expect(page.getByRole("radio", { name: "Selection", exact: true })).toHaveCount(0);
await expect(page.getByRole("button", { name: /Lasso/i })).toBeVisible();

await page.getByRole("button", { name: /Lasso/i }).click();
expect(await getModel(page, "mode")).toBe("lasso");

await page.getByRole("radio", { name: "Move", exact: true }).click();
expect(await getModel(page, "mode")).toBe("move");

await page.getByRole("radio", { name: "Probe", exact: true }).click();
expect(await getModel(page, "mode")).toBe("probe");

await page.getByRole("radio", { name: "Node", exact: true }).click();
expect(await getModel(page, "mode")).toBe("node");

await page.getByRole("radio", { name: "Select", exact: true }).click();
expect(await getModel(page, "mode")).toBe("select");
```

Helpers: `bootLandmarksHarness`, `getModel`.

Model keys: `mode` (string: `"select"`, `"node"`, `"move"`, `"probe"`, `"lasso"`, …).

**Proof**

- After each radio/button interaction, `getModel(page, "mode")` matches the expected string.
- Visibility asserts confirm the four interaction radios and Lasso button exist.

## Gotchas

- **Node** mode is required for vertex hit-testing; **Select** mode does not edit vertices (see `landmark-edit-node`).
- Lasso uses `getByRole("button", { name: /Lasso/i })` — geometry is not a top-level ModeToggle radio.
- Probe and Move are distinct modes; do not assume they share behavior with Select.
