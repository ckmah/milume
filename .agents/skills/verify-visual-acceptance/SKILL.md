---
name: verify-visual-acceptance
description: >-
  One agent pass that checks a ready UI PR's screenshots against its linked issue's
  Visual acceptance items and records pass/fail per item on the PR. Use once when a
  UI PR (widget/UI paths, or the ui-evidence label) is marked ready for review, after
  `ui-pr-policy` is green. Not for drafts, and not on every push.
---

# verify-visual-acceptance

`ui-pr-policy` (`npm run check:pr-policy`) already checks the mechanical part: the PR body
has a `## Visual acceptance` section with one entry per issue item, in order, and each entry
has an image/video or `N/A: <reason>`. This skill checks whether the images **show** what
each item asks. Visual checks are expensive and slow, so the budget is **one pass per PR**.

## When

- Once, when the PR goes ready for review and `ui-pr-policy` is green.
- Again only if the reviewer asks, or a push changes rendering *and* replaces the shots.
- Skip drafts and non-UI PRs (no `ui-evidence` label, no `core`/`landmarks` paths).

## Captures (author side)

- Shots of a widget come from a **production build**: `cd frontend && npm run build`, then
  your **own** `marimo run --headless --port <free>` on the notebook the item names. Never a
  Vite dev server (`npm run dev*`): #133 shipped a stale dev-server capture with the wrong
  landmark colour.
- Use the data the item names (e.g. Pyxa small or colon A2, mosaic visible). Toy-harness
  shots count only for items that ask for Playwright snapshots.
- "Before" means `main` at the PR's merge base, captured the same way, same camera.
- Embed GitHub-hosted images (drag into the PR body). The reviewer can't open
  `cursor.com/agents/.../artifacts` links, so treat those as **unverifiable**.

## The pass (reviewer side)

1. Read the linked issue's `Visual acceptance` items (same parsing as `visualAcceptanceItems`
   in `frontend/scripts/lib/pr-policy.mjs`: list entries, else paragraphs).
2. For each item, open only the media in its PR entry. Split the item into its checkable
   claims (data set, view, cut state, before/after relation, colour/contrast).
3. Give each claim `pass`, `fail` or `unverifiable`, with one line of reason. Don't re-run
   the app; if a claim can't be judged from the images, it's `unverifiable` and the author
   adds a shot.
4. Post one PR comment (start it with `<!-- visual-acceptance -->`; edit that comment if it
   exists):

   ```
   <!-- visual-acceptance -->
   ### Visual acceptance pass (<head sha>)
   | # | Item (short) | Claim | Result | Why |
   | 1 | Before/after on Pyxa small... | real tissue, mosaic visible | fail | synthetic spheres on a flat slab |
   Agent time: <minutes>, images viewed: <n>
   ```

5. Any `fail` or `unverifiable`: the PR isn't ready; say which entry needs which shot.

## Cost (prototype, #262)

Replay of #120 (closes #117) on the e2e2fe8 shots: 3 images, 4 claims, about 1 agent minute
including fetching the issue and images (judging took seconds). Cost scales with the number
of images viewed, so keep one shot per claim. The pass matched PM's review on "not real
tissue" and "outline doesn't contrast". It also flagged that the uncut Top "after" differs
from "before" and that the Z-cut has no "before" shot. It can't judge the fill opacity (0.15),
because that's an Acceptance number and not a Visual acceptance item.
