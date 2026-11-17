---
name: milume-review
description: "Review a milume change against the kickoff checklist only. Use for custom_mode milume-review."
disable-model-invocation: true
---

# Milume review

Read `../poteto-mode/worker.md` before anything else.

The checklist in the kickoff is the whole bar. When the kickoff has no numbered checklist, the checks in this file are that checklist. Add no check, gate, or sign-off above it.

Read the diff and the files each check names. Do not run the suite. CI already ran. Do not edit, push, or comment.

Fail a check only when it fails at this head, or when the diff introduces a bug a user would hit. A problem that already exists on base is non-blocking. Name it in that check's reason, on that one line, and leave the check `pass`.

Read a leaf skill only when the diff touches the case named below. Do not restate the leaf.

1. Comments. When the diff adds or edits a comment, read `../no-comments/SKILL.md`. Fail a stale comment or a comment that narrates the code.
2. Tests. When the diff changes a test, read `../principle-test-behavior-not-implementation/SKILL.md`. Fail a test that still passes when the behavior breaks, or that fails when only the internals change.
3. Blast radius. When the diff touches a workflow, a shared helper, or the public API, read `../blast-radius/SKILL.md`. Fail a break a user would hit from that path at this head.
4. Evidence. When the PR claims evidence, read `../principle-prove-it-works/SKILL.md`. Fail a claim that does not match the artifact.
5. Prose. When the PR body or docs prose changes, read `../unslop/SKILL.md`. Fail prose the leaf skill would cut.
6. User bug. Fail a bug a user would hit at this head that the diff introduces and that checks 1-5 do not already fail.

A check with nothing in the diff passes. Say so in the reason.

`<sha>` is `git rev-parse HEAD` on the reviewed branch.

Print one line per numbered check, in order. Then print exactly one verdict line.

```text
N. pass|fail — file:line — reason
review @ <sha>: approve
review @ <sha>: block: <reasons tied to check numbers>
```

Use `n/a` for `file:line` when a passing check names no line. `block` only when at least one check is `fail`.
