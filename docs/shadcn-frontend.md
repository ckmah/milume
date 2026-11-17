# shadcn frontend

React/shadcn anywidgets live in `frontend/` and compile to ESM under
`milume/static/bundled/`.

Docs: [widget UI dev quick reference](./widget-ui-dev.md),
[widget packaging](./widget-packaging.md).
Agent workflow:
[`.agents/skills/shadcn-anywidget/SKILL.md`](../.agents/skills/shadcn-anywidget/SKILL.md).

```
frontend/                          npm package (UI source of truth)
├── components.json                shadcn CLI config (`style` selects the library)
├── src/
│   ├── styles/globals.css         theme tokens + Tailwind
│   ├── components/ui/             `npx shadcn@latest add …`
│   ├── hooks/                     traitlets + notebook theme bridges
│   └── widgets/<name>/            one Vite entry per widget
│       └── landmarks/landmarks.css   canvas CSS (emitted into widgets.css)
└── vite.config.ts                 → milume/static/bundled/

milume/static/
├── bundled/{name}.mjs, widgets.css   committed; shipped in the wheel
└── landmarks.js                      canvas engine for the landmarks widget
```

Build: `cd frontend && npm install && npm run build`.

### Registries

`npx shadcn@latest info --json` in `frontend/` reports the library in `config.base`. On 2026-11-17 that value is `radix` because `style` is `new-york`. The `@shadcn` registry URL is `https://ui.shadcn.com/r/styles/{style}/{name}.json`, so a `base-*` style is what makes `shadcn add` emit Base UI. Agent steps are in [`.agents/skills/base-ui/SKILL.md`](../.agents/skills/base-ui/SKILL.md).

Widget authoring loops: [widget-ui-dev.md](./widget-ui-dev.md).

CI builds `frontend/` before tests and publish so wheels include bundles.
`pip install` does not require Node.
