# Widgets own their rendering controls; traitlets carry only what Python needs

A widget's controls live in its own chrome, built from the repo's shadcn
primitives. A value becomes a synced traitlet only when Python reads it, sets
it, or computes it. The notebook is glue between widgets and analysis, not a
second control panel.

| Value | Where it lives |
| --- | --- |
| Needed only to render (camera, projection mode, colors, a layer toggle) | widget chrome, client-local |
| Rendered **and** read by analysis (cube cut box) | widget chrome, synced trait the widget writes |
| Set from another widget or from code (inspect window, contrast) | synced trait, also editable in chrome |
| Known or computed in Python (URLs, voxel frame, highlight groups) | synced trait, set from Python |

Controls render live while dragging and **commit** to their trait once on
release (`onValueCommit`), so a drag updates the widget every frame but re-runs
the notebook cells that read the widget once per gesture.

**Why:** the VolumeCube cuts started as marimo sliders. Every drag step went
browser → kernel → cell → trait → browser: rapid input queued and the cube
lagged behind the slider, a debounce made it feel dead, and any cell that
referenced a slider re-ran and remounted the cube unless the sliders were
defined in the cell that displayed it. The same controls in the widget update
every frame, need no notebook wiring, and are covered by Playwright in the dev
harness. This extends [ADR 0002](0002-named-traitlets-as-widget-contract.md):
traitlets are the contract, and this decides which state is worth putting in it.

**Consequences:** one owner per value — a notebook slider and a widget control
must not both drive the same trait. Scripted control keeps working
(`cube.slice_z_min = 40` still moves the cut) because chrome-owned values that
Python needs stay traits. Landmarks already follows the rule (mode, genes and
color are client-local; `landmarks`, `selections` and inspect are synced).
