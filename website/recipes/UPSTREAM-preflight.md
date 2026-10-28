# Upstream note: cold `view preflight` + `mo.ui.anywidget(LandmarksWidget)`

Do **not** open automatically; minimal repro for marimo-team if we pursue upstream.

## Symptom

`marimo-studio view preflight` on a cold tree (no `__marimo__/`, empty `MARIMO_EXPORT_REPOSITORY`) fails:

```text
Could not prepare the notebook states: state 'baseline' input 'widget' rejected its value
```

(JSON diagnostic code `input_value_invalid`, input name `widget`.)

Running `view preflight` again on the same tree **passes**. `view export` on the same cold tree **passes** on the first attempt (includes internal preflight).

## Minimal notebook shape

1. Build `w = milume.peek(adata)` and run analysis cells.
2. `widget = mo.ui.anywidget(w)` in one cell; `widget` in the next (named e.g. `landmark_map`).
3. Studio vanilla view with `<marimo-cell name="landmark_map">`.

Environment: marimo 0.25.x, marimo-studio 0.4.1, milume anywidget (LandmarksWidget).

## Milume workaround (PR #344)

Display the widget model in the named cell **without** `mo.ui.anywidget`:

```python
@app.cell
def landmark_map(..., w):
    w.color = niche_col
    w
    return (w, niche_col)
```

This removes the export **control input** named `widget`, so baseline state preparation no longer validates/rejects a UI-element value. Cold preflight passes.

## Separate issue: prepared snapshot vs split cells

If `w.color = niche_col` runs in a different cell than the cell that displays `w`, marimo-export can snapshot `active_category: cell_type` in the prepared Landmarks model even after the color cell ran. Fix: run Squidpy + `w.color = ...` in the **same** cell that displays `w`.
