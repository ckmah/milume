# fetch-errors

A window fetch that fails (a server error or a refused connection, not a missing
chunk) ends in an error state with a status line, never an endless "loading".

**Spec:** `frontend/e2e/volume-cube/volume-cube.spec.ts` — `"a failed labels fetch ends in an error state, not loading"`, `"a failed image window fetch shows a status line"`

## Sub-features

- Labels chunks fail: `data-labels="error"`, status "Could not load labels: …", and
  the image keeps rendering alone (`data-channels="1"`)
- Image window chunks fail: status "Could not load this window: …"; with Labels on,
  `data-labels="error"` (labels only show over the image)
- A labels OME-Zarr that fails to open (`loadOmeZarr`) also gives `data-labels="error"`
- A new window is a new fetch, so moving the window retries and clears the error
- Missing chunks (HTTP 404) are not errors: zarrita reads them as the fill value
  (all-background label chunks are never written)

## How to get to it (user POV)

Normally invisible. When the loopback server or the store fails, the viewport shows
a one-line status instead of a spinner-like "Loading" that never ends.

## Driving it with Playwright

```ts
const widget = volumeCubeWidget(page);
await page.route(/\/toy\.ome\.zarr\/labels\/cells\/\d+(\/\d+)+$/, (route) =>
  route.fulfill({ status: 500, body: "boom" }),
);
await page.getByRole("switch", { name: "Labels" }).click();
await expect(widget).toHaveAttribute("data-labels", "error");
await expect(widget.getByText(/Could not load labels/)).toBeVisible();
```

Helpers: `bootVolumeCubeHarness`, `volumeCubeWidget`, `setVolumeModel` (move the
window so the image refetches under the route).

**Proof**

- Functional: `data-labels="error"` and the status text under a failing route.
- Visual: none.

## Gotchas

- Viv's `VolumeLayer` waits on every plane and swallows a rejected fetch, so the
  cube watches `WindowPixelSource.fetchBlock({})` itself (the same cached promise
  Viv reads; no second request).
- Match chunk keys only (`\d+(/\d+)+$`), not `.zarray` / `zarr.json`, or the
  labels fail at open instead of at the window fetch.
- The loopback server (`serve_directory`) uses a 256-deep listen backlog; the
  stdlib default of 5 refused bursts of chunk requests on Windows
  (`test_serve_directory_takes_a_burst_of_parallel_reads`).
