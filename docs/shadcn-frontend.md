# shadcn frontend

React/shadcn anywidgets live in `frontend/` and compile to ESM under
`milume/static/bundled/`.

Docs: [widget UI dev quick reference](./widget-ui-dev.md),
[widget packaging](./widget-packaging.md).
Agent workflow:
[`.agents/skills/shadcn-anywidget/SKILL.md`](../.agents/skills/shadcn-anywidget/SKILL.md).

```
frontend/                          npm package (UI source of truth)
├── components.json                shadcn CLI config (+ @reui registry)
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

`components.json` includes the [ReUI](https://reui.io/docs/registry) namespace:

```json
"registries": {
  "@reui": "https://reui.io/r/{style}/{name}.json"
}
```

From `frontend/`:

```bash
npx shadcn@latest search @reui
npx shadcn@latest add @reui/c-alert-1
```

Free ReUI components use the `c-*` prefix.

Widget authoring loops: [widget-ui-dev.md](./widget-ui-dev.md).

CI builds `frontend/` before tests and publish so wheels include bundles.
`pip install` does not require Node.
