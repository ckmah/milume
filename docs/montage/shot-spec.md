# Landing montage shot spec

The single source of truth for `website/landing/assets/milume-montage-web.mp4` (and its
poster). `npm run check:shot-spec` (`frontend/scripts/check-shot-spec.mjs`) validates this
table in CI (`agent-policy-tests`).

## Handoff rules (Designer ↔ Developer ↔ PM)

- Every handoff note, issue comment and PR body names shots by **id** (e.g. `knn`, `inspect-zcut`).
  Don't describe a shot in free-form chat; change its row here instead.
- **Designer** writes or changes a row (setup, duration, caption) and sets `status` to `spec-done`.
- **Developer** captures the clip with the row's `capture` and sets `status` to `clip-done`.
- **PM** edits the montage only when every row in the cut is `clip-done` (or `shipped`), then
  sets the rows to `shipped` in the PR that replaces the mp4.
- Captions with `caption_kind` = `tagline` must equal the landing `<h1>` in
  `website/landing/index.html` exactly. To change the tagline, change the `<h1>` first.
  `feature` captions are canonical here: copy them from this table into the edit.
- Datasets: `colon_a2` is human colon; `pyxa_small` and `pyxa_xsmall` are mouse brain. Never
  mix their cell IDs in one shot (#97).
- Montage work uses the **Montage** issue template, which lists shot ids as a checklist.

## Capture scripts

- A new or re-shot row's `capture` is the repo path of the script that records it (e.g.
  `frontend/scripts/montage/knn.mjs`), or `N/A: <reason>` when no script can (say why).
  `check:shot-spec` fails on `manual:` and on a path that doesn't exist.
- The 8 rows below were captured by hand before this rule and keep `manual: <how>` while
  `status` is `shipped` (`GRANDFATHERED_MANUAL` in `frontend/scripts/lib/shot-spec.mjs`).
  Re-shooting one means moving it off `shipped`, and then it needs a script too.
- Scripts must uphold Clarence's rules:
  - **Inspect never shows points.**
  - **The cursor is visible whenever it's in use** (clicks, drags, drawing).
  - **The default palette is used** (no custom colours).

Columns: `id` (kebab-case, unique) · `dataset` (`colon_a2`, `pyxa_small`, `pyxa_xsmall`, `none`)
· `setup` (widget state) · `duration_s` (in the cut) · `caption` · `caption_kind` (`tagline`,
`feature`, `none`) · `capture` (a script path in the repo, or `N/A: <reason>`; see below) · `status` (`planned`,
`spec-done`, `clip-done`, `shipped`) · `owner` (`Designer`, `Developer`, `PM`).

## Shots

The current cut (43 s, #237). Durations come from the shipped mp4's scene cuts (crossfades overlap, so they're good to about 0.5 s) and add up to 43 s.

| id | dataset | setup | duration_s | caption | caption_kind | capture | status | owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| title | colon_a2 | Title card: wordmark and tagline over the colon A2 overview | 3 | Explore spatial biology in your notebook. | tagline | manual: title card built in the editor over a Cap still | shipped | Designer |
| peek | colon_a2 | Notebook cell `milume.peek(sdata)` runs and the widget opens | 5 | One call opens it | feature | manual: Cap screen recording, played at 2x | shipped | Developer |
| spline-buffer | colon_a2 | Draw a spline landmark, then widen its buffer | 5 | Draw a spline landmark with a buffer | feature | manual: Cap screen recording, played at 2x | shipped | Developer |
| distances | colon_a2 | Notebook cell `milume.distances()` and its histogram | 4.5 | Measure distances to it in Python | feature | manual: Cap screen recording, played at 2x | shipped | Developer |
| probe | colon_a2 | Probe panel: local cell composition and embedding | 5.5 | Probe local cell compositions and embedding spaces | feature | manual: Cap screen recording, played at 2x | shipped | Developer |
| knn | colon_a2 | Pick a cell type and show its k-NN neighborhoods | 7 | Trace a cell type’s k nearest neighbors | feature | manual: Cap screen recording, played at 2x | shipped | Developer |
| inspect-zcut | colon_a2 | Inspect cube, cell meshes, orbit and Z cut | 9 | Inspect · cell meshes in 3D | feature | manual: Cap screen recording, played at 2x | shipped | Developer |
| end | colon_a2 | End card: wordmark, tagline, `pip install milume`, site URL | 4 | Explore spatial biology in your notebook. | tagline | manual: end card built in the editor | shipped | Designer |
| tour | colon_a2 | Pan across the tissue | 3 | Explore spatial biology in your notebook. | tagline | manual: Cap screen recording | planned | Developer |
| knn-2 | colon_a2 | Second k-NN pass | 3 | Trace again | feature | frontend/scripts/montage/knn.mjs | planned | Developer |
