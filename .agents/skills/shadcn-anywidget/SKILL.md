---
name: shadcn-anywidget
description: >-
  Integrates shadcn/ui into milume anywidgets via the bundled React frontend.
  Always prefer shadcn components (@/components/ui/*) for widget chrome. Use when
  adding or changing a React/shadcn anywidget, fixing stale widget UI / HMR /
  hot-reload in marimo, running shadcn CLI from frontend/, wiring Vite widget
  entries, or pointing Python at bundled assets.
---

# shadcn anywidget

anywidget ESM cannot import React/shadcn source directly. Compose UI in
`frontend/`, ship per-widget bundles under `milume/static/bundled/`.

Landmarks chrome (panels, toolbar, forms) is React/shadcn. The deck.gl canvas
engine stays in `milume/static/landmarks.js` (`mountEngine`) and is imported
by the landmarks Vite entry. Chrome reads/writes via `useLandmarksModel` (not
raw `model.set`); shared write recipes live in `milume/static/landmarks_state.js`.

## UI components (required)

**Always prefer shadcn/ui** for widget chrome in this repo.

1. Import from `@/components/ui/*` (`Button`, `Card`, `Slider`, `Field`, `Accordion`,
   `ToggleGroup`, `Separator`, etc.) or install from `@reui/*` when ReUI has a fit.
2. Before writing custom markup, run `npx shadcn@latest search` or
   `npx shadcn@latest docs <component>` from `frontend/` (include `@reui` in search).
3. If a primitive is missing, add it: `npx shadcn@latest add <component>` or
   `npx shadcn@latest add @reui/c-<name>` — do not copy registry source by hand.
4. Follow composition rules in [../shadcn/SKILL.md](../shadcn/SKILL.md): built-in
   variants, semantic tokens, `Field`/`FieldGroup` for forms, full `Card` structure.

| Prefer | Avoid |
| --- | --- |
| `@/components/ui/button` | Raw `<button className="...">` |
| `Card` + `CardHeader` + `CardContent` | Styled panel `div`s |
| `Slider`, `Switch`, `ToggleGroup` | Native `<input type="range">` or manual toggles |
| `Field` + `FieldLabel` + `FieldDescription` | Label/description `div` stacks |
| `Separator` | `<hr>` or border-only dividers |
| `Accordion` for collapsible sections | Custom show/hide state + styled headers |

Exceptions: canvas/WebGL hosts (`plot-host`, deck mount nodes), layout wrappers with
no shadcn equivalent, and CSS in `landmarks.css` for engine-adjacent layout (resize
handles, fullscreen shell). Even then, keep interactive controls on shadcn.

### ReUI registry (`@reui`)

Configured in `frontend/components.json`. Search and install from `frontend/`:

```bash
cd frontend
npx shadcn@latest search @reui
npx shadcn@latest add @reui/c-alert-1
```

Free components use the `c-*` prefix (`npx shadcn@latest add @reui/c-alert-1`).

shadcn APIs: [../shadcn/SKILL.md](../shadcn/SKILL.md) (CLI from `frontend/`).
Humans: [../../docs/shadcn-frontend.md](../../docs/shadcn-frontend.md),
[../../docs/widget-packaging.md](../../docs/widget-packaging.md).
Domain: [../../CONTEXT.md](../../CONTEXT.md).

## Reload contract (file-watch HMR)

Authoring reload is **anywidget file-watch**, not the Vite dev server.

| Piece | Value |
| --- | --- |
| `_esm` / `_css` | `pathlib.Path` from `widget_esm` / `widget_css` → `milume/static/bundled/` |
| Rebuild | `cd frontend && npm run watch:<name>` (`vite build --watch`) |
| Python | `ANYWIDGET_HMR=1` set **before** starting marimo/jupyter |
| Dep | `watchfiles` (`uv sync --group dev`) |

Done when: save a TSX/CSS file → bundled `.mjs` / `widgets.css` mtime changes →
widget UI updates in the open notebook **without** remounting the cell or
opening a new tab.

Hard rules for `_esm` / `_css`:

- Keep them as `Path` objects (anywidget watches Paths).
- Resolve via `milume._assets.widget_esm` / `widget_css`.
- Set `ANYWIDGET_HMR=1` on the process that imports the widget class.

Stale-UI triage (in order):

1. Confirm `ANYWIDGET_HMR=1` in the shell that launched Python (`echo $ANYWIDGET_HMR`).
2. Confirm `_esm` is a Path / `FileContents`, not a long JS string and not an `http://` URL.
3. Confirm Vite `--watch` is rewriting the bundle (mtime moves on save).
4. Confirm `watchfiles` is installed.

Longer rationale and packaging roles: [widget-packaging.md](../../docs/widget-packaging.md).

## Reference

| Layer | Path |
| --- | --- |
| Python widget | `milume/volume_cube.py` |
| Asset resolver | `milume/_assets.py` |
| React UI | `frontend/src/widgets/volume-cube/VolumeCubeView.tsx` |
| anywidget entry | `frontend/src/widgets/volume-cube/index.tsx` |
| shadcn primitives | `frontend/src/components/ui/` |
| Build config | `frontend/vite.config.ts` |
| Shipped bundles | `milume/static/bundled/{name}.mjs`, `widgets.css` |
| Landmarks canvas CSS | `frontend/src/widgets/landmarks/landmarks.css` (in bundle) |
| Demo | `demos/volume-cube.py` |

## Add a widget

Declare the Python↔browser contract as **named traitlets**, shaped for the
widget (e.g. `points:List[Dict]`, `color:Unicode`, `radius:Float`), not copied
from another widget.

Complete every step.

1. **Python class** `milume/<name>.py`: an `AnyWidget` subclass with
   `_esm = widget_esm("<kebab-name>")`, `_css = widget_css()` and the traitlets
   tagged `sync=True`. Export it from `milume/__init__.py` (`__all__` too).

2. **Wire the bundle**: add `frontend/src/widgets/<kebab-name>/index.tsx` (the
   anywidget `render` entry), a `widgetEntries` entry in `frontend/vite.config.ts`,
   a `MILUME_BUILD_WIDGET=<kebab-name> vite build` step in the `build` script
   and a `watch:<kebab-name>` script in `frontend/package.json`, and the bundle
   name in `tests/test_assets.py` / `tests/test_widget_bundles.py`.

3. **Add shadcn components** from `frontend/` (if needed):

   ```bash
   cd frontend
   npx shadcn@latest add button dialog
   ```

4. **Implement `<Name>View.tsx`** — presentation only; read via `useModel(model,
   [/* spec traitlet names */])`; on user action `model.set(...)` then
   `model.save_changes()`. Wrap in `useNotebookTheme(hostEl.parentElement)`.
   Build UI with shadcn components only (see [UI components](#ui-components-required)).

5. **Implement Python validation** in `__init__` if needed.

6. **Build and verify**:

   ```bash
   cd frontend && npm run build
   uv run pytest
   ```

   Done when `milume/static/bundled/<name>.mjs` exists and the demo renders
   under the [reload contract](#reload-contract-file-watch-hmr).

7. **Do not commit** `milume/static/bundled/`: it is gitignored, and CI and
   the publish workflows run `npm run build` before building the wheel. See
   [widget packaging](../../docs/widget-packaging.md).

## Do / don't

| Do | Don't |
| --- | --- |
| shadcn `@/components/ui/*` for all widget chrome | Hand-rolled buttons, inputs, panels, toggles |
| `npx shadcn@latest add` when a primitive is missing | Styled `div`/`span` substitutes for components |
| `Path` `_esm` + `npm run watch:<name>` + `ANYWIDGET_HMR=1` | Point `_esm` at `localhost:5173`, use `npm run dev`, or add `@anywidget/vite` for the normal loop |
| `widget_esm` / `widget_css` returning `Path` | `_esm = path.read_text()` (kills watching) |
| `npx shadcn@latest add` from `frontend/` | Copy registry JSON from GitHub |
| One Vite entry per widget | One monolithic bundle for all widgets |
| `@/components/ui/*` imports | Hand-port `data-slot` CSS into `milume/static/` |
| Shared `widgets.css` theme tokens | Per-widget duplicate CSS variables |
| Python traitlets as the state API | Notebook business logic in React |

## React checklist

Follow the [shadcn skill](../shadcn/SKILL.md), especially:

- **shadcn first** — search/add components before writing custom UI
- Built-in variants before custom `className` styling
- Semantic tokens (`bg-muted`, `text-muted-foreground`), not raw colors
- `flex` + `gap-*`, not `space-x-*` / `space-y-*`
- Full composition (`ItemHeader` + `ItemContent`, not a styled `div`)
- `npx shadcn@latest docs <component>` before guessing APIs
