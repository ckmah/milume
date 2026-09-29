# Named traitlets as the widget contract

Each widget declares its own synced fields as named traitlets on an AnyWidget
subclass (`landmarks`, `selections`, `point_size`, …). We do not use a single generic
`data` JSON blob (as in wigglystuff's EsmWidget) for library widgets.

Python gets typed, per-field APIs and validation. The browser subscribes to
`change:<name>` per field via `useModel`, so React re-renders only what changed.

**Considered:** EsmWidget with one `data` dict (simpler Python, but loses typed
APIs and forces all React widgets to key off `model.get("data")`); codegen from
OpenAPI-style schemas (heavier than needed for a small widget set).

**Consequences:** new widgets declare a traitlet list up front rather than copying
another widget's fields. Arbitrary JSON-serializable structures pass through
`List` and `Dict` traitlets — the contract is the spec, not a fixed card shape.
