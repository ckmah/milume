---
name: base-ui
description: >-
  Widget chrome on Base UI (@base-ui/react), shadcn components generated for
  Base UI, Tailwind 4, and Motion. Use when adding or changing landmarks
  chrome, generating a shadcn component, portaling into the widget shadow
  root, animating a popup or panel, or mapping frontend/src/components/ui
  to Base UI parts.
---

# Base UI widget chrome

Widget chrome uses `@base-ui/react`, shadcn components generated for Base UI, Tailwind 4, and Motion. Visual direction is pending a redesign issue. This skill does not migrate components.

Read the matching page from [https://base-ui.com/llms.txt](https://base-ui.com/llms.txt) before you invent a prop. Handbook pages worth fetching first are quick start, composition, styling, animation, and accessibility. The package name is `@base-ui/react`. The old name `@base-ui-components/react` is retired.

`frontend/package.json` already depends on `@base-ui/react` (`^1.7.0`), `motion` (`^14`), and `tailwindcss` (`^4`). Install from `frontend/` with `npm i @base-ui/react` only when the dependency is missing. Import a part from `@base-ui/react/<name>`, for example `@base-ui/react/popover`.

## Generate from the catalog

Search the shadcn catalog before you write a component. From `frontend/`:

```bash
npx shadcn@latest info --json
npx shadcn@latest search @shadcn -q "<name>"
npx shadcn@latest docs <name>
```

Add a component only when `info` reports `"base": "base"`.

```bash
npx shadcn@latest add <name>
```

Measured on 2026-11-17 from `frontend/`. `components.json` has `"style": "new-york"`. `npx shadcn@latest info --json` reports `"base": "radix"`. The built-in registry URL is `https://ui.shadcn.com/r/styles/{style}/{name}.json`, so `style` picks the library. Doc links in that `info` output use `/docs/components/radix/[component].md`. There is no separate Base UI registry.

`https://ui.shadcn.com/schema.json` allows these `style` values for Base UI: `base-vega`, `base-nova`, `base-maia`, `base-lyra`, `base-mira`, `base-luma`, `base-sera`, `base-rhea`. `base-nova` is the CLI's default preset name (`shadcn init --defaults` documents `--preset=base-nova`). The redesign issue names which `base-*` value this repo uses. Until `style` is one of those values, `shadcn add` writes Radix files into a tree that is still on `new-york`. Leave `components.json` unchanged in a docs or one-component PR.

Composition differences between the two shadcn outputs are in `.agents/skills/shadcn/rules/base-vs-radix.md`. That skill is vendored from `shadcn/ui` through `skills-lock.json`. Do not edit it in place.

A custom component is allowed only when the catalog has no part that fits. Name the gap and the reason in the PR. The map below records the gaps known today.

## MCP

`.cursor/mcp.json` starts the official server:

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

That block is what `npx shadcn@latest mcp init --client cursor` writes, and it matches [the shadcn MCP docs](https://ui.shadcn.com/docs/mcp). The server searches registries listed in `components.json`. It does not take a Base UI flag. The same `style` field that `info` reads decides which library a search or install returns. `shadcn mcp init` also writes a root `package.json` that depends on `shadcn`. This repo does not keep that file. `npx shadcn@latest mcp` is enough.

## Composition

Compose with the `render` prop. The element you pass must forward `ref` and spread the rest of the props onto its DOM node.

```tsx
<Popover.Trigger render={<Button />}>Open</Popover.Trigger>
```

Nest `render` when one part wraps another. When `render` is not a `<button>`, set `nativeButton={false}`.

A `render` function is for state-dependent children or a hot path:

```tsx
<Switch.Thumb
  render={(props, state) => (
    <span {...props}>{state.checked ? "On" : "Off"}</span>
  )}
/>
```

`className` and `style` may be functions of that same state. State also arrives as data attributes. Style those.

## Portal and theme

Popups mount through `Portal`. Pass `container` or the popup escapes the widget shadow root and loses the widget tokens. `container` accepts `HTMLElement | ShadowRoot | React.RefObject | null`.

```tsx
const [wrapRef, portalEl] = useWidgetPortalContainer();

return (
  <div ref={wrapRef}>
    <Popover.Root>
      <Popover.Trigger>Open</Popover.Trigger>
      <Popover.Portal container={portalEl}>
        <Popover.Positioner>
          <Popover.Popup>{children}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  </div>
);
```

`useWidgetPortalContainer` lives in `frontend/src/widgets/landmarks/chrome/use-widget-portal.ts`. It creates one `[data-milume-portal]` host. The host is inside the widget `ShadowRoot` when the widget has one, and on `document.body` otherwise. The hook copies these classes from `.milume-widget` onto the host: `dark`, `landmarks--light`, `landmarks--dark`, `landmarks--image`.

Put theme variables on `.milume-widget` and on `[data-milume-portal]`. Portaled nodes are not descendants of `.milume-widget`, so a variable set only on the widget does not reach them. `frontend/src/widgets/landmarks/landmarks.css` already sets the float tokens on `[data-milume-portal]`. Add new portaled tokens in that same block.

## Animation

Default to CSS transitions on Base UI's data attributes.

- `data-starting-style` is the style the transition starts from.
- `data-ending-style` is the style the transition ends at.
- `data-open` and `data-closed` drive CSS animations. Prefer transitions. A transition can reverse if the user closes a popup while it is still opening.

```css
.Popup {
  transform-origin: var(--transform-origin);
  height: var(--popup-height, auto);
  transition: transform 150ms, opacity 150ms;
}

.Popup[data-starting-style],
.Popup[data-ending-style] {
  opacity: 0;
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .Popup {
    transition: none;
  }
}
```

Panel height is a variable on the panel, transitioned to `0` while the starting or ending attribute is present.

- Collapsible panel: `--collapsible-panel-height` and `--collapsible-panel-width`.
- Accordion panel: `--accordion-panel-height`.

Positioned popups also expose `--transform-origin`, `--popup-width`, `--popup-height`, `--available-width`, `--available-height`, `--anchor-width`, and `--anchor-height`.

Use Motion (`motion/react`) when you want a spring. Base UI keeps the popup mounted through the close until it sees the animation end. CSS animations are detected. Motion animations are detected when they animate `opacity`. Include `opacity` in the Motion values.

Popup removed from the DOM when closed (Popover, Dialog, Tooltip, Menu):

- Control `open` on the root.
- Wrap the portal in `AnimatePresence` and render it only while `open` is true.
- Set `keepMounted` on `Portal`.
- Pass the motion element through `render`.

```tsx
<Popover.Root open={open} onOpenChange={setOpen}>
  <Popover.Trigger>Open</Popover.Trigger>
  <AnimatePresence>
    {open && (
      <Popover.Portal keepMounted container={portalEl}>
        <Popover.Positioner>
          <Popover.Popup
            render={
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
              />
            }
          />
        </Popover.Positioner>
      </Popover.Portal>
    )}
  </AnimatePresence>
</Popover.Root>
```

Parts that stay mounted (`keepMounted` on the part itself) use `render={<motion.div />}` and animate from the `open` boolean. Skip `AnimatePresence` in that case. Select stays in the DOM after the first open. Follow the Select section of the animation handbook for that mix.

Honor `prefers-reduced-motion`. For CSS, the media query above drops the transition. For Motion, call `useReducedMotion()` and render the open styles with no spring when it returns true.

## Accessibility

Base UI sets roles, ARIA, keyboard interaction, and focus moves. You still have to show focus. Style `:focus-visible`. Give each custom control an accessible name (`aria-label` or `aria-labelledby`). Use `Field` to wire a label to its control. A dialog needs a title.

## Component map

Lookup from `frontend/src/components/ui/*` to the Base UI part. shadcn file names stay unless the catalog renames them. Confirm a name with `npx shadcn@latest docs <name>` after `base` is `base`.

| File | Base UI part | Gap |
| --- | --- | --- |
| `badge.tsx` | none. shadcn `badge` is a styled span | |
| `button.tsx` | `Button` | |
| `card.tsx` | none. shadcn `card` is markup | |
| `collapsible.tsx` | `Collapsible` | |
| `color-selector.tsx` | none | Color ramp. No catalog part. |
| `combobox.tsx` | `Combobox` | Already imports `@base-ui/react`. Regenerate it from the catalog in its family PR. |
| `dropdown-menu.tsx` | `Menu` | |
| `field.tsx` | `Field`, `Fieldset`, `Form` | |
| `hover-card.tsx` | `Preview Card` | |
| `input.tsx` | `Input` | |
| `input-group.tsx` | shadcn `input-group` over `Input` | |
| `item.tsx` | none. shadcn `item` | On Base UI the trigger uses `render`. |
| `label.tsx` | `Field` label | The Base UI component list has no standalone Label. shadcn still ships `label`. |
| `radio-group.tsx` | `Radio Group` | |
| `separator.tsx` | `Separator` | |
| `slider.tsx` | `Slider` | `Slider.Value` prints the number. The capsule that places that readout inside the track is custom. |
| `spring-popover.tsx` | `Popover` with Motion `render` | |
| `switch.tsx` | `Switch` | Already imports `@base-ui/react/switch`. Regenerate it from the catalog in its family PR. |
| `tabs.tsx` | `Tabs` | |
| `textarea.tsx` | shadcn `textarea` | The Base UI component list has `Input` and no Textarea. |
| `toggle.tsx` | `Toggle` | |
| `toggle-group.tsx` | `Toggle Group` | `multiple` is a boolean. `value` is an array. See the shadcn base-vs-radix note. |
| `tooltip.tsx` | `Tooltip` | |
| `motion-controls.css`, `motion-overlays.css` | none | CSS for the current motion wrappers. |

Toolbars under `frontend/src/widgets/landmarks/chrome/` are not in this folder. Base UI `Toolbar` is the catalog part for that family.

## Migration PRs

Land the component migration as a GitHub PR stack. One PR per component family. Only the top PR targets `main`. Run one full e2e suite per stack. The first code PR sets `components.json` `style` to the `base-*` value the redesign issue names, then regenerates that family with `npx shadcn@latest add`.
