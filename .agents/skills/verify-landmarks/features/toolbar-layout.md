# toolbar-layout

Main toolbar order and grouping: `select · hand · inspect · probe · node |
lasso ▾ · landmark ▾ | + · − · reset | full screen`. The landmark dropdown
replaces four separate landmark buttons; the active lasso/landmark dropdown
keeps its on-color on hover in dark mode.

**Spec:** `frontend/e2e/landmarks/landmarks.spec.ts` —
`"toolbar: interaction order, lasso and landmark dropdowns, cube icon"`,
`"active lasso keeps its colours on hover in dark mode"`

## Sub-features

- Toolbar radios (`getByRole("toolbar", { name: "Drawing tools" })`) read, in order: Select, Move, Inspect, Probe, Node
- Inspect uses the lucide `Box` icon (`svg.lucide-box`)
- **Landmark ▾** (`chrome/mode-dropdown.tsx`, shared with the lasso dropdown): left click arms the last-used landmark type (point/line/spline/shape), right click or the chevron opens the menu to pick one
- The dropdown remembers the last-used mode per group across renders (arming Spline, switching to Select, then clicking the dropdown again re-arms Spline)
- Active lasso (or landmark) dropdown button keeps `bg-foreground`/`text-background` on hover in dark mode — it does not fall back to the ghost variant's darker hover
- Every toolbar (main, View CTA, context L1/L2, Inspect bar, cube title bar) shares `TOOLBAR_CLASS` and every hit shares `chromeHitClass` (`.landmarks-hit`, on = `aria-pressed`/`data-state="on"`) — see DESIGN.md "Chrome tokens"; the hover-colour spec above proves the shared on state

## How to get to it (user POV)

Open the LandmarksWidget; the bottom toolbar shows tool radios, then the
lasso and landmark dropdowns, then zoom controls and full screen. Left-click
**Landmark ▾** to arm the last type used; right-click (or its chevron) to
pick point / line / spline / shape from the menu. The dropdown button stays
legible (light icon on a filled pill) when active and hovered, in both light
and dark themes.

## Driving it with Playwright

```ts
const bar = page.getByRole("toolbar", { name: "Drawing tools" });
const radios = bar.getByRole("radio");
const names = await radios.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
expect(names).toEqual(["Select", "Move", "Inspect", "Probe", "Node"]);
await expect(bar.locator('[aria-label="Inspect"] svg.lucide-box')).toHaveCount(1);

const landmark = bar.getByRole("button", { name: /Point\. Right-click for landmark menu/ });
await landmark.click();
await expect.poll(() => getModel(page, "mode")).toBe("point");
await landmark.click({ button: "right" });
await page.getByRole("menuitem", { name: /Spline/ }).click();
await expect.poll(() => getModel(page, "mode")).toBe("spline");
```

Hover-color proof:

```ts
const lasso = page.getByRole("button", { name: /Lasso\. Right-click for shape menu/ });
await lasso.click();
await lasso.hover();
const [bg, fg] = await lasso.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
expect(bg).not.toBe(fg);
```

Helpers: `bootLandmarksHarness`, `getModel` (`frontend/e2e/helpers.ts`).
Selectors: `getByRole("toolbar", { name: "Drawing tools" })`, the
mode-dropdown's accessible name pattern `/<Label>\. Right-click for (landmark|shape) menu/`.

**Proof**

- Functional: toolbar radio order and labels; `mode` traitlet follows left-click (arm) and menu pick; dropdown remembers last-used mode.
- Visual: computed `backgroundColor`/`color` differ while active+hovered, and match the same values after switching tools and back (no accidental darkening).

## Gotchas

- The landmark dropdown and the lasso/shape dropdown are the same `ModeDropdown` component (`chrome/mode-dropdown.tsx`) parameterized by `modes`/`menuNoun` — a fix to one hover/arm bug likely needs the same fix in both call sites' shared component, not two.
- `lastUsedByGroup` is a module-level `Map`, not React state — it persists across remounts within a test file/page; do not assume a fresh default on re-render within the same page load.
- The accessible name for the armed button is the current mode's label, so `getByRole("button", { name: /Point\.../ })` stops matching once another mode is armed — re-query after arming a different mode.
