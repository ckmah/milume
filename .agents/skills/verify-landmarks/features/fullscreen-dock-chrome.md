# fullscreen-dock-chrome

Full screen mode keeps side dock columns short enough that scroll content does not run under the minimap or depth rail.

**Spec:** `frontend/e2e/landmarks/landmarks-fullscreen-dock-420.spec.ts` — `docks end above minimap and depth rail in fullscreen`

## Sub-features

- Full screen toggle (toolbar "Full screen" / "Exit full screen") applies `landmarks--fs`
- Left dock (`.landmarks__chrome-dock--left`) max height clears `--lm-minimap-slot`
- Right dock (`.landmarks__chrome-dock--right`) max height clears `--lm-depth-rail-active` when 3D z is present (no `landmarks--no-z`)

## Driving it with Playwright

```ts
await page.goto("/?fixture=/fixture.json", { waitUntil: "networkidle" });
await waitForEngine(page);
await page.getByRole("button", { name: "Full screen" }).click();
// assert getBoundingClientRect: dock.bottom <= min(minimap.top, depthRail.top)
```

Helpers: `waitForEngine`

**Proof**

- Functional: spec compares dock bottoms to the top of minimap and depth rail in fullscreen
- CSS: `--lm-minimap-slot`, `--lm-depth-rail-active` subtract from dock height in `landmarks.css` (not overridden in fullscreen-only rules except dock width)

## Gotchas

- Default `fixture.json` is 2D (`landmarks--no-z`); depth rail is not mounted — minimap slot still constrains both docks
- Use isolated page when full navigation is needed (`@isolated`)
