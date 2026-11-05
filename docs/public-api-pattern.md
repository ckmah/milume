# Public API pattern

A change to anything under `public` in [`.github/public-api.json`](../.github/public-api.json) (`milume.__all__` exports and `_PUBLIC_TRAITS`) proceeds when it meets every rule below. Post this checklist, with every item ticked, as a PR comment, then remove the `needs-clarence` label that the `public-api` check added. Any unticked rule is a deviation: stop and ask Clarence.

The `public-api` check only labels. It still passes on a public API diff. A green check is not permission.

This pattern is taken from milume 2.0.0 and 2.1.0, `public-api.json`, and the migration section of [#404](https://github.com/ckmah/milume/pull/404).

## Naming

- Functions and methods are snake_case. Widget methods are verb_noun (`clear_selections`, `get_obs_names`, `set_points`, `category_colors`).
- Widget public traits are plain nouns (`color`, `selections`, `landmarks`, `volume`). Internal synced state is `_`-prefixed (`_color_state`, `_look`, `_color_options`) and stays out of `public`.
- Argument names use scverse vocabulary: `adata`, `sdata`, `obs_key`, `spatial_key="spatial"`, `obs_names`, `genes`, `table`, `channels`.
- Errors are `milume.<Thing>Error` subclassing both `TraitError` and the builtin, for example `ColorKeyError(TraitError, KeyError)`.
- Module aliases only follow scverse style (`ml.ds` is `ml.datasets`). Do not add other top-level aliases.

## Signatures

- The data object is the first positional argument (`adata` or `data`). Everything else is keyword-only after `*`.
- Optional arguments are typed `X | None = None`, and defaults match scverse.
- Analysis functions return `pd.DataFrame` or `pd.Index`. They do not mutate `adata` unless named `write_*`.
- `ml.peek` takes exactly `LandmarksWidget`'s kwargs. A new widget kwarg works through both.
- One way to do a thing, as in "Color is one trait" and "One region reader". No second path to an existing capability.
- Unknown keys or names raise a typed error before render, and nothing changes when it raises.

## Deprecation

- Renaming or removing a public name keeps a shim through the current major. Assigning or calling it emits `DeprecationWarning` with this wording: `"<Class>.<name> is deprecated and will be removed in <next major>; assign ``<new>`` instead (…)"`. It is removed in the next major.
- Names that are not in `public` can be removed or renamed without a warning. List them under `### Removed` in the changelog, or in a "removed synced traits" table on the PR.
- Semver: additive is a minor bump, deprecation is a minor bump, removal of a public name is major.

## Docs and changelog

Do all of this in the same PR.

- Update `.github/public-api.json` so the `public-api` check passes.
- Add a CHANGELOG line under `## <version> (unreleased)` in Added, Changed, Fixed, or Removed, with a bold lead phrase and the issue link.
- Any rename or removal gets a `### Migration (#N)` before/after table and the exact warning text, as in #404.
- Regenerate the API reference from the public-trait registry ([#205](https://github.com/ckmah/milume/issues/205)), and update the `use-milume` skill if usage changes.
- Confirm the in-repo demo notebook still runs clean.

## Deviations

Always ask Clarence before merging when the change does any of the following:

- Removes or renames a public name without a shim.
- Forces a major bump, or a "breaking, no deprecation" release.
- Adds a new top-level export or module.
- Changes the type or meaning of an existing argument.
- Adds a new core dependency.
- Adds a second way to do an existing thing.

## Checklist

Paste this on the PR and tick what holds:

```
## Public API pattern
- [ ] Naming (snake_case, verb_noun methods, noun traits, `_` internals, scverse argument names, typed errors)
- [ ] Signatures (data first, keyword-only after `*`, peek matches LandmarksWidget, one way to do a thing, typed errors before render)
- [ ] Deprecation (shim through current major with the standard warning, or not public)
- [ ] public-api.json updated
- [ ] CHANGELOG line under unreleased
- [ ] Migration table and exact warning text, if a public name moved or went away
- [ ] API reference / use-milume updated if usage changed
- [ ] In-repo demo notebook runs clean
```

If every box is ticked, remove `needs-clarence` and merge after the required checks and the Cursor agent review pass. If any box is empty, ask Clarence with the PR link and the unticked items. Do not merge until he answers.
